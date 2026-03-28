import { apiCache } from './cache';

export async function safeFetch(fn, fallback, cacheKey = null, cacheTTL = 5 * 60 * 1000) {
  try {
    // Check cache first if cacheKey provided
    if (cacheKey && apiCache.has(cacheKey)) {
      return apiCache.get(cacheKey);
    }

    const res = await fn();
    const result = res ?? fallback;

    // Cache the result if cacheKey provided
    if (cacheKey && result !== fallback) {
      apiCache.set(cacheKey, result, cacheTTL);
    }

    return result;
  } catch (err) {
    console.warn('SafeFetch error:', err);
    // Try to return cached fallback if available
    if (cacheKey && apiCache.has(cacheKey)) {
      return apiCache.get(cacheKey);
    }
    return fallback;
  }
}

export default safeFetch;

