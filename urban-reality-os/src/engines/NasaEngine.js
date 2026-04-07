// ================================================
// NasaEngine — NASA EONET Data Engine
// Pure JS — no React dependency
//
// ✅ In-memory cache with TTL_5MIN freshness
// ✅ Request deduplication via _pendingRequests Map
// ✅ Exponential backoff with jitter (up to MAX_RETRIES)
// ✅ GeoJSON transformation from raw EONET events
// ✅ Impact radius circles per category
// ✅ Client-side category / status / proximity filtering
// ✅ Auto-refresh timer with live/stale status tracking
// ================================================
import { createLogger } from '../core/Logger';

const log = createLogger('NasaEngine');

export const EONET_BASE_URL = 'https://eonet.gsfc.nasa.gov/api/v3/events';
export const TTL_5MIN    = 300_000;
export const MAX_RETRIES = 3;
export const BASE_DELAY  = 800;
export const JITTER      = 0.3;

export const CATEGORY_COLORS = {
  wildfires:    '#ef4444',
  floods:       '#3b82f6',
  severeStorms: '#eab308',
  volcanoes:    '#f97316',
  drought:      '#92400e',
};

export const DEFAULT_COLOR = '#6b7280';

export const IMPACT_RADIUS_KM = {
  wildfires:    50,
  floods:       80,
  severeStorms: 120,
  volcanoes:    100,
  drought:      300,
};

export const CATEGORY_SEVERITY = {
  wildfires:    0.75,
  floods:       0.80,
  severeStorms: 0.70,
  volcanoes:    0.90,
  drought:      0.50,
};

export function createImpactCircle(lng, lat, radiusKm, steps = 32) {
  const coords = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    const dx = (radiusKm * Math.cos(angle)) / 111;
    const dy = (radiusKm * Math.sin(angle)) / (111 * Math.cos(lat * Math.PI / 180));
    coords.push([lng + dy, lat + dx]);
  }
  return { type: 'Polygon', coordinates: [coords] };
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = (b[1] - a[1]) * Math.PI / 180;
  const dLng = (b[0] - a[0]) * Math.PI / 180;
  const lat1 = a[1] * Math.PI / 180;
  const lat2 = b[1] * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

class NasaEngine {
  constructor() {
    this._cache           = new Map();
    this._pendingRequests = new Map();
    this._liveStatus      = 'stale';
  }

  _cacheKey(params) {
    return Object.keys(params).sort().map(k => `${k}=${params[k] ?? ''}`).join('&');
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async _fetchWithRetry(url) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(url);
        if (response.ok) return response;
        throw new Error(`HTTP ${response.status}`);
      } catch (err) {
        if (attempt === MAX_RETRIES) throw err;
        const delay = BASE_DELAY * Math.pow(2, attempt);
        await this._sleep(delay + delay * JITTER * Math.random());
      }
    }
  }

  _transformEvent(rawEvent) {
    if (!rawEvent.geometry || rawEvent.geometry.length === 0) {
      log.warn(`Skipping event ${rawEvent.id}: no geometry`);
      return null;
    }

    const geometryEntry = rawEvent.geometry[0];
    const geometryType  = geometryEntry.type;

    let coordinates;
    if (geometryType === 'Point') {
      coordinates = [geometryEntry.coordinates[0], geometryEntry.coordinates[1]];
    } else {
      coordinates = geometryEntry.coordinates;
    }

    const datedEntries = rawEvent.geometry.filter(g => g.date != null);
    datedEntries.sort((a, b) => new Date(b.date) - new Date(a.date));
    const date = datedEntries[0]?.date ?? rawEvent.closed ?? rawEvent.open ?? null;

    const category = rawEvent.categories?.[0]?.id ?? 'unknown';
    const status   = rawEvent.closed ? 'closed' : 'open';

    const daysActive = date
      ? Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / 86_400_000))
      : 0;

    const impactRadius = IMPACT_RADIUS_KM[category] ?? 50;
    const severity     = Math.min(1, (CATEGORY_SEVERITY[category] ?? 0.5) + daysActive * 0.01);
    const affectedPop  = Math.round(impactRadius ** 2 * Math.PI * 8 * severity);

    return {
      type: 'Feature',
      geometry: { type: geometryType, coordinates },
      properties: {
        id:           rawEvent.id,
        title:        rawEvent.title,
        category,
        status,
        date,
        sources:      rawEvent.sources ?? [],
        geometryType,
        impactRadius,
        severity:     Math.round(severity * 100) / 100,
        daysActive,
        affectedPop,
      },
    };
  }

  async fetchEvents(params = {}) {
    const { days, near, radius, ...apiParams } = params;
    const key = this._cacheKey(params);

    if (this._pendingRequests.has(key)) return this._pendingRequests.get(key);

    const cached = this._cache.get(key);
    if (cached && (Date.now() - cached.timestamp) < TTL_5MIN) return cached.data;

    const url = new URL(EONET_BASE_URL);
    if (apiParams.category) url.searchParams.set('category', apiParams.category);
    if (apiParams.status)   url.searchParams.set('status',   apiParams.status);
    if (apiParams.limit)    url.searchParams.set('limit',    String(apiParams.limit));
    if (days)               url.searchParams.set('days',     String(days));

    const promise = (async () => {
      try {
        const response = await this._fetchWithRetry(url.toString());
        const json     = await response.json();

        let features = (json.events ?? [])
          .map(e => this._transformEvent(e))
          .filter(Boolean);

        if (near && radius) {
          features = features.filter(f => {
            const coords = f.geometry.type === 'Point'
              ? f.geometry.coordinates
              : f.geometry.coordinates[0][0];
            return haversineKm(near, coords) <= radius;
          });
        }

        const fc = { type: 'FeatureCollection', features };
        this._cache.set(key, { data: fc, timestamp: Date.now(), params });
        return fc;
      } catch (err) {
        log.error('fetchEvents failed:', err);
        return this._cache.get(key)?.data ?? null;
      }
    })();

    this._pendingRequests.set(key, promise);
    try {
      return await promise;
    } finally {
      this._pendingRequests.delete(key);
    }
  }

  getEventsByCategory(category) {
    if (this._cache.size === 0) return null;
    const features = [];
    for (const entry of this._cache.values()) {
      for (const f of entry.data.features) {
        if (f.properties.category === category) features.push(f);
      }
    }
    return { type: 'FeatureCollection', features };
  }

  getActiveEvents() {
    if (this._cache.size === 0) return null;
    const features = [];
    for (const entry of this._cache.values()) {
      for (const f of entry.data.features) {
        if (f.properties.status === 'open') features.push(f);
      }
    }
    return { type: 'FeatureCollection', features };
  }

  clearCache() { this._cache.clear(); }

  startAutoRefresh(params, onRefresh) {
    const id = setInterval(async () => {
      try {
        this._cache.delete(this._cacheKey(params));
        const data = await this.fetchEvents(params);
        if (data) { onRefresh(data); this._liveStatus = 'live'; }
        else        this._liveStatus = 'stale';
      } catch { this._liveStatus = 'stale'; }
    }, TTL_5MIN);
    return id;
  }

  stopAutoRefresh(id) { clearInterval(id); }
}

export default new NasaEngine();
