import { useCallback, useRef, useEffect } from 'react';
import { aqiCache } from '../utils/cache';

/**
 * Optimized hook for AQI data fetching with caching
 * ✅ Uses AbortController for cancellable requests
 */
export function useAQIData(OPENWEATHER_KEY) {
    const abortRef = useRef(null);

    const fetchRealtimeAQI = useCallback(async (lat, lng) => {
        // Check cache first
        const cacheKey = `aqi_${lat}_${lng}`;
        const cached = aqiCache.get(cacheKey);
        if (cached) return cached;

        // Cancel previous in-flight request
        if (abortRef.current) {
            abortRef.current.abort();
        }
        abortRef.current = new AbortController();

        try {
            const res = await fetch(
                `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lng}&appid=${OPENWEATHER_KEY}`,
                { signal: abortRef.current.signal }
            );

            if (!res.ok) throw new Error('AQI fetch failed');

            const data = await res.json();
            const result = {
                aqi: Math.round(data.list?.[0]?.main?.aqi ?? 50),
                category: __getAQICategory(data.list?.[0]?.main?.aqi)
            };

            aqiCache.set(cacheKey, result, 3 * 60 * 1000);
            return result;
        } catch (err) {
            if (err.name === 'AbortError') return null;
            console.warn('AQI fetch failed:', err);
            return null;
        }
    }, [OPENWEATHER_KEY]);

    // Cleanup abort on unmount
    useEffect(() => {
        return () => {
            if (abortRef.current) abortRef.current.abort();
        };
    }, []);

    return { fetchRealtimeAQI };
}

function __getAQICategory(aqi) {
    const categories = { 1: 'Good', 2: 'Fair', 3: 'Moderate', 4: 'Poor', 5: 'Very Poor' };
    return categories[aqi] || 'Unknown';
}

/**
 * Optimized hook for debounced location updates.
 * ✅ Fixed: uses ref-based approach to prevent closure staleness
 */
export function useDebouncedLocation(callback, delay = 500) {
    const callbackRef = useRef(callback);
    const timerRef = useRef(null);

    // Keep ref current without recreating the debounced function
    callbackRef.current = callback;

    const debouncedFn = useCallback((...args) => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            callbackRef.current(...args);
            timerRef.current = null;
        }, delay);
    }, [delay]);

    // Cleanup timer on unmount
    useEffect(() => {
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    return debouncedFn;
}
