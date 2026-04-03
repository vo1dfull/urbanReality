// ================================================
// Terrain Flood Plugin
// Handles interactive flood simulation on terrain
// ================================================
import BaseLayerPlugin from '../BaseLayerPlugin';
import { terrainEngine } from '../../engines/TerrainEngine';
import FrameController from '../../core/FrameController';
import useMapStore from '../../store/useMapStore';

export default class TerrainFloodPlugin extends BaseLayerPlugin {
  constructor() {
    super('terrainFlood');
    this.worker = null;
    this.floodData = { type: 'FeatureCollection', features: [] };
    this._requestId = 0;
    this._running = false;
    this._taskId = null;
    this._currentMap = null;
    this._lastFrameAt = 0;
    this._stepTaskId = null;
    this._unsubStore = null;
    this._liveParams = { rainIntensityMmHr: 50, waterLevel: 1.0, quality: 'medium', perfMode: 'balanced' };
    this._lastParamDigest = '';
  }

  /**
   * @param {maplibregl.Map} map
   * @param {{ visible: boolean }} data
   */
  init(map, data) {
    if (!map) return;

    try {
      if (!this.worker) {
        this.worker = new Worker(new URL('../../workers/floodPropagationWorker.js', import.meta.url), { type: 'module' });
        this.worker.onmessage = ({ data: workerData }) => {
          const m = this._currentMap;
          if (!m || !m.getSource('flood-zones')) return;
          if (workerData?.type !== 'frame') return;
          if (workerData.requestId !== this._requestId) return;

          const pts = workerData.points || [];
          const features = new Array(pts.length);
          for (let i = 0; i < pts.length; i++) {
            const p = pts[i];
            const depth = p[2];
            const risk = p[3];
            const trace = risk === 'high' ? 1 : risk === 'medium' ? 0.6 : 0.35;
            features[i] = {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [p[0], p[1]] },
              properties: { depth, risk, trace },
            };
          }
          this.floodData = { type: 'FeatureCollection', features };
          // Actual setData is done on our FrameController cadence to avoid main-thread spikes.
        };
      }

      this._addSource(map, 'flood-zones', {
        type: 'geojson',
        data: this.floodData
      });

      // Depth points as circles (fast + clear)
      this._addLayer(map, {
        id: 'flood-depth-points',
        type: 'circle',
        source: 'flood-zones',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 4, 14, 9],
          'circle-color': [
            'interpolate',
            ['linear'],
            ['get', 'depth'],
            0, 'rgba(59,130,246,0.15)',
            0.3, 'rgba(59,130,246,0.40)',
            0.8, 'rgba(14,165,233,0.55)',
            1.2, 'rgba(37,99,235,0.7)',
            2.0, 'rgba(30,64,175,0.82)',
          ],
          'circle-opacity': ['interpolate', ['linear'], ['get', 'depth'], 0, 0.2, 2.5, 0.85],
          'circle-stroke-width': 1,
          'circle-stroke-color': 'rgba(248,250,252,0.35)',
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

      // Main-thread apply loop (throttled, FPS-aware)
      this._currentMap = map;
      if (this._taskId === null) {
        this._taskId = FrameController.add(() => {
          const m = this._currentMap;
          if (!m) return;
          if (!this._running) return;
          if (!m.getSource('flood-zones')) return;
          if (FrameController.getFPS() < 20) return;
          const now = performance.now();
          if (now - this._lastFrameAt < 220) return;
          this._lastFrameAt = now;
          try {
            m.getSource('flood-zones').setData(this.floodData);
          } catch (_) {}
        }, 120, 'terrain-flood-sync', 'normal');
      }

      this._bindStoreFeed();
      this.initialized = true;
    } catch (err) {
      console.error('[TerrainFloodPlugin] init error:', err);
    }
  }

  _bindStoreFeed() {
    if (this._unsubStore) return;
    // Direct Zustand subscription: no React renders
    this._unsubStore = useMapStore.subscribe((s) => {
      const year = s.year;
      const simFlood = Number(s.simulationState?.outputs?.riskLevels?.flood ?? 0); // 0-100
      const rainfallMm = Number(s.locationData?.rainfall ?? 0); // click-based (mm) if available
      const perfMode = s.perfMode || 'balanced';
      const quality = FrameController.getQualityHint();

      // Convert signals → rainfall intensity (mm/hr)
      // - Use rainfall if present (recently clicked location)
      // - Blend in simulation flood risk as a proxy for forecast severity
      const rainFromWeather = Math.max(0, Math.min(200, rainfallMm * 6)); // mm (hourly-ish) -> mm/hr proxy
      const rainFromRisk = Math.max(0, Math.min(200, (simFlood / 100) * (40 + (year - 2026) * 3)));
      const rainIntensityMmHr = clamp(0.65 * rainFromRisk + 0.35 * rainFromWeather, 0, 220);

      // Water level increases with long-horizon risk
      const waterLevel = clamp(0.8 + (simFlood / 100) * 1.6, 0.3, 3.0);

      this._liveParams = { rainIntensityMmHr, waterLevel, quality, perfMode };
    });
  }

  /**
   * Start the flood simulation at a center point.
   */
  startSimulation(map, center, params = {}) {
    if (!map || !this.worker) return;

    const { rainIntensity = 50, waterLevel = 1.0 } = params;
    this._currentMap = map;
    this._requestId += 1;
    const requestId = this._requestId;
    this._running = true;

    // Build a bounded simulation window around click (prevents huge viewports)
    const b = map.getBounds();
    const quality = FrameController.getQualityHint();
    const perfMode = useMapStore.getState().perfMode || 'balanced';

    const spanLng = Math.min(Math.abs(b.getEast() - b.getWest()), quality === 'low' ? 0.06 : 0.045);
    const spanLat = Math.min(Math.abs(b.getNorth() - b.getSouth()), quality === 'low' ? 0.05 : 0.038);
    const west = center[0] - spanLng / 2;
    const east = center[0] + spanLng / 2;
    const south = center[1] - spanLat / 2;
    const north = center[1] + spanLat / 2;

    // Resolution: adaptive grid. Keep <= ~64x64 to avoid spikes.
    const target = perfMode === 'low' ? 36 : quality === 'ultra' ? 64 : quality === 'high' ? 56 : quality === 'low' ? 40 : 48;
    const width = target;
    const height = target;

    // Warm cache
    terrainEngine.prefetchGrid(map, b, quality === 'low' ? 0.006 : 0.004, { year: useMapStore.getState().year, builtDensity: 0.65 });

    // Sample DEM heightfield (main-thread, bounded)
    const elevations = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const lng = west + (east - west) * (x / (width - 1));
        const lat = south + (north - south) * (y / (height - 1));
        const m = terrainEngine.getTerrainMetrics(map, { lng, lat }, { year: useMapStore.getState().year, builtDensity: 0.65 });
        elevations[y * width + x] = m.elevation || 0;
      }
    }

    this.worker.postMessage({
      type: 'init',
      requestId,
      width,
      height,
      bounds: { west, east, south, north },
      elevations,
      rainIntensityMmHr: rainIntensity,
      waterLevel,
    }, [elevations.buffer]);

    // Simulation stepping loop (FrameController drives; worker does compute)
    const stepInterval = perfMode === 'low' ? 520 : quality === 'low' ? 420 : 320;
    const stride = perfMode === 'low' ? 4 : quality === 'low' ? 3 : 2;
    const maxOut = perfMode === 'low' ? 900 : 1600;

    // Replace any existing stepping task
    if (this._stepTaskId !== null) {
      FrameController.remove(this._stepTaskId);
      this._stepTaskId = null;
    }

    this._stepTaskId = FrameController.add(() => {
      if (!this._running) return;
      if (FrameController.getFPS() < 20) return;
      try {
        // Live param feed (year + forecast/risk). Only send when changed.
        const lp = this._liveParams;
        const digest = `${lp.rainIntensityMmHr.toFixed(1)}|${lp.waterLevel.toFixed(2)}|${lp.quality}|${lp.perfMode}`;
        if (digest !== this._lastParamDigest) {
          this._lastParamDigest = digest;
          this.worker.postMessage({
            type: 'set-params',
            requestId,
            rainIntensityMmHr: lp.rainIntensityMmHr,
            waterLevel: lp.waterLevel,
          });
        }

        this.worker.postMessage({ type: 'step', requestId, dtSec: stepInterval / 1000, outStride: stride, maxOut });
      } catch (_) {}
    }, stepInterval, 'terrain-flood-step', 'normal');
  }

  /**
   * Stop the flood simulation.
   */
  stopSimulation(map) {
    this._running = false;
    this.floodData = { type: 'FeatureCollection', features: [] };
    try {
      map?.getSource('flood-zones')?.setData(this.floodData);
    } catch (e) {
      // Source may not exist
    }
    if (this.worker) {
      try { this.worker.postMessage({ type: 'reset', requestId: this._requestId }); } catch (_) {}
    }
    if (this._stepTaskId !== null) {
      FrameController.remove(this._stepTaskId);
      this._stepTaskId = null;
    }
  }

  destroy(map) {
    this._running = false;
    if (this._taskId !== null) {
      FrameController.remove(this._taskId);
      this._taskId = null;
    }
    if (this._stepTaskId !== null) {
      FrameController.remove(this._stepTaskId);
      this._stepTaskId = null;
    }
    if (this._unsubStore) {
      this._unsubStore();
      this._unsubStore = null;
    }
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    super.destroy(map);
  }
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
