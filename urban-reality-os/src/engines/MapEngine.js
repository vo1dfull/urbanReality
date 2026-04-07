// ================================================
// MapEngine — Map initialization, lifecycle, style switching
// Pure JS — no React dependency
// ================================================
import maplibregl from 'maplibre-gl';
import { MAP_CONFIG, STYLE_URLS, TERRAIN_SOURCE_URL, TERRAIN_SOURCE_ID, SATELLITE_RASTER_TILE_URL } from '../constants/mapConstants';
import PERFORMANCE_CONFIG from '../config/performance';
import { throttle } from '../utils/cache';
import { createLogger } from '../core/Logger';
import SpaceRenderer from './SpaceRenderer';
import SkyAtmosphereRenderer from './SkyAtmosphereRenderer';
import RealisticBuildingRenderer from '../renderers/RealisticBuildingRenderer';
import RealisticSkyRenderer from '../renderers/RealisticSkyRenderer';

const log = createLogger('MapEngine');

/**
 * Major Indian cities with coordinates (lng, lat)
 * @type {{[cityName]: {lng: number, lat: number}}}
 */
const INDIAN_CITIES_COORDS = {
  'Mumbai': { lng: 72.8479, lat: 19.0760 },
  'Delhi': { lng: 77.2090, lat: 28.6139 },
  'Bangalore': { lng: 77.5946, lat: 12.9716 },
  'Hyderabad': { lng: 78.4711, lat: 17.3850 },
  'Chennai': { lng: 80.2809, lat: 13.0827 },
  'Kolkata': { lng: 88.3639, lat: 22.5726 },
  'Pune': { lng: 73.8567, lat: 18.5204 },
  'Ahmedabad': { lng: 72.6369, lat: 23.0225 },
  'Jaipur': { lng: 75.7873, lat: 26.9124 },
  'Surat': { lng: 72.8300, lat: 21.1702 },
  'Lucknow': { lng: 80.9462, lat: 26.8467 },
  'Indore': { lng: 75.8577, lat: 22.7196 },
  'Chandigarh': { lng: 76.7794, lat: 30.7333 },
  'Kochi': { lng: 76.2711, lat: 9.9312 },
  'Bhopal': { lng: 77.4126, lat: 23.1815 },
  'Visakhapatnam': { lng: 83.2185, lat: 17.6869 },
  'Pimpri-Chinchwad': { lng: 73.8007, lat: 18.6298 },
  'Nagpur': { lng: 79.0882, lat: 21.1458 },
  'Vadodara': { lng: 73.2167, lat: 22.3072 },
  'Ghaziabad': { lng: 77.6655, lat: 28.6692 },
  'Ludhiana': { lng: 75.8573, lat: 30.9010 },
  'Nashik': { lng: 73.7997, lat: 19.9975 },
  'Agra': { lng: 78.0081, lat: 27.1767 },
  'Varanasi': { lng: 82.9789, lat: 25.3176 },
  'Amritsar': { lng: 74.8723, lat: 31.6340 },
};

/** @type {number} Max polls for style loading */
const STYLE_LOAD_MAX_POLLS = 50;
const STYLE_LOAD_POLL_MS = 250;

const QUALITY_PRESETS = PERFORMANCE_CONFIG.quality;


class MapEngine {
  constructor() {
    this._map = null;
    this._popup = null;
    this._currentStyle = 'default';
    this._destroyed = false;
    this._quality = 'medium';
    this._terrainExaggeration = QUALITY_PRESETS.medium?.terrainExaggeration ?? 1.4;
    this._styleSwitchTimeout = null;
    this._styleSwitchAbortController = null; // Cancellation token for style switches
    this._lastStatsTime = 0;
    this._statsCache = null;
    this._layerEngine = null;
    this._a11yOptions = { reduceMotion: false, highContrast: false, keyboardNavigation: false };
    this._viewportIdleSubscribers = []; // Array of { callback, unsubscribe }
    this._moveEndFired = false;
    this._idleFired = false;
    this._currentHour = 12;
    this._fpsTracker = { frameCount: 0, lastTime: performance.now(), fps: 0 };

    // Space and sky renderers
    this._spaceRenderer = new SpaceRenderer();
    this._skyRenderer = new SkyAtmosphereRenderer();
    // Hyper-realistic building renderer (custom WebGL layer)
    this._realisticBuildingRenderer = new RealisticBuildingRenderer();
    // Ultra-realistic atmospheric sky renderer
    this._realisticSkyRenderer = new RealisticSkyRenderer();
  }

  setLayerEngine(layerEngine) {
    this._layerEngine = layerEngine || null;
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

    const quality = options.quality || this._quality || 'medium';
    const qualityPreset = QUALITY_PRESETS[quality] || QUALITY_PRESETS.medium;
    this._quality = quality;
    this._terrainExaggeration = qualityPreset.terrainExaggeration ?? this._terrainExaggeration;

    const map = new maplibregl.Map({
      container,
      style: STYLE_URLS.default,
      center: options.center || MAP_CONFIG.center,
      zoom: options.zoom || MAP_CONFIG.zoom,
      pitch: options.pitch || MAP_CONFIG.pitch,
      bearing: options.bearing || MAP_CONFIG.bearing,
      maxPitch: 85,
      minPitch: 0,
      pitchWithRotate: true,
      antialias: qualityPreset.antialias ?? true,
      fadeDuration: qualityPreset.fadeDuration ?? 0,
      maxTileCacheSize: qualityPreset.maxTileCacheSize ?? 50,
      renderWorldCopies: false,
      trackResize: true,
      preserveDrawingBuffer: false,
    });

    this._currentStyle = 'default';
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    // Use once — only for the initial style load.
    // Subsequent style loads are handled by _executeStyleSwitch's own handler.
    map.once('style.load', () => {
      this._applySceneLighting();
      this._applyFog();
      this._initializeRenderers();
      this._updateAtmosphereMode(this._currentStyle);
    });
    this._map = map;

    log.info('Map initialized');
    return map;
  }

  /**
   * Initialize space and sky renderers
   */
  _initializeRenderers() {
    if (!this._map) return;

    try {
      const isSatelliteStyle = this._currentStyle === 'satellite';
      const terrainStyle = this._currentStyle === 'terrain';

      // Initialize sky renderer
      this._skyRenderer.init(this._map);

      // Add or update space background layer
      if (!this._map.getLayer('space-background')) {
        this._map.addLayer({
          id: 'space-background',
          type: 'background',
          paint: {
            'background-color': '#020617'
          }
        });
      }
      if (this._map.getLayer('space-background')) {
        this._map.setLayoutProperty('space-background', 'visibility', isSatelliteStyle ? 'visible' : 'none');
      }

      // Add or update stars custom layer
      if (!this._map.getLayer('stars')) {
        this._map.addLayer({
          id: 'stars',
          type: 'custom',
          renderingMode: '3d',
          onAdd: (map, gl) => {
            const starCount = this._quality === 'low' ? 1000 : this._quality === 'high' ? 3000 : 2000;
            this._spaceRenderer.init(gl, starCount, map);
          },
          render: (gl, matrix) => {
            this._spaceRenderer.render(gl, matrix);
          }
        });
      }
      // Custom layers do not reliably support setLayoutProperty('visibility').
      // Control visibility through renderer enable/disable instead.
      if (isSatelliteStyle) this._spaceRenderer.enable();
      else this._spaceRenderer.disable();

      // Apply dynamic atmosphere/space background for non-map blank area.
      this._applyCanvasAtmosphereBackground(this._currentStyle);

      // Add realistic building renderer on top of fill-extrusion layer
      try {
        if (!this._map.getLayer('realistic-buildings')) {
          this._map.addLayer(this._realisticBuildingRenderer.customLayer);
        }
      } catch (err) {
        log.warn('Failed to add realistic buildings renderer:', err);
      }

      // Add ultra-realistic sky renderer for terrain mode.
      try {
        if (terrainStyle && !this._map.getLayer('realistic-sky')) {
          this._map.addLayer(this._realisticSkyRenderer.customLayer, 'realistic-buildings');
        }
      } catch (err) {
        log.warn('Failed to add realistic sky renderer:', err);
      }

      log.info('Renderers initialized');
    } catch (error) {
      log.error('Failed to initialize renderers:', error);
    }
  }

  _applySceneLighting() {
    if (!this._map) return;
    try {
      // Photorealistic afternoon sun: warm white, high elevation from SW,
      // strong intensity so facade/roof contrast matches real-world photography.
      this._map.setLight({
        anchor: 'map',
        color: '#fff8e8',      // warm solar white (not pure white = more natural)
        intensity: 0.65,       // strong directional — creates visible shadow planes
        position: [1.5, 210, 60], // azimuth 210° (SW sun), elevation 60°
      });
    } catch (err) {
      log.warn('setLight not supported on this style/runtime:', err);
    }
  }

  _applyFog() {
    if (!this._map) return;
    try {
      // Photorealistic atmospheric haze:
      // - Start fog close (range[0]=0.8) so distant buildings get aerial perspective
      // - Soft horizon blend for natural sky-to-ground fade
      // - Light blue-grey fog matches real aerial/satellite photography
      this._map.setFog({
        range: [0.8, 12],
        color: 'rgb(210, 224, 238)',          // hazy light blue — atmosphere
        'high-color': 'rgb(120, 168, 210)',    // richer blue overhead
        'horizon-blend': 0.08,                 // smooth horizon gradient
        'space-color': 'rgb(8, 10, 22)',       // deep space dark for high pitch
        'star-intensity': 0.0,                 // no stars in day mode
      });
    } catch (err) {
      log.warn('setFog not supported on this style/runtime:', err);
    }
  }

  /**
   * Update atmosphere mode based on current style
   * @param {string} styleName
   */
  _updateAtmosphereMode(styleName) {
    if (!this._map) return;

    const setVisibility = (layerId, visibility) => {
      try {
        if (this._map.getLayer(layerId)) {
          this._map.setLayoutProperty(layerId, 'visibility', visibility);
        }
      } catch (err) {
        log.warn(`Failed to set visibility for ${layerId}:`, err);
      }
    };

    const resetSkyBackground = () => {
      try {
        this._applyCanvasAtmosphereBackground(styleName);
        if (this._map.getLayer('terrain-sky-fallback')) {
          this._map.removeLayer('terrain-sky-fallback');
        }
      } catch (err) {
        log.warn('Failed to reset sky background:', err);
      }
    };

    if (styleName === 'satellite') {
      setVisibility('space-background', 'visible');
      setVisibility('stars', 'visible');
      this._spaceRenderer.enable();
      this._skyRenderer.enableSpaceMode();
      this._applyCanvasAtmosphereBackground('satellite');
      try {
        if (this._map.getLayer('realistic-sky')) this._map.removeLayer('realistic-sky');
      } catch (_) {}
      resetSkyBackground();
    } else if (styleName === 'terrain') {
      setVisibility('space-background', 'none');
      setVisibility('stars', 'none');
      this._spaceRenderer.disable();
      this._skyRenderer.enableAtmosphereMode();
      this._applyCanvasAtmosphereBackground('terrain');
      try {
        if (!this._map.getLayer('realistic-sky')) {
          this._map.addLayer(this._realisticSkyRenderer.customLayer, 'realistic-buildings');
        }
      } catch (_) {}
    } else {
      setVisibility('space-background', 'none');
      setVisibility('stars', 'none');
      this._spaceRenderer.disable();
      this._skyRenderer.disable();
      this._applyCanvasAtmosphereBackground('default');
      try {
        if (this._map.getLayer('realistic-sky')) this._map.removeLayer('realistic-sky');
      } catch (_) {}
      resetSkyBackground();
    }
  }

  _applyCanvasAtmosphereBackground(styleName = this._currentStyle) {
    if (!this._map) return;
    const canvas = this._map.getCanvas();
    const container = this._map.getContainer?.();
    const containerParent = container?.parentElement;
    const bg = this._getAtmosphereBackground(styleName, this._currentHour);

    // Apply to both surfaces: some browsers/styles reveal container background
    // in high-pitch non-map regions instead of canvas background.
    canvas.style.background = bg;
    canvas.style.backgroundColor = styleName === 'default' ? 'transparent' : '';

    if (container) {
      container.style.background = bg;
      container.style.backgroundColor = styleName === 'default' ? 'transparent' : '';
    }
    if (containerParent) {
      containerParent.style.background = bg;
      containerParent.style.backgroundColor = styleName === 'default' ? 'transparent' : '';
    }
  }

  _getAtmosphereBackground(styleName, hour = 12) {
    if (styleName === 'satellite') {
      return 'radial-gradient(circle at 50% -25%, #0f1c4a 0%, #060b24 45%, #020617 100%)';
    }
    if (styleName !== 'terrain') return 'transparent';

    if (hour < 5.5 || hour > 19.5) {
      return 'radial-gradient(circle at 70% -10%, rgba(130,160,255,0.20) 0%, rgba(24,38,88,0.10) 30%, rgba(8,14,34,0) 55%), linear-gradient(180deg, #0a173a 0%, #10264f 42%, #2a3f66 72%, #4d5d73 100%)';
    }
    if ((hour >= 5.5 && hour < 8) || (hour > 16.5 && hour <= 19.5)) {
      return 'radial-gradient(ellipse at 50% 88%, rgba(255,188,128,0.42) 0%, rgba(255,168,108,0.18) 22%, rgba(255,149,92,0) 50%), radial-gradient(circle at 78% 28%, rgba(255,238,210,0.25) 0%, rgba(255,238,210,0) 30%), linear-gradient(180deg, #3d6ca2 0%, #739fca 38%, #f2bf92 68%, #ffd9b4 100%)';
    }
    return 'radial-gradient(circle at 82% 25%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 28%), linear-gradient(180deg, #4f88c0 0%, #77add8 35%, #9ac6e4 62%, #cbe2f1 100%)';
  }

  _ensureSatelliteRasterLayer() {
    if (!this._map) return;
    try {
      if (!this._map.getSource('satellite')) {
        this._map.addSource('satellite', {
          type: 'raster',
          tiles: [SATELLITE_RASTER_TILE_URL],
          tileSize: 256,
        });
      }
      if (!this._map.getLayer('satellite-raster-layer')) {
        this._map.addLayer({
          id: 'satellite-raster-layer',
          type: 'raster',
          source: 'satellite',
          paint: {
            'raster-opacity': 1,
            'raster-fade-duration': 0,
          },
          layout: {
            visibility: this._currentStyle === 'satellite' ? 'visible' : 'none',
          },
        });
      } else {
        this._map.setLayoutProperty(
          'satellite-raster-layer',
          'visibility',
          this._currentStyle === 'satellite' ? 'visible' : 'none'
        );
      }
    } catch (err) {
      log.warn('satellite raster source setup failed:', err);
    }
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
      this._map.setTerrain({
        source: TERRAIN_SOURCE_ID,
        exaggeration: this._terrainExaggeration,
      });
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

  _executeStyleSwitch(styleName, onRecovery, abortSignal) {
    if (!this._map || this._destroyed || abortSignal?.aborted) return;
    if (this._currentStyle === styleName) return;

    const targetStyle = STYLE_URLS[styleName];
    if (!targetStyle) return;

    log.info(`Switching style: ${this._currentStyle} → ${styleName}`);
    this._spaceRenderer.disable();
    this._skyRenderer.disable();
    // Update _currentStyle IMMEDIATELY so that:
    // 1. Subsequent switchStyle() calls see the correct current state
    // 2. The guard `if (_currentStyle === styleName) return` doesn't block
    //    switching back to 'default' when a previous finalize was aborted/delayed
    this._currentStyle = styleName;
    this._map.setStyle(targetStyle);

    let finished = false;
    const finalize = (reason) => {
      if (finished || abortSignal?.aborted) return;
      finished = true;
      if (!this._map || this._destroyed) return;

      if (this._map.off) {
        this._map.off('error', handleStyleError);
      }

      this._currentStyle = styleName;

      if (styleName === 'terrain' || styleName === 'satellite') {
        this.addTerrain();
      } else {
        this.removeTerrain();
      }
      this._ensureSatelliteRasterLayer();
      this._initializeRenderers();
      this._applySceneLighting();
      this._applyFog();
      this._updateAtmosphereMode(styleName);
      if (reason !== 'styleError' && onRecovery) onRecovery(this._map, styleName);
      if (this._layerEngine?.syncAllToggles) {
        try {
          const layers = this._layerEngine.getCurrentLayerState?.();
          if (layers) this._layerEngine.syncAllToggles(this._map, layers);
        } catch (err) {
          log.warn('LayerEngine sync after style switch failed:', err);
        }
      }
      log.info(`Style switch complete (${reason}): ${styleName}`);
    };

    const handleStyleError = (error) => {
      if (!this._map || this._destroyed || abortSignal?.aborted) return;
      log.warn('Map style load error during switch:', error);
      finalize('styleError');
    };

    const checkReady = () => {
      if (!this._map || this._destroyed || abortSignal?.aborted) return;
      if (this._map.isStyleLoaded()) {
        requestAnimationFrame(() => finalize('styleLoaded'));
      } else if (pollCount < STYLE_LOAD_MAX_POLLS) {
        pollCount++;
        setTimeout(checkReady, STYLE_LOAD_POLL_MS);
      } else {
        log.warn('Style load polling exceeded max attempts, forcing finalize');
        requestAnimationFrame(() => finalize('maxPolls'));
      }
    };

    let pollCount = 0;
    const handleIdle = () => {
      if (!this._map || this._destroyed || abortSignal?.aborted) return;
      requestAnimationFrame(() => finalize('idle'));
    };

    this._map.once('error', handleStyleError);
    this._map.once('style.load', () => {
      if (!this._map || this._destroyed || abortSignal?.aborted) return;
      this._map.once('idle', handleIdle);
      checkReady();
    });
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
   * Cancellable — if called again before completion, aborts previous switch.
   * @param {string} styleName
   * @param {Function} onRecovery
   */
  switchStyle(styleName, onRecovery) {
    if (!this._map || this._destroyed) return;
    if (this._currentStyle === styleName) return;

    // Cancel any in-flight style switch
    if (this._styleSwitchAbortController) {
      this._styleSwitchAbortController.abort();
    }
    this._styleSwitchAbortController = new AbortController();
    const abortSignal = this._styleSwitchAbortController.signal;

    if (this._styleSwitchTimeout) {
      clearTimeout(this._styleSwitchTimeout);
    }

    this._styleSwitchTimeout = setTimeout(() => {
      this._styleSwitchTimeout = null;
      if (!abortSignal.aborted) {
        this._executeStyleSwitch(styleName, onRecovery, abortSignal);
      }
    }, 350);
  }

  getCurrentStyle() {
    return this._currentStyle;
  }

  getMap() {
    return this._map;
  }

  getPopup() {
    return this._popup;
  }

  /**
   * Get map debug stats (used by DebugPanel).
   * @returns {{zoom: number, center: [number,number], pitch: number, bearing: number, style: string, tilesLoaded: number, fps: number} | null}
   */
  getStats() {
    if (!this._map) return null;
    const now = performance.now();
    if (this._lastStatsTime && now - this._lastStatsTime < 100) {
      return this._statsCache;
    }

    try {
      // Track FPS
      const frameTime = now - this._fpsTracker.lastTime;
      if (frameTime >= 1000) {
        this._fpsTracker.fps = Math.round(this._fpsTracker.frameCount / (frameTime / 1000));
        this._fpsTracker.frameCount = 0;
        this._fpsTracker.lastTime = now;
      }
      this._fpsTracker.frameCount += 1;

      // Get tile load data
      let tilesLoaded = 0;
      try {
        const tilesRenderData = this._map.painter?.getTilesRenderData?.();
        if (tilesRenderData?.length) {
          tilesLoaded = tilesRenderData.length;
        }
      } catch {
        // Fallback if getTilesRenderData is unavailable
        tilesLoaded = 0;
      }

      const stats = {
        zoom: Math.round(this._map.getZoom() * 100) / 100,
        center: [
          Math.round(this._map.getCenter().lng * 1000) / 1000,
          Math.round(this._map.getCenter().lat * 1000) / 1000,
        ],
        pitch: Math.round(this._map.getPitch()),
        bearing: Math.round(this._map.getBearing()),
        style: this._currentStyle,
        tilesLoaded,
        fps: this._fpsTracker.fps,
      };
      this._lastStatsTime = now;
      this._statsCache = stats;
      return stats;
    } catch {
      return this._statsCache || null;
    }
  }

  /**
   * Haversine distance between two geographic points
   * @private
   */
  _haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  /**
   * Fly to a major Indian city.
   * @param {string} cityName
   * @param {number} zoom
   * @returns {Promise<void>}
   */
  async flyToCity(cityName, zoom = 12) {
    if (!this._map) return Promise.reject(new Error('Map not initialized'));

    const cityCoords = INDIAN_CITIES_COORDS[cityName];
    if (!cityCoords) {
      return Promise.reject(new Error(`City "${cityName}" not found`));
    }

    return new Promise((resolve) => {
      this._map.flyTo({
        center: [cityCoords.lng, cityCoords.lat],
        zoom,
        duration: 2000,
      });
      this._map.once('moveend', resolve);
    });
  }

  /**
   * Measure total distance of a path (km).
   * @param {Array<{lng: number, lat: number}>} points
   * @returns {number} Distance in km
   */
  measureDistance(points) {
    if (!Array.isArray(points) || points.length < 2) {
      return 0;
    }

    let totalDistance = 0;
    for (let i = 0; i < points.length - 1; i += 1) {
      const p1 = points[i];
      const p2 = points[i + 1];
      totalDistance += this._haversineDistance(p1.lat, p1.lng, p2.lat, p2.lng);
    }
    return Math.round(totalDistance * 100) / 100;
  }

  /**
   * Measure area of a polygon (km²) using the Shoelace formula.
   * @param {Array<{lng: number, lat: number}>} polygon
   * @returns {number} Area in km²
   */
  measureArea(polygon) {
    if (!Array.isArray(polygon) || polygon.length < 3) {
      return 0;
    }

    // Convert to radians
    const toRad = (deg) => deg * Math.PI / 180;

    let areaRad = 0;
    for (let i = 0; i < polygon.length; i += 1) {
      const p1 = polygon[i];
      const p2 = polygon[(i + 1) % polygon.length];
      const lat1 = toRad(p1.lat);
      const lat2 = toRad(p2.lat);
      const dLng = toRad(p2.lng - p1.lng);

      areaRad += dLng * (2 + Math.sin(lat1) + Math.sin(lat2));
    }

    // Earth's surface area / 4π * 2
    const R = 6371; // km
    const earthSurfaceArea = 4 * Math.PI * R * R;
    const areaKm2 = Math.abs(areaRad) * earthSurfaceArea / (8 * Math.PI);

    return Math.round(areaKm2 * 100) / 100;
  }

  /**
   * Capture the current map viewport as a PNG blob.
   * @returns {Promise<Blob>}
   */
  async captureSnapshot() {
    if (!this._map) {
      return Promise.reject(new Error('Map not initialized'));
    }

    const canvas = this._map.getCanvas();
    if (!canvas) {
      return Promise.reject(new Error('Canvas not available'));
    }

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Failed to capture snapshot'));
        } else {
          resolve(blob);
        }
      }, 'image/png');
    });
  }

  /**
   * Set accessibility options for the map.
   * @param {{reduceMotion?: boolean, highContrast?: boolean, keyboardNavigation?: boolean}} options
   */
  setAccessibility(options = {}) {
    const { reduceMotion, highContrast, keyboardNavigation } = options;

    if (typeof reduceMotion === 'boolean') {
      this._a11yOptions.reduceMotion = reduceMotion;
      // Reduce animation durations when enabled
      if (this._map && reduceMotion) {
        this._map._fadeDuration = 0;
      }
    }

    if (typeof highContrast === 'boolean') {
      this._a11yOptions.highContrast = highContrast;
      if (this._map && this._layerEngine) {
        if (highContrast) {
          // Switch to high-contrast style and maximize opacity
          this.switchStyle('default');
          const allLayers = Array.from(this._layerEngine.layerConfigs.values());
          for (const cfg of allLayers) {
            cfg.opacity = 1;
          }
        }
      }
    }

    if (typeof keyboardNavigation === 'boolean') {
      this._a11yOptions.keyboardNavigation = keyboardNavigation;
      if (this._map) {
        // Keyboard shortcuts will be handled by useKeyboardShortcuts hook
        // This flag informs the hook that keyboard navigation is enabled
      }
    }

    log.info('Accessibility options set:', this._a11yOptions);
  }

  /**
   * Register a callback to fire once after the map has finished moving
   * and all tiles have loaded (combines moveend + idle events).
   * @param {Function} cb
   * @returns {Function} Unsubscribe function
   */
  onViewportIdle(cb) {
    if (!this._map || typeof cb !== 'function') {
      return () => {};
    }

    const handleMoveEnd = () => {
      this._moveEndFired = true;
      this._checkViewportIdle(cb);
    };

    const handleIdle = () => {
      this._idleFired = true;
      this._checkViewportIdle(cb);
    };

    this._map.on('moveend', handleMoveEnd);
    this._map.on('idle', handleIdle);

    // Return unsubscribe function
    return () => {
      if (this._map) {
        this._map.off('moveend', handleMoveEnd);
        this._map.off('idle', handleIdle);
      }
    };
  }

  _checkViewportIdle(cb) {
    if (this._moveEndFired && this._idleFired) {
      this._moveEndFired = false;
      this._idleFired = false;
      if (cb) cb();
    }
  }

  destroy() {
    this._destroyed = true;
    if (this._styleSwitchTimeout) {
      clearTimeout(this._styleSwitchTimeout);
      this._styleSwitchTimeout = null;
    }
    if (this._styleSwitchAbortController) {
      this._styleSwitchAbortController.abort();
      this._styleSwitchAbortController = null;
    }
    if (this._popup) {
      this._popup.remove();
      this._popup = null;
    }
    if (this._spaceRenderer) {
      this._spaceRenderer.cleanup();
    }
    if (this._skyRenderer) {
      this._skyRenderer.disable();
    }
    if (this._realisticBuildingRenderer && this._map) {
      try { this._map.removeLayer('realistic-buildings'); } catch (_) {}
        if (this._realisticSkyRenderer && this._map) {
          try { this._map.removeLayer('realistic-sky'); } catch (_) {}
        }
    }
    if (this._map) {
      this._map.remove();
      this._map = null;
    }
    this._currentStyle = 'default';
    this._moveEndFired = false;
    this._idleFired = false;
    this._viewportIdleSubscribers.length = 0;
    log.info('Map destroyed');
  }

  /**
   * Apply quality preset to the map.
   * @param {'low'|'medium'|'high'|'ultra'} level
   */
  applyQuality(level) {
    if (!this._map) return;
    const preset = QUALITY_PRESETS[level];
    if (!preset) return;
    try {
      this._quality = level;
      this._terrainExaggeration = preset.terrainExaggeration ?? this._terrainExaggeration;
      if (typeof this._map._fadeDuration !== 'undefined') {
        this._map._fadeDuration = preset.fadeDuration ?? 0;
      }
      if (this._map.getTerrain()) {
        this._map.setTerrain({
          source: TERRAIN_SOURCE_ID,
          exaggeration: this._terrainExaggeration,
        });
      }
      log.info(`Quality set to: ${level}`);
    } catch (err) {
      log.warn('applyQuality error:', err);
    }
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

  /**
   * Set performance mode for renderers
   * @param {boolean} enabled
   */
  setPerformanceMode(enabled) {
    this._spaceRenderer.setPerformanceMode(enabled);
    this._skyRenderer.setPerformanceMode(enabled);
    log.info(`Performance mode ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Update time for sky atmosphere (0-23.99) and dynamic sun lighting.
   * @param {number} hour
   */
  setTime(hour) {
    this._currentHour = Math.max(0, Math.min(23.99, hour));
    this._skyRenderer.setTime(hour);
    this._realisticBuildingRenderer.setTime(hour);
    this._realisticSkyRenderer.setTime(hour);
    this._applyCanvasAtmosphereBackground(this._currentStyle);

    // Drive map.setLight dynamically from the time slider
    if (!this._map) return;
    const lightConfig = this._skyRenderer.getLightConfig();
    if (!lightConfig) return;
    try {
      this._map.setLight(lightConfig);
    } catch (err) {
      log.warn('setLight (dynamic) failed:', err);
    }

    // Drive night-mode building colors
    if (this._layerEngine) {
      const plugin = this._layerEngine.registry?.get?.('buildings');
      if (plugin?.setNightMode) {
        const isNight = hour < 6 || hour > 19;
        plugin.setNightMode(isNight);
      }
    }
  }

  /**
   * Get current atmosphere mode
   * @returns {string} 'space' | 'sky' | 'none'
   */
  getAtmosphereMode() {
    if (this._currentStyle === 'satellite') return 'space';
    if (this._currentStyle === 'terrain') return 'sky';
    return 'none';
  }
}

export default new MapEngine();
