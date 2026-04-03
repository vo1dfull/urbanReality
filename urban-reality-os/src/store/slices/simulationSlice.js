import { INITIAL_YEAR } from '../../constants/mapConstants';
import { applyUpdater } from './utils';

export const createSimulationSlice = (set) => ({
  simulationState: {
    running: false,
    progress: 0,
    metrics: { risk: 0, damage: 0, affected: 0 },
    year: INITIAL_YEAR,
  },
  setSimulationState: (updater) =>
    set((state) => ({
      simulationState: applyUpdater(updater, state.simulationState),
    })),
  batchSet: (updates) => set(updates),
});
