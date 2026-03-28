/**
 * Performance monitoring and optimization utilities
 */

class PerformanceMonitor {
    constructor() {
        this.marks = new Map();
        this.measures = new Map();
    }

    mark(name) {
        performance.mark(name);
        this.marks.set(name, performance.now());
    }

    measure(name, startMark, endMark) {
        try {
            performance.measure(name, startMark, endMark);
            const duration = performance.now() - this.marks.get(startMark);
            this.measures.set(name, duration);
            
            if (duration > 100) {
                console.warn(`⚠️ Slow operation: ${name} took ${duration.toFixed(2)}ms`);
            }
            
            return duration;
        } catch (err) {
            console.warn('Performance measure failed:', err);
            return 0;
        }
    }

    getMetrics() {
        return Object.fromEntries(this.measures);
    }

    clear() {
        this.marks.clear();
        this.measures.clear();
    }
}

export const performanceMonitor = new PerformanceMonitor();

/**
 * Track React component render performance
 */
export function trackComponentRender(componentName) {
    const startTime = performance.now();
    
    return () => {
        const duration = performance.now() - startTime;
        if (duration > 16.67) { // More than one frame (60fps = 16.67ms)
            console.warn(`⚠️ Slow render: ${componentName} took ${duration.toFixed(2)}ms`);
        }
    };
}

/**
 * Idle callback for non-critical updates
 */
export function scheduleIdleCallback(callback, timeout = 10000) {
    if ('requestIdleCallback' in window) {
        return requestIdleCallback(callback, { timeout });
    } else {
        // Fallback to setTimeout
        return setTimeout(callback, 0);
    }
}

/**
 * Check if component is visible in viewport
 */
export function isComponentVisible(ref) {
    if (!ref?.current) return false;
    
    const observer = new IntersectionObserver(([entry]) => {
        return entry.isIntersecting;
    });
    
    observer.observe(ref.current);
    return observer;
}

/**
 * Resource hints for better loading
 */
export function addResourceHints() {
    const links = [
        { rel: 'dns-prefetch', href: '//api.mapbox.com' },
        { rel: 'dns-prefetch', href: '//api.tomtom.com' },
        { rel: 'dns-prefetch', href: '//api.maptiler.com' },
        { rel: 'dns-prefetch', href: '//api.openweathermap.org' },
        { rel: 'preconnect', href: 'https://api.maptiler.com' },
        { rel: 'preconnect', href: 'https://api.tomtom.com' }
    ];

    links.forEach(({ rel, href }) => {
        const link = document.createElement('link');
        link.rel = rel;
        link.href = href;
        document.head.appendChild(link);
    });
}
