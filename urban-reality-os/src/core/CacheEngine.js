// ================================================
// core/CacheEngine.js — System-level API cache
// ✅ TTL-based expiry
// ✅ Wraps any async fn with cache-or-fetch logic
// ✅ Deduplicates in-flight requests (no dog-pile)
// ================================================

class CacheEngine {
  constructor() {
    this._store = new Map();         // key → { value, expiry }
    this._inflight = new Map();      // key → Promise (dedup)
  }

  /**
   * Get a cached value. Returns null if missing or expired.
   */
  get(key) {
    const entry = this._store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
      this._store.delete(key);
      return null;
    }
    return entry.value;
  }

  /**
   * Set a cache entry with TTL in ms (default 5 min).
   */
  set(key, value, ttl = 300_000) {
    this._store.set(key, { value, expiry: Date.now() + ttl });
    return value;
  }

  /**
   * Check existence without returning value.
   */
  has(key) {
    return this.get(key) !== null;
  }

  /**
   * Delete a key immediately.
   */
  delete(key) {
    this._store.delete(key);
    this._inflight.delete(key);
  }

  /**
   * Clear all cache entries.
   */
  clear() {
    this._store.clear();
    this._inflight.clear();
  }

  /**
   * Wrap an async fetcher with cache-or-fetch logic + in-flight dedup.
   *
   * Usage:
   *   const data = await CacheEngine.fetch('aqi:delhi', () => fetchAQI(), 60_000);
   *
   * @param {string} key
   * @param {Function} fetcher - async function returning fresh data
   * @param {number} ttl - cache lifetime in ms
   */
  async fetch(key, fetcher, ttl = 300_000) {
    // 1. Cache hit
    const cached = this.get(key);
    if (cached !== null) return cached;

    // 2. In-flight dedup: if same key is already fetching, wait on it
    if (this._inflight.has(key)) {
      return this._inflight.get(key);
    }

    // 3. Fresh fetch
    const promise = (async () => {
      try {
        const result = await fetcher();
        this.set(key, result, ttl);
        return result;
      } finally {
        this._inflight.delete(key);
      }
    })();

    this._inflight.set(key, promise);
    return promise;
  }

  /**
   * Invalidate all keys matching a prefix.
   */
  invalidatePrefix(prefix) {
    for (const key of this._store.keys()) {
      if (key.startsWith(prefix)) this._store.delete(key);
    }
    for (const key of this._inflight.keys()) {
      if (key.startsWith(prefix)) this._inflight.delete(key);
    }
  }

  /**
   * Debug: return all live keys.
   */
  keys() {
    return [...this._store.keys()].filter((k) => this.has(k));
  }
}

// Singleton
export default new CacheEngine();
