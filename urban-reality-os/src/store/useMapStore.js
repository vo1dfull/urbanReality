import { create } from 'zustand';
import { createMapSlice } from './slices/mapSlice';
import { createUiSlice } from './slices/uiSlice';
import { createSimulationSlice } from './slices/simulationSlice';
import { createAuthSlice } from './slices/authSlice';

const useMapStore = create((set, get) => ({
  ...createMapSlice(set, get),
  ...createUiSlice(set, get),
  ...createSimulationSlice(set, get),
  ...createAuthSlice(set, get),
}));

export default useMapStore;
