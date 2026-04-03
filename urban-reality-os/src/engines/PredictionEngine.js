// ================================================
// PredictionEngine — AI-driven future city growth modeling
// ✅ Predicts: population growth, sprawl, infrastructure demand, land value
// ✅ Worker-based heavy computation
// ✅ Async predictions with caching
// ================================================

import EventBus from '../core/EventBus';
import { createLogger } from '../core/Logger';

const log = createLogger('PredictionEngine');

export class PredictionEngine {
  constructor() {
    this.state = {
      baselineYear: 2025,
      predictions: new Map(), // year -> prediction result
      models: {
        population: null,
        sprawl: null,
        infrastructure: null,
        landValue: null,
      },
      isComputing: false,
      activeScenarios: new Map(), // scenario name -> parameters
    };
    this.eventBus = EventBus;
    this._worker = null;
    this._requestId = 0;
    this._pendingRequests = new Map();
    this._modelCache = new Map(); // scenario + year -> cached result
    this._destroyed = false;
  }

  /**
   * Initialize prediction worker
   */
  async initialize() {
    if (this._destroyed) return;
    
    try {
      this._worker = new Worker(
        new URL('../workers/predictionWorker.js', import.meta.url),
        { type: 'module' }
      );
      
      this._worker.onmessage = (event) => {
        this._handleWorkerMessage(event.data);
      };
      
      this._worker.onerror = (error) => {
        log.error('Prediction worker error:', error);
        this.eventBus.emit('prediction:error', { error: error.message });
      };

      log.info('Prediction worker initialized');
    } catch (error) {
      log.error('Failed to initialize worker:', error);
    }
  }

  /**
   * Handle worker response
   */
  _handleWorkerMessage(data) {
    if (!data) return;
    
    const { requestId, scenario, year, result, error } = data;
    const request = this._pendingRequests.get(requestId);
    
    if (!request) return;
    
    this._pendingRequests.delete(requestId);
    
    if (error) {
      request.reject(new Error(error));
      return;
    }

    // Cache result
    const cacheKey = `${scenario}:${year}`;
    this._modelCache.set(cacheKey, result);
    
    // Store prediction
    if (!this.state.predictions.has(year)) {
      this.state.predictions.set(year, {});
    }
    this.state.predictions.get(year)[scenario] = result;
    
    request.resolve(result);
    this.eventBus.emit('prediction:computed', { scenario, year, result });
  }

  /**
   * Predict population growth for future years
   * @param {object} baseline — { population, density, growthRate, infrastructureProximity }
   * @param {number} targetYear
   * @param {string} scenario — 'conservative' | 'moderate' | 'aggressive' | 'custom'
   * @returns {Promise<object>}
   */
  async predictPopulationGrowth(baseline = {}, targetYear = 2050, scenario = 'moderate') {
    if (this._destroyed) return null;

    const { population = 420000, density = 0.6, growthRate = 0.019, infrastructureProximity = 0.5 } = baseline;
    
    // Check cache first
    const cacheKey = `population:${scenario}:${targetYear}`;
    if (this._modelCache.has(cacheKey)) {
      return this._modelCache.get(cacheKey);
    }

    if (!this._worker) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      const requestId = ++this._requestId;
      
      this._pendingRequests.set(requestId, { resolve, reject });
      
      this._worker.postMessage({
        requestId,
        type: 'predictPopulation',
        scenario,
        baseline: {
          population,
          density,
          growthRate,
          infrastructureProximity,
        },
        targetYear,
        baselineYear: this.state.baselineYear,
      });

      // Timeout after 10s
      setTimeout(() => {
        if (this._pendingRequests.has(requestId)) {
          this._pendingRequests.delete(requestId);
          reject(new Error('Prediction timeout'));
        }
      }, 10000);
    });
  }

  /**
   * Predict urban sprawl expansion zones
   * @param {object} cityData — { center, currentExtent, terrainSuitability }
   * @param {number} targetYear
   * @returns {Promise<object>}
   */
  async predictUrbanSprawl(cityData = {}, targetYear = 2050) {
    if (this._destroyed) return null;

    const cacheKey = `sprawl:${targetYear}`;
    if (this._modelCache.has(cacheKey)) {
      return this._modelCache.get(cacheKey);
    }

    if (!this._worker) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      const requestId = ++this._requestId;
      this._pendingRequests.set(requestId, { resolve, reject });

      this._worker.postMessage({
        requestId,
        type: 'predictSprawl',
        cityData,
        targetYear,
        baselineYear: this.state.baselineYear,
      });

      setTimeout(() => {
        if (this._pendingRequests.has(requestId)) {
          this._pendingRequests.delete(requestId);
          reject(new Error('Sprawl prediction timeout'));
        }
      }, 10000);
    });
  }

  /**
   * Predict infrastructure demand
   * @param {object} baseline — { population, existingInfrastructure, coverage }
   * @param {number} targetYear
   * @returns {Promise<object>}
   */
  async predictInfrastructureDemand(baseline = {}, targetYear = 2050) {
    if (this._destroyed) return null;

    const cacheKey = `infra:${targetYear}`;
    if (this._modelCache.has(cacheKey)) {
      return this._modelCache.get(cacheKey);
    }

    if (!this._worker) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      const requestId = ++this._requestId;
      this._pendingRequests.set(requestId, { resolve, reject });

      this._worker.postMessage({
        requestId,
        type: 'predictInfrastructure',
        baseline,
        targetYear,
        baselineYear: this.state.baselineYear,
      });

      setTimeout(() => {
        if (this._pendingRequests.has(requestId)) {
          this._pendingRequests.delete(requestId);
          reject(new Error('Infrastructure prediction timeout'));
        }
      }, 10000);
    });
  }

  /**
   * Predict land value changes
   * @param {object} baseline — { currentValue, accessibility, amenities, risk }
   * @param {number} targetYear
   * @returns {Promise<object>}
   */
  async predictLandValue(baseline = {}, targetYear = 2050) {
    if (this._destroyed) return null;

    const cacheKey = `landValue:${targetYear}`;
    if (this._modelCache.has(cacheKey)) {
      return this._modelCache.get(cacheKey);
    }

    if (!this._worker) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      const requestId = ++this._requestId;
      this._pendingRequests.set(requestId, { resolve, reject });

      this._worker.postMessage({
        requestId,
        type: 'predictLandValue',
        baseline,
        targetYear,
        baselineYear: this.state.baselineYear,
      });

      setTimeout(() => {
        if (this._pendingRequests.has(requestId)) {
          this._pendingRequests.delete(requestId);
          reject(new Error('Land value prediction timeout'));
        }
      }, 10000);
    });
  }

  /**
   * Run all predictions for a given year & scenario
   */
  async predictFutureState(baseline = {}, targetYear = 2050, scenario = 'moderate') {
    if (this._destroyed) return null;

    this.state.isComputing = true;
    this.eventBus.emit('prediction:started', { targetYear, scenario });

    try {
      const [population, sprawl, infrastructure, landValue] = await Promise.all([
        this.predictPopulationGrowth(baseline, targetYear, scenario),
        this.predictUrbanSprawl(baseline, targetYear),
        this.predictInfrastructureDemand(baseline, targetYear),
        this.predictLandValue(baseline, targetYear),
      ]);

      const result = { population, sprawl, infrastructure, landValue, scenario, year: targetYear };
      this.state.isComputing = false;
      this.eventBus.emit('prediction:complete', result);
      
      return result;
    } catch (error) {
      this.state.isComputing = false;
      this.eventBus.emit('prediction:error', { error: error.message });
      log.error('Prediction failed:', error);
      throw error;
    }
  }

  /**
   * Subscribe to prediction events
   */
  on(event, callback) {
    return this.eventBus.on(event, callback);
  }

  /**
   * Clear cache and reset state
   */
  reset() {
    this._modelCache.clear();
    this.state.predictions.clear();
    this.state.models = { population: null, sprawl: null, infrastructure: null, landValue: null };
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
    this._modelCache.clear();
    this.eventBus.clear();
  }
}

export default new PredictionEngine();
