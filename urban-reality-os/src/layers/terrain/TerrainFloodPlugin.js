// ================================================
// Terrain Flood Plugin
// Handles interactive flood simulation on terrain
// ================================================
import BaseLayerPlugin from '../BaseLayerPlugin';
import { terrainEngine } from '../../engines/TerrainEngine';
import FrameController from '../../core/FrameController';

export default class TerrainFloodPlugin extends BaseLayerPlugin {
  constructor() {
    super('terrainFlood');
    this.worker = null;
    this.floodData = { type: 'FeatureCollection', features: [] };
  }

  /**
   * @param {maplibregl.Map} map
   * @param {{ visible: boolean }} data
   */
  init(map, data) {
    if (!map) return;

    try {
      if (!this.worker) {
        this.worker = new Worker(new URL('../../workers/floodWorker.js', import.meta.url), { type: 'module' });
        this.worker.onmessage = ({ data: workerData }) => {
          if (!map || !map.getSource('flood-zones')) return;

          const features = workerData.features.map((feature) => {
            const trace = feature.properties.risk === 'high' ? 1 : feature.properties.risk === 'medium' ? 0.6 : 0.35;
            return {
              ...feature,
              properties: { ...feature.properties, trace }
            };
          });

          this.floodData = { type: 'FeatureCollection', features };
          try {
            map.getSource('flood-zones')?.setData(this.floodData);
          } catch (e) {
            // Source may not be available yet
          }
        };
      }

      this._addSource(map, 'flood-zones', {
        type: 'geojson',
        data: this.floodData
      });

      this._addLayer(map, {
        id: 'flood-fill',
        type: 'fill',
        source: 'flood-zones',
        paint: {
          'fill-color': [
            'interpolate',
            ['linear'],
            ['get', 'depth'],
            0, 'rgba(0, 123, 255, 0.1)',
            0.5, 'rgba(0, 123, 255, 0.35)',
            1.0, 'rgba(3, 169, 244, 0.4)',
            1.2, 'rgba(0, 123, 255, 0.55)'
          ],
          'fill-opacity': ['interpolate', ['linear'], ['get', 'depth'], 0, 0.25, 3.2, 0.75],
          'fill-outline-color': 'rgba(2, 136, 209, 0.9)'
        },
        layout: { visibility: data?.visible ? 'visible' : 'none' }
      });

      this._addLayer(map, {
        id: 'flood-risk-heatmap',
        type: 'heatmap',
        source: 'flood-zones',
        paint: {
          'heatmap-weight': ['interpolate', ['linear'], ['get', 'trace'], 0, 0, 1, 1],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 5, 0.7, 15, 1.8],
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(0, 123, 255, 0)',
            0.1, 'rgba(16, 185, 129, 0.4)',
            0.4, 'rgba(249, 168, 37, 0.5)',
            0.7, 'rgba(244, 63, 94, 0.68)',
            1, 'rgba(153, 27, 27, 0.95)'
          ],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 5, 14, 15, 30],
          'heatmap-opacity': 0.8
        },
        layout: { visibility: data?.visible ? 'visible' : 'none' }
      });

      this.initialized = true;
    } catch (err) {
      console.error('[TerrainFloodPlugin] init error:', err);
    }
  }

  /**
   * Start the flood simulation at a center point.
   */
  startSimulation(map, center, params = {}) {
    if (!map || !this.worker) return;

    const { rainIntensity = 50, waterLevel = 1.0 } = params;
    const bounds = map.getBounds();
    const mapBounds = {
      west: bounds.getWest(),
      east: bounds.getEast(),
      south: bounds.getSouth(),
      north: bounds.getNorth()
    };

    const terrainMetrics = terrainEngine.getTerrainMetrics(map, { lng: center[0], lat: center[1] });

    // Pass through current quality hint so worker can adapt sampling
    const quality = typeof FrameController?.getQualityHint === 'function'
      ? FrameController.getQualityHint()
      : 'medium';

    this.worker.postMessage({ center, rainIntensity, waterLevel, mapBounds, terrainMetrics, quality });
  }

  /**
   * Stop the flood simulation.
   */
  stopSimulation(map) {
    this.floodData = { type: 'FeatureCollection', features: [] };
    try {
      map?.getSource('flood-zones')?.setData(this.floodData);
    } catch (e) {
      // Source may not exist
    }
  }

  destroy(map) {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    super.destroy(map);
  }
}
