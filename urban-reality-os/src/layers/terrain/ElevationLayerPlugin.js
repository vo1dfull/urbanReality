// ================================================
// Elevation Layer Plugin
// Handles Elevation Intelligence:
// - terrainEngine sampling (queryTerrainElevation) with cache/worker prefetch
// - slope/aspect/variance overlays
// - slope heatmap + high-risk slope zones
// ================================================
import BaseLayerPlugin from '../BaseLayerPlugin';
import { terrainEngine } from '../../engines/TerrainEngine';
import FrameController from '../../core/FrameController';

const ELEVATION_COLORS = [
  [0, '#2d5016'],      // Deep green (low elevation)
  [100, '#4a7c59'],    // Green
  [300, '#7cb342'],    // Light green
  [600, '#c0ca33'],    // Yellow-green
  [1000, '#fdd835'],   // Yellow
  [1500, '#fb8c00'],   // Orange
  [2000, '#f4511e'],   // Red-orange
  [2500, '#d32f2f'],   // Red
  [3000, '#8d6e63']    // Brown (high elevation)
];

const SLOPE_COLORS = [
  [0, '#2e7d32'],      // Green (flat)
  [5, '#66bb6a'],      // Light green
  [15, '#ffee58'],     // Yellow
  [30, '#ff9800'],     // Orange
  [45, '#f44336'],     // Red
  [60, '#8d6e63']      // Brown (steep)
];

export default class ElevationLayerPlugin extends BaseLayerPlugin {
  constructor() {
    super('terrainElevation');
    this._worker = null;
    this._reqId = 0;
    this._lastHandled = 0;
    this._pending = null;
    this._moveHandler = null;
    this._zoomHandler = null;
    this._taskId = null;
    this._visible = false;
    this._mode = 'elevation';
    this._grid = { heat: { type: 'FeatureCollection', features: [] }, risk: { type: 'FeatureCollection', features: [] } };
  }

  /**
   * @param {maplibregl.Map} map
   * @param {{ visible: boolean, mode: string }} data
   */
  init(map, data) {
    if (!map) return;

    try {
      this._ensureWorker();
      this._visible = !!data?.visible;
      this._mode = data?.mode || 'elevation';

      // Core visualization (vector contours as a baseline layer)
      this._addSource(map, 'elevation-data', {
        type: 'vector',
        url: 'https://api.maptiler.com/tiles/contours/tiles.json?key=UQBNCVHquLf1PybiywBt'
      });

      this._addLayer(map, {
        id: 'elevation-fill',
        type: 'fill',
        source: 'elevation-data',
        'source-layer': 'contour',
        paint: {
          'fill-color': [
            'interpolate',
            ['linear'],
            ['get', 'ele'],
            ...ELEVATION_COLORS.flat()
          ],
          'fill-opacity': 0.6
        },
        layout: {
          visibility: (data?.visible && data?.mode === 'elevation') ? 'visible' : 'none'
        }
      });

      this._addLayer(map, {
        id: 'slope-fill',
        type: 'fill',
        source: 'elevation-data',
        'source-layer': 'contour',
        paint: {
          'fill-color': [
            'interpolate',
            ['linear'],
            ['get', 'slope'],
            ...SLOPE_COLORS.flat()
          ],
          'fill-opacity': 0.6
        },
        layout: {
          visibility: (data?.visible && data?.mode === 'slope') ? 'visible' : 'none'
        }
      });

      // Elevation Intelligence overlays (worker-built)
      this._addSource(map, 'elevation-intel-heat', { type: 'geojson', data: this._grid.heat });
      this._addLayer(map, {
        id: 'elevation-intel-slope-heatmap',
        type: 'heatmap',
        source: 'elevation-intel-heat',
        paint: {
          'heatmap-weight': ['interpolate', ['linear'], ['get', 'intensity'], 0, 0, 1, 1],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 7, 0.7, 14, 1.35],
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(34,197,94,0)',
            0.25, 'rgba(34,197,94,0.35)',
            0.55, 'rgba(234,179,8,0.55)',
            0.8, 'rgba(239,68,68,0.75)',
            1, 'rgba(153,27,27,0.92)',
          ],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 7, 18, 14, 34],
          'heatmap-opacity': this._visible ? 0.9 : 0,
        },
        layout: { visibility: this._visible ? 'visible' : 'none' },
      });

      this._addSource(map, 'elevation-intel-risk', { type: 'geojson', data: this._grid.risk });
      this._addLayer(map, {
        id: 'elevation-intel-slope-risk',
        type: 'fill',
        source: 'elevation-intel-risk',
        paint: {
          'fill-color': [
            'match',
            ['get', 'risk'],
            'high', 'rgba(239,68,68,0.22)',
            'medium', 'rgba(234,179,8,0.18)',
            'rgba(239,68,68,0.12)',
          ],
          'fill-outline-color': 'rgba(248,250,252,0.22)',
          'fill-opacity': this._visible ? 0.85 : 0,
        },
        layout: { visibility: this._visible ? 'visible' : 'none' },
      });

      this._bindMapEvents(map);
      this._scheduleUpdate(map, { immediate: true });

      this.initialized = true;
    } catch (err) {
      console.error('[ElevationLayerPlugin] init error:', err);
    }
  }

  _ensureWorker() {
    if (this._worker || typeof Worker === 'undefined') return;
    try {
      this._worker = new Worker(new URL('../../workers/elevationIntelligenceWorker.js', import.meta.url), { type: 'module' });
      this._worker.onmessage = ({ data }) => {
        const { requestId, out } = data || {};
        if (!requestId || requestId < this._lastHandled) return;
        this._lastHandled = requestId;
        this._pending = null;
        this._grid = out || this._grid;
      };
    } catch {
      this._worker = null;
    }
  }

  _bindMapEvents(map) {
    if (this._moveHandler || this._zoomHandler) return;
    const onMoveEnd = () => this._scheduleUpdate(map);
    const onZoomEnd = () => this._scheduleUpdate(map);
    this._moveHandler = onMoveEnd;
    this._zoomHandler = onZoomEnd;
    map.on('moveend', onMoveEnd);
    map.on('zoomend', onZoomEnd);

    // Push map source updates through FrameController (never update per event spam)
    this._taskId = FrameController.add(() => {
      if (!this._visible) return;
      if (!this._grid?.heat || !map.getSource('elevation-intel-heat')) return;
      try { map.getSource('elevation-intel-heat').setData(this._grid.heat); } catch (_) {}
      try { map.getSource('elevation-intel-risk').setData(this._grid.risk); } catch (_) {}
    }, 450, 'elevation-intel-sync', 'idle');
  }

  _scheduleUpdate(map, { immediate = false } = {}) {
    if (!map || !this._visible) return;
    if (FrameController.getFPS() < 22) return;
    if (this._pending && !immediate) return;
    this._pending = true;

    const bounds = map.getBounds();
    const zoom = map.getZoom();
    const quality = FrameController.getQualityHint();
    const step = quality === 'low' ? 0.006 : zoom >= 13 ? 0.002 : zoom >= 11 ? 0.0035 : 0.005;

    // Warm the terrain cache (worker-backed inside TerrainEngine)
    terrainEngine.prefetchGrid(map, bounds, step, { year: 2026, builtDensity: 0.6 });

    // Build point list from cache (bounded)
    const points = [];
    const west = bounds.getWest();
    const east = bounds.getEast();
    const south = bounds.getSouth();
    const north = bounds.getNorth();
    let count = 0;
    const maxPoints = quality === 'low' ? 650 : quality === 'ultra' ? 1400 : 1000;

    for (let lng = west; lng <= east; lng += step) {
      for (let lat = south; lat <= north; lat += step) {
        const m = terrainEngine.getTerrainMetrics(map, { lng, lat }, { year: 2026, builtDensity: 0.6 });
        points.push({ lng, lat, slope: m.slope, aspect: m.aspect, variance: m.variance, step });
        if (++count >= maxPoints) break;
      }
      if (count >= maxPoints) break;
    }

    const requestId = ++this._reqId;
    if (this._worker) {
      this._worker.postMessage({ requestId, points, mode: this._mode });
    } else {
      // Minimal fallback: no worker — keep previous grid to avoid spikes
      this._pending = null;
    }
  }

  /**
   * Toggle visibility based on mode.
   * @param {maplibregl.Map} map
   * @param {boolean} visible
   * @param {string} mode - 'elevation' or 'slope'
   */
  toggleMode(map, visible, mode) {
    if (!map) return;
    this._visible = !!visible;
    this._mode = mode || this._mode;
    try {
      if (map.getLayer('elevation-fill')) {
        map.setLayoutProperty('elevation-fill', 'visibility', (visible && mode === 'elevation') ? 'visible' : 'none');
      }
      if (map.getLayer('slope-fill')) {
        map.setLayoutProperty('slope-fill', 'visibility', (visible && mode === 'slope') ? 'visible' : 'none');
      }
      if (map.getLayer('elevation-intel-slope-heatmap')) map.setLayoutProperty('elevation-intel-slope-heatmap', 'visibility', visible ? 'visible' : 'none');
      if (map.getLayer('elevation-intel-slope-risk')) map.setLayoutProperty('elevation-intel-slope-risk', 'visibility', visible ? 'visible' : 'none');
    } catch (err) {
      console.warn('[ElevationLayerPlugin] toggleMode error:', err);
    }
  }

  toggle(map, visible) {
    // Rely on toggleMode for proper dispatching based on UI mode,
    // but provide fallback that leaves the previous mode
    if (!map) return;
    try {
      if (!visible) {
        if (map.getLayer('elevation-fill')) map.setLayoutProperty('elevation-fill', 'visibility', 'none');
        if (map.getLayer('slope-fill')) map.setLayoutProperty('slope-fill', 'visibility', 'none');
      }
    } catch (err) {}
  }

  destroy(map) {
    if (this._taskId !== null) {
      FrameController.remove(this._taskId);
      this._taskId = null;
    }
    if (map && this._moveHandler) {
      try { map.off('moveend', this._moveHandler); } catch (_) {}
      this._moveHandler = null;
    }
    if (map && this._zoomHandler) {
      try { map.off('zoomend', this._zoomHandler); } catch (_) {}
      this._zoomHandler = null;
    }
    if (this._worker) {
      this._worker.terminate();
      this._worker = null;
    }
    this._pending = null;
    super.destroy(map);
  }
}
