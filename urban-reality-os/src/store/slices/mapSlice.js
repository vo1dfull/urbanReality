import { INITIAL_YEAR, MAP_CONFIG } from '../../constants/mapConstants';
import { applyUpdater } from './utils';

export const createMapSlice = (set) => ({
  mapReady: false,
  loading: true,
  error: null,
  mapStyle: 'default',
  layers: {
    aqi: true,
    flood: false,
    traffic: false,
    floodDepth: false,
    hospitals: false,
    policeStations: false,
    fireStations: false,
    schools: false,
    nasaEvents: false,
  },
  dataReady: false,
  year: INITIAL_YEAR,
  cameraState: { bearing: MAP_CONFIG.bearing, pitch: MAP_CONFIG.pitch },
  macroData: null,
  terrainSubLayers: {
    elevation: false,
    flood: false,
    suitability: false,
    heat: false,
    green: false,
    road: false,
    hillshade: false,
  },
  terrainMode: 'elevation',
  terrainHoveredPoint: null,
  qualityLevel: 'high',
  safeMode: true,
  perfMode: 'balanced',
  // Shared “green intervention” state (used by Heat + Flood + Green modules)
  // Stored as stable string keys: "lngKey,latKey" (rounded to 1e-3 deg)
  greenZones: [],

  setMapReady: (ready) => set({ mapReady: ready }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setMapStyle: (style) => set({ mapStyle: style }),
  setLayers: (updater) => set((state) => ({ layers: applyUpdater(updater, state.layers) })),
  toggleLayer: (key) => set((state) => ({ layers: { ...state.layers, [key]: !state.layers[key] } })),
  setDataReady: (ready) => set({ dataReady: ready }),
  setYear: (year) => set({ year }),
  setCameraState: (cam) => set({ cameraState: cam }),
  setMacroData: (data) => set({ macroData: data }),
  setTerrainSubLayers: (updater) => set((state) => ({ terrainSubLayers: applyUpdater(updater, state.terrainSubLayers) })),
  toggleTerrainSubLayer: (key) => set((state) => ({ terrainSubLayers: { ...state.terrainSubLayers, [key]: !state.terrainSubLayers[key] } })),
  setTerrainMode: (mode) => set({ terrainMode: mode }),
  setTerrainHoveredPoint: (point) => set({ terrainHoveredPoint: point }),
  setQualityLevel: (level) => set({ qualityLevel: level }),
  setSafeMode: (enabled) => set({ safeMode: !!enabled }),
  setPerfMode: (mode) => set({ perfMode: mode }),

  addGreenZone: (lng, lat) => set((state) => {
    const key = `${Math.round(lng * 1000)},${Math.round(lat * 1000)}`;
    if (state.greenZones.includes(key)) return state;
    const next = [key, ...state.greenZones].slice(0, 500);
    return { greenZones: next };
  }),
  removeGreenZone: (lng, lat) => set((state) => {
    const key = `${Math.round(lng * 1000)},${Math.round(lat * 1000)}`;
    return { greenZones: state.greenZones.filter((k) => k !== key) };
  }),
  toggleGreenZone: (lng, lat) => set((state) => {
    const key = `${Math.round(lng * 1000)},${Math.round(lat * 1000)}`;
    const has = state.greenZones.includes(key);
    return { greenZones: has ? state.greenZones.filter((k) => k !== key) : [key, ...state.greenZones].slice(0, 500) };
  }),
  clearGreenZones: () => set({ greenZones: [] }),

  // ── Disaster simulation impact ──────────────────────────────────────────
  simulationImpact: null, // { traffic, aqi, risk, livability }
  setSimulationImpact: (impact) => set({ simulationImpact: impact }),
  clearSimulationImpact: () => set({ simulationImpact: null }),
});
