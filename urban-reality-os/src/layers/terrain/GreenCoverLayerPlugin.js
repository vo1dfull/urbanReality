// ================================================
// Green Cover Layer Plugin
// Handles NDVI data and green cover visualization
// ================================================
import BaseLayerPlugin from '../BaseLayerPlugin';

const GREEN_COVER_COLORS = [
  [0, '#8B4513'],     // Brown (no vegetation)
  [0.2, '#DAA520'],   // Goldenrod
  [0.4, '#9ACD32'],   // Yellow green
  [0.6, '#32CD32'],   // Lime green
  [0.8, '#228B22'],   // Forest green
  [1, '#006400']      // Dark green (dense vegetation)
];

export default class GreenCoverLayerPlugin extends BaseLayerPlugin {
  constructor() {
    super('terrainGreen');
    this.coverData = { type: 'FeatureCollection', features: [] };
    this.userGreenZonesData = { type: 'FeatureCollection', features: [] };
    this.environmentScore = 65;
  }

  getNDVI(lng, lat) {
    const urbanCenterDist = Math.sqrt(Math.pow(lng - 77.209, 2) + Math.pow(lat - 28.6139, 2));
    const parkEffect = Math.exp(-Math.pow(urbanCenterDist - 0.005, 2) / 0.0001);
    const riverEffect = Math.exp(-Math.pow(urbanCenterDist - 0.002, 2) / 0.00005);

    let ndvi = Math.max(0.1, 0.8 - urbanCenterDist * 5);
    ndvi += parkEffect * 0.3;
    ndvi += riverEffect * 0.4;
    ndvi += (Math.sin(lng * 1000) * Math.cos(lat * 1000)) * 0.1;
    return Math.max(0, Math.min(1, ndvi));
  }

  calculateEnvironmentScore(features) {
    if (!features || features.length === 0) return 65;
    let score = 65;
    const avgNDVI = features.reduce((sum, f) => sum + f.properties.ndvi, 0) / features.length;
    score += avgNDVI * 20;

    const userAddedCount = this.userGreenZonesData.features.length;
    score += userAddedCount * 2;
    score += Math.min(10, userAddedCount * 0.5);

    return Math.min(100, Math.max(0, Math.round(score)));
  }

  updateGrid(map) {
    if (!map) return;
    try {
      const bounds = map.getBounds();
      const features = [];
      const step = 0.0005;

      for (let lng = bounds.getWest(); lng <= bounds.getEast(); lng += step) {
        for (let lat = bounds.getSouth(); lat <= bounds.getNorth(); lat += step) {
          const ndvi = this.getNDVI(lng, lat);
          features.push({
            type: 'Feature',
            properties: { ndvi, isUserAdded: false },
            geometry: {
              type: 'Polygon',
              coordinates: [[[lng, lat], [lng + step, lat], [lng + step, lat + step], [lng, lat + step], [lng, lat]]]
            }
          });
        }
      }

      this.coverData = { type: 'FeatureCollection', features };
      this.environmentScore = this.calculateEnvironmentScore(features);

      if (map.getSource('green-cover-data')) {
        map.getSource('green-cover-data').setData(this.coverData);
      }
    } catch (e) {
      console.error('[GreenCoverLayerPlugin] Error updating grid:', e);
    }
  }

  addGreenZone(map, lng, lat) {
    if (!map) return;
    this.userGreenZonesData.features.push({
      type: 'Feature',
      properties: { isUserAdded: true },
      geometry: { type: 'Point', coordinates: [lng, lat] }
    });

    if (map.getSource('user-green-zones')) {
      map.getSource('user-green-zones').setData(this.userGreenZonesData);
    }
    this.environmentScore = Math.min(100, this.environmentScore + 2);
  }

  init(map, data) {
    if (!map) return;
    try {
      this.updateGrid(map);

      this._addSource(map, 'green-cover-data', { type: 'geojson', data: this.coverData });
      this._addLayer(map, {
        id: 'green-cover-fill',
        type: 'fill',
        source: 'green-cover-data',
        paint: {
          'fill-color': [
            'interpolate', ['linear'], ['get', 'ndvi'],
            ...GREEN_COVER_COLORS.flat()
          ],
          'fill-opacity': 0.7
        },
        layout: { visibility: data?.visible ? 'visible' : 'none' }
      });

      this._addSource(map, 'user-green-zones', { type: 'geojson', data: this.userGreenZonesData });
      this._addLayer(map, {
        id: 'user-green-zones-fill',
        type: 'circle',
        source: 'user-green-zones',
        paint: {
          'circle-radius': 12,
          'circle-color': '#22c55e',
          'circle-opacity': 0.9,
          'circle-stroke-width': 3,
          'circle-stroke-color': '#16a34a'
        },
        layout: { visibility: data?.visible ? 'visible' : 'none' }
      });

      this.initialized = true;
    } catch (err) {
      console.error('[GreenCoverLayerPlugin] init error:', err);
    }
  }

  toggle(map, visible) {
    super.toggle(map, visible);
    if (visible && this.coverData.features.length === 0) {
      this.updateGrid(map);
    }
  }
}
