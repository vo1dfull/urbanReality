// ================================================
// MapEngine — Map initialization, lifecycle, style switching
// Pure JS — no React dependency
// ================================================
import maplibregl from 'maplibre-gl';
import { MAP_CONFIG, STYLE_URLS, TERRAIN_SOURCE_URL, TERRAIN_SOURCE_ID } from '../constants/mapConstants';
import { throttle } from '../utils/cache';

class MapEngine {
  constructor() {
    this._map = null;
    this._popup = null;
    this._currentStyle = 'default';
    this._onStyleRecovery = null; // callback after style switch
  }

  /**
   * Initialize the MapLibre map instance.
   * @param {HTMLElement} container
   * @param {object} options — override MAP_CONFIG values
   * @returns {maplibregl.Map}
   */
  init(container, options = {}) {
    if (this._map) {
      console.warn('[MapEngine] Already initialized');
      return this._map;
    }

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

    return map;
  }

  /**
   * Wait for the map to be fully loaded.
   * @returns {Promise<void>}
   */
  waitForLoad() {
    return new Promise((resolve) => {
      if (!this._map) return resolve();
      if (this._map.loaded()) {
        resolve();
      } else {
        this._map.once('load', resolve);
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
          console.warn('[MapEngine] removeTerrainSource failed:', removalError);
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
      console.warn('[MapEngine] addTerrain error:', err);
    }
  }

  removeTerrain() {
    if (!this._map) return;
    try {
      this._map.setTerrain(null);
    } catch (err) {
      console.warn('[MapEngine] removeTerrain error:', err);
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
   * Switch the map style and trigger layer recovery.
   * @param {string} styleName — 'default' | 'satellite' | 'terrain'
   * @param {Function} onRecovery — called after style.load + idle
   */
  switchStyle(styleName, onRecovery) {
    if (!this._map) return;
    if (this._currentStyle === styleName) return;

    const targetStyle = STYLE_URLS[styleName];
    if (!targetStyle) return;

    this._currentStyle = styleName;
    this._map.setStyle(targetStyle);

    this._map.once('style.load', () => {
      this._map.once('idle', () => {
        if (styleName === 'terrain' || styleName === 'satellite') {
          this.addTerrain();
        } else {
          this.removeTerrain();
        }
        if (onRecovery) onRecovery(this._map, styleName);
      });
    });
  }

  /**
   * Get the current style name.
   */
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

  /**
   * Get the popup instance.
   * @returns {maplibregl.Popup | null}
   */
  getPopup() {
    return this._popup;
  }

  /**
   * Clean up and destroy the map.
   */
  destroy() {
    if (this._popup) {
      this._popup.remove();
      this._popup = null;
    }
    if (this._map) {
      this._map.remove();
      this._map = null;
    }
    this._currentStyle = 'default';
  }

  /**
   * Attach a throttled event handler to the map.
   * @param {string} event
   * @param {Function} handler
   * @param {number} limit — ms throttle (default 50)
   * @returns {Function} the throttled handler (for cleanup)
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
