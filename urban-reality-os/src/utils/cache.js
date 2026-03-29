/**
 * Utility functions: cache, debounce, throttle
 * ✅ MemoryCache with TTL
 * ✅ Trailing-edge throttle option
 * ✅ RAF-based throttle for render-sensitive paths
 */

class MemoryCache {
    constructor(defaultTTL = 5 * 60 * 1000) {
        this.cache = new Map();
        this.timers = new Map();
        this.defaultTTL = defaultTTL;
    }

    set(key, value, ttl = this.defaultTTL) {
        if (this.timers.has(key)) {
            clearTimeout(this.timers.get(key));
        }
        this.cache.set(key, value);
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
export const apiCache = new MemoryCache(5 * 60 * 1000);
export const geoCache = new MemoryCache(10 * 60 * 1000);
export const aqiCache = new MemoryCache(3 * 60 * 1000);

/**
 * Memoize function calls with arguments.
 * @param {Function} fn
 * @param {number} ttl
 * @returns {Function}
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
 * Debounce function for reducing rapid calls.
 * @param {Function} fn
 * @param {number} delay
 * @returns {Function & {cancel: Function}}
 */
export function debounce(fn, delay = 300) {
    let timeoutId = null;

    const debounced = function(...args) {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            fn.apply(this, args);
            timeoutId = null;
        }, delay);
    };

    debounced.cancel = () => {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
    };

    return debounced;
}

/**
 * Throttle function with optional trailing-edge execution.
 * @param {Function} fn
 * @param {number} limit — ms between executions
 * @param {{trailing?: boolean}} options
 * @returns {Function & {cancel: Function}}
 */
export function throttle(fn, limit = 500, options = {}) {
    const { trailing = false } = options;
    let lastRunTime = 0;
    let trailingTimeoutId = null;
    let lastArgs = null;
    let lastThis = null;

    const throttled = function(...args) {
        const now = Date.now();
        const remaining = limit - (now - lastRunTime);

        lastArgs = args;
        lastThis = this;

        if (remaining <= 0) {
            // Enough time has passed — execute immediately
            if (trailingTimeoutId) {
                clearTimeout(trailingTimeoutId);
                trailingTimeoutId = null;
            }
            lastRunTime = now;
            fn.apply(this, args);
        } else if (trailing && !trailingTimeoutId) {
            // Schedule trailing call
            trailingTimeoutId = setTimeout(() => {
                lastRunTime = Date.now();
                trailingTimeoutId = null;
                fn.apply(lastThis, lastArgs);
            }, remaining);
        }
    };

    throttled.cancel = () => {
        if (trailingTimeoutId) {
            clearTimeout(trailingTimeoutId);
            trailingTimeoutId = null;
        }
        lastArgs = null;
        lastThis = null;
    };

    return throttled;
}

/**
 * RAF-based throttle — ensures the callback runs at most once per animation frame.
 * Ideal for render-sensitive operations (canvas draw, DOM updates).
 * @param {Function} fn
 * @returns {Function & {cancel: Function}}
 */
export function throttleRAF(fn) {
    let rafId = null;
    let lastArgs = null;
    let lastThis = null;

    const throttled = function(...args) {
        lastArgs = args;
        lastThis = this;
        if (rafId === null) {
            rafId = requestAnimationFrame(() => {
                rafId = null;
                fn.apply(lastThis, lastArgs);
            });
        }
    };

    throttled.cancel = () => {
        if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
    };

    return throttled;
}
