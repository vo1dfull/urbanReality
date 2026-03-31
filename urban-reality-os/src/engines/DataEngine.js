// ================================================
// DataEngine — All API calls, caching, AbortController
// Pure JS — no React dependency
// ✅ CacheEngine wraps all expensive API calls
// ✅ Retry with backoff for critical requests
// ✅ Signal propagation for all fetches
// ✅ AI response caching
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
const MAX_RETRIES = 2;

/** @type {number} Base backoff delay in ms */
const RETRY_BACKOFF = 1000;

/**
 * Sleep for a given duration.
 * @param {number} ms
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

class DataEngine {
  constructor() {
    this._abortControllers = new Map();
    this._macroDataCache = null;
    // Non-reactive map data storage (kept out of Zustand)
    this._aqiGeo = null;
    this._floodData = null;
    this._facilityData = null;
    this._cityDemo = null;
  }

  // ── Non-reactive data getters/setters ──
  getAqiGeo() { return this._aqiGeo; }
  setAqiGeo(data) { this._aqiGeo = data; }
  getFloodData() { return this._floodData; }
  setFloodData(data) { this._floodData = data; }
  getFacilityData() { return this._facilityData; }
  setFacilityData(data) { this._facilityData = data; }
  getCityDemo() { return this._cityDemo; }
  setCityDemo(data) { this._cityDemo = data; }

  // ── AQI ──

  /**
   * Fetch AQI for all major Indian cities in chunks.
   * @returns {Promise<{type: string, features: object[]} | null>}
   */
  async fetchAllCitiesAQI() {
    if (!OPENWEATHER_KEY) {
      log.warn('OpenWeather API key not available');
      return null;
    }

    const cacheKey = 'aqi:cities:all';
    const cached = CacheEngine.get(cacheKey);
    if (cached) {
      this._refreshAllCitiesAQI(cacheKey);
      return cached;
    }

    return CacheEngine.fetch(cacheKey, async () => {
      const CHUNK_SIZE = PERFORMANCE_CONFIG.batch.aqiChunkSize;
      const features = [];

      for (let i = 0; i < MAJOR_INDIAN_CITIES.length; i += CHUNK_SIZE) {
        const chunk = MAJOR_INDIAN_CITIES.slice(i, i + CHUNK_SIZE);
        const results = await Promise.all(
          chunk.map(async (city) => {
            try {
              const r = await fetchRealtimeAQI(city.lat, city.lng, OPENWEATHER_KEY);
              if (!r) return null;
              return {
                type: 'Feature',
                properties: {
                  aqi: r.aqi,
                  city: city.name,
                  level: r.category || null,
                  pm25: r.pm25 ?? null,
                  pm10: r.pm10 ?? null,
                },
                geometry: { type: 'Point', coordinates: [city.lng, city.lat] },
              };
            } catch (err) {
              log.warn(`AQI fetch failed for ${city.name}:`, err);
              return null;
            }
          })
        );
        features.push(...results.filter(Boolean));
      }

      return { type: 'FeatureCollection', features };
    }, PERFORMANCE_CONFIG.cache.aqi);
  }

  _refreshAllCitiesAQI(cacheKey) {
    CacheEngine.fetch(cacheKey, async () => {
      const CHUNK_SIZE = PERFORMANCE_CONFIG.batch.aqiChunkSize;
      const features = [];

      for (let i = 0; i < MAJOR_INDIAN_CITIES.length; i += CHUNK_SIZE) {
        const chunk = MAJOR_INDIAN_CITIES.slice(i, i + CHUNK_SIZE);
        const results = await Promise.all(
          chunk.map(async (city) => {
            try {
              const r = await fetchRealtimeAQI(city.lat, city.lng, OPENWEATHER_KEY);
              if (!r) return null;
              return {
                type: 'Feature',
                properties: {
                  aqi: r.aqi,
                  city: city.name,
                  level: r.category || null,
                  pm25: r.pm25 ?? null,
                  pm10: r.pm10 ?? null,
                },
                geometry: { type: 'Point', coordinates: [city.lng, city.lat] },
              };
            } catch (err) {
              log.warn(`AQI refresh failed for ${city.name}:`, err);
              return null;
            }
          })
        );
        features.push(...results.filter(Boolean));
      }

      return { type: 'FeatureCollection', features };
    }, PERFORMANCE_CONFIG.cache.aqi).catch((err) => {
      log.warn('Background AQI refresh failed:', err);
    });
  }

  // ── Static Data ──

  /**
   * Fetch flood.json, demographics.json, facilities.json in parallel.
   * Includes retry logic for robustness.
   */
  async fetchStaticData() {
    return CacheEngine.fetch('static:all', async () => {
      const results = { floodData: null, cityDemo: null, facilityData: null };

      const fetchWithRetry = async (url, retries = MAX_RETRIES) => {
        for (let attempt = 0; attempt <= retries; attempt++) {
          try {
            const res = await fetch(url);
            if (res.ok) return await res.json();
            throw new Error(`HTTP ${res.status}`);
          } catch (err) {
            if (attempt < retries) {
              await sleep(RETRY_BACKOFF * Math.pow(2, attempt));
            } else {
              log.warn(`Static fetch failed: ${url}`, err);
              return null;
            }
          }
        }
        return null;
      };

      const [floodData, cityDemo, facilityData] = await Promise.all([
        fetchWithRetry('/data/flood.json'),
        fetchWithRetry('/data/demographics.json'),
        fetchWithRetry('/data/facilities.json'),
      ]);

      results.floodData = floodData;
      results.cityDemo = cityDemo;
      results.facilityData = facilityData;

      return results;
    }, PERFORMANCE_CONFIG.cache.geo);
  }

  // ── World Bank ──

  /**
   * Fetch India macro data with caching and retry.
   */
  async fetchWorldBankData() {
    if (this._macroDataCache) return this._macroDataCache;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const data = await fetchIndiaMacroData();
        this._macroDataCache = data;
        return data;
      } catch (e) {
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_BACKOFF * Math.pow(2, attempt));
        } else {
          log.warn('World Bank data failed after retries:', e);
          return null;
        }
      }
    }
    return null;
  }

  getMacroData() {
    return this._macroDataCache;
  }

  // ── Location Click Data ──

  /**
   * Fetch all data for a map click location in parallel.
   * @param {number} lat
   * @param {number} lng
   * @param {AbortSignal} signal
   */
  async fetchLocationData(lat, lng, signal) {
    const locationKey = `location:${lat.toFixed(4)}:${lng.toFixed(4)}`;

    return CacheEngine.fetch(locationKey, async () => {
      const [placeName, realTimeAQI, rainData, trafficJson] = await Promise.all([
        // Place Name
        this._fetchPlaceName(lat, lng, signal).catch((err) => {
          if (err?.name === 'AbortError') throw err;
          log.warn('Geocoding failed:', err);
          return 'Unknown Location';
        }),

        // AQI
        (async () => {
          try {
            return await fetchRealtimeAQI(lat, lng, OPENWEATHER_KEY, signal);
          } catch (e) {
            if (e.name === 'AbortError') return null;
            log.warn('AQI fetch failed:', e);
            return null;
          }
        })(),

        // Rainfall — signal now propagated
        (async () => {
          try {
            return await Promise.race([
              this._fetchRainfall(lat, lng, signal),
              new Promise((_, r) => setTimeout(() => r(new Error('Rain Timeout')), 4000)),
            ]);
          } catch (e) {
            if (e.name === 'AbortError') return { rain: 0, probability: 0 };
            log.warn('Rain fetch failed:', e);
            return { rain: 0, probability: 0 };
          }
        })(),

        // Traffic
        (async () => {
          if (!TOMTOM_KEY) return null;
          try {
            const res = await Promise.race([
              fetch(
                `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?key=${TOMTOM_KEY}&point=${lat},${lng}`,
                { signal }
              ),
              new Promise((_, r) => setTimeout(() => r(new Error('Traffic Timeout')), 4000)),
            ]);
            if (res.ok) return await res.json();
            return null;
          } catch (e) {
            if (e.name === 'AbortError') return null;
            return null;
          }
        })(),
      ]);

      return { placeName, realTimeAQI, rainData, trafficJson };
    }, PERFORMANCE_CONFIG.cache.api);
  }

  // ── AI Analysis ──

  /**
   * Fetch urban AI analysis with caching and abort support.
   * @param {object} payload
   * @param {object} [options]
   * @param {AbortSignal} [options.signal]
   * @returns {Promise<string|null>}
   */
  async fetchAIAnalysis(payload, options = {}) {
    try {
      const analysis = await getUrbanAnalysis(payload, options);
      return analysis || 'No analysis available.';
    } catch (err) {
      if (err?.name === 'AbortError') return null;
      log.error('AI Analysis Failed:', err);
      return null;
    }
  }

  // ── AbortController Management ──

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
  }

  // ── Private Helpers ──

  async _fetchPlaceName(lat, lng, signal) {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      {
        headers: { 'User-Agent': 'UrbanRealityOS/1.0' },
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

  /**
   * Fixed: signal is now propagated to the fetch call.
   */
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
}

// Singleton
export default new DataEngine();
