// ================================================
// Heat Layer Plugin
// Handles urban heat island heatmap rendering
// ================================================
import BaseLayerPlugin from '../BaseLayerPlugin';
import { terrainEngine } from '../../engines/TerrainEngine';

export default class HeatLayerPlugin extends BaseLayerPlugin {
  constructor() {
    super('terrainHeat');
    this.heatData = { type: 'FeatureCollection', features: [] };
    this.greenZonesData = { type: 'FeatureCollection', features: [] };
  }

  getBuildingDensity(lng, lat) {
    const urbanCenterDist = Math.sqrt(Math.pow(lng - 77.209, 2) + Math.pow(lat - 28.6139, 2));
    return Math.max(0, Math.min(1, 1 - urbanCenterDist * 10));
  }

  calculateHeatIndex(map, lng, lat, year, greenZonesSet) {
    const terrainMetrics = terrainEngine.getTerrainMetrics(map, { lng, lat });
    const buildingDensity = this.getBuildingDensity(lng, lat);
    const { elevation, slope } = terrainMetrics;

    const greenZoneKey = `${Math.round(lng * 1000)},${Math.round(lat * 1000)}`;
    const hasGreenZone = greenZonesSet && greenZonesSet.has(greenZoneKey);
    const greenCover = hasGreenZone ? 0.8 : 0.2;

    let temperature = 30;
    temperature += buildingDensity * 8;
    temperature -= elevation * 0.005;
    temperature -= slope * 0.1;
    temperature -= greenCover * 5;

    const yearOffset = (year - 2025) * 0.3;
    temperature += yearOffset;

    return Math.max(15, Math.min(50, temperature));
  }

  updateGrid(map, year, greenZonesSet) {
    if (!map) return;
    try {
      const bounds = map.getBounds();
      terrainEngine.prefetchGrid(map, bounds, 0.002, { year });
      const features = [];
      const step = 0.002;

      for (let lng = bounds.getWest(); lng <= bounds.getEast(); lng += step) {
        for (let lat = bounds.getSouth(); lat <= bounds.getNorth(); lat += step) {
          const temperature = this.calculateHeatIndex(map, lng, lat, year, greenZonesSet);
          features.push({
            type: 'Feature',
            properties: { temperature },
            geometry: { type: 'Point', coordinates: [lng, lat] }
          });
        }
      }

      this.heatData = { type: 'FeatureCollection', features };
      if (map.getSource('heat-data')) {
        map.getSource('heat-data').setData(this.heatData);
      }

      // Update Green Zones feature collection
      const gzFeatures = Array.from(greenZonesSet || new Set()).map(key => {
        const [glng, glat] = key.split(',').map(Number).map(x => x / 1000);
        return { type: 'Feature', geometry: { type: 'Point', coordinates: [glng, glat] } };
      });
      this.greenZonesData = { type: 'FeatureCollection', features: gzFeatures };
      if (map.getSource('green-zones')) {
        map.getSource('green-zones').setData(this.greenZonesData);
      }
    } catch (error) {
      console.error('[HeatLayerPlugin] Error updating grid:', error);
    }
  }

  init(map, data) {
    if (!map) return;
    try {
      this.updateGrid(map, data?.year || 2025, data?.greenZones || new Set());

      this._addSource(map, 'heat-data', { type: 'geojson', data: this.heatData });
      this._addLayer(map, {
        id: 'heat-heatmap',
        type: 'heatmap',
        source: 'heat-data',
        paint: {
          'heatmap-weight': ['interpolate', ['linear'], ['get', 'temperature'], 15, 0, 30, 0.5, 45, 1],
          'heatmap-intensity': 1,
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(30, 58, 138, 0)',
            0.2, 'rgba(59, 130, 246, 0.4)',
            0.4, 'rgba(245, 158, 11, 0.6)',
            0.6, 'rgba(249, 115, 22, 0.7)',
            0.8, 'rgba(220, 38, 38, 0.8)',
            1, 'rgba(124, 45, 18, 0.9)'
          ],
          'heatmap-radius': 25,
          'heatmap-opacity': 0.7
        },
        layout: { visibility: data?.visible ? 'visible' : 'none' }
      });

      this._addSource(map, 'green-zones', { type: 'geojson', data: this.greenZonesData });
      this._addLayer(map, {
        id: 'green-zones-fill',
        type: 'circle',
        source: 'green-zones',
        paint: {
          'circle-radius': 8,
          'circle-color': '#22c55e',
          'circle-opacity': 0.8,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#16a34a'
        },
        layout: { visibility: data?.visible ? 'visible' : 'none' }
      });

      this.initialized = true;
    } catch (err) {
      console.error('[HeatLayerPlugin] init error:', err);
    }
  }

  toggle(map, visible, year, greenZonesSet) {
    if (visible) this.updateGrid(map, year, greenZonesSet);
    try {
      if (map && map.getLayer('heat-heatmap')) map.setLayoutProperty('heat-heatmap', 'visibility', visible ? 'visible' : 'none');
      if (map && map.getLayer('green-zones-fill')) map.setLayoutProperty('green-zones-fill', 'visibility', visible ? 'visible' : 'none');
    } catch (e) {}
  }
}
