import { create } from 'zustand';
import { createMapSlice } from './slices/mapSlice';
import { createUiSlice } from './slices/uiSlice';
import { createSimulationSlice } from './slices/simulationSlice';

const useMapStore = create((set, get) => ({
  ...createMapSlice(set, get),
  ...createUiSlice(set, get),
  ...createSimulationSlice(set, get),
}));

export default useMapStore;
