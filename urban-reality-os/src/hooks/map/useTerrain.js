import { terrainEngine } from '../../engines/TerrainEngine';

export function useTerrain() {
  const getTerrainMetrics = (map, lngLat, options = {}) => {
    if (!map || !lngLat) {
      return {
        elevation: 0,
        slope: 0,
        drainage: 0,
        heat: 0,
        baseTerrainCost: 100,
        terrainQuality: 0,
        tileScore: 0
      };
    }

    terrainEngine.init(map);
    return terrainEngine.getTerrainMetrics(map, lngLat, options);
  };

  const prefetchTerrainGrid = (map, bounds, step = 0.002, options = {}) => {
    if (!map || !bounds) return;
    terrainEngine.init(map);
    terrainEngine.prefetchGrid(map, bounds, step, options);
  };

  const clearCache = () => {
    terrainEngine.clearCache();
  };

  return {
    getTerrainMetrics,
    prefetchTerrainGrid,
    clearCache
  };
}
