import { useCallback, useRef, useEffect, useState } from 'react';
import { aqiCache, debounce } from '../utils/cache';

/**
 * Optimized hook for AQI data fetching with caching
 * ✅ Now uses AbortController for cancellable requests
 */
export function useAQIData(OPENWEATHER_KEY) {
    const cacheRef = useRef(new Map());
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
                `https://api.openweathermap.org/api/pollution/v1/co/?lon=${lng}&lat=${lat}&appid=${OPENWEATHER_KEY}`,
                { signal: abortRef.current.signal }
            );

            if (!res.ok) throw new Error('AQI fetch failed');

            const data = await res.json();
            const result = {
                aqi: Math.round(data.list?.[0]?.main?.aqi ?? 50),
                category: __getAQICategory(data.list?.[0]?.main?.aqi)
            };

            aqiCache.set(cacheKey, result, 3 * 60 * 1000); // 3 min cache
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
 * Optimized hook for debounced location updates
 */
export function useDebouncedLocation(callback, delay = 500) {
    const debouncedCallback = useCallback(
        debounce(callback, delay),
        [callback, delay]
    );

    return debouncedCallback;
}

/**
 * Optimized hook for layer state management
 */
export function useLayerState(initialLayers = {}) {
    const [layers, setLayers] = useState(initialLayers);
    const layersCacheRef = useRef(initialLayers);

    const updateLayer = useCallback((key, value) => {
        setLayers(prev => {
            const updated = { ...prev, [key]: value };
            layersCacheRef.current = updated;
            return updated;
        });
    }, []);

    const updateMultipleLayers = useCallback((updates) => {
        setLayers(prev => {
            const updated = { ...prev, ...updates };
            layersCacheRef.current = updated;
            return updated;
        });
    }, []);

    return { layers, updateLayer, updateMultipleLayers };
}
