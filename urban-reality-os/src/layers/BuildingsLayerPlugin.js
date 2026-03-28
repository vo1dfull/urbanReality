// ================================================
// Buildings Layer Plugin — 3D extruded buildings
// ================================================
import BaseLayerPlugin from './BaseLayerPlugin';

export default class BuildingsLayerPlugin extends BaseLayerPlugin {
  constructor() {
    super('buildings');
  }

  /**
   * @param {maplibregl.Map} map
   */
  init(map) {
    if (!map) return;

    try {
      // Only works if 'openmaptiles' source exists (streets-v2 style)
      if (!map.getSource('openmaptiles')) return;

      this._addLayer(map, {
        id: '3d-buildings',
        source: 'openmaptiles',
        'source-layer': 'building',
        type: 'fill-extrusion',
        minzoom: 14,
        paint: {
          'fill-extrusion-color': '#cbd5e1',
          'fill-extrusion-height': ['get', 'render_height'],
          'fill-extrusion-base': ['get', 'render_min_height'],
          'fill-extrusion-opacity': 0.9,
        },
      });

      this.initialized = true;
    } catch (err) {
      console.warn('[BuildingsLayerPlugin] init error:', err);
    }
  }

  /**
   * Override destroy — don't try to remove the openmaptiles source,
   * it belongs to the base style.
   */
  destroy(map) {
    if (!map) return;
    for (const layerId of this.layerIds) {
      try {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
      } catch (e) { /* ignored */ }
    }
    this.sourceIds = []; // Don't touch the base style source
    this.initialized = false;
  }
}
