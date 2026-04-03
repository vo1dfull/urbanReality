// ================================================
// SatelliteEngine — Real-time NDVI + satellite data integration
// Fetches Sentinel/Landsat NDVI tiles, computes vegetation density
// ================================================

import EventBus from '../core/EventBus';
import { createLogger } from '../core/Logger';
import { throttle } from '../utils/cache';

const log = createLogger('SatelliteEngine');

/** @type {string} Sentinel-2 NDVI tile provider (WCS endpoint) */
const SENTINEL_NDVI_URL = 'https://services.sentinel-hub.com/api/v1/wcs';

/** @type {string} Landsat NDVI provider fallback */
const LANDSAT_NDVI_URL = 'https://earthexplorer.usgs.gov/rest/landsat8/search';

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
    this._tileCache = new Map(); // [lng, lat] -> cached tile
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
   * Handle worker response
   */
  _handleWorkerMessage(data) {
    if (!data) return;

    const { requestId, tileKey, result, error } = data;
    const request = this._pendingRequests.get(requestId);

    if (!request) return;

    this._pendingRequests.delete(requestId);

    if (error) {
      request.reject(new Error(error));
      return;
    }

    // Cache tile
    this._tileCache.set(tileKey, {
      data: result,
      timestamp: Date.now(),
    });

    request.resolve(result);
    this.eventBus.emit('satellite:tile-loaded', { tileKey, result });
  }

  /**
   * Fetch NDVI data for a geographic region
   * @param {object} bounds — { north, south, east, west }
   * @param {string} provider — 'sentinel' | 'landsat'
   * @returns {Promise<object>}
   */
  async fetchNDVI(bounds = {}, provider = this.state.provider) {
    if (this._destroyed) return null;

    const { north, south, east, west } = bounds;
    if (!north || !south || !east || !west) {
      throw new Error('Invalid bounds');
    }

    // Validate cache
    const cacheKey = `${north}:${south}:${east}:${west}`;
    const cached = this._tileCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.state.cacheExpiry) {
      log.info('NDVI cache hit');
      return cached.data;
    }

    if (!this._worker) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      const requestId = ++this._requestId;
      this._pendingRequests.set(requestId, { resolve, reject });

      this._worker.postMessage({
        requestId,
        type: 'fetchNDVI',
        bounds,
        provider,
        tileKey: cacheKey,
      });

      // Timeout after 30s
      setTimeout(() => {
        if (this._pendingRequests.has(requestId)) {
          this._pendingRequests.delete(requestId);
          reject(new Error('NDVI fetch timeout'));
        }
      }, 30000);
    });
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
   * Generate NDVI layer data for visualization
   * @param {Float32Array} ndviValues
   * @param {number} width
   * @param {number} height
   * @returns {ImageData}
   */
  generateNDVIOverlay(ndviValues, width, height) {
    if (!ndviValues || ndviValues.length !== width * height) {
      throw new Error('Invalid NDVI data dimensions');
    }

    const imageData = new ImageData(width, height);
    const data = imageData.data;

    for (let i = 0; i < ndviValues.length; i++) {
      const ndvi = ndviValues[i];
      // Normalize to [0, 255]
      const normalized = Math.round(((ndvi + 1) / 2) * 255);

      // Green colormap: low NDVI = yellow, high NDVI = green
      const idx = i * 4;
      if (normalized < 128) {
        // Yellow to lime
        data[idx] = 255;     // R
        data[idx + 1] = normalized * 2; // G
        data[idx + 2] = 0;   // B
      } else {
        // Lime to green
        data[idx] = 255 - (normalized - 128) * 2;
        data[idx + 1] = 255;
        data[idx + 2] = 0;   // B
      }
      data[idx + 3] = 180; // 70% opacity
    }

    return imageData;
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
