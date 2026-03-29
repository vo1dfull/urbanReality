// ================================================
// core/CacheEngine.js — System-level API cache
// ✅ TTL-based expiry
// ✅ Wraps any async fn with cache-or-fetch logic
// ✅ Deduplicates in-flight requests (no dog-pile)
// ✅ LRU eviction when maxSize exceeded
// ✅ Hit/miss stats for debug panel
// ================================================

/** @type {number} Default maximum cache entries */
const DEFAULT_MAX_SIZE = 500;

class CacheEngine {
  constructor(maxSize = DEFAULT_MAX_SIZE) {
    this._store = new Map();         // key → { value, expiry }
    this._inflight = new Map();      // key → Promise (dedup)
    this._maxSize = maxSize;

    // Stats
    this._hits = 0;
    this._misses = 0;
  }

  /**
   * Get a cached value. Returns null if missing or expired.
   * @param {string} key
   * @returns {*|null}
   */
  get(key) {
    const entry = this._store.get(key);
    if (!entry) {
      this._misses++;
      return null;
    }
    if (Date.now() > entry.expiry) {
      this._store.delete(key);
      this._misses++;
      return null;
    }
    this._hits++;
    // LRU: move to end (most recently used)
    this._store.delete(key);
    this._store.set(key, entry);
    return entry.value;
  }

  /**
   * Set a cache entry with TTL in ms (default 5 min).
   * @param {string} key
   * @param {*} value
   * @param {number} ttl
   * @returns {*} the value
   */
  set(key, value, ttl = 300_000) {
    // LRU eviction: remove oldest entries if over maxSize
    if (this._store.size >= this._maxSize) {
      const keysToDelete = [];
      let count = 0;
      const evictCount = Math.max(1, Math.floor(this._maxSize * 0.1)); // Evict 10%
      for (const k of this._store.keys()) {
        keysToDelete.push(k);
        count++;
        if (count >= evictCount) break;
      }
      for (const k of keysToDelete) {
        this._store.delete(k);
      }
    }

    this._store.set(key, { value, expiry: Date.now() + ttl });
    return value;
  }

  /**
   * Check existence without returning value.
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    return this.get(key) !== null;
  }

  /**
   * Delete a key immediately.
   * @param {string} key
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
   * @returns {Promise<*>}
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
   * Get or create: synchronous version of fetch for computed values.
   * @param {string} key
   * @param {Function} factory - synchronous factory function
   * @param {number} ttl
   * @returns {*}
   */
  getOrCreate(key, factory, ttl = 300_000) {
    const cached = this.get(key);
    if (cached !== null) return cached;
    const value = factory();
    this.set(key, value, ttl);
    return value;
  }

  /**
   * Invalidate all keys matching a prefix.
   * @param {string} prefix
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
   * Get cache statistics for debug panel.
   * @returns {{size: number, maxSize: number, hits: number, misses: number, hitRate: string, inflightCount: number}}
   */
  getStats() {
    const total = this._hits + this._misses;
    return {
      size: this._store.size,
      maxSize: this._maxSize,
      hits: this._hits,
      misses: this._misses,
      hitRate: total > 0 ? ((this._hits / total) * 100).toFixed(1) + '%' : '0%',
      inflightCount: this._inflight.size,
    };
  }

  /**
   * Reset statistics.
   */
  resetStats() {
    this._hits = 0;
    this._misses = 0;
  }

  /**
   * Debug: return all live keys.
   * @returns {string[]}
   */
  keys() {
    return [...this._store.keys()].filter((k) => this.has(k));
  }
}

// Singleton
export default new CacheEngine();
