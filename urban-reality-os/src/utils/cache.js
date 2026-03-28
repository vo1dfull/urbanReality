/**
 * Simple in-memory cache with TTL (Time To Live)
 * Reduces API calls and improves performance
 */
class MemoryCache {
    constructor(defaultTTL = 5 * 60 * 1000) { // 5 minutes default
        this.cache = new Map();
        this.timers = new Map();
        this.defaultTTL = defaultTTL;
    }

    set(key, value, ttl = this.defaultTTL) {
        // Clear existing timer
        if (this.timers.has(key)) {
            clearTimeout(this.timers.get(key));
        }

        // Set value
        this.cache.set(key, value);

        // Set expiration timer
        if (ttl > 0) {
            const timer = setTimeout(() => {
                this.cache.delete(key);
                this.timers.delete(key);
            }, ttl);
            this.timers.set(key, timer);
        }
    }

    get(key) {
        return this.cache.get(key) || null;
    }

    has(key) {
        return this.cache.has(key);
    }

    delete(key) {
        if (this.timers.has(key)) {
            clearTimeout(this.timers.get(key));
            this.timers.delete(key);
        }
        this.cache.delete(key);
    }

    clear() {
        this.timers.forEach(timer => clearTimeout(timer));
        this.cache.clear();
        this.timers.clear();
    }

    size() {
        return this.cache.size;
    }
}

// Singleton cache instances for different data types
export const apiCache = new MemoryCache(5 * 60 * 1000); // 5 min for API data
export const geoCache = new MemoryCache(10 * 60 * 1000); // 10 min for geo data
export const aqiCache = new MemoryCache(3 * 60 * 1000); // 3 min for AQI (updates frequently)

/**
 * Memoize function calls with arguments
 */
export function memoize(fn, ttl = 60000) {
    const cache = new Map();
    const timers = new Map();

    return function(...args) {
        const key = JSON.stringify(args);

        if (cache.has(key)) {
            return cache.get(key);
        }

        const result = fn.apply(this, args);

        cache.set(key, result);
        if (timers.has(key)) clearTimeout(timers.get(key));
        const timer = setTimeout(() => {
            cache.delete(key);
            timers.delete(key);
        }, ttl);
        timers.set(key, timer);

        return result;
    };
}

/**
 * Debounce function for reducing rapid calls
 */
export function debounce(fn, delay = 300) {
    let timeoutId = null;

    return function(...args) {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            fn.apply(this, args);
            timeoutId = null;
        }, delay);
    };
}

/**
 * Throttle function for limiting call frequency
 */
export function throttle(fn, limit = 500) {
    let inThrottle;

    return function(...args) {
        if (!inThrottle) {
            fn.apply(this, args);
            inThrottle = true;
            setTimeout(() => (inThrottle = false), limit);
        }
    };
}
