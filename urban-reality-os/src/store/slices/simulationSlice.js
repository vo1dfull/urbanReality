import { INITIAL_YEAR } from '../../constants/mapConstants';
import { applyUpdater } from './utils';

export const createSimulationSlice = (set) => ({
  simulationState: {
    running: false,
    progress: 0,
    metrics: { risk: 0, damage: 0, affected: 0 },
    year: INITIAL_YEAR,
    outputs: {
      populationGrowth: { current: 0, growthRatePct: 0 },
      infrastructureStress: 0,
      environmentalChanges: 0,
      riskLevels: { flood: 0, heat: 0, health: 0, overall: 0 },
    },
  },
  setSimulationState: (updater) =>
    set((state) => ({
      simulationState: applyUpdater(updater, state.simulationState),
    })),
  batchSet: (updates) => set(updates),
});
