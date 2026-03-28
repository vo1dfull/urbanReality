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
  }

  _notify() {
    this.subscribers.forEach((subscriber) => {
      try {
        subscriber(this.state);
      } catch (error) {
        console.warn('Simulation subscriber failed:', error);
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
    this.state = { ...this.state, ...params, timestamp: Date.now() };
    this._notify();
  }

  setFloodTrigger(location) {
    this.state = { ...this.state, active: true, location, timestamp: Date.now() };
    this._notify();
  }

  resetSimulation() {
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
}

export const simulationEngine = new SimulationEngine();
