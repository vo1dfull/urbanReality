// ================================================
// SimulationEngine — Year-based simulation pipeline
// ✅ Worker-first heavy model computation
// ✅ Exponential population + trend + rule-based risk
// ✅ Batched notifications + store sync
// ================================================

import useMapStore from '../store/useMapStore';
import { BASE_YEAR } from '../constants/mapConstants';

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
    this.subscribers = new Set();
    this._notifyPending = false;
    this._notifyRafId = null;
    this._destroyed = false;
    this._worker = null;
    this._requestId = 0;
    this._lastHandledId = 0;
  }

  _notify() {
    if (this._notifyPending || this._destroyed) return;
    this._notifyPending = true;

    this._notifyRafId = requestAnimationFrame(() => {
      this._notifyPending = false;
      this._notifyRafId = null;
      if (this._destroyed) return;

      for (const subscriber of this.subscribers) {
        try {
          subscriber(this.state);
        } catch (error) {
          console.warn('Simulation subscriber failed:', error);
        }
      }
    });
  }

  subscribe(callback) {
    if (typeof callback !== 'function') return () => {};
    this.subscribers.add(callback);
    callback(this.state);
    return () => this.subscribers.delete(callback);
  }

  setSimulationParameters(params) {
    if (this._destroyed) return;
    this.state = { ...this.state, ...params, timestamp: Date.now() };
    this._notify();
  }

  setYear(year, baseline = {}) {
    if (this._destroyed || !Number.isFinite(year)) return;
    this._ensureWorker();
    const requestId = ++this._requestId;
    this.state = { ...this.state, year, timestamp: Date.now() };
    this._notify();

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
      this._syncStore();
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
        if (!data?.requestId || data.requestId < this._lastHandledId) return;
        this._lastHandledId = data.requestId;
        this.state = {
          ...this.state,
          year: data.year ?? this.state.year,
          outputs: data.output || this.state.outputs,
          timestamp: Date.now(),
        };
        this._syncStore();
        this._notify();
      };
      this._worker.onerror = () => {
        // Keep engine alive with existing state.
      };
    } catch {
      this._worker = null;
    }
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

  /**
   * Get debug stats.
   */
  getStats() {
    return {
      subscriberCount: this.subscribers.size,
      active: this.state.active,
      notifyPending: this._notifyPending,
    };
  }

  /**
   * Clean shutdown — cancel pending RAF, clear subscribers.
   */
  destroy() {
    this._destroyed = true;
    if (this._notifyRafId !== null) {
      cancelAnimationFrame(this._notifyRafId);
      this._notifyRafId = null;
    }
    this._notifyPending = false;
    this.subscribers.clear();
    if (this._worker) {
      this._worker.terminate();
      this._worker = null;
    }
  }
}

export const simulationEngine = new SimulationEngine();
