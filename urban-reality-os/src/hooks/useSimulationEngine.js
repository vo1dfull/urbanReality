import { useEffect, useState } from 'react';
import { simulationEngine } from '../engines/SimulationEngine';

export function useSimulationEngine() {
  const [simulationState, setSimulationState] = useState(simulationEngine.state);

  useEffect(() => {
    const unsubscribe = simulationEngine.subscribe(setSimulationState);
    return unsubscribe;
  }, []);

  return {
    simulationState,
    setSimulationParameters: (params) => simulationEngine.setSimulationParameters(params),
    setFloodTrigger: (location) => simulationEngine.setFloodTrigger(location),
    resetSimulation: () => simulationEngine.resetSimulation(),
    generateScenario: (scenario) => simulationEngine.generateScenario(scenario)
  };
}
