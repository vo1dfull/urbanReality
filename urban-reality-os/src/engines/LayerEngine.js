// ================================================
// LayerEngine — Orchestrates the LayerRegistry + plugin lifecycle
// Pure JS — no React dependency
// ================================================
import LayerRegistry from '../layers/LayerRegistry';
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
  }

  /**
   * Initialize all layers with their respective data.
   * @param {maplibregl.Map} map
   * @param {object} storeState — current Zustand state snapshot
   */
  initAllLayers(map, storeState) {
    const { aqiGeo, floodData, facilityData, layers } = storeState;

    const dataMap = {
      aqi: { aqiGeo, visible: layers.aqi },
      flood: {
        floodData,
        floodVisible: layers.flood,
        depthVisible: layers.floodDepth,
      },
      traffic: { visible: layers.traffic },
      facility: { facilityData, layers },
      buildings: null,
      terrainElevation: { visible: storeState.terrainSubLayers?.elevation, mode: storeState.terrainMode },
      terrainFlood: { visible: storeState.terrainSubLayers?.flood },
      terrainSuitability: { visible: storeState.terrainSubLayers?.suitability },
      terrainHeat: { visible: storeState.terrainSubLayers?.heat, year: storeState.year },
      terrainGreen: { visible: storeState.terrainSubLayers?.green },
      terrainRoad: { visible: storeState.terrainSubLayers?.road }
    };

    this.registry.initAll(map, dataMap);
  }

  /**
   * Re-initialize all layers after a style switch.
   * @param {maplibregl.Map} map
   * @param {object} storeState
   */
  recoverAllLayers(map, storeState) {
    const { aqiGeo, floodData, facilityData, layers } = storeState;

    const dataMap = {
      aqi: { aqiGeo, visible: layers.aqi },
      flood: {
        floodData,
        floodVisible: layers.flood,
        depthVisible: layers.floodDepth,
      },
      traffic: { visible: layers.traffic },
      facility: { facilityData, layers },
      buildings: null,
      terrainElevation: { visible: storeState.terrainSubLayers?.elevation, mode: storeState.terrainMode },
      terrainFlood: { visible: storeState.terrainSubLayers?.flood },
      terrainSuitability: { visible: storeState.terrainSubLayers?.suitability },
      terrainHeat: { visible: storeState.terrainSubLayers?.heat, year: storeState.year },
      terrainGreen: { visible: storeState.terrainSubLayers?.green },
      terrainRoad: { visible: storeState.terrainSubLayers?.road }
    };

    this.registry.recoverAll(map, dataMap);
  }

  /**
   * Toggle a layer's visibility.
   * @param {string} layerId — plugin ID
   * @param {maplibregl.Map} map
   * @param {boolean} visible
   */
  toggleLayer(layerId, map, visible) {
    this.registry.toggle(layerId, map, visible);
  }

  /**
   * Sync all layer toggles based on current store state.
   * @param {maplibregl.Map} map
   * @param {object} layers — layers toggle state from store
   */
  syncAllToggles(map, layers) {
    if (!map) return;

    // AQI
    const aqiPlugin = this.registry.get('aqi');
    if (aqiPlugin) aqiPlugin.toggle(map, layers.aqi);

    // Flood
    const floodPlugin = this.registry.get('flood');
    if (floodPlugin) {
      floodPlugin.toggle(map, layers.flood);
      floodPlugin.toggleDepth(map, layers.floodDepth);
    }

    // Traffic (special — uses ensure)
    const trafficPlugin = this.registry.get('traffic');
    if (trafficPlugin) trafficPlugin.ensure(map, layers.traffic);

    // Facilities
    const facilityPlugin = this.registry.get('facility');
    if (facilityPlugin) {
      facilityPlugin.toggleByType(map, 'hospitals', layers.hospitals);
      facilityPlugin.toggleByType(map, 'policeStations', layers.policeStations);
      facilityPlugin.toggleByType(map, 'fireStations', layers.fireStations);
    }
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
