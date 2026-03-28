/**
 * Application Performance Configuration
 */

export const PERFORMANCE_CONFIG = {
  // Caching
  cache: {
    aqi: 3 * 60 * 1000,      // 3 minutes - AQI updates frequently
    geo: 10 * 60 * 1000,     // 10 minutes - geo data is stable
    api: 5 * 60 * 1000,      // 5 minutes - general API data
    traffic: 2 * 60 * 1000   // 2 minutes - traffic updates often
  },

  // Debounce/Throttle delays (ms)
  debounce: {
    search: 300,
    mapMove: 500,
    resize: 300
  },

  throttle: {
    scroll: 100,
    mouseMov: 100,
    zoom: 100
  },

  // Request timeouts (ms)
  timeout: {
    aqi: 5000,
    traffic: 4000,
    rainfall: 4000,
    general: 8000
  },

  // Batch processing
  batch: {
    aqiChunkSize: 5,
    facilityChunkSize: 10,
    delay: 200
  },

  // Feature flags
  features: {
    enableOfflineMode: true,
    enableServiceWorker: false,
    enableResourceHints: true,
    enableLazyLoading: true,
    enableRenderOptimization: true
  },

  // Render hints
  render: {
    maxFrameTime: 16.67, // 60fps
    warningThreshold: 50, // warn if render takes > 50ms
    measurePerformance: false // set to true for debugging
  }
};

export default PERFORMANCE_CONFIG;
