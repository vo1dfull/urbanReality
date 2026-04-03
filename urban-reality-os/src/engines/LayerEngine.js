// ================================================
// LayerEngine — Orchestrates the LayerRegistry + plugin lifecycle
// Pure JS — no React dependency
// ================================================
import LayerRegistry from '../layers/LayerRegistry';
import DataEngine from './DataEngine';
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

class LayerEngine {
  constructor() {
    this.registry = new LayerRegistry();
    this.layerConfigs = new Map();
    this.groupOrder = ['base', 'terrain', 'infrastructure', 'facilities', 'environment', 'analytics'];
    this._fadeTimers = new Map();
    this._currentLayers = null;

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
      .register(new RoadPlannerLayerPlugin());

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
    this.registerLayer('analytics.population', { group: 'analytics', zIndex: 61, pluginId: 'terrainSuitability', enabled: false });
    this.registerLayer('analytics.risk', { group: 'analytics', zIndex: 62, pluginId: 'terrainFlood', enabled: false });
    this.registerLayer('analytics.economy', { group: 'analytics', zIndex: 63, pluginId: 'terrainGreen', enabled: false });
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
    return normalized;
  }

  enableLayer(id, map) {
    const cfg = this.layerConfigs.get(id);
    if (!cfg || !map) return;
    cfg.enabled = true;
    this._applyLayerState(map, cfg, true);
    this._applyZOrder(map);
  }

  disableLayer(id, map) {
    const cfg = this.layerConfigs.get(id);
    if (!cfg || !map) return;
    cfg.enabled = false;
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
    this._fadePlugin(map, plugin, enabled, cfg.fadeMs);
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

  _applyZOrder(map) {
    if (!map) return;
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
   */
  initAllLayers(map, storeState) {
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
      terrainRoad: storeState.terrainSubLayers?.road ? { visible: true } : false
    };

    this.registry.initAll(map, dataMap);
  }

  /**
   * Re-initialize all layers after a style switch.
   * @param {maplibregl.Map} map
   * @param {object} storeState
   */
  recoverAllLayers(map, storeState) {
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
      terrainRoad: storeState.terrainSubLayers?.road ? { visible: true } : false
    };

    this.registry.recoverAll(map, dataMap);
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
  }
}

// Singleton
export default new LayerEngine();
