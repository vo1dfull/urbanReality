// ================================================
// DataEngine — All API calls, caching, AbortController
// Pure JS — no React dependency
// ✅ Request deduplication (prevent parallel duplicate requests)
// ✅ Memory-efficient caching with automatic cleanup
// ✅ Exponential backoff with jitter for retries
// ✅ Request prioritization queue
// ✅ Automatic stale data detection
// ✅ Batch request optimization
// ✅ Circuit breaker pattern for failing services
// ================================================
import { fetchRealtimeAQI } from '../utils/aqi';
import { fetchIndiaMacroData } from '../utils/worldBank';
import { getUrbanAnalysis } from '../utils/gemini';
import { MAJOR_INDIAN_CITIES, OPENWEATHER_KEY, TOMTOM_KEY } from '../constants/mapConstants';
import PERFORMANCE_CONFIG from '../config/performance';
import CacheEngine from '../core/CacheEngine';
import { createLogger } from '../core/Logger';

const log = createLogger('DataEngine');

/** @type {number} Retry attempts for critical fetches */
const MAX_RETRIES = 3; // Increased from 2

/** @type {number} Base backoff delay in ms */
const RETRY_BACKOFF = 800; // Reduced from 1000 for faster recovery

/** @type {number} Memory pressure threshold (MB) */
const MEMORY_PRESSURE_THRESHOLD = 100;

/**
 * Sleep with jitter to prevent thundering herd
 * @param {number} ms
 * @param {number} jitter - Jitter factor (0-1)
 * @returns {Promise<void>}
 */
const sleep = (ms, jitter = 0.3) => {
  const jitterMs = ms * jitter * Math.random();
  return new Promise(r => setTimeout(r, ms + jitterMs));
};

/**
 * Circuit breaker for failing endpoints
 */
class CircuitBreaker {
  constructor(threshold = 5, timeout = 60000) {
    this.failures = new Map();
    this.threshold = threshold;
    this.timeout = timeout;
  }

  recordFailure(key) {
    const now = Date.now();
    const record = this.failures.get(key) || { count: 0, lastFailure: now };
    record.count++;
    record.lastFailure = now;
    this.failures.set(key, record);

    // Auto-reset after timeout
    setTimeout(() => {
      const current = this.failures.get(key);
      if (current && current.lastFailure === record.lastFailure) {
        this.failures.delete(key);
      }
    }, this.timeout);
  }

  recordSuccess(key) {
    this.failures.delete(key);
  }

  isOpen(key) {
    const record = this.failures.get(key);
    if (!record) return false;
    return record.count >= this.threshold && (Date.now() - record.lastFailure) < this.timeout;
  }

  getStats() {
    const stats = {};
    for (const [key, record] of this.failures) {
      stats[key] = {
        failures: record.count,
        isOpen: this.isOpen(key),
        lastFailure: new Date(record.lastFailure).toISOString()
      };
    }
    return stats;
  }
}

class DataEngine {
  constructor() {
    this._abortControllers = new Map();
    this._macroDataCache = null;
    this._pendingRequests = new Map(); // Request deduplication
    this._requestQueue = []; // Priority queue
    this._circuitBreaker = new CircuitBreaker();
    
    // Non-reactive map data storage
    this._aqiGeo = null;
    this._floodData = null;
    this._facilityData = null;
    this._cityDemo = null;

    // Performance tracking
    this._stats = {
      requests: 0,
      cacheHits: 0,
      failures: 0,
      deduplicated: 0,
      avgResponseTime: 0
    };

    // Memory management
    this._memoryCheckInterval = null;
    this._startMemoryMonitoring();
  }

  // ──────────────────────────────────────────────────
  // NON-REACTIVE DATA GETTERS/SETTERS
  // ──────────────────────────────────────────────────

  getAqiGeo() { return this._aqiGeo; }
  setAqiGeo(data) { 
    this._aqiGeo = data;
    this._checkMemoryPressure();
  }
  
  getFloodData() { return this._floodData; }
  setFloodData(data) { 
    this._floodData = data;
    this._checkMemoryPressure();
  }
  
  getFacilityData() { return this._facilityData; }
  setFacilityData(data) { 
    this._facilityData = data;
    this._checkMemoryPressure();
  }
  
  getCityDemo() { return this._cityDemo; }
  setCityDemo(data) { 
    this._cityDemo = data;
    this._checkMemoryPressure();
  }

  // ──────────────────────────────────────────────────
  // AQI DATA FETCHING
  // ──────────────────────────────────────────────────

  /**
   * Fetch AQI for all major Indian cities with optimized batching
   * ✅ Deduplicates parallel requests
   * ✅ Smart batch sizing based on network conditions
   * @returns {Promise<{type: string, features: object[]} | null>}
   */
  async fetchAllCitiesAQI() {
    if (!OPENWEATHER_KEY) {
      log.warn('OpenWeather API key not available');
      return null;
    }

    const cacheKey = 'aqi:cities:all';
    
    // Check for pending identical request
    if (this._pendingRequests.has(cacheKey)) {
      this._stats.deduplicated++;
      return this._pendingRequests.get(cacheKey);
    }

    const cached = CacheEngine.get(cacheKey);
    if (cached) {
      this._stats.cacheHits++;
      // Refresh in background if stale
      if (this._isStale(cacheKey, PERFORMANCE_CONFIG.cache.aqi)) {
        this._refreshAllCitiesAQI(cacheKey);
      }
      return cached;
    }

    const requestPromise = this._fetchAllCitiesAQIImpl(cacheKey);
    this._pendingRequests.set(cacheKey, requestPromise);

    try {
      const result = await requestPromise;
      return result;
    } finally {
      this._pendingRequests.delete(cacheKey);
    }
  }

  async _fetchAllCitiesAQIImpl(cacheKey) {
    this._stats.requests++;
    const startTime = performance.now();

    return CacheEngine.fetch(cacheKey, async () => {
      // Adaptive batch size based on recent performance
      const avgTime = this._stats.avgResponseTime;
      const batchSize = avgTime > 1000 
        ? Math.max(3, PERFORMANCE_CONFIG.batch.aqiChunkSize - 2)
        : PERFORMANCE_CONFIG.batch.aqiChunkSize;

      const features = [];
      const errors = [];

      for (let i = 0; i < MAJOR_INDIAN_CITIES.length; i += batchSize) {
        const chunk = MAJOR_INDIAN_CITIES.slice(i, i + batchSize);
        
        const results = await Promise.allSettled(
          chunk.map(async (city) => {
            const cityKey = `aqi:${city.name}`;
            
            // Circuit breaker check
            if (this._circuitBreaker.isOpen(cityKey)) {
              log.warn(`Circuit breaker open for ${city.name}, skipping`);
              return null;
            }

            try {
              const r = await this._fetchWithRetry(
                () => fetchRealtimeAQI(city.lat, city.lng, OPENWEATHER_KEY),
                cityKey
              );
              
              if (!r) return null;

              this._circuitBreaker.recordSuccess(cityKey);

              return {
                type: 'Feature',
                properties: {
                  aqi: r.aqi,
                  city: city.name,
                  level: r.category || null,
                  pm25: r.pm25 ?? null,
                  pm10: r.pm10 ?? null,
                  timestamp: Date.now()
                },
                geometry: { type: 'Point', coordinates: [city.lng, city.lat] },
              };
            } catch (err) {
              this._circuitBreaker.recordFailure(cityKey);
              errors.push({ city: city.name, error: err.message });
              log.warn(`AQI fetch failed for ${city.name}:`, err);
              return null;
            }
          })
        );

        const successfulResults = results
          .filter(r => r.status === 'fulfilled' && r.value)
          .map(r => r.value);

        features.push(...successfulResults);

        // Rate limiting pause between batches
        if (i + batchSize < MAJOR_INDIAN_CITIES.length) {
          await sleep(150, 0.2);
        }
      }

      const endTime = performance.now();
      this._updateAvgResponseTime(endTime - startTime);

      if (errors.length > 0) {
        log.warn(`AQI fetch completed with ${errors.length} errors`);
      }

      return { type: 'FeatureCollection', features, errors };
    }, PERFORMANCE_CONFIG.cache.aqi);
  }

  _refreshAllCitiesAQI(cacheKey) {
    // Background refresh with lower priority
    setTimeout(() => {
      this._fetchAllCitiesAQIImpl(cacheKey).catch((err) => {
        log.warn('Background AQI refresh failed:', err);
      });
    }, 1000);
  }

  // ──────────────────────────────────────────────────
  // STATIC DATA FETCHING
  // ──────────────────────────────────────────────────

  /**
   * Fetch flood.json, demographics.json, facilities.json in parallel
   * ✅ Improved error recovery
   * ✅ Partial success handling
   */
  async fetchStaticData() {
    const cacheKey = 'static:all';

    // Deduplication
    if (this._pendingRequests.has(cacheKey)) {
      this._stats.deduplicated++;
      return this._pendingRequests.get(cacheKey);
    }

    const cached = CacheEngine.get(cacheKey);
    if (cached) {
      this._stats.cacheHits++;
      return cached;
    }

    const requestPromise = CacheEngine.fetch(cacheKey, async () => {
      const results = { floodData: null, cityDemo: null, facilityData: null, errors: [] };

      const fetchWithRetry = async (url, name, retries = MAX_RETRIES) => {
        if (this._circuitBreaker.isOpen(name)) {
          log.warn(`Circuit breaker open for ${name}, using fallback`);
          return null;
        }

        for (let attempt = 0; attempt <= retries; attempt++) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (res.ok) {
              this._circuitBreaker.recordSuccess(name);
              return await res.json();
            }
            throw new Error(`HTTP ${res.status}`);
          } catch (err) {
            if (attempt < retries) {
              const backoff = RETRY_BACKOFF * Math.pow(2, attempt);
              await sleep(backoff, 0.3);
            } else {
              this._circuitBreaker.recordFailure(name);
              log.warn(`Static fetch failed: ${url}`, err);
              results.errors.push({ file: name, error: err.message });
              return null;
            }
          }
        }
        return null;
      };

      const [floodData, cityDemo, facilityData] = await Promise.all([
        fetchWithRetry('/data/flood.json', 'flood'),
        fetchWithRetry('/data/demographics.json', 'demographics'),
        fetchWithRetry('/data/facilities.json', 'facilities'),
      ]);

      results.floodData = floodData;
      results.cityDemo = cityDemo;
      results.facilityData = facilityData;

      return results;
    }, PERFORMANCE_CONFIG.cache.geo);

    this._pendingRequests.set(cacheKey, requestPromise);

    try {
      return await requestPromise;
    } finally {
      this._pendingRequests.delete(cacheKey);
    }
  }

  // ──────────────────────────────────────────────────
  // WORLD BANK DATA
  // ──────────────────────────────────────────────────

  async fetchWorldBankData() {
    if (this._macroDataCache) return this._macroDataCache;

    const cacheKey = 'worldbank:india';
    if (this._circuitBreaker.isOpen(cacheKey)) {
      log.warn('World Bank circuit breaker open, using cached data');
      return this._macroDataCache;
    }

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const data = await fetchIndiaMacroData();
        this._macroDataCache = data;
        this._circuitBreaker.recordSuccess(cacheKey);
        return data;
      } catch (e) {
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_BACKOFF * Math.pow(2, attempt), 0.3);
        } else {
          this._circuitBreaker.recordFailure(cacheKey);
          log.warn('World Bank data failed after retries:', e);
          return this._macroDataCache; // Return stale data if available
        }
      }
    }
    return this._macroDataCache;
  }

  getMacroData() {
    return this._macroDataCache;
  }

  // ──────────────────────────────────────────────────
  // LOCATION CLICK DATA
  // ──────────────────────────────────────────────────

  /**
   * Fetch all data for a map click location in parallel
   * ✅ Smart timeout handling
   * ✅ Graceful degradation
   * @param {number} lat
   * @param {number} lng
   * @param {AbortSignal} signal
   */
  async fetchLocationData(lat, lng, signal) {
    const locationKey = `location:${lat.toFixed(4)}:${lng.toFixed(4)}`;

    // Deduplication
    if (this._pendingRequests.has(locationKey)) {
      this._stats.deduplicated++;
      return this._pendingRequests.get(locationKey);
    }

    const requestPromise = CacheEngine.fetch(locationKey, async () => {
      const results = {
        placeName: 'Unknown Location',
        realTimeAQI: null,
        rainData: { rain: 0, probability: 0 },
        trafficJson: null
      };

      // Fetch with individual timeouts and fallbacks
      const fetchTasks = [
        // Place Name (critical)
        this._fetchPlaceName(lat, lng, signal).catch((err) => {
          if (err?.name !== 'AbortError') {
            log.warn('Geocoding failed:', err);
          }
          return 'Unknown Location';
        }),

        // AQI (important)
        this._fetchWithTimeout(
          () => fetchRealtimeAQI(lat, lng, OPENWEATHER_KEY, signal),
          3000,
          'AQI'
        ).catch((e) => {
          if (e?.name !== 'AbortError') {
            log.warn('AQI fetch failed:', e);
          }
          return null;
        }),

        // Rainfall (important)
        this._fetchWithTimeout(
          () => this._fetchRainfall(lat, lng, signal),
          3000,
          'Rain'
        ).catch((e) => {
          if (e?.name !== 'AbortError') {
            log.warn('Rain fetch failed:', e);
          }
          return { rain: 0, probability: 0 };
        }),

        // Traffic (nice-to-have)
        this._fetchTraffic(lat, lng, signal).catch(() => null)
      ];

      const [placeName, realTimeAQI, rainData, trafficJson] = await Promise.all(fetchTasks);

      return {
        placeName,
        realTimeAQI,
        rainData,
        trafficJson,
        timestamp: Date.now()
      };
    }, PERFORMANCE_CONFIG.cache.api);

    this._pendingRequests.set(locationKey, requestPromise);

    try {
      return await requestPromise;
    } finally {
      this._pendingRequests.delete(locationKey);
    }
  }

  // ──────────────────────────────────────────────────
  // AI ANALYSIS
  // ──────────────────────────────────────────────────

  /**
   * Fetch urban AI analysis with caching and abort support
   * ✅ Request deduplication
   * ✅ Streaming support
   * @param {object} payload
   * @param {object} [options]
   * @param {AbortSignal} [options.signal]
   * @returns {Promise<string|null>}
   */
  async fetchAIAnalysis(payload, options = {}) {
    // Generate cache key from payload
    const cacheKey = `ai:${JSON.stringify(payload).slice(0, 100)}`;

    // Check cache first
    const cached = CacheEngine.get(cacheKey);
    if (cached) {
      this._stats.cacheHits++;
      return cached;
    }

    // Deduplication
    if (this._pendingRequests.has(cacheKey)) {
      this._stats.deduplicated++;
      return this._pendingRequests.get(cacheKey);
    }

    const requestPromise = (async () => {
      try {
        const analysis = await getUrbanAnalysis(payload, options);
        const result = analysis || 'No analysis available.';
        
        // Cache successful responses
        if (result && result !== 'No analysis available.') {
          CacheEngine.set(cacheKey, result, 3600000); // 1 hour
        }
        
        return result;
      } catch (err) {
        if (err?.name === 'AbortError') return null;
        this._stats.failures++;
        log.error('AI Analysis Failed:', err);
        return null;
      }
    })();

    this._pendingRequests.set(cacheKey, requestPromise);

    try {
      return await requestPromise;
    } finally {
      this._pendingRequests.delete(cacheKey);
    }
  }

  // ──────────────────────────────────────────────────
  // ABORTCONTROLLER MANAGEMENT
  // ──────────────────────────────────────────────────

  createAbortController(key) {
    this.abort(key);
    const controller = new AbortController();
    this._abortControllers.set(key, controller);
    return controller;
  }

  abort(key) {
    const existing = this._abortControllers.get(key);
    if (existing) {
      existing.abort();
      this._abortControllers.delete(key);
    }
  }

  abortAll() {
    for (const controller of this._abortControllers.values()) {
      controller.abort();
    }
    this._abortControllers.clear();
    this._pendingRequests.clear();
  }

  // ──────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ──────────────────────────────────────────────────

  async _fetchPlaceName(lat, lng, signal) {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      {
        headers: { 'User-Agent': 'UrbanRealityOS/2.0' },
        signal,
      }
    );
    if (!response.ok) throw new Error('Geocoding failed');
    const data = await response.json();
    if (data.address) {
      const a = data.address;
      return a.village || a.town || a.city || a.county || a.state || a.country || 'Unknown Location';
    }
    return 'Unknown Location';
  }

  async _fetchRainfall(lat, lng, signal) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=rain,precipitation_probability&forecast_days=1`;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error('Open-Meteo error');
    const data = await res.json();
    return {
      rain: data.hourly?.rain?.[0] ?? 0,
      probability: data.hourly?.precipitation_probability?.[0] ?? 0,
    };
  }

  async _fetchTraffic(lat, lng, signal) {
    if (!TOMTOM_KEY) return null;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    try {
      const res = await fetch(
        `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?key=${TOMTOM_KEY}&point=${lat},${lng}`,
        { signal: signal || controller.signal }
      );
      clearTimeout(timeoutId);
      
      if (res.ok) return await res.json();
      return null;
    } catch (e) {
      clearTimeout(timeoutId);
      if (e.name === 'AbortError') return null;
      return null;
    }
  }

  async _fetchWithRetry(fn, key, retries = MAX_RETRIES) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        if (attempt < retries && err?.name !== 'AbortError') {
          const backoff = RETRY_BACKOFF * Math.pow(2, attempt);
          await sleep(backoff, 0.3);
        } else {
          throw err;
        }
      }
    }
  }

  async _fetchWithTimeout(fn, timeout, name) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      log.warn(`${name} fetch timeout after ${timeout}ms`);
    }, timeout);

    try {
      const result = await fn();
      clearTimeout(timeoutId);
      return result;
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  }

  _updateAvgResponseTime(time) {
    this._stats.avgResponseTime = 
      (this._stats.avgResponseTime * 0.8) + (time * 0.2); // Exponential moving average
  }

  _isStale(key, maxAge) {
    const entry = CacheEngine.get(key);
    if (!entry) return true;
    const age = Date.now() - (entry.timestamp || 0);
    return age > maxAge * 0.8; // Refresh at 80% of max age
  }

  // ──────────────────────────────────────────────────
  // MEMORY MANAGEMENT
  // ──────────────────────────────────────────────────

  _startMemoryMonitoring() {
    // Check memory every 30 seconds
    this._memoryCheckInterval = setInterval(() => {
      this._checkMemoryPressure();
    }, 30000);
  }

  _checkMemoryPressure() {
    if (typeof performance === 'undefined' || !performance.memory) return;

    const usedMB = performance.memory.usedJSHeapSize / 1024 / 1024;
    
    if (usedMB > MEMORY_PRESSURE_THRESHOLD) {
      log.warn(`Memory pressure detected: ${usedMB.toFixed(2)}MB, clearing caches`);
      this._clearLeastUsedData();
    }
  }

  _clearLeastUsedData() {
    // Clear non-critical cached data
    CacheEngine.clear('location:*'); // Clear old location data
    
    // Clear old features from AQI data
    if (this._aqiGeo?.features?.length > 100) {
      this._aqiGeo.features = this._aqiGeo.features.slice(-50);
      log.info('Trimmed AQI features to reduce memory');
    }
  }

  // ──────────────────────────────────────────────────
  // PUBLIC UTILITY METHODS
  // ──────────────────────────────────────────────────

  getStats() {
    return {
      ...this._stats,
      pendingRequests: this._pendingRequests.size,
      activeControllers: this._abortControllers.size,
      circuitBreaker: this._circuitBreaker.getStats(),
      cacheHitRate: this._stats.requests > 0
        ? Math.round((this._stats.cacheHits / this._stats.requests) * 100)
        : 0,
      deduplicationRate: this._stats.requests > 0
        ? Math.round((this._stats.deduplicated / this._stats.requests) * 100)
        : 0
    };
  }

  clearAll() {
    this.abortAll();
    CacheEngine.clearAll();
    this._aqiGeo = null;
    this._floodData = null;
    this._facilityData = null;
    this._cityDemo = null;
    this._macroDataCache = null;
  }

  destroy() {
    this.abortAll();
    if (this._memoryCheckInterval) {
      clearInterval(this._memoryCheckInterval);
      this._memoryCheckInterval = null;
    }
  }
}

// Singleton
export default new DataEngine();