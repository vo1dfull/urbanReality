// ================================================
// safeFetch — Resilient fetch wrapper
// ✅ Retry with exponential backoff
// ✅ Configurable timeout
// ✅ Circuit breaker for repeated failures
// ✅ Cache fallback on error
// ================================================
import { apiCache } from './cache';

/** @type {Map<string, {failures: number, lastFailure: number}>} */
const circuitBreakers = new Map();

/** @type {number} Failures before circuit opens */
const CIRCUIT_THRESHOLD = 5;

/** @type {number} ms before circuit resets */
const CIRCUIT_RESET_MS = 60_000;

/**
 * Fetch with retry, timeout, caching, and circuit breaker.
 * @param {Function} fn — async function that returns data or a Response
 * @param {*} fallback — returned on unrecoverable failure
 * @param {object} [options]
 * @param {string} [options.cacheKey] — cache key for storing result
 * @param {number} [options.cacheTTL=300000] — cache TTL in ms
 * @param {number} [options.retries=2] — number of retry attempts
 * @param {number} [options.timeout=8000] — timeout per attempt in ms
 * @param {number} [options.backoff=1000] — base backoff delay in ms
 * @param {string} [options.circuitId] — circuit breaker group ID
 * @returns {Promise<*>}
 */
export async function safeFetch(fn, fallback, options = {}) {
  // Support legacy positional API: safeFetch(fn, fallback, cacheKey, cacheTTL)
  if (typeof options === 'string') {
    options = { cacheKey: options, cacheTTL: arguments[3] };
  }

  const {
    cacheKey = null,
    cacheTTL = 5 * 60 * 1000,
    retries = 2,
    timeout = 8000,
    backoff = 1000,
    circuitId = null,
  } = options;

  // Check cache first
  if (cacheKey && apiCache.has(cacheKey)) {
    return apiCache.get(cacheKey);
  }

  // Check circuit breaker
  if (circuitId) {
    const circuit = circuitBreakers.get(circuitId);
    if (circuit && circuit.failures >= CIRCUIT_THRESHOLD) {
      if (Date.now() - circuit.lastFailure < CIRCUIT_RESET_MS) {
        // Circuit is open — return fallback immediately
        if (cacheKey && apiCache.has(cacheKey)) return apiCache.get(cacheKey);
        return fallback;
      }
      // Reset circuit after cooldown
      circuitBreakers.delete(circuitId);
    }
  }

  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await Promise.race([
        _executeFetch(fn),
        _timeoutPromise(timeout),
      ]);

      // Cache the result
      if (cacheKey && result !== fallback) {
        apiCache.set(cacheKey, result, cacheTTL);
      }

      // Clear circuit on success
      if (circuitId) circuitBreakers.delete(circuitId);

      return result ?? fallback;
    } catch (err) {
      lastError = err;
      if (err.name === 'AbortError') break; // Don't retry aborted requests

      // Exponential backoff before retry
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, backoff * Math.pow(2, attempt)));
      }
    }
  }

  // All attempts failed
  if (circuitId) {
    const circuit = circuitBreakers.get(circuitId) || { failures: 0, lastFailure: 0 };
    circuit.failures++;
    circuit.lastFailure = Date.now();
    circuitBreakers.set(circuitId, circuit);
  }

  console.warn('[safeFetch] All attempts failed:', lastError?.message || lastError);

  // Return cached fallback if available
  if (cacheKey && apiCache.has(cacheKey)) {
    return apiCache.get(cacheKey);
  }

  return fallback;
}

/**
 * Execute the fetcher, handling both Response and raw values.
 * @private
 */
async function _executeFetch(fn) {
  const res = await fn();

  // Check if it looks like a Response object
  const looksLikeResponse = res && typeof res === 'object' && typeof res.ok === 'boolean' && typeof res.status === 'number';
  if (looksLikeResponse) {
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    return await res.json();
  }

  return res;
}

/**
 * Create a timeout promise.
 * @private
 */
function _timeoutPromise(ms) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Request timed out after ${ms}ms`)), ms);
  });
}

export default safeFetch;
