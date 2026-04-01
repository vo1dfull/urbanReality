// ================================================
// Urban Reality OS — Zustand Store
// Centralized state management for the map system
// ✅ Batch setter for multiple state updates in one render
// ✅ debugMode flag for dev tools
// ✅ fpsTarget for adaptive quality
// NOTE: MapLibre instances should not be stored in Zustand.
// ================================================
import { create } from 'zustand';
import { INITIAL_YEAR, MAP_CONFIG } from '../constants/mapConstants';

const applyUpdater = (updater, current) =>
  typeof updater === 'function' ? updater(current) : updater;

const useMapStore = create((set, get) => ({
  // ── Map Slice ──
  mapReady: false,
  loading: true,
  error: null,
  mapStyle: 'default',

  setMapReady: (ready) => set({ mapReady: ready }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setMapStyle: (style) => set({ mapStyle: style }),

  // ── Layer Slice ──
  layers: {
    aqi: true,
    flood: true,
    traffic: true,
    floodDepth: false,
    hospitals: false,
    policeStations: false,
    fireStations: false,
  },
  dataReady: false,

  setLayers: (updater) =>
    set((state) => ({
      layers: applyUpdater(updater, state.layers),
    })),
  toggleLayer: (key) =>
    set((state) => ({
      layers: { ...state.layers, [key]: !state.layers[key] },
    })),
  setDataReady: (ready) => set({ dataReady: ready }),

  // ── Location Slice ──
  activeLocation: null,
  locationData: null,
  uiMode: null, // legacy: null | 'location' | 'terrain'
  activePanel: null, // left dock active panel
  appMode: 'explore', // explore | simulation | planning
  buildMode: false,
  impactData: null,
  demographics: null,
  locationPopulation: null,

  setActiveLocation: (loc) => set({ activeLocation: loc }),
  setActivePanel: (panel) => set((state) => ({ activePanel: state.activePanel === panel ? null : panel })),
  setAppMode: (mode) => set({ appMode: mode }),
  setBuildMode: (active) => set((state) => ({ buildMode: typeof active === 'function' ? active(state.buildMode) : active })),
  setLocationData: (data) =>
    set((state) => ({
      locationData: applyUpdater(data, state.locationData),
    })),
  setUiMode: (mode) => set({ uiMode: mode }),
  setImpactData: (data) => set({ impactData: data }),
  setDemographics: (data) => set({ demographics: data }),
  setLocationPopulation: (pop) => set({ locationPopulation: pop }),

  // ── Analysis Slice ──
  urbanAnalysis: null,
  analysisLoading: false,

  setUrbanAnalysis: (analysis) => set({ urbanAnalysis: analysis }),
  setAnalysisLoading: (loading) => set({ analysisLoading: loading }),

  // ── UI Slice ──
  facilityCheckOpen: false,
  showLayersMenu: false,
  showSuggestions: false,
  facilityViewMode: 'coverage',
  hoveredFacility: null,
  floodMode: false,

  setFacilityCheckOpen: (open) =>
    set((state) => ({
      facilityCheckOpen: applyUpdater(open, state.facilityCheckOpen),
    })),
  setShowLayersMenu: (show) =>
    set((state) => ({
      showLayersMenu: applyUpdater(show, state.showLayersMenu),
    })),
  setShowSuggestions: (show) => set({ showSuggestions: show }),
  setFacilityViewMode: (mode) => set({ facilityViewMode: mode }),
  setHoveredFacility: (facility) => set({ hoveredFacility: facility }),
  setFloodMode: (mode) =>
    set((state) => ({
      floodMode: typeof mode === 'function' ? mode(state.floodMode) : mode,
    })),

  // ── Camera Slice ──
  year: INITIAL_YEAR,
  cameraState: { bearing: MAP_CONFIG.bearing, pitch: MAP_CONFIG.pitch },

  setYear: (year) => set({ year }),
  setCameraState: (cam) => set({ cameraState: cam }),

  // ── Macro Data ──
  macroData: null,
  setMacroData: (data) => set({ macroData: data }),

  // ── Terrain Slice ──
  terrainSubLayers: {
    elevation: false,
    flood: false,
    suitability: false,
    heat: false,
    green: false,
    road: false,
  },
  terrainMode: 'elevation',
  terrainHoveredPoint: null,
  
  setTerrainSubLayers: (updater) =>
    set((state) => ({
      terrainSubLayers:
        typeof updater === 'function'
          ? updater(state.terrainSubLayers)
          : updater,
    })),
  toggleTerrainSubLayer: (key) =>
    set((state) => ({
      terrainSubLayers: {
        ...state.terrainSubLayers,
        [key]: !state.terrainSubLayers[key],
      },
    })),
  setTerrainMode: (mode) => set({ terrainMode: mode }),
  setTerrainHoveredPoint: (point) => set({ terrainHoveredPoint: point }),

  // ── Simulation Slice ──
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

  // ── Debug Slice ──
  debugMode: false,
  setDebugMode: (mode) => set({ debugMode: mode }),

  // ── Adaptive Quality ──
  qualityLevel: 'high', // 'low' | 'medium' | 'high' | 'ultra'
  setQualityLevel: (level) => set({ qualityLevel: level }),

  // ── Notification (replaces alert()) ──
  notification: null,
  setNotification: (msg) => set({ notification: msg }),
  clearNotification: () => set({ notification: null }),

  // ── Batch setter: update multiple keys in a single render ──
  batchSet: (updates) => set(updates),
}));

export default useMapStore;
