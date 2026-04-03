// ================================================
// AQI Layer Plugin — Real-time air quality circles
// ================================================
import BaseLayerPlugin from './BaseLayerPlugin';

const AQI_PAINT = {
  'circle-radius': 12,
  'circle-opacity': 0.9,
  'circle-stroke-width': 2,
  'circle-stroke-color': '#ffffff',
  'circle-stroke-opacity': 0.8,
  'circle-color': [
    'interpolate',
    ['linear'],
    ['get', 'aqi'],
    0, '#22c55e',
    50, '#22c55e',
    100, '#eab308',
    150, '#f97316',
    200, '#dc2626',
    300, '#9333ea',
    400, '#6b21a8',
  ],
};

export default class AqiLayerPlugin extends BaseLayerPlugin {
  constructor() {
    super('aqi');
    this._lastDigest = '';
  }

  /**
   * @param {maplibregl.Map} map
   * @param {{ aqiGeo: object, visible: boolean }} data
   */
  init(map, data) {
    if (!data?.aqiGeo) return;

    try {
      this._addSource(map, 'aqi', { type: 'geojson', data: data.aqiGeo });
      this._addLayer(map, {
        id: 'aqi-layer',
        type: 'circle',
        source: 'aqi',
        paint: AQI_PAINT,
        layout: {
          visibility: data.visible !== false ? 'visible' : 'none',
        },
      });
      this.initialized = true;
    } catch (err) {
      console.error('[AqiLayerPlugin] init error:', err);
    }
  }

  /**
   * Update the AQI GeoJSON data source.
   */
  update(map, data) {
    if (!map || !data?.aqiGeo) return;
    try {
      const features = data.aqiGeo.features || [];
      let digest = `${features.length}`;
      for (let i = 0; i < Math.min(features.length, 24); i++) {
        digest += `:${features[i]?.properties?.aqi ?? 0}`;
      }
      if (digest === this._lastDigest) return;
      this._lastDigest = digest;
      const source = map.getSource('aqi');
      if (source) {
        source.setData(data.aqiGeo);
      }
    } catch (err) {
      console.warn('[AqiLayerPlugin] update error:', err);
    }
  }
}
