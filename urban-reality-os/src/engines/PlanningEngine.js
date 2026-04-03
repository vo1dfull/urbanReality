// ================================================
// PlanningEngine — Reinforcement Learning-style urban planner
// Simulates multiple strategies, recommends optimal placements
// Typed MessageChannel protocol, Monte Carlo, strategy comparison
// ================================================

import EventBus from '../core/EventBus';
import { createLogger } from '../core/Logger';

const log = createLogger('PlanningEngine');

/**
 * @typedef {Object} CityState
 * @property {object} terrain
 * @property {object} infrastructure
 * @property {object} population
 * @property {number} heat
 * @property {number} floodRisk
 */

/**
 * @typedef {Object} Action
 * @property {string} type — 'road' | 'facility' | 'greenZone' | 'building'
 * @property {object} location — { lng, lat }
 * @property {string} label
 */

/**
 * @typedef {Object} SimulationResult
 * @property {number} reward
 * @property {object} metrics — accessibility, heat, flood, livability
 * @property {array} impacts
 */

/**
 * @typedef {Object} PlanningConstraints
 * @property {number} maxBudget
 * @property {Array<Array<{lng, lat}>>} priorityZones — Polygons to prioritize
 * @property {Array<Array<{lng, lat}>>} forbiddenZones — Polygons to avoid
 * @property {number} minimumGreenCoverage — 0-1, min % of green space
 */

/**
 * @typedef {Object} MonteCarloResult
 * @property {number} meanReward
 * @property {number} variance
 * @property {number} stdDev
 * @property {Array} topStrategies — Top 3 with full action sequences
 */

/**
 * @typedef {Object} StrategyComparison
 * @property {string} strategyA
 * @property {string} strategyB
 * @property {object} rewardDiff
 * @property {object} metricsDiff
 * @property {string} winner
 * @property {number} confidenceScore
 */

/**
 * @typedef {Object} RoadNetworkPlan
 * @property {Array} segments — Ordered list of road segments
 * @property {number} totalLength — Total km
 * @property {number} estimatedCost — Total cost
 * @property {Array} priorityOrder — Sequence for building
 */

/**
 * Typed MessageChannel protocol for Worker communication
 */
const MESSAGE_TYPES = {
  SIMULATE_ACTION: 'simulateAction',
  PLAN_STRATEGY: 'planStrategy',
  MONTE_CARLO: 'monteCarloSimulation',
  RECOMMEND_PLACEMENT: 'recommendPlacement',
  GET_HEATMAP: 'getHeatmap',
  GENERATE_ROAD_NETWORK: 'generateRoadNetwork',
};

export class PlanningEngine {
  constructor() {
    this.state = {
      currentCityState: null,
      simulationHistory: [],
      strategies: new Map(),
      rewards: {
        accessibility: 0.3,
        heatReduction: 0.25,
        floodMitigation: 0.2,
        livability: 0.25,
      },
      constraints: {
        maxBudget: Infinity,
        priorityZones: [],
        forbiddenZones: [],
        minimumGreenCoverage: 0.15,
      },
      exploitation: 0.8, // balance between exploration/exploitation
      isSimulating: false,
    };
    
    this.eventBus = EventBus;
    this._worker = null;
    this._requestId = 0;
    this._pendingRequests = new Map();
    this._abortControllers = new Map();
    this._destroyed = false;
  }

  /**
   * Initialize planning worker
   */
  async initialize() {
    if (this._destroyed) return;

    try {
      this._worker = new Worker(
        new URL('../workers/planningWorker.js', import.meta.url),
        { type: 'module' }
      );

      this._worker.onmessage = (event) => {
        this._handleWorkerMessage(event.data);
      };

      this._worker.onerror = (error) => {
        log.error('Planning worker error:', error);
        this.eventBus.emit('planning:error', { error: error.message });
      };

      log.info('Planning worker initialized');
    } catch (error) {
      log.error('Failed to initialize worker:', error);
    }
  }

  /**
   * Handle typed worker message with AbortController support
   * @private
   */
  _handleWorkerMessage(message) {
    if (!message || !message.requestId) return;

    const { requestId, type, result, error } = message;
    const request = this._pendingRequests.get(requestId);

    if (!request) return;

    // Cancel timeout if request completes
    const controller = this._abortControllers.get(requestId);
    if (controller) {
      controller.abort();
      this._abortControllers.delete(requestId);
    }

    this._pendingRequests.delete(requestId);

    if (error) {
      request.reject(new Error(`${type}: ${error}`));
      return;
    }

    request.resolve(result);
    this.eventBus.emit(`planning:${type}-complete`, result);
  }

  /**
   * Send typed message to worker with AbortController timeout
   * @private
   */
  _sendWorkerMessage(type, payload, timeoutMs = 15000) {
    return new Promise(async (resolve, reject) => {
      const requestId = ++this._requestId;
      this._pendingRequests.set(requestId, { resolve, reject });

      // Setup AbortController for timeout
      const controller = new AbortController();
      this._abortControllers.set(requestId, controller);

      const timeoutId = setTimeout(() => {
        if (this._pendingRequests.has(requestId)) {
          this._pendingRequests.delete(requestId);
          this._abortControllers.delete(requestId);
          controller.abort();
          reject(new Error(`${type} timeout (${timeoutMs}ms)`));
        }
      }, timeoutMs);

      // Clean up timeout on abort
      controller.signal.addEventListener('abort', () => {
        clearTimeout(timeoutId);
      });

      if (!this._worker) {
        await this.initialize();
      }

      this._worker.postMessage({
        requestId,
        type,
        ...payload,
      });
    });
  }

  /**
   * Set planning constraints
   * @param {PlanningConstraints} constraints
   */
  setConstraints(constraints = {}) {
    this.state.constraints = {
      ...this.state.constraints,
      ...constraints,
    };
    log.info('Planning constraints updated:', this.state.constraints);
    this.eventBus.emit('planning:constraints-updated', this.state.constraints);
  }

  /**
   * Update current city state
   * @param {CityState} state
   */
  setCityState(state) {
    this.state.currentCityState = state;
    log.info('City state updated');
  }

  /**
   * Simulate action and compute reward
   * @param {Action} action
   * @param {CityState} cityState
   * @returns {Promise<SimulationResult>}
   */
  async simulateAction(action = {}, cityState = null) {
    if (this._destroyed) return null;

    const state = cityState || this.state.currentCityState;
    if (!state) {
      throw new Error('No city state available');
    }

    return this._sendWorkerMessage(
      MESSAGE_TYPES.SIMULATE_ACTION,
      {
        action,
        cityState: state,
        rewardWeights: this.state.rewards,
        constraints: this.state.constraints,
      },
      15000
    );
  }

  /**
   * Run multi-action planning strategy
   * Simulates different combinations of infrastructure placements
   * @param {CityState} cityState
   * @param {number} numStrategies — # of strategies to evaluate
   * @returns {Promise<object>}
   */
  async planOptimalStrategy(cityState = null, numStrategies = 5) {
    if (this._destroyed) return null;

    const state = cityState || this.state.currentCityState;
    if (!state) {
      throw new Error('No city state available');
    }

    this.state.isSimulating = true;
    this.eventBus.emit('planning:started', { numStrategies });

    try {
      const result = await this._sendWorkerMessage(
        MESSAGE_TYPES.PLAN_STRATEGY,
        {
          cityState: state,
          numStrategies,
          rewardWeights: this.state.rewards,
          constraints: this.state.constraints,
        },
        30000
      );

      // Store strategy
      if (result && result.id) {
        this.state.strategies.set(result.id, result);
      }

      return result;
    } finally {
      this.state.isSimulating = false;
    }
  }

  /**
   * Run Monte Carlo simulation with randomized variants
   * @param {CityState} cityState
   * @param {number} iterations — Number of simulation variants
   * @returns {Promise<MonteCarloResult>}
   */
  async runMonteCarloSimulation(cityState = null, iterations = 100) {
    if (this._destroyed) return null;

    const state = cityState || this.state.currentCityState;
    if (!state) {
      throw new Error('No city state available');
    }

    if (iterations < 10 || iterations > 1000) {
      throw new Error('Iterations must be between 10 and 1000');
    }

    this.state.isSimulating = true;
    this.eventBus.emit('planning:montecarlo-started', { iterations });

    try {
      const result = await this._sendWorkerMessage(
        MESSAGE_TYPES.MONTE_CARLO,
        {
          cityState: state,
          iterations,
          rewardWeights: this.state.rewards,
          constraints: this.state.constraints,
        },
        Math.max(60000, iterations * 500) // Dynamic timeout
      );

      // Store top strategies
      if (result && result.topStrategies) {
        for (const strategy of result.topStrategies) {
          this.state.strategies.set(strategy.id, strategy);
        }
      }

      return result;
    } finally {
      this.state.isSimulating = false;
    }
  }

  /**
   * Compare two strategies
   * @param {string} strategyA — Strategy ID
   * @param {string} strategyB — Strategy ID
   * @returns {StrategyComparison}
   */
  compareStrategies(strategyA, strategyB) {
    const stA = this.state.strategies.get(strategyA);
    const stB = this.state.strategies.get(strategyB);

    if (!stA || !stB) {
      throw new Error('One or both strategies not found');
    }

    const rewardDiff = {
      a: stA.reward || 0,
      b: stB.reward || 0,
      delta: (stB.reward || 0) - (stA.reward || 0),
    };

    // Compare metrics
    const metricKeys = ['accessibility', 'heat', 'flood', 'livability', 'population'];
    const metricsDiff = {};
    for (const key of metricKeys) {
      const valA = stA.metrics?.[key] || 0;
      const valB = stB.metrics?.[key] || 0;
      metricsDiff[key] = {
        a: valA,
        b: valB,
        delta: valB - valA,
        improved: valB > valA,
      };
    }

    // Determine winner
    const winner = rewardDiff.delta > 0 ? strategyB : rewardDiff.delta < 0 ? strategyA : 'tie';
    const confidenceScore = Math.abs(rewardDiff.delta) / Math.max(Math.abs(rewardDiff.a), Math.abs(rewardDiff.b), 1);

    return {
      strategyA,
      strategyB,
      rewardDiff,
      metricsDiff,
      winner,
      confidenceScore: Math.min(1, confidenceScore),
      detail: {
        actionCountA: stA.actions?.length || 0,
        actionCountB: stB.actions?.length || 0,
        costA: stA.totalCost || 0,
        costB: stB.totalCost || 0,
      },
    };
  }

  /**
   * Generate optimal road network plan
   * @param {CityState} cityState
   * @param {number} targetCoverage — 0-1, coverage goal
   * @returns {Promise<RoadNetworkPlan>}
   */
  async generateRoadNetwork(cityState = null, targetCoverage = 0.6) {
    if (this._destroyed) return null;

    const state = cityState || this.state.currentCityState;
    if (!state) {
      throw new Error('No city state available');
    }

    if (targetCoverage < 0.1 || targetCoverage > 1.0) {
      throw new Error('Coverage must be between 0.1 and 1.0');
    }

    return this._sendWorkerMessage(
      MESSAGE_TYPES.GENERATE_ROAD_NETWORK,
      {
        cityState: state,
        targetCoverage,
        constraints: this.state.constraints,
      },
      45000
    );
  }

  /**
   * Recommend building locations based on RL evaluation
   * @param {CityState} cityState
   * @param {string} buildingType — 'road' | 'park' | 'facility'
   * @returns {Promise<array>}
   */
  async recommendPlacement(cityState = null, buildingType = 'park') {
    if (this._destroyed) return null;

    const state = cityState || this.state.currentCityState;
    if (!state) {
      throw new Error('No city state available');
    }

    return this._sendWorkerMessage(
      MESSAGE_TYPES.RECOMMEND_PLACEMENT,
      {
        cityState: state,
        buildingType,
        rewardWeights: this.state.rewards,
        constraints: this.state.constraints,
      },
      10000
    );
  }

  /**
   * Export strategy as GeoJSON
   * @param {string} strategyId
   * @returns {string}
   */
  exportStrategyAsGeoJSON(strategyId) {
    const strategy = this.state.strategies.get(strategyId);
    if (!strategy) {
      throw new Error(`Strategy "${strategyId}" not found`);
    }

    const features = (strategy.actions || []).map((action, idx) => ({
      type: 'Feature',
      id: `${strategyId}-action-${idx}`,
      geometry: {
        type: 'Point',
        coordinates: [action.location?.lng || 0, action.location?.lat || 0],
      },
      properties: {
        actionType: action.type,
        actionLabel: action.label,
        sequence: idx,
        reward: action.reward || null,
        impact: JSON.stringify(action.impact || {}),
      },
    }));

    const geojson = {
      type: 'FeatureCollection',
      id: strategyId,
      properties: {
        strategyId,
        totalReward: strategy.reward,
        totalCost: strategy.totalCost,
        actionCount: strategy.actions?.length || 0,
        metrics: strategy.metrics,
        exportedAt: new Date().toISOString(),
      },
      features,
    };

    return JSON.stringify(geojson, null, 2);
  }

  /**
   * Update reward function (adjust planning priorities)
   * @param {object} weights — { accessibility, heatReduction, floodMitigation, livability }
   */
  setRewardWeights(weights = {}) {
    this.state.rewards = { ...this.state.rewards, ...weights };
    log.info('Reward weights updated:', this.state.rewards);
    this.eventBus.emit('planning:rewards-updated', this.state.rewards);
  }

  /**
   * Get optimization heatmap for a given building type
   * Shows best locations across map
   */
  async getOptimizationHeatmap(cityState = null, buildingType = 'park') {
    if (this._destroyed) return null;

    const state = cityState || this.state.currentCityState;
    if (!state) {
      throw new Error('No city state available');
    }

    return this._sendWorkerMessage(
      MESSAGE_TYPES.GET_HEATMAP,
      {
        cityState: state,
        buildingType,
      },
      20000
    );
  }

  /**
   * Subscribe to planning events
   */
  on(event, callback) {
    return this.eventBus.on(event, callback);
  }

  /**
   * Get simulation history
   */
  getHistory() {
    return this.state.simulationHistory.slice(-50); // Last 50 simulations
  }

  /**
   * Get all stored strategies
   */
  getStrategies() {
    return Array.from(this.state.strategies.values());
  }

  /**
   * Get specific strategy
   */
  getStrategy(strategyId) {
    return this.state.strategies.get(strategyId);
  }

  /**
   * Cleanup
   */
  destroy() {
    this._destroyed = true;
    if (this._worker) {
      this._worker.terminate();
      this._worker = null;
    }
    // Abort all pending requests
    for (const controller of this._abortControllers.values()) {
      controller.abort();
    }
    this._pendingRequests.clear();
    this._abortControllers.clear();
    this.state.simulationHistory = [];
    this.state.strategies.clear();
    this.eventBus.clear();
  }
}

export default new PlanningEngine();
