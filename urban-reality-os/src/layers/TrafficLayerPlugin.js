// ================================================
// Traffic Layer Plugin — TomTom raster traffic tiles
// ================================================
import BaseLayerPlugin from './BaseLayerPlugin';
import { TOMTOM_KEY } from '../constants/mapConstants';

export default class TrafficLayerPlugin extends BaseLayerPlugin {
  constructor() {
    super('traffic');
  }

  /**
   * @param {maplibregl.Map} map
   * @param {{ visible: boolean }} data
   */
  init(map, data) {
    if (!map || !TOMTOM_KEY) return;

    try {
      this._addSource(map, 'traffic', {
        type: 'raster',
        tiles: [
          `https://api.tomtom.com/traffic/map/4/tile/flow/relative/{z}/{x}/{y}.png?key=${TOMTOM_KEY}`,
        ],
        tileSize: 256,
      });

      this._addLayer(map, {
        id: 'traffic-layer',
        type: 'raster',
        source: 'traffic',
        paint: {
          'raster-opacity': 1.0,
          'raster-fade-duration': 300,
        },
        layout: {
          visibility: data?.visible ? 'visible' : 'none',
        },
      });

      // Position traffic under AQI or flood layers
      try {
        if (map.getLayer('aqi-layer')) {
          map.moveLayer('traffic-layer', 'aqi-layer');
        } else if (map.getLayer('flood-layer')) {
          map.moveLayer('traffic-layer', 'flood-layer');
        }
      } catch (e) {
        console.warn('[TrafficLayerPlugin] Could not reposition:', e);
      }

      this.initialized = true;
    } catch (err) {
      console.error('[TrafficLayerPlugin] init error:', err);
    }
  }

  /**
   * Ensure traffic layer exists and set visibility.
   * Handles the case where we need to re-add after style switch.
   */
  ensure(map, visible) {
    if (!map || !TOMTOM_KEY) return;

    try {
      if (!map.getSource('traffic')) {
        this.destroy(map);
        this.init(map, { visible });
        return;
      }

      if (!map.getLayer('traffic-layer')) {
        this._addLayer(map, {
          id: 'traffic-layer',
          type: 'raster',
          source: 'traffic',
          paint: { 'raster-opacity': 1.0, 'raster-fade-duration': 300 },
          layout: { visibility: visible ? 'visible' : 'none' },
        });
        this.initialized = true;
      } else {
        this.toggle(map, visible);
      }
    } catch (err) {
      console.error('[TrafficLayerPlugin] ensure error:', err);
    }
  }
}
