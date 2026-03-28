import { useState, useCallback, useRef } from 'react';

export function useSimulation() {
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationType, setSimulationType] = useState(null);
  const [simulationData, setSimulationData] = useState(null);
  const simulationRef = useRef(null);

  const startSimulation = useCallback((type, data = {}) => {
    setIsSimulating(true);
    setSimulationType(type);
    setSimulationData(data);

    // Clear any existing simulation
    if (simulationRef.current) {
      cancelAnimationFrame(simulationRef.current);
    }
  }, []);

  const stopSimulation = useCallback(() => {
    setIsSimulating(false);
    setSimulationType(null);
    setSimulationData(null);

    if (simulationRef.current) {
      cancelAnimationFrame(simulationRef.current);
      simulationRef.current = null;
    }
  }, []);

  const updateSimulationData = useCallback((data) => {
    setSimulationData(prev => ({ ...prev, ...data }));
  }, []);

  const getSimulationState = useCallback(() => {
    return {
      isSimulating,
      simulationType,
      simulationData
    };
  }, [isSimulating, simulationType, simulationData]);

  return {
    startSimulation,
    stopSimulation,
    updateSimulationData,
    getSimulationState,
    simulationRef
  };
}