// ================================================
// Urban Reality OS — Zustand Store
// Centralized state management for the map system
// ================================================
import { create } from 'zustand';
import { INITIAL_YEAR, MAP_CONFIG } from '../constants/mapConstants';

const useMapStore = create((set, get) => ({
  // ── Map Slice ──
  mapInstance: null,
  mapReady: false,
  loading: true,
  error: null,
  mapStyle: 'default',

  setMapInstance: (map) => set({ mapInstance: map }),
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
  aqiGeo: null,
  floodData: null,
  facilityData: null,
  cityDemo: null,

  setLayers: (updater) =>
    set((state) => ({
      layers: typeof updater === 'function' ? updater(state.layers) : updater,
    })),
  toggleLayer: (key) =>
    set((state) => ({
      layers: { ...state.layers, [key]: !state.layers[key] },
    })),
  setAqiGeo: (data) => set({ aqiGeo: data }),
  setFloodData: (data) => set({ floodData: data }),
  setFacilityData: (data) => set({ facilityData: data }),
  setCityDemo: (data) => set({ cityDemo: data }),

  // ── Location Slice ──
  activeLocation: null,
  locationData: null,
  uiMode: null, // null | 'location' | 'terrain'
  impactData: null,
  demographics: null,
  locationPopulation: null,

  setActiveLocation: (loc) => set({ activeLocation: loc }),
  setLocationData: (data) =>
    set((state) => ({
      locationData:
        typeof data === 'function' ? data(state.locationData) : data,
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
      facilityCheckOpen:
        typeof open === 'function' ? open(state.facilityCheckOpen) : open,
    })),
  setShowLayersMenu: (show) =>
    set((state) => ({
      showLayersMenu:
        typeof show === 'function' ? show(state.showLayersMenu) : show,
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
  terrainMode: 'elevation', // 'elevation' or 'slope'
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
      simulationState:
        typeof updater === 'function' ? updater(state.simulationState) : updater,
    })),
}));

export default useMapStore;
