// ================================================
// SimulationEngine — Flood simulation state & scenarios
// ✅ _notify() batched via requestAnimationFrame
// ✅ RAF ID tracked for cleanup
// ✅ destroy() method for clean shutdown
// ================================================

export class SimulationEngine {
  constructor() {
    this.state = {
      rainIntensity: 80,
      waterLevel: 1.2,
      speed: 1.0,
      active: false,
      location: null,
      timestamp: Date.now()
    };
    this.subscribers = new Set();
    this._notifyPending = false;
    this._notifyRafId = null;
    this._destroyed = false;
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
  }
}

export const simulationEngine = new SimulationEngine();
