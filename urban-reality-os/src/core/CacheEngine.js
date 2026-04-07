// ================================================
// core/CacheEngine.js — resilient cache system
// ✅ Backward-compatible set/get/fetch API
// ✅ SWR + background refresh + retries/backoff
// ✅ Namespace-aware eviction + adaptive TTL
// ✅ Circuit breaker + optional persistence
// ================================================

const DEFAULT_MAX_SIZE = 1000;
const DEFAULT_TTL = 300_000;
const HISTORY_LIMIT = 300;

class CacheEngine {
  constructor(maxSize = DEFAULT_MAX_SIZE) {
    this._store = new Map();
    this._inflight = new Map();
    this._maxSize = maxSize;
    this._started = true;

    this._hits = 0;
    this._misses = 0;
    this._evictions = 0;
    this._refreshes = 0;
    this._circuitTrips = 0;

    this._namespaceMeta = new Map();
    this._history = new Array(HISTORY_LIMIT);
    this._historyIdx = 0;
    this._historySize = 0;

    this._persistentPrefix = 'urban-cache:';
    this._persistenceEnabled = true;
  }

  init() {
    this._started = true;
    return this;
  }

  start() {
    this._started = true;
  }

  stop() {
    this._started = false;
  }

  destroy() {
    this.stop();
    this.clearAll();
  }

  _pushHistory(item) {
    this._history[this._historyIdx] = item;
    this._historyIdx = (this._historyIdx + 1) % HISTORY_LIMIT;
    if (this._historySize < HISTORY_LIMIT) this._historySize++;
  }

  _namespaceOf(key) {
    const idx = key.indexOf(':');
    return idx > 0 ? key.slice(0, idx) : 'default';
  }

  _metaFor(namespace) {
    let meta = this._namespaceMeta.get(namespace);
    if (!meta) {
      meta = { usage: 0, failures: 0, openUntil: 0 };
      this._namespaceMeta.set(namespace, meta);
    }
    return meta;
  }

  /**
   * Get a cached value. Returns null if missing or expired.
   * @param {string} key
   * @returns {*|null}
   */
  get(key) {
    if (!this._started) return null;
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
    entry.lastAccess = Date.now();
    entry.hits++;
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
    if (!this._started) return value;
    const namespace = this._namespaceOf(key);
    const adaptiveTtl = this._getAdaptiveTtl(namespace, ttl);

    // Priority-aware eviction
    if (this._store.size >= this._maxSize) {
      this._evictEntries();
    }

    const now = Date.now();
    this._store.set(key, {
      value,
      expiry: now + adaptiveTtl,
      staleAt: now + Math.floor(adaptiveTtl * 0.7),
      createdAt: now,
      lastAccess: now,
      ttl: adaptiveTtl,
      hits: 0,
      namespace,
      priority: namespace === 'map' ? 2 : 1,
      persistent: this._persistenceEnabled,
    });

    if (this._persistenceEnabled) this._persistKey(key);
    this._pushHistory({ type: 'set', key, ts: now });
    return value;
  }

  _getAdaptiveTtl(namespace, ttl) {
    const meta = this._metaFor(namespace);
    if (meta.usage > 200) return Math.min(ttl * 2, 3_600_000);
    if (meta.usage > 60) return Math.min(Math.floor(ttl * 1.5), 1_800_000);
    return ttl;
  }

  _evictEntries() {
    const target = Math.max(1, Math.floor(this._maxSize * 0.12));
    const candidates = [];
    for (const [key, entry] of this._store.entries()) {
      const age = Date.now() - entry.lastAccess;
      const score = age - (entry.priority * 5_000) - (entry.hits * 50);
      candidates.push([key, score]);
    }
    candidates.sort((a, b) => b[1] - a[1]);
    for (let i = 0; i < target && i < candidates.length; i++) {
      this._store.delete(candidates[i][0]);
      this._evictions++;
    }
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
  clear(pattern) {
    if (typeof pattern === 'string' && pattern.endsWith('*')) {
      this.invalidatePrefix(pattern.slice(0, -1));
      return;
    }
    if (typeof pattern === 'string' && pattern.length > 0) {
      this.delete(pattern);
      return;
    }
    this.clearAll();
  }

  clearAll() {
    this._store.clear();
    this._inflight.clear();
    this._namespaceMeta.clear();
    if (this._persistenceEnabled) this._clearPersistent();
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
  async fetch(key, fetcher, ttlOrOptions = 300_000) {
    if (!this._started) return fetcher();
    const options = typeof ttlOrOptions === 'number'
      ? { ttl: ttlOrOptions }
      : (ttlOrOptions || {});
    const ttl = options.ttl ?? DEFAULT_TTL;
    const namespace = options.namespace || this._namespaceOf(key);
    const staleWhileRevalidate = options.staleWhileRevalidate !== false;
    const retries = Math.max(0, options.retries ?? 2);

    const meta = this._metaFor(namespace);
    meta.usage++;
    if (meta.openUntil && Date.now() < meta.openUntil) {
      const cachedFallback = this.get(key);
      if (cachedFallback !== null) return cachedFallback;
      throw new Error(`CacheEngine circuit open for namespace: ${namespace}`);
    }

    const existing = this._store.get(key);
    if (existing) {
      if (Date.now() <= existing.expiry) {
        this._hits++;
        if (staleWhileRevalidate && Date.now() > existing.staleAt) {
          this._refreshInBackground(key, fetcher, ttl, options);
        }
        return existing.value;
      }
      if (staleWhileRevalidate && Date.now() <= existing.expiry + ttl) {
        this._refreshInBackground(key, fetcher, ttl, options);
        return existing.value;
      }
    }

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
        const result = await this._fetchWithRetry(fetcher, retries, options.retryBaseMs ?? 150);
        this.set(key, result, ttl);
        meta.failures = 0;
        meta.openUntil = 0;
        this._pushHistory({ type: 'fetch', key, ts: Date.now(), namespace, status: 'ok' });
        return result;
      } catch (error) {
        meta.failures++;
        if (meta.failures >= 4) {
          meta.openUntil = Date.now() + 10_000;
          this._circuitTrips++;
        }
        this._pushHistory({ type: 'fetch', key, ts: Date.now(), namespace, status: 'error', message: error?.message });
        throw error;
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
      evictions: this._evictions,
      refreshes: this._refreshes,
      circuitTrips: this._circuitTrips,
      namespaces: this._namespaceMeta.size,
    };
  }

  /**
   * Reset statistics.
   */
  resetStats() {
    this._hits = 0;
    this._misses = 0;
    this._evictions = 0;
    this._refreshes = 0;
    this._circuitTrips = 0;
  }

  /**
   * Debug: return all live keys.
   * @returns {string[]}
   */
  keys() {
    return [...this._store.keys()].filter((k) => this.has(k));
  }

  getHistory(limit = 100) {
    const count = Math.min(limit, this._historySize);
    const out = new Array(count);
    for (let i = 0; i < count; i++) {
      const idx = (this._historyIdx - 1 - i + HISTORY_LIMIT) % HISTORY_LIMIT;
      out[count - 1 - i] = this._history[idx];
    }
    return out;
  }

  async _fetchWithRetry(fetcher, retries, baseMs) {
    let attempt = 0;
    let lastError = null;
    while (attempt <= retries) {
      try {
        return await fetcher();
      } catch (err) {
        lastError = err;
        if (attempt === retries) break;
        const waitMs = baseMs * Math.pow(2, attempt) + Math.floor(Math.random() * 40);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
      attempt++;
    }
    throw lastError;
  }

  _refreshInBackground(key, fetcher, ttl, options) {
    if (this._inflight.has(key)) return;
    this._refreshes++;
    const retries = Math.max(0, options.retries ?? 1);
    const p = this._fetchWithRetry(fetcher, retries, options.retryBaseMs ?? 150)
      .then((result) => this.set(key, result, ttl))
      .catch(() => null)
      .finally(() => this._inflight.delete(key));
    this._inflight.set(key, p);
  }

  _persistKey(key) {
    try {
      if (typeof localStorage === 'undefined') return;
      const entry = this._store.get(key);
      if (!entry) return;
      localStorage.setItem(`${this._persistentPrefix}${key}`, JSON.stringify(entry));
    } catch (_) {}
  }

  _clearPersistent() {
    try {
      if (typeof localStorage === 'undefined') return;
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(this._persistentPrefix)) keys.push(k);
      }
      for (let i = 0; i < keys.length; i++) {
        localStorage.removeItem(keys[i]);
      }
    } catch (_) {}
  }
}

// Singleton
export default new CacheEngine();
