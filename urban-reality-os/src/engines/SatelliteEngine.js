// ================================================
// SatelliteEngine — Real-time NDVI + satellite data integration
// Multi-band support (NDVI, NDWI, NDBI, EVI), heat islands, water bodies
// IndexedDB-backed tile cache for persistent offline access
// ================================================

import EventBus from '../core/EventBus';
import { createLogger } from '../core/Logger';
import { throttle } from '../utils/cache';

const log = createLogger('SatelliteEngine');

/** @type {string} Sentinel-2 NDVI tile provider (WCS endpoint) */
const SENTINEL_NDVI_URL = 'https://services.sentinel-hub.com/api/v1/wcs';

/** @type {string} Landsat NDVI provider fallback */
const LANDSAT_NDVI_URL = 'https://earthexplorer.usgs.gov/rest/landsat8/search';

/**
 * @typedef {Object} BandData
 * @property {Float32Array} values — Band index values
 * @property {number} min — Minimum value in band
 * @property {number} max — Maximum value in band
 * @property {number} mean — Mean value in band
 * @property {number} timestamp — Data acquisition time
 */

/**
 * @typedef {Object} NDVIOverlay
 * @property {ImageData} imageData — Rendered image
 * @property {Array<ColorStop>} legend — Color legend entries
 * @property {number} min — Min NDVI value
 * @property {number} max — Max NDVI value
 * @property {number} mean — Mean NDVI value
 * @property {number} width — Image width
 * @property {number} height — Image height
 */

/**
 * @typedef {Object} HeatIsland
 * @property {number} lng — Longitude
 * @property {number} lat — Latitude
 * @property {number} intensity — Heat intensity 0-100
 * @property {number} lstEstimate — Land surface temperature (K)
 * @property {number} ndbi — Built-up index
 */

/**
 * @typedef {Object} ChangeMap
 * @property {Uint8Array} diffMap — 0=lost, 127=unchanged, 255=gained
 * @property {number} gainedArea — km² of vegetation gained
 * @property {number} lostArea — km² of vegetation lost
 * @property {number} percentChange — % of total area changed
 */

/**
 * @typedef {Object} EnvironmentalReport
 * @property {number} score — Overall health 0-100
 * @property {number} vegetationCoverage — % of area with NDVI > 0.3
 * @property {number} waterCoverage — % of area with NDWI > 0.3
 * @property {number} urbanCoverage — % of area with NDBI > 0.1
 * @property {number} meanTemperature — Estimated mean temperature (celsius)
 * @property {number} heatStress — % of area with elevated heat
 * @property {object} bands — { ndvi, ndwi, ndbi, evi } band statistics
 * @property {string} healthStatus — 'excellent' | 'good' | 'moderate' | 'poor'
 */

/**
 * Simplified OfflineStore for tile caching
 */
class TileStore {
  constructor() {
    this.db = null;
    this._ready = this._initDB();
  }

  async _initDB() {
    if (typeof indexedDB === 'undefined') {
      log.warn('IndexedDB not available, tile cache in-memory only');
      return false;
    }

    try {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open('UrbanRealitySatelliteTiles', 1);
        
        request.onupgradeneeded = (evt) => {
          const db = evt.target.result;
          if (!db.objectStoreNames.contains('tiles')) {
            const store = db.createObjectStore('tiles', { keyPath: 'key' });
            store.createIndex('timestamp', 'timestamp', { unique: false });
          }
        };

        request.onsuccess = () => {
          this.db = request.result;
          resolve(true);
        };

        request.onerror = () => {
          log.warn('IndexedDB open failed:', request.error);
          resolve(false);
        };
      });
    } catch (err) {
      log.warn('IndexedDB init error:', err);
      return false;
    }
  }

  async set(key, tileData, ttlMs = 7 * 24 * 60 * 60000) { // 7 days default
    if (!await this._ready || !this.db) return;

    try {
      const tx = this.db.transaction('tiles', 'readwrite');
      const store = tx.objectStore('tiles');
      
      await new Promise((resolve, reject) => {
        const request = store.put({
          key,
          data: tileData,
          timestamp: Date.now(),
          expires: Date.now() + ttlMs,
        });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (err) {
      log.warn('TileStore.set error:', err);
    }
  }

  async get(key) {
    if (!await this._ready || !this.db) return null;

    try {
      return await new Promise((resolve) => {
        const tx = this.db.transaction('tiles', 'readonly');
        const store = tx.objectStore('tiles');
        const request = store.get(key);

        request.onsuccess = () => {
          const item = request.result;
          if (!item) {
            resolve(null);
            return;
          }

          // Check expiration
          if (item.expires && item.expires < Date.now()) {
            tx.abort();
            const txDel = this.db.transaction('tiles', 'readwrite');
            txDel.objectStore('tiles').delete(key);
            resolve(null);
          } else {
            resolve(item.data);
          }
        };

        request.onerror = () => resolve(null);
      });
    } catch (err) {
      log.warn('TileStore.get error:', err);
      return null;
    }
  }

  async clear() {
    if (!await this._ready || !this.db) return;

    try {
      return new Promise((resolve) => {
        const tx = this.db.transaction('tiles', 'readwrite');
        const request = tx.objectStore('tiles').clear();
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
      });
    } catch (err) {
      log.warn('TileStore.clear error:', err);
    }
  }
}

export class SatelliteEngine {
  constructor() {
    this.state = {
      tiles: new Map(),           // [lng, lat] -> tile data
      lastUpdate: 0,
      provider: 'sentinel',        // 'sentinel' | 'landsat' | 'hybrid'
      cacheExpiry: 24 * 60 * 60000, // 24 hours
      coverage: {},                // bounds -> coverage %
    };
    
    this.eventBus = EventBus;
    this._worker = null;
    this._requestId = 0;
    this._pendingRequests = new Map();
    this._abortControllers = new Map();
    this._memoryCache = new Map(); // [lng, lat] -> cached tile
    this._tileStore = new TileStore(); // IndexedDB persistence
    this._destroyed = false;
    this._ndviProcessor = null;
  }

  /**
   * Initialize satellite worker
   */
  async initialize() {
    if (this._destroyed) return;

    try {
      this._worker = new Worker(
        new URL('../workers/satelliteWorker.js', import.meta.url),
        { type: 'module' }
      );

      this._worker.onmessage = (event) => {
        this._handleWorkerMessage(event.data);
      };

      this._worker.onerror = (error) => {
        log.error('Satellite worker error:', error);
        this.eventBus.emit('satellite:error', { error: error.message });
      };

      log.info('Satellite worker initialized');
    } catch (error) {
      log.error('Failed to initialize worker:', error);
    }
  }

  /**
   * Handle typed worker message with AbortController
   * @private
   */
  _handleWorkerMessage(message) {
    if (!message || !message.requestId) return;

    const { requestId, type, result, error } = message;
    const request = this._pendingRequests.get(requestId);

    if (!request) return;

    // Cleanup abort controller
    const controller = this._abortControllers.get(requestId);
    if (controller) {
      controller.abort();
      this._abortControllers.delete(requestId);
    }

    this._pendingRequests.delete(requestId);

    if (error) {
      request.reject(new Error(`${type}: ${error}`));
      return;
    }

    request.resolve(result);
    this.eventBus.emit(`satellite:${type}-complete`, result);
  }

  /**
   * Send typed message to worker with AbortController timeout
   * @private
   */
  _sendWorkerMessage(type, payload, timeoutMs = 30000) {
    return new Promise(async (resolve, reject) => {
      const requestId = ++this._requestId;
      this._pendingRequests.set(requestId, { resolve, reject });

      const controller = new AbortController();
      this._abortControllers.set(requestId, controller);

      const timeoutId = setTimeout(() => {
        if (this._pendingRequests.has(requestId)) {
          this._pendingRequests.delete(requestId);
          this._abortControllers.delete(requestId);
          controller.abort();
          reject(new Error(`${type} timeout (${timeoutMs}ms)`));
        }
      }, timeoutMs);

      controller.signal.addEventListener('abort', () => {
        clearTimeout(timeoutId);
      });

      if (!this._worker) {
        await this.initialize();
      }

      this._worker.postMessage({
        requestId,
        type,
        ...payload,
      });
    });
  }

  /**
   * Fetch specific band data
   * @param {object} bounds — { north, south, east, west }
   * @param {string} band — 'NDVI' | 'NDWI' | 'NDBI' | 'EVI'
   * @returns {Promise<BandData>}
   */
  async fetchBand(bounds = {}, band = 'NDVI') {
    const validBands = ['NDVI', 'NDWI', 'NDBI', 'EVI'];
    if (!validBands.includes(band)) {
      throw new Error(`Invalid band: ${band}. Must be one of ${validBands.join(', ')}`);
    }

    const { north, south, east, west } = bounds;
    if (!north || !south || !east || !west) {
      throw new Error('Invalid bounds');
    }

    // Check memory cache first
    const cacheKey = `${band}:${north}:${south}:${east}:${west}`;
    const cached = this._memoryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.state.cacheExpiry) {
      log.info(`${band} cache hit`);
      return cached.data;
    }

    // Check IndexedDB
    const storedData = await this._tileStore.get(cacheKey);
    if (storedData && Date.now() - storedData.timestamp < this.state.cacheExpiry) {
      this._memoryCache.set(cacheKey, { data: storedData, timestamp: Date.now() });
      return storedData;
    }

    // Fetch from worker
    const data = await this._sendWorkerMessage(
      `fetch${band}`,
      { bounds },
      30000
    );

    // Update caches
    this._memoryCache.set(cacheKey, { data, timestamp: Date.now() });
    await this._tileStore.set(cacheKey, data);

    return data;
  }

  /**
   * Detect urban heat islands using NDBI + LST approximation
   * @param {object} bounds
   * @returns {Promise<HeatIsland[]>}
   */
  async detectUrbanHeatIslands(bounds = {}) {
    const ndbiData = await this.fetchBand(bounds, 'NDBI');
    const ndviData = await this.fetchBand(bounds, 'NDVI');

    // Approximate LST from NDBI and NDVI
    const heatIslands = [];
    const { values: ndbiValues } = ndbiData;
    const { values: ndviValues } = ndviData;

    for (let i = 0; i < Math.min(ndbiValues.length, ndviValues.length); i++) {
      const ndbi = ndbiValues[i];
      const ndvi = ndviValues[i];

      // High NDBI (built-up) + low NDVI = potential heat island
      if (ndbi > 0.1 && ndvi < 0.3) {
        // Approximate LST in Kelvin using empirical formula
        // LST ≈ T_b / (1 + λ * T_b / ρ * ln(NDVI + 1))
        // Simplified: LST ~ 300K base + NDBI*50 - NDVI*30
        const lstEstimate = 300 + ndbi * 50 - ndvi * 30;
        const intensity = Math.round(Math.min(100, (ndbi - (-1)) / 1.1 * 100)); // Normalize to 0-100

        if (intensity > 20) {
          heatIslands.push({
            lng: bounds.west + (i % 256) * (bounds.east - bounds.west) / 256,
            lat: bounds.south + Math.floor(i / 256) * (bounds.north - bounds.south) / 256,
            intensity,
            lstEstimate: Math.round(lstEstimate),
            ndbi: Math.round(ndbi * 100) / 100,
          });
        }
      }
    }

    return heatIslands;
  }

  /**
   * Detect water bodies using NDWI threshold
   * @param {object} bounds
   * @returns {Promise<GeoJSON.FeatureCollection>}
   */
  async detectWaterBodies(bounds = {}) {
    const ndwiData = await this.fetchBand(bounds, 'NDWI');
    const { values: ndwiValues } = ndwiData;
    const { north, south, east, west } = bounds;

    const features = [];
    const waterPixels = [];

    // Identify water pixels (NDWI > 0.3)
    for (let i = 0; i < ndwiValues.length; i++) {
      if (ndwiValues[i] > 0.3) {
        const col = i % 256;
        const row = Math.floor(i / 256);
        waterPixels.push({
          col,
          row,
          ndwi: ndwiValues[i],
        });
      }
    }

    // Group contiguous pixels into polygons (simplified clustering)
    const processed = new Set();
    for (const pixel of waterPixels) {
      if (processed.has(`${pixel.col}:${pixel.row}`)) continue;

      const cluster = this._clusterWaterPixels(waterPixels, pixel, processed);
      if (cluster.length > 10) { // Only report clusters > 10 pixels
        const polygon = this._pixelsToPolygon(cluster, bounds);
        features.push({
          type: 'Feature',
          geometry: polygon,
          properties: {
            type: 'water_body',
            pixelCount: cluster.length,
            meanNDWI: Math.round(
              cluster.reduce((s, p) => s + p.ndwi, 0) / cluster.length * 100
            ) / 100,
          },
        });
      }
    }

    return {
      type: 'FeatureCollection',
      features,
      bounds,
    };
  }

  /**
   * Helper: Cluster contiguous water pixels
   * @private
   */
  _clusterWaterPixels(allPixels, startPixel, processed) {
    const cluster = [startPixel];
    const queue = [startPixel];
    processed.add(`${startPixel.col}:${startPixel.row}`);

    while (queue.length > 0) {
      const current = queue.shift();
      const neighbors = [
        { col: current.col - 1, row: current.row },
        { col: current.col + 1, row: current.row },
        { col: current.col, row: current.row - 1 },
        { col: current.col, row: current.row + 1 },
      ];

      for (const neighbor of neighbors) {
        const key = `${neighbor.col}:${neighbor.row}`;
        if (processed.has(key)) continue;

        const pixel = allPixels.find(p => p.col === neighbor.col && p.row === neighbor.row);
        if (pixel) {
          cluster.push(pixel);
          queue.push(pixel);
          processed.add(key);
        }
      }
    }

    return cluster;
  }

  /**
   * Helper: Convert pixel cluster to GeoJSON polygon
   * @private
   */
  _pixelsToPolygon(cluster, bounds) {
    if (cluster.length < 3) return null;

    // Simple convex hull approximation
    const points = cluster.map(p => ({
      lng: bounds.west + (p.col / 256) * (bounds.east - bounds.west),
      lat: bounds.south + (p.row / 256) * (bounds.north - bounds.south),
    }));

    // Sort by angle for convex hull
    const center = points.reduce((acc, p) => ({
      lng: acc.lng + p.lng / points.length,
      lat: acc.lat + p.lat / points.length,
    }), { lng: 0, lat: 0 });

    points.sort((a, b) => {
      const angleA = Math.atan2(a.lat - center.lat, a.lng - center.lng);
      const angleB = Math.atan2(b.lat - center.lat, b.lng - center.lng);
      return angleA - angleB;
    });

    return {
      type: 'Polygon',
      coordinates: [[
        ...points.map(p => [p.lng, p.lat]),
        [points[0].lng, points[0].lat] // Close the polygon
      ]],
    };
  }

  /**
   * Compute NDVI change detection between two dates
   * @param {object} bounds
   * @param {string} dateA — ISO date string
   * @param {string} dateB — ISO date string (must be > dateA)
   * @returns {Promise<ChangeMap>}
   */
  async computeChangeDetection(bounds = {}, dateA = '', dateB = '') {
    if (!dateA || !dateB) {
      throw new Error('Both dateA and dateB required');
    }

    const result = await this._sendWorkerMessage(
      'computeChangeDetection',
      { bounds, dateA, dateB },
      45000
    );

    // Compute area metrics (simplified: assume 100m/pixel)
    const pixelSizeKm = 0.01; // 100m = 0.01 km
    const areaPerPixel = pixelSizeKm * pixelSizeKm;
    const gainedPixels = result.diffMap.filter((v) => v === 255).length;
    const lostPixels = result.diffMap.filter((v) => v === 0).length;
    const totalPixels = result.diffMap.length;

    return {
      ...result,
      gainedArea: gainedPixels * areaPerPixel,
      lostArea: lostPixels * areaPerPixel,
      percentChange: ((gainedPixels + lostPixels) / totalPixels) * 100,
    };
  }

  /**
   * Generate typed NDVI overlay with metadata
   * @param {Float32Array} ndviValues
   * @param {number} width
   * @param {number} height
   * @returns {NDVIOverlay}
   */
  generateNDVIOverlay(ndviValues, width, height) {
    if (!ndviValues || ndviValues.length !== width * height) {
      throw new Error('Invalid NDVI data dimensions');
    }

    // Compute statistics
    let min = Infinity, max = -Infinity, sum = 0;
    for (let i = 0; i < ndviValues.length; i++) {
      const val = ndviValues[i];
      min = Math.min(min, val);
      max = Math.max(max, val);
      sum += val;
    }
    const mean = sum / ndviValues.length;

    // Create legend
    const legend = [
      { label: 'No Data', color: '#888888', min: -1.0, max: -0.5 },
      { label: 'Urban/Barren', color: '#FFffff', min: -0.5, max: -0.1 },
      { label: 'Water', color: '#0000FF', min: -0.1, max: 0.1 },
      { label: 'Sparse Veg', color: '#FFFF00', min: 0.1, max: 0.3 },
      { label: 'Moderate Veg', color: '#00FF00', min: 0.3, max: 0.6 },
      { label: 'Dense Veg', color: '#006400', min: 0.6, max: 1.0 },
    ];

    // Render image
    const imageData = new ImageData(width, height);
    const data = imageData.data;

    for (let i = 0; i < ndviValues.length; i++) {
      const ndvi = ndviValues[i];
      const normalized = (ndvi - min) / (max - min + 0.0001);

      const idx = i * 4;
      let r = 0, g = 0, b = 0, a = 255;

      if (ndvi < -0.1) {
        // Blue (water)
        b = 255;
      } else if (ndvi < 0.1) {
        // White (bare soil/urban)
        r = g = b = 255;
      } else if (ndvi < 0.3) {
        // Yellow (sparse)
        r = 255;
        g = 200;
      } else if (ndvi < 0.6) {
        // Green (moderate)
        r = 0;
        g = Math.round(100 + normalized * 155);
        b = 0;
      } else {
        // Dark green (dense)
        r = 0;
        g = 150;
        b = 0;
      }

      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = a;
    }

    return {
      imageData,
      legend,
      min,
      max,
      mean,
      width,
      height,
    };
  }

  /**
   * Get comprehensive environmental health report
   * @param {object} bounds
   * @returns {Promise<EnvironmentalReport>}
   */
  async getEnvironmentalHealthReport(bounds = {}) {
    const [ndviData, ndwiData, ndbiData, eviData] = await Promise.all([
      this.fetchBand(bounds, 'NDVI'),
      this.fetchBand(bounds, 'NDWI'),
      this.fetchBand(bounds, 'NDBI'),
      this.fetchBand(bounds, 'EVI'),
    ]);

    // Calculate coverage percentages
    const ndviGood = ndviData.values.filter((v) => v > 0.3).length;
    const ndwiGood = ndwiData.values.filter((v) => v > 0.3).length;
    const ndbiGood = ndbiData.values.filter((v) => v > 0.1).length;
    const total = ndviData.values.length;

    const vegetationCoverage = (ndviGood / total) * 100;
    const waterCoverage = (ndwiGood / total) * 100;
    const urbanCoverage = (ndbiGood / total) * 100;

    // Estimate mean temperature from NDBI
    const meanNDBI = ndbiData.mean;
    const meanTemperature = 25 + meanNDBI * 25; // 25°C base + NDBI influence

    // Heat stress areas (NDBI high, NDVI low)
    const heatStress = ndbiData.values.filter(
      (ndbi, i) => ndbi > 0.2 && ndviData.values[i] < 0.2
    ).length / total * 100;

    // Overall health score
    const healthScore = Math.round(
      (vegetationCoverage * 0.4 + waterCoverage * 0.2 + (100 - urbanCoverage) * 0.3 + (100 - heatStress) * 0.1)
    );

    let healthStatus = 'excellent';
    if (healthScore < 50) healthStatus = 'poor';
    else if (healthScore < 60) healthStatus = 'moderate';
    else if (healthScore < 75) healthStatus = 'good';

    return {
      score: healthScore,
      vegetationCoverage: Math.round(vegetationCoverage),
      waterCoverage: Math.round(waterCoverage),
      urbanCoverage: Math.round(urbanCoverage),
      meanTemperature: Math.round(meanTemperature),
      heatStress: Math.round(heatStress),
      bands: {
        ndvi: { mean: ndviData.mean, min: ndviData.min, max: ndviData.max },
        ndwi: { mean: ndwiData.mean, min: ndwiData.min, max: ndwiData.max },
        ndbi: { mean: ndbiData.mean, min: ndbiData.min, max: ndbiData.max },
        evi: { mean: eviData.mean, min: eviData.min, max: eviData.max },
      },
      healthStatus,
      timestamp: Date.now(),
    };
  }

  /**
   * Compute vegetation density from NDVI values
   * Normalizes NDVI (-1 to +1) to percentage (0-100)
   * @param {Float32Array} ndviValues
   * @returns {Uint8Array}
   */
  computeVegetationDensity(ndviValues) {
    if (!ndviValues || ndviValues.length === 0) return null;

    const vegetationDensity = new Uint8Array(ndviValues.length);

    for (let i = 0; i < ndviValues.length; i++) {
      const ndvi = ndviValues[i];
      // Normalize from [-1, 1] to [0, 100]
      const density = Math.round(((ndvi + 1) / 2) * 100);
      vegetationDensity[i] = Math.max(0, Math.min(100, density));
    }

    return vegetationDensity;
  }

  /**
   * Compute environmental quality index from NDVI
   * Higher vegetation = better environmental quality
   * @param {Uint8Array} vegetationDensity
   * @returns {number} quality index 0-100
   */
  computeEnvironmentalQualityIndex(vegetationDensity) {
    if (!vegetationDensity || vegetationDensity.length === 0) return 0;

    let sum = 0;
    for (let i = 0; i < vegetationDensity.length; i++) {
      sum += vegetationDensity[i];
    }

    const average = sum / vegetationDensity.length;

    // Quality index: vegetation + inversely proportional to urban footprint
    // Assumption: dense vegetation = less urban footprint
    return Math.round(average * 1.2); // Slightly boost vegetation signal
  }

  /**
   * Apply NDVI adjustments to heat and flood models
   * @param {number} ndvi — raw NDVI value [-1, 1]
   * @param {object} models — { heat, flood }
   * @returns {object} adjusted model values
   */
  adjustModelsWithNDVI(ndvi, models = {}) {
    // Vegetation reduces heat
    // Vegetation increases water absorption (reduces flood risk)
    const vegFactor = (ndvi + 1) / 2; // [0, 1]

    return {
      heat: Math.max(0, (models.heat || 0.5) * (1 - vegFactor * 0.3)), // -30% heat with vegetation
      flood: Math.max(0, (models.flood || 0.4) * (1 - vegFactor * 0.25)), // -25% flood risk with vegetation
    };
  }

  /**
   * Efficient tile-based loading for viewport
   * @param {object} viewport — { north, south, east, west, zoom }
   */
  async loadViewportTiles(viewport = {}) {
    if (this._destroyed) return;

    const { north, south, east, west, zoom } = viewport;
    const tileSize = this._getTileSizeForZoom(zoom);

    // Generate tile grid
    const tiles = [];
    let lng = west;
    while (lng < east) {
      let lat = south;
      while (lat < north) {
        tiles.push({
          north: Math.min(lat + tileSize, north),
          south: lat,
          east: Math.min(lng + tileSize, east),
          west: lng,
        });
        lat += tileSize;
      }
      lng += tileSize;
    }

    // Load non-cached tiles
    const promises = tiles
      .filter((tile) => {
        const key = `${tile.north}:${tile.south}:${tile.east}:${tile.west}`;
        return !this._tileCache.has(key);
      })
      .map((tile) => this.fetchNDVI(tile).catch(() => null));

    await Promise.allSettled(promises);
    this.eventBus.emit('satellite:viewport-loaded', { tilesLoaded: tiles.length });
  }

  /**
   * Get tile size based on zoom level
   * Higher zoom = smaller tiles
   */
  _getTileSizeForZoom(zoom) {
    if (zoom < 8) return 0.5;    // 0.5° tiles
    if (zoom < 12) return 0.1;   // 0.1° tiles
    return 0.05;                 // 0.05° tiles (more detailed)
  }

  /**
   * Subscribe to satellite events
   */
  on(event, callback) {
    return this.eventBus.on(event, callback);
  }

  /**
   * Clear cache
   */
  clearCache() {
    this._tileCache.clear();
    this.eventBus.emit('satellite:cache-cleared');
  }

  /**
   * Cleanup
   */
  destroy() {
    this._destroyed = true;
    if (this._worker) {
      this._worker.terminate();
      this._worker = null;
    }
    this._pendingRequests.clear();
    this._tileCache.clear();
    this.eventBus.clear();
  }
}

export default new SatelliteEngine();
