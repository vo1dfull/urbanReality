// ================================================
// Flood Layer Plugin — Static flood zones + depth layer
// (Animation is handled separately via useFloodAnimation hook)
// ================================================
import BaseLayerPlugin from './BaseLayerPlugin';

const DEPTH_COLOR = [
  'interpolate', ['linear'], ['get', 'depth'],
  0, '#bfdbfe',
  1, '#60a5fa',
  2, '#2563eb',
  3, '#1e3a8a',
];

const DEPTH_OPACITY = [
  'interpolate', ['linear'], ['get', 'depth'],
  0, 0.2,
  3, 0.75,
];

export default class FloodLayerPlugin extends BaseLayerPlugin {
  constructor() {
    super('flood');
  }

  /**
   * @param {maplibregl.Map} map
   * @param {{ floodData: object, floodVisible: boolean, depthVisible: boolean }} data
   */
  init(map, data) {
    try {
      // ── Static Flood Zones ──
      if (data?.floodData) {
        this._addSource(map, 'flood', { type: 'geojson', data: data.floodData });
        this._addLayer(map, {
          id: 'flood-layer',
          type: 'fill',
          source: 'flood',
          paint: {
            'fill-color': '#2563eb',
            'fill-opacity': 0.45,
          },
          layout: {
            visibility: data.floodVisible !== false ? 'visible' : 'none',
          },
        });
      }

      // ── Flood Depth (animated data fed externally) ──
      this._addSource(map, 'flood-depth', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      this._addLayer(map, {
        id: 'flood-depth-layer',
        type: 'fill',
        source: 'flood-depth',
        paint: {
          'fill-color': DEPTH_COLOR,
          'fill-opacity': DEPTH_OPACITY,
        },
        layout: {
          visibility: data?.depthVisible ? 'visible' : 'none',
        },
      });

      this.initialized = true;
    } catch (err) {
      console.error('[FloodLayerPlugin] init error:', err);
    }
  }

  /**
   * Toggle individual sub-layers.
   * @param {maplibregl.Map} map
   * @param {boolean} visible — controls flood-layer
   */
  toggle(map, visible) {
    if (!map) return;
    try {
      if (map.getLayer('flood-layer')) {
        map.setLayoutProperty('flood-layer', 'visibility', visible ? 'visible' : 'none');
      }
    } catch (err) {
      console.warn('[FloodLayerPlugin] toggle error:', err);
    }
  }

  /**
   * Toggle the depth sub-layer independently.
   */
  toggleDepth(map, visible) {
    if (!map) return;
    try {
      if (map.getLayer('flood-depth-layer')) {
        map.setLayoutProperty('flood-depth-layer', 'visibility', visible ? 'visible' : 'none');
      }
    } catch (err) {
      console.warn('[FloodLayerPlugin] toggleDepth error:', err);
    }
  }

  /**
   * Get the flood-depth source for animation updates.
   */
  getDepthSource(map) {
    if (!map) return null;
    return map.getSource('flood-depth') || null;
  }
}
