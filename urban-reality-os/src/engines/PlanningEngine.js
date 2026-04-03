// ================================================
// PlanningEngine — Reinforcement Learning-style urban planner
// Simulates multiple strategies, recommends optimal placements
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
      exploitation: 0.8, // balance between exploration/exploitation
      isSimulating: false,
    };
    
    this.eventBus = EventBus;
    this._worker = null;
    this._requestId = 0;
    this._pendingRequests = new Map();
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
   * Handle worker response
   */
  _handleWorkerMessage(data) {
    if (!data) return;

    const { requestId, result, error } = data;
    const request = this._pendingRequests.get(requestId);

    if (!request) return;

    this._pendingRequests.delete(requestId);

    if (error) {
      request.reject(new Error(error));
      return;
    }

    request.resolve(result);
    this.eventBus.emit('planning:simulation-complete', result);
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

    if (!this._worker) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      const requestId = ++this._requestId;
      this._pendingRequests.set(requestId, { resolve, reject });

      this._worker.postMessage({
        requestId,
        type: 'simulateAction',
        action,
        cityState: state,
        rewardWeights: this.state.rewards,
      });

      setTimeout(() => {
        if (this._pendingRequests.has(requestId)) {
          this._pendingRequests.delete(requestId);
          reject(new Error('Simulation timeout'));
        }
      }, 15000);
    });
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

    if (!this._worker) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      const requestId = ++this._requestId;
      this._pendingRequests.set(requestId, { resolve, reject });

      this._worker.postMessage({
        requestId,
        type: 'planStrategy',
        cityState: state,
        numStrategies,
        rewardWeights: this.state.rewards,
      });

      setTimeout(() => {
        if (this._pendingRequests.has(requestId)) {
          this._pendingRequests.delete(requestId);
          this.state.isSimulating = false;
          reject(new Error('Planning timeout'));
        }
      }, 30000);
    }).finally(() => {
      this.state.isSimulating = false;
    });
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

    if (!this._worker) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      const requestId = ++this._requestId;
      this._pendingRequests.set(requestId, { resolve, reject });

      this._worker.postMessage({
        requestId,
        type: 'recommendPlacement',
        cityState: state,
        buildingType,
        rewardWeights: this.state.rewards,
      });

      setTimeout(() => {
        if (this._pendingRequests.has(requestId)) {
          this._pendingRequests.delete(requestId);
          reject(new Error('Recommendation timeout'));
        }
      }, 10000);
    });
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

    if (!this._worker) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      const requestId = ++this._requestId;
      this._pendingRequests.set(requestId, { resolve, reject });

      this._worker.postMessage({
        requestId,
        type: 'getHeatmap',
        cityState: state,
        buildingType,
      });

      setTimeout(() => {
        if (this._pendingRequests.has(requestId)) {
          this._pendingRequests.delete(requestId);
          reject(new Error('Heatmap generation timeout'));
        }
      }, 20000);
    });
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
   * Cleanup
   */
  destroy() {
    this._destroyed = true;
    if (this._worker) {
      this._worker.terminate();
      this._worker = null;
    }
    this._pendingRequests.clear();
    this.state.simulationHistory = [];
    this.eventBus.clear();
  }
}

export default new PlanningEngine();
