// ================================================
// Layer Registry — Central registry for all layer plugins
// ================================================

export default class LayerRegistry {
  constructor() {
    /** @type {Map<string, import('./BaseLayerPlugin').default>} */
    this._plugins = new Map();
  }

  /**
   * Register a plugin instance.
   * @param {import('./BaseLayerPlugin').default} plugin
   */
  register(plugin) {
    if (this._plugins.has(plugin.id)) {
      console.warn(`[LayerRegistry] Plugin "${plugin.id}" already registered, replacing.`);
    }
    this._plugins.set(plugin.id, plugin);
    return this;
  }

  /**
   * Get a plugin by ID.
   * @param {string} id
   * @returns {import('./BaseLayerPlugin').default | undefined}
   */
  get(id) {
    return this._plugins.get(id);
  }

  /**
   * Get all registered plugins.
   * @returns {import('./BaseLayerPlugin').default[]}
   */
  getAll() {
    return Array.from(this._plugins.values());
  }

  /**
   * Get all registered plugin IDs.
   * @returns {string[]}
   */
  getIds() {
    return Array.from(this._plugins.keys());
  }

  /**
   * Initialize all registered plugins.
   * @param {maplibregl.Map} map
   * @param {object} dataMap — { pluginId: data }
   */
  initAll(map, dataMap = {}) {
    for (const plugin of this._plugins.values()) {
      try {
        if (!plugin.isInitialized()) {
          plugin.init(map, dataMap[plugin.id] || null);
        }
      } catch (err) {
        console.error(`[LayerRegistry] Failed to init "${plugin.id}":`, err);
      }
    }
  }

  /**
   * Destroy all registered plugins (style-switch cleanup).
   * @param {maplibregl.Map} map
   */
  destroyAll(map) {
    for (const plugin of this._plugins.values()) {
      try {
        plugin.destroy(map);
      } catch (err) {
        console.warn(`[LayerRegistry] Failed to destroy "${plugin.id}":`, err);
      }
    }
  }

  /**
   * Re-initialize all plugins after a style switch.
   * Destroys first, then re-inits with provided data.
   * @param {maplibregl.Map} map
   * @param {object} dataMap — { pluginId: data }
   */
  recoverAll(map, dataMap = {}) {
    this.destroyAll(map);
    this.initAll(map, dataMap);
  }

  /**
   * Toggle a specific plugin's visibility.
   * @param {string} id
   * @param {maplibregl.Map} map
   * @param {boolean} visible
   */
  toggle(id, map, visible) {
    const plugin = this._plugins.get(id);
    if (plugin) {
      try {
        plugin.toggle(map, visible);
      } catch (err) {
        console.warn(`[LayerRegistry] toggle error "${id}":`, err);
      }
    }
  }
}
