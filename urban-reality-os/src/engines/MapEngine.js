// ================================================
// MapEngine — Map initialization, lifecycle, style switching
// Pure JS — no React dependency
// ✅ Robust style switch with isStyleLoaded polling
// ✅ Stats for debug panel
// ✅ Adaptive quality support
// ================================================
import maplibregl from 'maplibre-gl';
import { MAP_CONFIG, STYLE_URLS, TERRAIN_SOURCE_URL, TERRAIN_SOURCE_ID } from '../constants/mapConstants';
import { throttle } from '../utils/cache';
import { createLogger } from '../core/Logger';

const log = createLogger('MapEngine');

/** @type {number} Max polls for style loading */
const STYLE_LOAD_MAX_POLLS = 50;
const STYLE_LOAD_POLL_MS = 100;

class MapEngine {
  constructor() {
    this._map = null;
    this._popup = null;
    this._currentStyle = 'default';
    this._destroyed = false;
  }

  /**
   * Initialize the MapLibre map instance.
   * @param {HTMLElement} container
   * @param {object} options
   * @returns {maplibregl.Map}
   */
  init(container, options = {}) {
    if (this._map) {
      log.warn('Already initialized');
      return this._map;
    }

    this._destroyed = false;

    const map = new maplibregl.Map({
      container,
      style: STYLE_URLS.default,
      center: options.center || MAP_CONFIG.center,
      zoom: options.zoom || MAP_CONFIG.zoom,
      pitch: options.pitch || MAP_CONFIG.pitch,
      bearing: options.bearing || MAP_CONFIG.bearing,
      antialias: false,
      fadeDuration: 0,
      maxTileCacheSize: 50,
      trackResize: true,
      preserveDrawingBuffer: false,
      failIfMajorPerformanceCaveat: true,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    this._map = map;
    this._currentStyle = 'default';

    log.info('Map initialized');
    return map;
  }

  /**
   * Wait for the map to be fully loaded.
   * @returns {Promise<void>}
   */
  waitForLoad() {
    return new Promise((resolve, reject) => {
      if (!this._map) return resolve();
      if (this._map.loaded()) {
        resolve();
      } else {
        this._map.once('load', resolve);
        this._map.once('error', reject);
      }
    });
  }

  /**
   * Add terrain source and enable 3D terrain.
   */
  addTerrain() {
    if (!this._map) return;
    try {
      const existingSource = this._map.getSource(TERRAIN_SOURCE_ID);
      if (existingSource && existingSource.type !== 'raster-dem') {
        try {
          this._map.removeSource(TERRAIN_SOURCE_ID);
        } catch (removalError) {
          log.warn('removeTerrainSource failed:', removalError);
        }
      }

      if (!this._map.getSource(TERRAIN_SOURCE_ID)) {
        this._map.addSource(TERRAIN_SOURCE_ID, {
          type: 'raster-dem',
          url: TERRAIN_SOURCE_URL,
          tileSize: 256,
        });
      }
      this._map.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration: 1.4 });
    } catch (err) {
      log.warn('addTerrain error:', err);
    }
  }

  removeTerrain() {
    if (!this._map) return;
    try {
      this._map.setTerrain(null);
    } catch (err) {
      log.warn('removeTerrain error:', err);
    }
  }

  /**
   * Create the reusable popup instance.
   * @returns {maplibregl.Popup}
   */
  createPopup() {
    this._popup = new maplibregl.Popup({
      className: 'custom-popup',
      closeButton: false,
      offset: 12,
      closeOnClick: false,
    });
    return this._popup;
  }

  /**
   * Switch the map style with robust recovery.
   * Uses polling fallback if 'idle' event doesn't fire.
   * @param {string} styleName
   * @param {Function} onRecovery
   */
  switchStyle(styleName, onRecovery) {
    if (!this._map) return;
    if (this._currentStyle === styleName) return;

    const targetStyle = STYLE_URLS[styleName];
    if (!targetStyle) return;

    log.info(`Switching style: ${this._currentStyle} → ${styleName}`);
    this._currentStyle = styleName;
    this._map.setStyle(targetStyle);

    this._map.once('style.load', () => {
      // Poll for style readiness instead of relying solely on 'idle'
      let pollCount = 0;
      const checkReady = () => {
        if (!this._map || this._destroyed) return;

        if (this._map.isStyleLoaded() || pollCount >= STYLE_LOAD_MAX_POLLS) {
          if (styleName === 'terrain' || styleName === 'satellite') {
            this.addTerrain();
          } else {
            this.removeTerrain();
          }
          if (onRecovery) onRecovery(this._map, styleName);
          log.info(`Style switch complete: ${styleName}`);
        } else {
          pollCount++;
          setTimeout(checkReady, STYLE_LOAD_POLL_MS);
        }
      };

      // First try 'idle', but also set polling as backup
      const idleTimeout = setTimeout(checkReady, STYLE_LOAD_MAX_POLLS * STYLE_LOAD_POLL_MS);

      this._map.once('idle', () => {
        clearTimeout(idleTimeout);
        if (!this._map || this._destroyed) return;
        if (styleName === 'terrain' || styleName === 'satellite') {
          this.addTerrain();
        } else {
          this.removeTerrain();
        }
        if (onRecovery) onRecovery(this._map, styleName);
        log.info(`Style switch complete (idle): ${styleName}`);
      });
    });
  }

  getCurrentStyle() {
    return this._currentStyle;
  }

  /**
   * Get the map instance (safe getter).
   * @returns {maplibregl.Map | null}
   */
  getMap() {
    return this._map;
  }

  getPopup() {
    return this._popup;
  }

  /**
   * Get map debug stats.
   * @returns {{zoom: number, center: [number,number], pitch: number, bearing: number, style: string} | null}
   */
  getStats() {
    if (!this._map) return null;
    try {
      return {
        zoom: Math.round(this._map.getZoom() * 100) / 100,
        center: [
          Math.round(this._map.getCenter().lng * 1000) / 1000,
          Math.round(this._map.getCenter().lat * 1000) / 1000,
        ],
        pitch: Math.round(this._map.getPitch()),
        bearing: Math.round(this._map.getBearing()),
        style: this._currentStyle,
      };
    } catch {
      return null;
    }
  }

  /**
   * Apply quality settings to the map.
   * @param {'low'|'medium'|'high'|'ultra'} quality
   */
  applyQuality(quality) {
    if (!this._map) return;
    try {
      switch (quality) {
        case 'low':
          this._map.setTerrain(null);
          break;
        case 'medium':
          this._map.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration: 0.8 });
          break;
        case 'high':
          this._map.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration: 1.4 });
          break;
        case 'ultra':
          this._map.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration: 2.0 });
          break;
      }
    } catch {
      // Terrain source may not exist
    }
  }

  /**
   * Clean up and destroy the map.
   */
  destroy() {
    this._destroyed = true;
    if (this._popup) {
      this._popup.remove();
      this._popup = null;
    }
    if (this._map) {
      this._map.remove();
      this._map = null;
    }
    this._currentStyle = 'default';
    log.info('Map destroyed');
  }

  /**
   * Attach a throttled event handler to the map.
   * @param {string} event
   * @param {Function} handler
   * @param {number} limit
   * @returns {Function}
   */
  onThrottled(event, handler, limit = 50) {
    const throttled = throttle(handler, limit);
    if (this._map) {
      this._map.on(event, throttled);
    }
    return throttled;
  }
}

// Singleton — one MapEngine per app
export default new MapEngine();
