// ================================================
// LayerEngine — Orchestrates the LayerRegistry + plugin lifecycle
// Pure JS — no React dependency
// ================================================
import LayerRegistry from '../layers/LayerRegistry';
import DataEngine from './DataEngine';
import FrameController from '../core/FrameController';
import AqiLayerPlugin from '../layers/AqiLayerPlugin';
import FloodLayerPlugin from '../layers/FloodLayerPlugin';
import TrafficLayerPlugin from '../layers/TrafficLayerPlugin';
import FacilityLayerPlugin from '../layers/FacilityLayerPlugin';
import BuildingsLayerPlugin from '../layers/BuildingsLayerPlugin';

// Terrain Plugins
import ElevationLayerPlugin from '../layers/terrain/ElevationLayerPlugin';
import TerrainFloodPlugin from '../layers/terrain/TerrainFloodPlugin';
import SuitabilityLayerPlugin from '../layers/terrain/SuitabilityLayerPlugin';
import HeatLayerPlugin from '../layers/terrain/HeatLayerPlugin';
import GreenCoverLayerPlugin from '../layers/terrain/GreenCoverLayerPlugin';
import RoadPlannerLayerPlugin from '../layers/terrain/RoadPlannerLayerPlugin';
import NasaEventsLayerPlugin from '../layers/NasaEventsLayerPlugin';

class LayerEngine {
  constructor() {
    this.registry = new LayerRegistry();
    this.layerConfigs = new Map();
    this.layerGroups = new Map(); // Map<groupId, { layers: Set<layerId>, enabled: boolean }>
    this.groupOrder = ['base', 'terrain', 'infrastructure', 'facilities', 'environment', 'analytics'];
    this._fadeTimers = new Map();
    this._currentLayers = null;
    this._zOrderDirty = false;
    this._zOrderTaskId = null;
    this._layerStats = new Map(); // Map<layerId, { renderCount, lastToggleTime, currentOpacity }>
    this._layerPresets = new Map(); // Map<presetName, LayerPreset>
    this._transitionInProgress = new Set(); // Set<fromLayerId:toLayerId>

    // Register all built-in plugins
    this.registry
      .register(new AqiLayerPlugin())
      .register(new FloodLayerPlugin())
      .register(new TrafficLayerPlugin())
      .register(new FacilityLayerPlugin())
      .register(new BuildingsLayerPlugin())
      .register(new ElevationLayerPlugin())
      .register(new TerrainFloodPlugin())
      .register(new SuitabilityLayerPlugin())
      .register(new HeatLayerPlugin())
      .register(new GreenCoverLayerPlugin())
      .register(new RoadPlannerLayerPlugin())
      .register(new NasaEventsLayerPlugin());

    this._registerBuiltins();
  }

  _registerBuiltins() {
    this.registerLayer('base.street', { group: 'base', zIndex: 10, mode: 'style', styleName: 'default', enabled: true });
    this.registerLayer('base.satellite', { group: 'base', zIndex: 11, mode: 'style', styleName: 'satellite', enabled: false });
    this.registerLayer('terrain.elevation', { group: 'terrain', zIndex: 20, pluginId: 'terrainElevation', enabled: false });
    this.registerLayer('terrain.slope', { group: 'terrain', zIndex: 21, pluginId: 'terrainElevation', enabled: false });
    this.registerLayer('terrain.heat', { group: 'environment', zIndex: 50, pluginId: 'terrainHeat', enabled: false });
    this.registerLayer('environment.aqi', { group: 'environment', zIndex: 51, pluginId: 'aqi', enabled: true });
    this.registerLayer('environment.rainfall', { group: 'environment', zIndex: 52, pluginId: 'flood', enabled: false });
    this.registerLayer('infrastructure.roads', { group: 'infrastructure', zIndex: 31, pluginId: 'terrainRoad', enabled: false });
    this.registerLayer('infrastructure.buildings', { group: 'infrastructure', zIndex: 32, pluginId: 'buildings', enabled: false });
    this.registerLayer('facilities.hospital', { group: 'facilities', zIndex: 40, mode: 'facility', facilityType: 'hospitals', enabled: false });
    this.registerLayer('facilities.police', { group: 'facilities', zIndex: 41, mode: 'facility', facilityType: 'policeStations', enabled: false });
    this.registerLayer('facilities.fire', { group: 'facilities', zIndex: 42, mode: 'facility', facilityType: 'fireStations', enabled: false });
    this.registerLayer('facilities.school', { group: 'facilities', zIndex: 43, mode: 'facility', facilityType: 'schools', enabled: false });
    this.registerLayer('analytics.population', { group: 'analytics', zIndex: 61, pluginId: 'terrainSuitability', enabled: false });
    this.registerLayer('analytics.risk', { group: 'analytics', zIndex: 62, pluginId: 'terrainFlood', enabled: false });
    this.registerLayer('analytics.economy', { group: 'analytics', zIndex: 63, pluginId: 'terrainGreen', enabled: false });
    this.registerLayer('environment.nasa', { group: 'environment', zIndex: 55, pluginId: 'nasa-events', enabled: false });
  }

  registerLayer(id, config = {}) {
    const normalized = {
      id,
      group: config.group || 'environment',
      zIndex: Number.isFinite(config.zIndex) ? config.zIndex : 100,
      mode: config.mode || 'plugin',
      pluginId: config.pluginId || null,
      styleName: config.styleName || null,
      facilityType: config.facilityType || null,
      enabled: !!config.enabled,
      opacity: config.opacity ?? 1,
      fadeMs: config.fadeMs ?? 180,
    };
    this.layerConfigs.set(id, normalized);

    // Add to group registry
    const groupId = normalized.group;
    if (!this.layerGroups.has(groupId)) {
      this.layerGroups.set(groupId, { layers: new Set(), enabled: true });
    }
    this.layerGroups.get(groupId).layers.add(id);

    // Initialize stats
    this._layerStats.set(id, {
      renderCount: 0,
      lastToggleTime: null,
      currentOpacity: normalized.opacity,
    });

    return normalized;
  }

  enableLayer(id, map) {
    const cfg = this.layerConfigs.get(id);
    if (!cfg || !map) return;
    cfg.enabled = true;
    
    // Update stats
    const stats = this._layerStats.get(id);
    if (stats) {
      stats.lastToggleTime = Date.now();
      stats.renderCount += 1;
    }

    this._applyLayerState(map, cfg, true);
    this._markZOrderDirty();
  }

  disableLayer(id, map) {
    const cfg = this.layerConfigs.get(id);
    if (!cfg || !map) return;
    cfg.enabled = false;
    
    // Update stats
    const stats = this._layerStats.get(id);
    if (stats) {
      stats.lastToggleTime = Date.now();
    }

    this._applyLayerState(map, cfg, false);
  }

  toggleLayer(id, map, visible) {
    const cfg = this.layerConfigs.get(id);
    if (!cfg || !map) return;
    const next = typeof visible === 'boolean' ? visible : !cfg.enabled;
    if (next) this.enableLayer(id, map);
    else this.disableLayer(id, map);
  }

  _applyLayerState(map, cfg, enabled) {
    if (cfg.mode === 'style') return;
    if (cfg.mode === 'facility') {
      const facilityPlugin = this.registry.get('facility');
      if (facilityPlugin) facilityPlugin.toggleByType(map, cfg.facilityType, enabled);
      this._fadePlugin(map, this.registry.get('facility'), enabled, cfg.fadeMs);
      return;
    }
    const plugin = this.registry.get(cfg.pluginId);
    if (!plugin) return;
    plugin.toggle(map, enabled);
    // Skip fade animation for plugins that manage their own visibility (e.g. nasa-events)
    if (cfg.pluginId !== 'nasa-events') {
      this._fadePlugin(map, plugin, enabled, cfg.fadeMs);
    }
  }

  _fadePlugin(map, plugin, enabled, fadeMs) {
    if (!map || !plugin?.layerIds?.length) return;
    const ids = plugin.layerIds.filter((id) => map.getLayer(id));
    if (!ids.length) return;

    // Visibility-only toggling with paint opacity transition to avoid flicker.
    ids.forEach((id) => {
      if (enabled) {
        this._setVisibility(map, id, true);
        this._setLayerOpacity(map, id, 0, fadeMs);
        requestAnimationFrame(() => this._setLayerOpacity(map, id, 1, fadeMs));
      } else {
        this._setLayerOpacity(map, id, 0, fadeMs);
        const k = `${plugin.id}:${id}`;
        clearTimeout(this._fadeTimers.get(k));
        const t = setTimeout(() => this._setVisibility(map, id, false), fadeMs + 20);
        this._fadeTimers.set(k, t);
      }
    });
  }

  _setVisibility(map, layerId, visible) {
    try {
      map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
    } catch {
      // no-op
    }
  }

  _setLayerOpacity(map, layerId, opacity, transitionMs) {
    const layer = map.getLayer(layerId);
    if (!layer) return;
    
    // Update stats
    const stats = this._layerStats.get(layerId);
    if (stats) {
      stats.currentOpacity = opacity;
    }

    const type = layer.type;
    const propMap = {
      fill: 'fill-opacity',
      line: 'line-opacity',
      symbol: 'icon-opacity',
      circle: 'circle-opacity',
      raster: 'raster-opacity',
      heatmap: 'heatmap-opacity',
      fillExtrusion: 'fill-extrusion-opacity',
      'fill-extrusion': 'fill-extrusion-opacity',
    };
    const paintProp = propMap[type];
    if (!paintProp) return;
    try {
      map.setPaintProperty(layerId, `${paintProp}-transition`, { duration: transitionMs, delay: 0 });
      map.setPaintProperty(layerId, paintProp, opacity);
      if (type === 'symbol') {
        map.setPaintProperty(layerId, 'text-opacity-transition', { duration: transitionMs, delay: 0 });
        map.setPaintProperty(layerId, 'text-opacity', opacity);
      }
    } catch {
      // no-op
    }
  }

  _markZOrderDirty() {
    if (this._zOrderDirty) return;
    this._zOrderDirty = true;
    if (this._zOrderTaskId !== null) {
      FrameController?.remove?.(this._zOrderTaskId);
    }
    this._zOrderTaskId = FrameController?.add?.(() => {
      this._zOrderDirty = false;
      this._zOrderTaskId = null;
      // Will be called with map from the context where it's needed
    });
  }

  _applyZOrder(map) {
    if (!map || this._zOrderDirty) return;
    const ordered = Array.from(this.layerConfigs.values())
      .filter((cfg) => cfg.enabled && cfg.mode !== 'style')
      .sort((a, b) => {
        const gA = this.groupOrder.indexOf(a.group);
        const gB = this.groupOrder.indexOf(b.group);
        if (gA !== gB) return gA - gB;
        return a.zIndex - b.zIndex;
      });
    for (const cfg of ordered) {
      const pluginId = cfg.mode === 'facility' ? 'facility' : cfg.pluginId;
      const plugin = this.registry.get(pluginId);
      if (!plugin?.layerIds) continue;
      for (const id of plugin.layerIds) {
        if (map.getLayer(id)) {
          try { map.moveLayer(id); } catch { /* no-op */ }
        }
      }
    }
  }

  /**
   * Initialize all layers with their respective data.
   * @param {maplibregl.Map} map
   * @param {object} storeState — current Zustand state snapshot
   * @param {Function} onProgress — callback(pct: number) called as each plugin initializes
   */
  initAllLayers(map, storeState, onProgress) {
    const { layers } = storeState;
    const aqiGeo = storeState.aqiGeo ?? DataEngine.getAqiGeo();
    const floodData = storeState.floodData ?? DataEngine.getFloodData();
    const facilityData = storeState.facilityData ?? DataEngine.getFacilityData();

    const dataMap = {
      aqi: { aqiGeo, visible: layers.aqi },
      flood: {
        floodData,
        floodVisible: layers.flood,
        depthVisible: layers.floodDepth,
      },
      traffic: { visible: layers.traffic },
      facility: { facilityData, layers },
      buildings: { visible: true },
      terrainElevation: storeState.terrainSubLayers?.elevation ? { visible: true, mode: storeState.terrainMode } : false,
      terrainFlood: storeState.terrainSubLayers?.flood ? { visible: true } : false,
      terrainSuitability: storeState.terrainSubLayers?.suitability ? { visible: true } : false,
      terrainHeat: storeState.terrainSubLayers?.heat ? { visible: true, year: storeState.year } : false,
      terrainGreen: storeState.terrainSubLayers?.green ? { visible: true } : false,
      terrainRoad: storeState.terrainSubLayers?.road ? { visible: true } : false,
      // NASA plugin always inits (async) so toggle works immediately; visible flag controls initial visibility
      'nasa-events': { params: { status: 'open', limit: 50 }, visible: !!layers.nasaEvents },
    };

    this.registry.initAll(map, dataMap, onProgress);
  }

  /**
   * Re-initialize all layers after a style switch.
   * @param {maplibregl.Map} map
   * @param {object} storeState
   * @param {Function} onProgress — callback(pct: number) called as each plugin recovers
   */
  recoverAllLayers(map, storeState, onProgress) {
    const { layers } = storeState;
    const aqiGeo = storeState.aqiGeo ?? DataEngine.getAqiGeo();
    const floodData = storeState.floodData ?? DataEngine.getFloodData();
    const facilityData = storeState.facilityData ?? DataEngine.getFacilityData();

    const dataMap = {
      aqi: { aqiGeo, visible: layers.aqi },
      flood: {
        floodData,
        floodVisible: layers.flood,
        depthVisible: layers.floodDepth,
      },
      traffic: { visible: layers.traffic },
      facility: { facilityData, layers },
      buildings: { visible: true },
      terrainElevation: storeState.terrainSubLayers?.elevation ? { visible: true, mode: storeState.terrainMode } : false,
      terrainFlood: storeState.terrainSubLayers?.flood ? { visible: true } : false,
      terrainSuitability: storeState.terrainSubLayers?.suitability ? { visible: true } : false,
      terrainHeat: storeState.terrainSubLayers?.heat ? { visible: true, year: storeState.year } : false,
      terrainGreen: storeState.terrainSubLayers?.green ? { visible: true } : false,
      terrainRoad: storeState.terrainSubLayers?.road ? { visible: true } : false,
      'nasa-events': { params: { status: 'open', limit: 50 }, visible: !!layers.nasaEvents },
    };

    this.registry.recoverAll(map, dataMap, onProgress);
  }

  /**
   * Toggle visibility for an entire group of layers.
   * @param {string} groupId
   * @param {maplibregl.Map} map
   * @param {boolean} visible
   */
  toggleGroup(groupId, map, visible) {
    const group = this.layerGroups.get(groupId);
    if (!group) return;
    
    const isVisible = typeof visible === 'boolean' ? visible : !group.enabled;
    group.enabled = isVisible;

    for (const layerId of group.layers) {
      if (isVisible) this.enableLayer(layerId, map);
      else this.disableLayer(layerId, map);
    }

    this._applyZOrder(map);
  }

  /**
   * Detect visual conflicts between enabled layers (e.g., heat + flood at max opacity).
   * @returns {Array<{type: string, layers: string[], severity: 'warn'|'critical', message: string}>}
   */
  getLayerConflicts() {
    const conflicts = [];
    const enabledLayers = Array.from(this.layerConfigs.values()).filter((cfg) => cfg.enabled);

    // Conflict: heat + flood both enabled and high opacity
    const heatEnabled = enabledLayers.find((cfg) => cfg.id === 'terrain.heat');
    const floodEnabled = enabledLayers.find((cfg) => cfg.id === 'environment.rainfall');
    if (heatEnabled && floodEnabled) {
      const heatOp = this._layerStats.get('terrain.heat')?.currentOpacity ?? 1;
      const floodOp = this._layerStats.get('environment.rainfall')?.currentOpacity ?? 1;
      if (heatOp > 0.7 && floodOp > 0.7) {
        conflicts.push({
          type: 'opacity_overlap',
          layers: ['terrain.heat', 'environment.rainfall'],
          severity: 'warn',
          message: 'Heat and Flood layers at high opacity may obscure details; consider reducing opacity.',
        });
      }
    }

    // Conflict: multiple facility types enabled in same group obscure each other
    const facilityLayers = enabledLayers.filter((cfg) => cfg.group === 'facilities');
    if (facilityLayers.length > 2) {
      conflicts.push({
        type: 'facility_overcrowd',
        layers: facilityLayers.map((cfg) => cfg.id),
        severity: 'warn',
        message: `${facilityLayers.length} facility layers enabled simultaneously; map may appear crowded.`,
      });
    }

    return conflicts;
  }

  /**
   * Save the current layer state as a preset.
   * @param {string} name
   * @returns {object} The created preset
   */
  saveLayerPreset(name) {
    const preset = {
      name,
      timestamp: Date.now(),
      layerStates: {},
      groupStates: {},
    };

    // Save each layer's state
    for (const [id, cfg] of this.layerConfigs) {
      preset.layerStates[id] = {
        enabled: cfg.enabled,
        opacity: cfg.opacity,
      };
    }

    // Save each group's state
    for (const [groupId, group] of this.layerGroups) {
      preset.groupStates[groupId] = {
        enabled: group.enabled,
      };
    }

    this._layerPresets.set(name, preset);
    return preset;
  }

  /**
   * Load a previously saved layer preset.
   * @param {object|string} preset — preset object or preset name
   * @param {maplibregl.Map} map
   */
  loadLayerPreset(preset, map) {
    let presetData = preset;
    if (typeof preset === 'string') {
      presetData = this._layerPresets.get(preset);
      if (!presetData) {
        console.warn(`Preset "${preset}" not found`);
        return;
      }
    }

    if (!presetData.layerStates || !presetData.groupStates) {
      console.warn('Invalid preset format');
      return;
    }

    // Restore layer states
    for (const [id, state] of Object.entries(presetData.layerStates)) {
      const cfg = this.layerConfigs.get(id);
      if (cfg) {
        cfg.opacity = state.opacity;
        if (state.enabled) this.enableLayer(id, map);
        else this.disableLayer(id, map);
      }
    }

    // Restore group states
    for (const [groupId, state] of Object.entries(presetData.groupStates)) {
      const group = this.layerGroups.get(groupId);
      if (group) {
        group.enabled = state.enabled;
      }
    }

    this._applyZOrder(map);
  }

  /**
   * Animate a smooth cross-fade transition from one layer to another.
   * @param {string} fromLayerId
   * @param {string} toLayerId
   * @param {maplibregl.Map} map
   * @param {number} durationMs
   * @returns {Promise<void>}
   */
  async animateLayerTransition(fromLayerId, toLayerId, map, durationMs = 500) {
    if (!map) return Promise.reject(new Error('Map required'));

    const transitionKey = `${fromLayerId}:${toLayerId}`;
    if (this._transitionInProgress.has(transitionKey)) {
      return; // Transition already in progress
    }

    this._transitionInProgress.add(transitionKey);

    try {
      // Enable both layers initially
      const fromCfg = this.layerConfigs.get(fromLayerId);
      const toCfg = this.layerConfigs.get(toLayerId);

      if (!fromCfg || !toCfg) {
        throw new Error(`Layer not found: ${!fromCfg ? fromLayerId : toLayerId}`);
      }

      // Enable from layer at full opacity, to layer at 0 opacity
      this.enableLayer(fromLayerId, map);
      this.enableLayer(toLayerId, map);

      // Get all layer IDs for both plugins
      const fromPlugin = this.registry.get(fromCfg.pluginId);
      const toPlugin = this.registry.get(toCfg.pluginId);

      const fromLayerIds = fromPlugin?.layerIds || [];
      const toLayerIds = toPlugin?.layerIds || [];

      // Set initial opacity states
      for (const id of fromLayerIds) {
        this._setLayerOpacity(map, id, 1, 0);
      }
      for (const id of toLayerIds) {
        this._setLayerOpacity(map, id, 0, 0);
      }

      // Animate transition
      await new Promise((resolve) => {
        const startTime = Date.now();
        const animate = () => {
          const elapsed = Date.now() - startTime;
          const progress = Math.min(elapsed / durationMs, 1);

          // Fade out fromLayer, fade in toLayer
          for (const id of fromLayerIds) {
            this._setLayerOpacity(map, id, 1 - progress, durationMs);
          }
          for (const id of toLayerIds) {
            this._setLayerOpacity(map, id, progress, durationMs);
          }

          if (progress < 1) {
            requestAnimationFrame(animate);
          } else {
            // Disable fromLayer at end
            this.disableLayer(fromLayerId, map);
            resolve();
          }
        };
        requestAnimationFrame(animate);
      });
    } finally {
      this._transitionInProgress.delete(transitionKey);
    }
  }

  /**
   * Get statistics for all layers.
   * @returns {{[layerId]: {renderCount: number, lastToggleTime: number|null, currentOpacity: number}}}
   */
  getLayerStats() {
    const stats = {};
    for (const [id, stat] of this._layerStats) {
      stats[id] = {
        renderCount: stat.renderCount,
        lastToggleTime: stat.lastToggleTime,
        currentOpacity: stat.currentOpacity,
      };
    }
    return stats;
  }

  /**
   * Toggle a layer's visibility.
   * @param {string} layerId — plugin ID
   * @param {maplibregl.Map} map
   * @param {boolean} visible
   */
  syncAllToggles(map, layers) {
    if (!map) return;
    this._currentLayers = layers;

    this.toggleLayer('environment.aqi', map, !!layers.aqi);
    this.toggleLayer('environment.rainfall', map, !!layers.flood);

    const floodPlugin = this.registry.get('flood');
    if (floodPlugin) floodPlugin.toggleDepth(map, layers.floodDepth);

    const trafficPlugin = this.registry.get('traffic');
    if (trafficPlugin) trafficPlugin.ensure(map, layers.traffic);

    this.toggleLayer('facilities.hospital', map, !!layers.hospitals);
    this.toggleLayer('facilities.police', map, !!layers.policeStations);
    this.toggleLayer('facilities.fire', map, !!layers.fireStations);
    this.toggleLayer('facilities.school', map, !!layers.schools);

    // NASA events — init on first enable if not yet initialized
    const nasaPlugin = this.registry.get('nasa-events');
    if (layers.nasaEvents && nasaPlugin && !nasaPlugin.isInitialized()) {
      // Fire-and-forget async init — visibility baked into layers during _doInit
      nasaPlugin.init(map, { params: { status: 'open', limit: 50 }, visible: true });
      // Zoom out to world view so global events are visible
      try {
        map.flyTo({ center: [0, 20], zoom: 2, duration: 1500 });
      } catch (_) {}
    } else if (nasaPlugin) {
      this.toggleLayer('environment.nasa', map, !!layers.nasaEvents);
    }

    this._applyZOrder(map);
  }

  getCurrentLayerState() {
    return this._currentLayers;
  }

  /**
   * Get a specific plugin.
   * @param {string} id
   */
  getPlugin(id) {
    return this.registry.get(id);
  }

  /**
   * Destroy all layers.
   */
  destroyAll(map) {
    this.registry.destroyAll(map);
    
    // Clean up fade timers
    for (const timerId of this._fadeTimers.values()) {
      clearTimeout(timerId);
    }
    this._fadeTimers.clear();

    // Clean up z-order task
    if (this._zOrderTaskId !== null) {
      FrameController?.remove?.(this._zOrderTaskId);
      this._zOrderTaskId = null;
    }

    // Clear stats
    this._layerStats.clear();

    // Clear presets
    this._layerPresets.clear();

    // Clear transition set
    this._transitionInProgress.clear();
  }
}

// Singleton
export default new LayerEngine();
