// ================================================
// DataEngine — All API calls, caching, AbortController
// Pure JS — no React dependency
// ✅ CacheEngine wraps all expensive API calls
// ================================================
import { fetchRealtimeAQI } from '../utils/aqi';
import { fetchIndiaMacroData } from '../utils/worldBank';
import { getUrbanAnalysis } from '../utils/gemini';
import { MAJOR_INDIAN_CITIES, OPENWEATHER_KEY, TOMTOM_KEY } from '../constants/mapConstants';
import CacheEngine from '../core/CacheEngine';

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
      console.warn('[DataEngine] OpenWeather API key not available');
      return null;
    }

    // ✅ Cache AQI city data for 5 minutes
    return CacheEngine.fetch('aqi:cities:all', async () => {
      const CHUNK_SIZE = 10;
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
              console.warn(`[DataEngine] AQI fetch failed for ${city.name}:`, err);
              return null;
            }
          })
        );
        features.push(...results.filter(Boolean));
      }

      return { type: 'FeatureCollection', features };
    }, 5 * 60_000); // 5 min TTL
  }

  // ── Static Data ──

  /**
   * Fetch flood.json, demographics.json, facilities.json in parallel.
   */
  async fetchStaticData() {
    // ✅ Cache static JSON files — they never change at runtime
    return CacheEngine.fetch('static:all', async () => {
      const results = { floodData: null, cityDemo: null, facilityData: null };
      const [floodRes, demoRes, facilityRes] = await Promise.allSettled([
        fetch('/data/flood.json'),
        fetch('/data/demographics.json'),
        fetch('/data/facilities.json'),
      ]);
      if (floodRes.status === 'fulfilled' && floodRes.value.ok) {
        try { results.floodData = await floodRes.value.json(); } catch (e) { /* skip */ }
      }
      if (demoRes.status === 'fulfilled' && demoRes.value.ok) {
        try { results.cityDemo = await demoRes.value.json(); } catch (e) { /* skip */ }
      }
      if (facilityRes.status === 'fulfilled' && facilityRes.value.ok) {
        try { results.facilityData = await facilityRes.value.json(); } catch (e) { /* skip */ }
      }
      return results;
    }, 60 * 60_000); // 1 hour TTL — static data
  }

  // ── World Bank ──

  /**
   * Fetch India macro data with caching.
   */
  async fetchWorldBankData() {
    if (this._macroDataCache) return this._macroDataCache;
    try {
      const data = await fetchIndiaMacroData();
      this._macroDataCache = data;
      return data;
    } catch (e) {
      console.warn('[DataEngine] World Bank data failed:', e);
      return null;
    }
  }

  /**
   * Get cached macro data without re-fetching.
   */
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

    // ✅ Cache location data for 3 minutes — coords rounded to ~11m precision
    return CacheEngine.fetch(locationKey, async () => {
      const [placeName, realTimeAQI, rainData, trafficJson] = await Promise.all([
      // Place Name
      this._fetchPlaceName(lat, lng).catch((err) => {
        console.warn('[DataEngine] Geocoding failed:', err);
        return 'Unknown Location';
      }),

      // AQI
      (async () => {
        try {
          return await fetchRealtimeAQI(lat, lng, OPENWEATHER_KEY, signal);
        } catch (e) {
          if (e.name === 'AbortError') return null;
          console.warn('[DataEngine] AQI fetch failed:', e);
          return null;
        }
      })(),

      // Rainfall
      (async () => {
        try {
          return await Promise.race([
            this._fetchRainfall(lat, lng, signal),
            new Promise((_, r) => setTimeout(() => r(new Error('Rain Timeout')), 4000)),
          ]);
        } catch (e) {
          if (e.name === 'AbortError') return { rain: 0, probability: 0 };
          console.warn('[DataEngine] Rain fetch failed:', e);
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
    }, 3 * 60_000); // 3 min TTL
  }

  // ── AI Analysis ──

  /**
   * Fetch urban AI analysis.
   * @param {object} payload
   * @returns {Promise<string|null>}
   */
  async fetchAIAnalysis(payload) {
    try {
      const analysis = await getUrbanAnalysis(payload);
      return analysis || 'No analysis available.';
    } catch (err) {
      console.error('[DataEngine] AI Analysis Failed:', err);
      return null;
    }
  }

  // ── AbortController Management ──

  /**
   * Create a new AbortController for a named operation, cancelling any previous one.
   * @param {string} key
   * @returns {AbortController}
   */
  createAbortController(key) {
    this.abort(key);
    const controller = new AbortController();
    this._abortControllers.set(key, controller);
    return controller;
  }

  /**
   * Abort a named operation.
   * @param {string} key
   */
  abort(key) {
    const existing = this._abortControllers.get(key);
    if (existing) {
      existing.abort();
      this._abortControllers.delete(key);
    }
  }

  /**
   * Abort all operations.
   */
  abortAll() {
    for (const controller of this._abortControllers.values()) {
      controller.abort();
    }
    this._abortControllers.clear();
  }

  // ── Private Helpers ──

  async _fetchPlaceName(lat, lng) {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      { headers: { 'User-Agent': 'UrbanRealityOS/1.0' } }
    );
    if (!response.ok) throw new Error('Geocoding failed');
    const data = await response.json();
    if (data.address) {
      const a = data.address;
      return a.village || a.town || a.city || a.county || a.state || a.country || 'Unknown Location';
    }
    return 'Unknown Location';
  }

  async _fetchRainfall(lat, lng) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=rain,precipitation_probability&forecast_days=1`;
    const res = await fetch(url);
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
