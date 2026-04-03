const SAMPLE_DELTA = 0.0005;
const CACHE_LIMIT = 20000;
const TILE_SIZE = 0.01;
const MAX_PREFETCH_POINTS = 500;
const PREFETCH_TARGET_GRID = 50;
const MAX_PREFETCH_ITERATIONS = 3000;

class TerrainEngine {
  constructor() {
    this.map = null;
    this.metricCache = new Map();
    this.tileIndex = new Map();
    this.worker = null;
    this.requestId = 0;
    this.pendingRequests = new Map();
    this._lastSampleTime = 0;
    this._lastSampleCache = new Map(); // lngLat key → elevation
  }

  init(map) {
    if (!map || this.map === map) return;
    this.map = map;
    this.clearCache();
    this._ensureWorker();
  }

  destroy() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.map = null;
    this.clearCache();
  }

  clearCache() {
    this.metricCache.clear();
    this.tileIndex.clear();
  }

  _getCacheKey(lngLat) {
    return `${lngLat.lng.toFixed(5)},${lngLat.lat.toFixed(5)}`;
  }

  _getTileKey(lngLat) {
    const x = Math.floor(lngLat.lng / TILE_SIZE);
    const y = Math.floor(lngLat.lat / TILE_SIZE);
    return `${x}:${y}`;
  }

  _addToTileIndex(key, tileKey) {
    if (!this.tileIndex.has(tileKey)) {
      this.tileIndex.set(tileKey, new Set());
    }
    this.tileIndex.get(tileKey).add(key);
  }

  _ensureWorker() {
    if (this.worker || typeof Worker === 'undefined') return;
    try {
      this.worker = new Worker(new URL('../workers/terrainWorker.js', import.meta.url), {
        type: 'module'
      });
      this.worker.onmessage = ({ data }) => {
        const { id, results } = data;
        const callback = this.pendingRequests.get(id);
        if (callback) {
          callback(results);
          this.pendingRequests.delete(id);
        }
      };
      this.worker.onerror = (error) => {
        console.warn('Terrain worker error:', error);
      };
    } catch (err) {
      console.warn('Could not initialize terrain worker:', err);
      this.worker = null;
    }
  }

  _clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  _queryElevation(map, lngLat) {
    if (!map || !lngLat || typeof map.queryTerrainElevation !== 'function') return 0;

    // ── Throttle: return cached if queried within 50ms ──
    const key = `${lngLat.lng?.toFixed?.(5) ?? lngLat.lng},${lngLat.lat?.toFixed?.(5) ?? lngLat.lat}`;
    const now = performance.now();
    if (now - this._lastSampleTime < 50 && this._lastSampleCache.has(key)) {
      return this._lastSampleCache.get(key);
    }

    try {
      const elevation = map.queryTerrainElevation(lngLat, { exaggerated: false }) ?? 0;
      this._lastSampleTime = now;
      this._lastSampleCache.set(key, elevation);

      // Cap sample cache size
      if (this._lastSampleCache.size > 500) {
        this._lastSampleCache.clear();
      }

      return elevation;
    } catch (error) {
      return 0;
    }
  }

  _computeMetricsFromSamples(samples, options = {}) {
    const builtDensity = options.builtDensity ?? 0.5;
    const year = options.year ?? 2026;
    const elevation = samples.center;
    const dx = (samples.east - samples.west) / (2 * SAMPLE_DELTA);
    const dy = (samples.north - samples.south) / (2 * SAMPLE_DELTA);
    const slope = Math.sqrt(dx * dx + dy * dy);
    const aspectRad = Math.atan2(dy, -dx); // downslope direction (approx)
    const aspectDeg = (aspectRad * 180 / Math.PI + 360) % 360;
    const variance = (() => {
      const a = samples.center;
      const b = samples.east;
      const c = samples.west;
      const d = samples.north;
      const e = samples.south;
      const mean = (a + b + c + d + e) / 5;
      const v = ((a - mean) ** 2 + (b - mean) ** 2 + (c - mean) ** 2 + (d - mean) ** 2 + (e - mean) ** 2) / 5;
      return v;
    })();

    const drainage = this._clamp(1 - slope * 3.5, 0, 1);
    const climateFactor = (year - 2026) * 0.08;
    const heat = this._clamp(1 + builtDensity * 0.8 - elevation * 0.002 - slope * 0.18 + climateFactor, 0, 3);
    const baseTerrainCost = Math.round(80 + slope * 35 + Math.max(0, 800 - elevation) * 0.08);
    const terrainQuality = this._clamp(1 - slope * 0.015 + drainage * 0.3, 0, 1);

    return {
      elevation,
      slope,
      aspect: aspectDeg,
      variance,
      drainage,
      heat,
      baseTerrainCost,
      terrainQuality,
      tileScore: Math.round((terrainQuality + drainage) * 50)
    };
  }

  getTerrainMetrics(map, lngLat, options = {}) {
    if (!map || !lngLat) {
      return {
        elevation: 0,
        slope: 0,
        drainage: 0,
        heat: 0,
        baseTerrainCost: 100,
        terrainQuality: 0,
        tileScore: 0
      };
    }

    this.init(map);
    const cacheKey = this._getCacheKey(lngLat);
    if (this.metricCache.has(cacheKey)) {
      return this.metricCache.get(cacheKey);
    }

    const center = this._queryElevation(map, lngLat);
    const east = this._queryElevation(map, { lng: lngLat.lng + SAMPLE_DELTA, lat: lngLat.lat });
    const west = this._queryElevation(map, { lng: lngLat.lng - SAMPLE_DELTA, lat: lngLat.lat });
    const north = this._queryElevation(map, { lng: lngLat.lng, lat: lngLat.lat + SAMPLE_DELTA });
    const south = this._queryElevation(map, { lng: lngLat.lng, lat: lngLat.lat - SAMPLE_DELTA });

    const metrics = this._computeMetricsFromSamples({ center, east, west, north, south }, options);
    this.metricCache.set(cacheKey, metrics);
    this._addToTileIndex(cacheKey, this._getTileKey(lngLat));

    if (this.metricCache.size > CACHE_LIMIT) {
      this.metricCache.clear();
      this.tileIndex.clear();
    }

    return metrics;
  }

  prefetchGrid(map, bounds, step = 0.002, options = {}) {
    if (!map || !bounds) return;
    this.init(map);
    const points = [];
    let count = 0;

    const west = bounds.getWest();
    const east = bounds.getEast();
    const south = bounds.getSouth();
    const north = bounds.getNorth();

    // Prevent catastrophic nested-loop cost on large viewports.
    const lngSpan = Math.abs(east - west);
    const latSpan = Math.abs(north - south);
    const minStepLng = lngSpan / PREFETCH_TARGET_GRID;
    const minStepLat = latSpan / PREFETCH_TARGET_GRID;
    const safeStep = Math.max(step, minStepLng, minStepLat, 0.0005);

    let iterations = 0;

    for (let lng = west; lng <= east; lng += safeStep) {
      for (let lat = south; lat <= north; lat += safeStep) {
        if (iterations++ >= MAX_PREFETCH_ITERATIONS) break;
        const key = this._getCacheKey({ lng, lat });
        if (this.metricCache.has(key)) continue;
        if (count >= MAX_PREFETCH_POINTS) break;

        const center = this._queryElevation(map, { lng, lat });
        const east = this._queryElevation(map, { lng: lng + SAMPLE_DELTA, lat });
        const west = this._queryElevation(map, { lng: lng - SAMPLE_DELTA, lat });
        const north = this._queryElevation(map, { lng, lat: lat + SAMPLE_DELTA });
        const south = this._queryElevation(map, { lng, lat: lat - SAMPLE_DELTA });

        points.push({ key, center, east, west, north, south, year: options.year ?? 2026, builtDensity: options.builtDensity ?? 0.5 });
        count += 1;
      }
      if (count >= MAX_PREFETCH_POINTS || iterations >= MAX_PREFETCH_ITERATIONS) break;
    }

    if (points.length === 0 || !this.worker) {
      points.forEach(point => {
        const metrics = this._computeMetricsFromSamples(point, options);
        this.metricCache.set(point.key, metrics);
        this._addToTileIndex(point.key, this._getTileKey({ lng: parseFloat(point.key.split(',')[0]), lat: parseFloat(point.key.split(',')[1]) }));
      });
      return;
    }

    const requestId = ++this.requestId;
    const payload = { id: requestId, points };
    this.pendingRequests.set(requestId, (results) => {
      results.forEach((result, index) => {
        const key = points[index].key;
        this.metricCache.set(key, result);
        const [lngString, latString] = key.split(',');
        this._addToTileIndex(key, this._getTileKey({ lng: Number(lngString), lat: Number(latString) }));
      });
    });
    this.worker.postMessage(payload);
  }
}

export const terrainEngine = new TerrainEngine();
