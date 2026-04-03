// ================================================
// Heat Layer Plugin
// Handles urban heat island heatmap rendering
// ================================================
import BaseLayerPlugin from '../BaseLayerPlugin';
import { terrainEngine } from '../../engines/TerrainEngine';
import FrameController from '../../core/FrameController';

export default class HeatLayerPlugin extends BaseLayerPlugin {
  constructor() {
    super('terrainHeat');
    this.heatData = { type: 'FeatureCollection', features: [] };
    this.greenZonesData = { type: 'FeatureCollection', features: [] };
    this._worker = null;
    this._reqId = 0;
    this._lastHandled = 0;
    this._pending = false;
    this._syncTaskId = null;
  }

  getBuildingDensity(lng, lat) {
    const urbanCenterDist = Math.sqrt(Math.pow(lng - 77.209, 2) + Math.pow(lat - 28.6139, 2));
    return Math.max(0, Math.min(1, 1 - urbanCenterDist * 10));
  }

  _ensureWorker() {
    if (this._worker || typeof Worker === 'undefined') return;
    try {
      this._worker = new Worker(new URL('../../workers/heatDynamicsWorker.js', import.meta.url), { type: 'module' });
      this._worker.onmessage = ({ data }) => {
        const { requestId, heat } = data || {};
        if (!requestId || requestId < this._lastHandled) return;
        this._lastHandled = requestId;
        this._pending = false;
        if (heat) this.heatData = heat;
      };
    } catch {
      this._worker = null;
    }
  }

  updateGrid(map, year, greenZonesSet, layers) {
    if (!map) return;
    try {
      this._ensureWorker();
      const bounds = map.getBounds();
      const quality = FrameController.getQualityHint();
      const zoom = map.getZoom();
      const step = quality === 'low' ? 0.006 : zoom >= 13 ? 0.0025 : zoom >= 11 ? 0.0035 : 0.005;
      terrainEngine.prefetchGrid(map, bounds, step, { year, builtDensity: 0.7 });

      if (!this._worker) return;
      if (this._pending) return;
      this._pending = true;

      const points = [];
      const west = bounds.getWest();
      const east = bounds.getEast();
      const south = bounds.getSouth();
      const north = bounds.getNorth();
      const maxPoints = quality === 'low' ? 900 : quality === 'ultra' ? 2200 : 1500;
      let count = 0;

      for (let lng = west; lng <= east; lng += step) {
        for (let lat = south; lat <= north; lat += step) {
          const built = this.getBuildingDensity(lng, lat);
          const m = terrainEngine.getTerrainMetrics(map, { lng, lat }, { year, builtDensity: built });
          points.push([lng, lat, m.elevation || 0, m.slope || 0, built]);
          if (++count >= maxPoints) break;
        }
        if (count >= maxPoints) break;
      }

      const requestId = ++this._reqId;
      const trafficOn = !!layers?.traffic;
      this._worker.postMessage({
        requestId,
        points,
        year,
        greenZones: Array.from(greenZonesSet || []),
        trafficOn,
      });

      // Update Green Zones feature collection
      const gzFeatures = Array.from(greenZonesSet || new Set()).map(key => {
        const [glng, glat] = key.split(',').map(Number).map(x => x / 1000);
        return { type: 'Feature', geometry: { type: 'Point', coordinates: [glng, glat] } };
      });
      this.greenZonesData = { type: 'FeatureCollection', features: gzFeatures };
      if (map.getSource('green-zones')) {
        map.getSource('green-zones').setData(this.greenZonesData);
      }
    } catch (error) {
      console.error('[HeatLayerPlugin] Error updating grid:', error);
    }
  }

  init(map, data) {
    if (!map) return;
    try {
      this.updateGrid(map, data?.year || 2025, data?.greenZones || new Set(), data?.layers || null);

      this._addSource(map, 'heat-data', { type: 'geojson', data: this.heatData });
      this._addLayer(map, {
        id: 'heat-heatmap',
        type: 'heatmap',
        source: 'heat-data',
        paint: {
          'heatmap-weight': ['interpolate', ['linear'], ['get', 'temperature'], 15, 0, 30, 0.5, 45, 1],
          'heatmap-intensity': 1,
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(30, 58, 138, 0)',
            0.2, 'rgba(59, 130, 246, 0.4)',
            0.4, 'rgba(245, 158, 11, 0.6)',
            0.6, 'rgba(249, 115, 22, 0.7)',
            0.8, 'rgba(220, 38, 38, 0.8)',
            1, 'rgba(124, 45, 18, 0.9)'
          ],
          'heatmap-radius': 25,
          'heatmap-opacity': 0.7
        },
        layout: { visibility: data?.visible ? 'visible' : 'none' }
      });

      this._addSource(map, 'green-zones', { type: 'geojson', data: this.greenZonesData });
      this._addLayer(map, {
        id: 'green-zones-fill',
        type: 'circle',
        source: 'green-zones',
        paint: {
          'circle-radius': 8,
          'circle-color': '#22c55e',
          'circle-opacity': 0.8,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#16a34a'
        },
        layout: { visibility: data?.visible ? 'visible' : 'none' }
      });

      this.initialized = true;
    } catch (err) {
      console.error('[HeatLayerPlugin] init error:', err);
    }
  }

  toggle(map, visible, year, greenZonesSet, layers) {
    if (visible) {
      this.updateGrid(map, year, greenZonesSet, layers);
      if (this._syncTaskId === null) {
        // Apply worker results to map at a safe cadence
        this._syncTaskId = FrameController.add(() => {
          if (!map?.getSource('heat-data')) return;
          if (FrameController.getFPS() < 22) return;
          try { map.getSource('heat-data').setData(this.heatData); } catch (_) {}
        }, 420, 'heat-sync', 'idle');
      }
    }
    try {
      if (map && map.getLayer('heat-heatmap')) map.setLayoutProperty('heat-heatmap', 'visibility', visible ? 'visible' : 'none');
      if (map && map.getLayer('green-zones-fill')) map.setLayoutProperty('green-zones-fill', 'visibility', visible ? 'visible' : 'none');
    } catch (e) {}
  }

  destroy(map) {
    if (this._syncTaskId !== null) {
      FrameController.remove(this._syncTaskId);
      this._syncTaskId = null;
    }
    if (this._worker) {
      this._worker.terminate();
      this._worker = null;
    }
    super.destroy(map);
  }
}
