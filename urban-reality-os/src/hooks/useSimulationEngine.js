import { useEffect, useMemo, useState } from 'react';

export function useSimulationEngine() {
  const [simulationState, setSimulationState] = useState({
    rainIntensity: 80,
    waterLevel: 1.2,
    speed: 1.0,
    active: false,
    location: null
  });

  const setSimulationParameters = (params) => {
    setSimulationState((prev) => ({ ...prev, ...params }));
  };

  const setFloodTrigger = (location) => {
    setSimulationState((prev) => ({ ...prev, active: true, location }));
  };

  const resetSimulation = () => {
    setSimulationState((prev) => ({ ...prev, active: false, location: null }));
  };

  const derived = useMemo(() => {
    return {
      isActive: simulationState.active,
      speedScalar: Math.max(0.2, Math.min(3, simulationState.speed)),
      rainIntensity: Math.max(10, Math.min(200, simulationState.rainIntensity)),
      waterLevel: Math.max(0.1, Math.min(4, simulationState.waterLevel)),
      location: simulationState.location
    };
  }, [simulationState]);

  useEffect(() => {
    if (derived.isActive && derived.location) {
      const timer = setTimeout(() => {
        setSimulationState((prev) => ({ ...prev, active: false }));
      }, 30_000);
      return () => clearTimeout(timer);
    }
  }, [derived.isActive, derived.location]);

  return {
    simulationState: derived,
    setSimulationParameters,
    setFloodTrigger,
    resetSimulation
  };
}
