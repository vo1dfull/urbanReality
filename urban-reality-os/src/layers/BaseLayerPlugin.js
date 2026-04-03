// ================================================
// Base Layer Plugin — Abstract class for all map layers
// Each plugin must implement: init, update, toggle, destroy
// ================================================

export default class BaseLayerPlugin {
  /**
   * @param {string} id — Unique plugin identifier (e.g. 'aqi', 'flood')
   * @param {object} options — Plugin-specific configuration
   */
  constructor(id, options = {}) {
    this.id = id;
    this.options = options;
    this.initialized = false;
    this.layerIds = []; // MapLibre layer IDs managed by this plugin
    this.sourceIds = []; // MapLibre source IDs managed by this plugin
  }

  /**
   * Initialize the layer on the map. Called once when data is ready.
   * @param {maplibregl.Map} map
   * @param {object} data — Layer-specific data
   */
  init(map, data) {
    throw new Error(`${this.id}: init() must be implemented`);
  }

  /**
   * Update the layer's data source without re-creating it.
   * @param {maplibregl.Map} map
   * @param {object} data — New data
   */
  update(map, data) {
    // Default: no-op (override in subclass if needed)
  }

  /**
   * Toggle visibility of all layers managed by this plugin.
   * @param {maplibregl.Map} map
   * @param {boolean} visible
   */
  toggle(map, visible) {
    if (!map) return;
    const vis = visible ? 'visible' : 'none';
    for (const layerId of this.layerIds) {
      try {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, 'visibility', vis);
        }
      } catch (err) {
        console.warn(`[${this.id}] toggle error for ${layerId}:`, err);
      }
    }
  }

  /**
   * Fully remove all layers and sources from the map.
   * @param {maplibregl.Map} map
   */
  destroy(map) {
    if (!map) return;
    for (const layerId of this.layerIds) {
      try {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
      } catch (e) {
        /* ignored */
      }
    }
    for (const sourceId of this.sourceIds) {
      try {
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      } catch (e) {
        /* ignored */
      }
    }
    this.initialized = false;
  }

  isInitialized() {
    return this.initialized;
  }

  /**
   * Return canonical source id for a plugin layer.
   */
  sourceId(suffix = 'source') {
    return `${this.id}-${suffix}`;
  }

  /**
   * Return canonical layer id for a plugin layer.
   */
  layerId(suffix = 'layer') {
    return `${this.id}-${suffix}`;
  }

  /**
   * Return a base layer id (for insertion ordering as reference).
   */
  baseLayerId() {
    return `${this.id}-base`;
  }

  /**
   * Safe helper to add source only if it doesn't exist.
   */
  _addSource(map, id, config) {
    if (!map.getSource(id)) {
      map.addSource(id, config);
    }
    if (!this.sourceIds.includes(id)) this.sourceIds.push(id);
  }

  /**
   * Safe helper to add layer only if it doesn't exist.
   */
  _addLayer(map, config, beforeId) {
    if (!map.getLayer(config.id)) {
      if (beforeId && map.getLayer(beforeId)) {
        map.addLayer(config, beforeId);
      } else {
        map.addLayer(config);
      }
    }
    if (!this.layerIds.includes(config.id)) this.layerIds.push(config.id);
  }

  /**
   * Set the initialization state of this plugin.
   * @param {boolean} initialized
   */
  _setInitialized(initialized) {
    this.initialized = !!initialized;
  }
}
