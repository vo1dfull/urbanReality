// ================================================
// SimulationEngine — Year-based simulation pipeline
// ✅ Worker-first heavy model computation
// ✅ Exponential population + trend + rule-based risk
// ✅ Batched notifications + store sync
// ================================================

import useMapStore from '../store/useMapStore';
import { BASE_YEAR } from '../constants/mapConstants';

/** @typedef {Object} FloodScenarioResult
 * @property {number} floodExtentKm2 — area covered by water
 * @property {number} affectedPopulation — estimated people in flood zone
 * @property {number} damageFactor — 0-1 infrastructure damage score
 * @property {number} duration_hours
 * @property {Array<{lng: number, lat: number}>} floodingZones — affected coordinates
 */

/** @typedef {Object} HeatwaveResult
 * @property {number} excessMortalityEstimate — deaths above baseline
 * @property {number} energyDemandSpikePct — % increase in power demand
 * @property {number} coolingCenterDemandCapacity — people needing cooling shelter
 * @property {number} peakTempCelsius
 * @property {number} duration_days
 */

/** @typedef {Object} EarthquakeResult
 * @property {number} magnitudeLocal — moment magnitude
 * @property {number} mmiIntensity — Modified Mercalli Intensity (1-12)
 * @property {number} expectedFatalitiesLow — conservative estimate
 * @property {number} expectedFatalitiesHigh — pessimistic estimate
 * @property {number} structuralDamageFactorKm2 — damage fraction per zone
 * @property {{lng: number, lat: number}} epicenter
 */

/** @typedef {Object} SimulationLogEntry
 * @property {number} timestamp
 * @property {number} year
 * @property {object} outputSnapshot — copy of outputs at this moment
 * @property {string} eventType — 'year-changed', 'scenario', etc.
 */

export class SimulationEngine {
  constructor() {
    this.state = {
      year: BASE_YEAR,
      rainIntensity: 80,
      waterLevel: 1.2,
      speed: 1.0,
      active: false,
      location: null,
      outputs: {
        populationGrowth: { current: 0, growthRatePct: 0 },
        infrastructureStress: 0,
        environmentalChanges: 0,
        riskLevels: { flood: 0, heat: 0, health: 0, overall: 0 },
      },
      timestamp: Date.now()
    };

    // EventEmitter-style API
    this._eventListeners = new Map(); // Map<eventName, Set<{cb, once}>

    this._notifyPending = false;
    this._notifyRafId = null;
    this._syncPending = false;
    this._syncRafId = null;
    this._destroyed = false;
    this._paused = false;
    this._worker = null;
    this._requestId = 0;
    this._lastHandledId = 0;
    this._setYearTimeout = null;
    this._simulationLog = []; // Last 200 snapshots
    this._maxLogSize = 200;
  }

  // ==================== EventEmitter API ====================

  /**
   * Register event listener.
   * @param {string} event — 'year-changed', 'output-updated', 'simulation-started', 'simulation-stopped'
   * @param {Function} callback
   */
  on(event, callback) {
    if (typeof callback !== 'function') return;
    if (!this._eventListeners.has(event)) {
      this._eventListeners.set(event, new Set());
    }
    this._eventListeners.get(event).add({ cb: callback, once: false });
  }

  /**
   * Register one-time event listener.
   * @param {string} event
   * @param {Function} callback
   */
  once(event, callback) {
    if (typeof callback !== 'function') return;
    if (!this._eventListeners.has(event)) {
      this._eventListeners.set(event, new Set());
    }
    this._eventListeners.get(event).add({ cb: callback, once: true });
  }

  /**
   * Unregister event listener.
   * @param {string} event
   * @param {Function} callback
   */
  off(event, callback) {
    if (!this._eventListeners.has(event)) return;
    const listeners = this._eventListeners.get(event);
    for (const listener of listeners) {
      if (listener.cb === callback) {
        listeners.delete(listener);
        break;
      }
    }
  }

  /**
   * Emit an event to all listeners.
   * @private
   */
  _emit(event, data = {}) {
    if (!this._eventListeners.has(event)) return;
    const listeners = this._eventListeners.get(event);
    const toRemove = [];

    for (const listener of listeners) {
      try {
        listener.cb(data);
        if (listener.once) {
          toRemove.push(listener);
        }
      } catch (error) {
        console.warn(`Event listener error for "${event}":`, error);
      }
    }

    // Remove one-time listeners
    for (const listener of toRemove) {
      listeners.delete(listener);
    }
  }

  // ==================== Legacy Subscriber API (preserved for backward compat) ====================

  _notify() {
    if (this._notifyPending || this._destroyed || this._paused) return;
    this._notifyPending = true;

    this._notifyRafId = requestAnimationFrame(() => {
      this._notifyPending = false;
      this._notifyRafId = null;
      if (this._destroyed || this._paused) return;

      // Emit output-updated event
      this._emit('output-updated', this.state);
    });
  }

  subscribe(callback) {
    if (typeof callback !== 'function') return () => {};
    // Register as a listener on output-updated event
    this.on('output-updated', callback);
    callback(this.state);
    return () => this.off('output-updated', callback);
  }

  _log(eventType, snapshot = null) {
    const entry = {
      timestamp: Date.now(),
      year: this.state.year,
      outputSnapshot: snapshot || { ...this.state.outputs },
      eventType,
    };
    this._simulationLog.push(entry);
    if (this._simulationLog.length > this._maxLogSize) {
      this._simulationLog.shift();
    }
  }

  setSimulationParameters(params) {
    if (this._destroyed) return;
    this.state = { ...this.state, ...params, timestamp: Date.now() };
    this._notify();
  }

  setYear(year, baseline = {}) {
    if (this._destroyed || !Number.isFinite(year)) return;

    // Debounce rapid year changes — only dispatch if stable for 150ms
    if (this._setYearTimeout !== null) {
      clearTimeout(this._setYearTimeout);
    }

    this._setYearTimeout = setTimeout(() => {
      this._setYearTimeout = null;
      this._executeSetYear(year, baseline);
    }, 150);

    // Update UI state immediately
    this.state = { ...this.state, year, timestamp: Date.now() };
    this._notify();
  }

  _executeSetYear(year, baseline = {}) {
    if (this._destroyed || this._paused) return;
    this._ensureWorker();
    const requestId = ++this._requestId;

    this._log('year-changed');

    if (!this._worker) {
      // Fallback when worker not available
      const growthRate = baseline.populationGrowthRate ?? 0.019;
      const pop = Math.round((baseline.population ?? 420000) * Math.pow(1 + growthRate, Math.max(0, year - BASE_YEAR)));
      this.state = {
        ...this.state,
        outputs: {
          populationGrowth: { current: pop, growthRatePct: Number((growthRate * 100).toFixed(2)) },
          infrastructureStress: 0,
          environmentalChanges: 0,
          riskLevels: { flood: 0, heat: 0, health: 0, overall: 0 },
        },
      };
      this._markSyncPending();
      this._notify();
      return;
    }

    this._worker.postMessage({
      requestId,
      year,
      baseYear: BASE_YEAR,
      baseline: {
        population: baseline.population ?? useMapStore.getState().macroData?.population?.value ?? 420000,
        populationGrowthRate: baseline.populationGrowthRate ?? 0.019,
        infrastructureCapacity: baseline.infrastructureCapacity ?? 1.0,
        environmentIndex: baseline.environmentIndex ?? 0.55,
        baseRisk: baseline.baseRisk ?? 0.28,
      },
    });
  }

  setFloodTrigger(location) {
    if (this._destroyed) return;
    this.state = { ...this.state, active: true, location, timestamp: Date.now() };
    this._notify();
  }

  resetSimulation() {
    if (this._destroyed) return;
    this.state = { ...this.state, active: false, location: null, timestamp: Date.now() };
    this._notify();
  }

  generateScenario(scenario = {}) {
    const rainFactor = scenario.rainfallMultiplier ?? 1;
    const populationFactor = scenario.populationMultiplier ?? 1;
    const infrastructureQuality = scenario.infrastructureQuality ?? 1;

    return {
      floodRisk: Math.min(1, 0.25 * rainFactor + 0.1 * populationFactor + 0.15 * (1 - infrastructureQuality)),
      heatIndex: Math.min(50, 28 + 4 * populationFactor + 3 * rainFactor - 2 * infrastructureQuality),
      pollutionIndex: Math.min(100, 40 + 10 * populationFactor + 8 * (1 - infrastructureQuality)),
      trafficStress: Math.min(1, 0.2 * populationFactor + 0.3 * (1 - infrastructureQuality))
    };
  }

  _ensureWorker() {
    if (this._worker || typeof Worker === 'undefined') return;
    try {
      this._worker = new Worker(new URL('../workers/simulationWorker.js', import.meta.url), { type: 'module' });
      this._worker.onmessage = ({ data }) => {
        if (!data?.requestId || data.requestId < this._lastHandledId || this._paused) return;
        this._lastHandledId = data.requestId;
        this.state = {
          ...this.state,
          year: data.year ?? this.state.year,
          outputs: data.output || this.state.outputs,
          timestamp: Date.now(),
        };
        this._markSyncPending();
        this._notify();
      };
      this._worker.onerror = () => {
        // Keep engine alive with existing state.
      };
    } catch {
      this._worker = null;
    }
  }

  /**
   * Mark store sync as pending — executes at most once per RAF.
   * @private
   */
  _markSyncPending() {
    if (this._syncPending || this._destroyed || this._paused) return;
    this._syncPending = true;

    this._syncRafId = requestAnimationFrame(() => {
      this._syncPending = false;
      this._syncRafId = null;
      if (this._destroyed || this._paused) return;
      this._syncStore();
    });
  }

  _syncStore() {
    const store = useMapStore.getState();
    if (!store?.setSimulationState) return;
    const o = this.state.outputs;
    store.setSimulationState((prev) => ({
      ...prev,
      running: this.state.active,
      year: this.state.year,
      progress: Math.round(((this.state.year - BASE_YEAR) / (2040 - BASE_YEAR)) * 100),
      metrics: {
        risk: o.riskLevels.overall,
        damage: o.infrastructureStress,
        affected: o.populationGrowth.current,
      },
      outputs: o,
    }));
  }

  // ==================== Pause/Resume ====================

  /**
   * Pause simulation — suspends worker messages and notifications.
   */
  pause() {
    if (this._destroyed) return;
    this._paused = true;
    this._emit('simulation-stopped', { reason: 'paused' });
  }

  /**
   * Resume simulation.
   */
  resume() {
    if (this._destroyed) return;
    this._paused = false;
    this._emit('simulation-started', {});
    this._notify();
  }

  /**
   * Get debug stats.
   */
  getStats() {
    return {
      listenerCount: Array.from(this._eventListeners.values()).reduce((sum, set) => sum + set.size, 0),
      active: this.state.active,
      paused: this._paused,
      notifyPending: this._notifyPending,
      syncPending: this._syncPending,
      logSize: this._simulationLog.length,
    };
  }

  // ==================== Scenario Simulations ====================

  /**
   * Run a flood scenario simulation.
   * @param {{lng: number, lat: number}} triggerLngLat
   * @param {number} rainfall_mm
   * @param {number} duration_hours
   * @returns {Promise<FloodScenarioResult>}
   */
  async runFloodScenario(triggerLngLat, rainfall_mm, duration_hours) {
    if (!triggerLngLat || !Number.isFinite(rainfall_mm) || !Number.isFinite(duration_hours)) {
      return Promise.reject(new Error('Invalid flood scenario parameters'));
    }

    const pop = this.state.outputs.populationGrowth.current || 420000;

    // Simple flood model: extent based on rainfall + terrain
    const floodExtentKm2 = Math.min(
      100,
      (rainfall_mm / 50) * 5 + (duration_hours / 24) * 2
    );

    // Affected population: ~50% of those within flood extent
    const affectedPopulation = Math.round((pop / 100) * Math.min(floodExtentKm2 * 0.5, 50));

    // Damage factor: increases with rainfall intensity and duration
    const damageFactor = Math.min(1, (rainfall_mm / 200) * 0.6 + (duration_hours / 48) * 0.4);

    // Generate affected zones (simplified grid around trigger point)
    const floodingZones = [];
    const zoneRadius = Math.sqrt(floodExtentKm2 / Math.PI);
    const steps = Math.max(4, Math.ceil(zoneRadius / 0.5));
    for (let i = 0; i < steps; i += 1) {
      const angle = (i / steps) * Math.PI * 2;
      const distance = zoneRadius * 111; // km to decimal degrees (rough)
      floodingZones.push({
        lng: triggerLngLat.lng + (Math.cos(angle) * distance) / 111,
        lat: triggerLngLat.lat + (Math.sin(angle) * distance) / 111,
      });
    }

    // Update state
    const result = {
      floodExtentKm2: Math.round(floodExtentKm2 * 100) / 100,
      affectedPopulation,
      damageFactor: Math.round(damageFactor * 100) / 100,
      duration_hours,
      floodingZones,
    };

    this._log('scenario-flood', { floodScenario: result });
    this._emit('output-updated', { scenario: 'flood', ...result });

    return result;
  }

  /**
   * Run a heatwave scenario simulation.
   * @param {number} duration_days
   * @param {number} peakTempCelsius
   * @returns {Promise<HeatwaveResult>}
   */
  async runHeatwaveScenario(duration_days, peakTempCelsius) {
    if (!Number.isFinite(duration_days) || !Number.isFinite(peakTempCelsius)) {
      return Promise.reject(new Error('Invalid heatwave scenario parameters'));
    }

    const pop = this.state.outputs.populationGrowth.current || 420000;
    const baseline_temp = 28; // assumes temperate Indian city baseline

    const tempAnomaly = Math.max(0, peakTempCelsius - baseline_temp);

    // Excess mortality: ~240 deaths per 1°C rise per 1M people per day (simplistic)
    const excessMortalityEstimate = Math.round(
      (pop / 1000000) * tempAnomaly * duration_days * 240 * 0.001
    );

    // Energy demand spike: +3% per 1°C rise
    const energyDemandSpikePct = Math.round(tempAnomaly * 3 * 10) / 10;

    // Cooling center demand: ~5% of population per degree above 40°C
    let coolingDemand = 0;
    if (peakTempCelsius > 40) {
      coolingDemand = Math.round(pop * 0.05 * (peakTempCelsius - 40));
    }

    const result = {
      excessMortalityEstimate,
      energyDemandSpikePct,
      coolingCenterDemandCapacity: coolingDemand,
      peakTempCelsius,
      duration_days,
    };

    this._log('scenario-heatwave', { heatwaveScenario: result });
    this._emit('output-updated', { scenario: 'heatwave', ...result });

    return result;
  }

  /**
   * Run an earthquake scenario simulation.
   * @param {number} magnitude
   * @param {{lng: number, lat: number}} epicenter
   * @returns {Promise<EarthquakeResult>}
   */
  async runEarthquakeScenario(magnitude, epicenter) {
    if (!Number.isFinite(magnitude) || !epicenter) {
      return Promise.reject(new Error('Invalid earthquake scenario parameters'));
    }

    const pop = this.state.outputs.populationGrowth.current || 420000;

    // MMI Intensity: simplified mapping from moment magnitude
    const mmiIntensity = Math.min(12, 2 + magnitude * 1.5);

    // Fatality estimates (Wald et al. model, simplified)
    const affectedArea = Math.pow(10, magnitude - 3.5); // km²
    const popDensity = pop > 0 ? pop / 100 : 4200; // per km²
    const affectedPop = affectedArea * popDensity;

    // Log-linear mortality: ~1% at MMI 7, ~10% at MMI 10
    const mortalityRate = Math.min(0.5, 0.001 * Math.pow(mmiIntensity, 3.5));

    const expectedFatalitiesLow = Math.round(affectedPop * mortalityRate * 0.5);
    const expectedFatalitiesHigh = Math.round(affectedPop * mortalityRate * 1.5);

    // Structural damage factor based on MMI
    const structuralDamageFactorKm2 = Math.min(1, mmiIntensity / 12);

    const result = {
      magnitudeLocal: magnitude,
      mmiIntensity: Math.round(mmiIntensity * 10) / 10,
      expectedFatalitiesLow,
      expectedFatalitiesHigh,
      structuralDamageFactorKm2: Math.round(structuralDamageFactorKm2 * 100) / 100,
      epicenter,
    };

    this._log('scenario-earthquake', { earthquakeScenario: result });
    this._emit('output-updated', { scenario: 'earthquake', ...result });

    return result;
  }

  /**
   * Export simulation log (last 200 snapshots).
   * @returns {SimulationLogEntry[]}
   */
  exportSimulationLog() {
    return this._simulationLog.map((entry) => ({
      timestamp: entry.timestamp,
      year: entry.year,
      outputSnapshot: { ...entry.outputSnapshot },
      eventType: entry.eventType,
    }));
  }

  /**
   * Clean shutdown — cancel pending RAF, clear listeners.
   */
  destroy() {
    this._destroyed = true;
    this._paused = true;

    // Cancel timeouts
    if (this._setYearTimeout !== null) {
      clearTimeout(this._setYearTimeout);
      this._setYearTimeout = null;
    }

    // Cancel RAF tasks
    if (this._notifyRafId !== null) {
      cancelAnimationFrame(this._notifyRafId);
      this._notifyRafId = null;
    }
    if (this._syncRafId !== null) {
      cancelAnimationFrame(this._syncRafId);
      this._syncRafId = null;
    }

    this._notifyPending = false;
    this._syncPending = false;

    // Clear event listeners
    this._eventListeners.clear();

    // Terminate worker
    if (this._worker) {
      this._worker.terminate();
      this._worker = null;
    }

    // Clear log
    this._simulationLog.length = 0;
  }
}

export const simulationEngine = new SimulationEngine();
