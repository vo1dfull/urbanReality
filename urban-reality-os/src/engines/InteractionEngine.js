// ================================================
// InteractionEngine — Click, hover, popup lifecycle
// Pure JS — manages popup React root externally
// ✅ isDestroyed guard prevents post-destroy updates
// ✅ Statistics tracking for debug panel
// ================================================
import maplibregl from 'maplibre-gl';
import { createRoot } from 'react-dom/client';

/** @typedef {Object} TooltipOptions
 * @property {string} [className] — CSS class for styling
 * @property {number} [offsetX] — pixels from cursor
 * @property {number} [offsetY]
 * @property {number} [autoHideDurationMs] — auto-hide delay (default 5000)
 */

/** @typedef {Object} ContextMenuItem
 * @property {string} label — display text
 * @property {string} [icon] — emoji or icon class
 * @property {Function} onClick — handler function
 */

/** @typedef {Object} InteractionHeatmap
 * @property {number} resolution — 0.01° per cell
 * @property {number[][]} grid — click counts by [latBucket][lngBucket]
 * @property {{minLat: number, maxLat: number, minLng: number, maxLng: number}} bounds
 */

class InteractionEngine {
  constructor() {
    this._popupRef = null;
    this._popupRootRef = null;
    this._popupSessionId = 0;
    this._lastRequestTime = 0;
    this._clickAbortController = null;
    this._eventHandlers = new Map(); // Map<key, {event, layerId, handler, originalHandler}>
    this._destroyed = false;

    // Tooltip management
    this._tooltip = null;
    this._tooltipAutoHideTimer = null;

    // Context menu management
    this._contextMenu = null;
    this._contextMenuAbortController = null;

    // Box select state
    this._boxSelectState = null; // {startX, startY, rect} or null
    this._boxSelectUnsubscribe = null;

    // Measure tool state
    this._measureState = null; // {points: [], polyline, layer}
    this._measureUnsubscribe = null;

    // Interaction mode
    this._interactionMode = 'default'; // 'default' | 'build' | 'measure' | 'select'

    // Interaction heatmap
    this._heatmapResolution = 0.01; // degrees
    this._heatmapGrid = new Map(); // Map<"lat,lng", count>
    this._heatmapBounds = { minLat: 90, maxLat: -90, minLng: 180, maxLng: -180 };

    // Popup lifecycle hooks
    this._popupOpenCallbacks = [];
    this._popupCloseCallbacks = [];

    // Stats
    this._stats = { clicks: 0, hovers: 0, popups: 0 };
  }

  /**
   * Initialize the popup instance.
   * @param {maplibregl.Popup} popup
   */
  initPopup(popup) {
    this._popupRef = popup;
    this._destroyed = false;

    popup.on('open', () => {
      for (const cb of this._popupOpenCallbacks) {
        try { cb(); } catch (e) { console.warn('onPopupOpen error:', e); }
      }
    });

    popup.on('close', () => {
      for (const cb of this._popupCloseCallbacks) {
        try { cb(); } catch (e) { console.warn('onPopupClose error:', e); }
      }

      try {
        if (this._popupRootRef) {
          this._popupRootRef.unmount();
          this._popupRootRef = null;
        }
      } catch (e) {
        // Ignore unmount errors
      }
    });
  }

  /**
   * Register a callback to fire when popup opens.
   * @param {Function} cb
   */
  onPopupOpen(cb) {
    if (typeof cb === 'function') {
      this._popupOpenCallbacks.push(cb);
    }
  }

  /**
   * Register a callback to fire when popup closes.
   * @param {Function} cb
   */
  onPopupClose(cb) {
    if (typeof cb === 'function') {
      this._popupCloseCallbacks.push(cb);
    }
  }

  /**
   * Create a new popup session (increments counter, returns ID).
   * @returns {number}
   */
  newSession() {
    this._stats.clicks++;
    return ++this._popupSessionId;
  }

  getSessionId() {
    return this._popupSessionId;
  }

  /**
   * Check if a session is still the current one.
   * @param {number} sessionId
   * @returns {boolean}
   */
  isCurrentSession(sessionId) {
    return !this._destroyed && this._popupSessionId === sessionId;
  }

  /**
   * Track request time for race condition prevention.
   * @returns {number}
   */
  markRequestTime() {
    this._lastRequestTime = Date.now();
    return this._lastRequestTime;
  }

  /**
   * Check if a request time is still the latest.
   * @param {number} requestTime
   * @returns {boolean}
   */
  isLatestRequest(requestTime) {
    return !this._destroyed && this._lastRequestTime === requestTime;
  }

  /**
   * Get a new AbortController, cancelling any previous one.
   * @returns {AbortController}
   */
  getClickAbortController() {
    if (this._clickAbortController) {
      this._clickAbortController.abort();
    }
    this._clickAbortController = new AbortController();
    return this._clickAbortController;
  }

  /**
   * Show popup at a location with a React element.
   * @param {maplibregl.Map} map
   * @param {[number, number]} lngLat
   * @param {React.ReactElement} element
   */
  showPopup(map, lngLat, element) {
    if (!this._popupRef || !map || this._destroyed) return;

    try {
      if (this._popupRootRef) {
        this._popupRootRef.unmount();
        this._popupRootRef = null;
      }

      const container = document.createElement('div');
      container.className = 'custom-popup';

      this._popupRef.setLngLat(lngLat).setDOMContent(container).addTo(map);

      const root = createRoot(container);
      this._popupRootRef = root;
      root.render(element);
      this._stats.popups++;
    } catch (err) {
      console.warn('[InteractionEngine] showPopup error:', err);
    }
  }

  /**
   * Update the current popup's content.
   * @param {React.ReactElement} element
   */
  updatePopup(element) {
    if (!this._popupRootRef || this._destroyed) return;
    try {
      if (this._popupRef && this._popupRef.isOpen()) {
        this._popupRootRef.render(element);
      }
    } catch (err) {
      console.warn('[InteractionEngine] updatePopup error:', err);
    }
  }

  isPopupOpen() {
    return this._popupRef && this._popupRef.isOpen();
  }

  getPopupRoot() {
    return this._popupRootRef;
  }

  /**
   * Track a hover event for stats.
   */
  trackHover() {
    this._stats.hovers++;
  }

  /**
   * Get interaction statistics.
   * @returns {{clicks: number, hovers: number, popups: number}}
   */
  getStats() {
    return { ...this._stats };
  }

  /**
   * Attach a map event handler with tracking for cleanup.
   * Store original handler reference to allow proper detachment even with wrapping.
   * @param {maplibregl.Map} map
   * @param {string} event
   * @param {string|null} layerId
   * @param {Function} handler — original unwrapped handler
   * @param {Function} [wrappedHandler] — optional wrapped version to pass to map.on()
   * @returns {string} key for detachment
   */
  attachEvent(map, event, layerId, handler, wrappedHandler = null) {
    const key = `${event}:${layerId || 'map'}:${Date.now()}:${Math.random()}`;
    const actualHandler = wrappedHandler || handler;
    
    if (layerId) {
      map.on(event, layerId, actualHandler);
    } else {
      map.on(event, actualHandler);
    }
    
    // Store both original and actual handler for cleanup
    this._eventHandlers.set(key, { 
      event, 
      layerId, 
      handler: actualHandler, // handler passed to map.on()
      originalHandler: handler // original for reference
    });
    return key;
  }

  detachEvent(map, key) {
    const entry = this._eventHandlers.get(key);
    if (!entry) return;
    try {
      if (entry.layerId) {
        map.off(entry.event, entry.layerId, entry.handler);
      } else {
        map.off(entry.event, entry.handler);
      }
    } catch (e) { /* ignored */ }
    this._eventHandlers.delete(key);
  }

  detachAllEvents(map) {
    for (const [key, entry] of this._eventHandlers) {
      try {
        if (entry.layerId) {
          map.off(entry.event, entry.layerId, entry.handler);
        } else {
          map.off(entry.event, entry.handler);
        }
      } catch (e) { /* ignored */ }
    }
    this._eventHandlers.clear();
  }

  /**
   * Check if engine is destroyed.
   * @returns {boolean}
   */
  isDestroyed() {
    return this._destroyed;
  }

  // ==================== Tooltip ====================

  /**
   * Show a lightweight DOM-based tooltip.
   * @param {maplibregl.Map} map
   * @param {{lng: number, lat: number}} lngLat
   * @param {string} content — HTML content
   * @param {TooltipOptions} [options]
   */
  showTooltip(map, lngLat, content, options = {}) {
    if (!map || !lngLat || !content || this._destroyed) return;

    this._hideTooltip();

    const tooltip = document.createElement('div');
    tooltip.className = `maplibre-tooltip ${options.className || ''}`;
    tooltip.innerHTML = content;
    tooltip.style.cssText = `
      position: fixed;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      pointer-events: none;
      z-index: 10000;
      max-width: 200px;
      word-wrap: break-word;
    `;

    document.body.appendChild(tooltip);
    this._tooltip = tooltip;

    // Position tooltip near cursor
    const pos = map.project([lngLat.lng, lngLat.lat]);
    const offsetX = options.offsetX ?? 12;
    const offsetY = options.offsetY ?? -12;
    tooltip.style.left = (pos.x + offsetX) + 'px';
    tooltip.style.top = (pos.y + offsetY) + 'px';

    // Auto-hide
    const duration = options.autoHideDurationMs ?? 5000;
    this._tooltipAutoHideTimer = setTimeout(() => this._hideTooltip(), duration);

    // Dismiss on mouseleave
    tooltip.addEventListener('mouseleave', () => this._hideTooltip());
  }

  _hideTooltip() {
    if (this._tooltipAutoHideTimer) {
      clearTimeout(this._tooltipAutoHideTimer);
      this._tooltipAutoHideTimer = null;
    }
    if (this._tooltip) {
      this._tooltip.remove();
      this._tooltip = null;
    }
  }

  // ==================== Context Menu ====================

  /**
   * Show a right-click context menu.
   * @param {maplibregl.Map} map
   * @param {{lng: number, lat: number}} lngLat
   * @param {ContextMenuItem[]} items
   */
  showContextMenu(map, lngLat, items) {
    if (!map || !Array.isArray(items) || this._destroyed) return;

    this._hideContextMenu();

    const menu = document.createElement('div');
    menu.className = 'maplibre-context-menu';
    menu.style.cssText = `
      position: fixed;
      background: white;
      border: 1px solid #ccc;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 10001;
      min-width: 160px;
    `;

    for (const item of items) {
      const menuItem = document.createElement('div');
      menuItem.style.cssText = `
        padding: 10px 16px;
        cursor: pointer;
        user-select: none;
        border-bottom: 1px solid #eee;
      `;
      menuItem.textContent = (item.icon ? item.icon + ' ' : '') + item.label;

      menuItem.addEventListener('mouseenter', () => {
        menuItem.style.backgroundColor = '#f5f5f5';
      });
      menuItem.addEventListener('mouseleave', () => {
        menuItem.style.backgroundColor = 'transparent';
      });

      menuItem.addEventListener('click', () => {
        if (typeof item.onClick === 'function') {
          item.onClick({ lngLat });
        }
        this._hideContextMenu();
      });

      menu.appendChild(menuItem);
    }

    // Position menu
    const pos = map.project([lngLat.lng, lngLat.lat]);
    menu.style.left = Math.max(0, pos.x - 80) + 'px';
    menu.style.top = Math.max(0, pos.y) + 'px';

    document.body.appendChild(menu);
    this._contextMenu = menu;

    // Dismiss on outside click or Escape
    if (this._contextMenuAbortController) {
      this._contextMenuAbortController.abort();
    }
    this._contextMenuAbortController = new AbortController();

    document.addEventListener('click', () => this._hideContextMenu(), 
      { once: true, signal: this._contextMenuAbortController.signal });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this._hideContextMenu();
    }, { signal: this._contextMenuAbortController.signal });
  }

  _hideContextMenu() {
    if (this._contextMenuAbortController) {
      this._contextMenuAbortController.abort();
      this._contextMenuAbortController = null;
    }
    if (this._contextMenu) {
      this._contextMenu.remove();
      this._contextMenu = null;
    }
  }

  // ==================== Box Select ====================

  /**
   * Enable box select mode: shift+drag to draw selection rectangle.
   * @param {maplibregl.Map} map
   * @param {Function} onSelect — fires with LngLatBounds
   * @returns {Function} unsubscribe function
   */
  enableBoxSelect(map, onSelect) {
    if (!map || typeof onSelect !== 'function' || this._destroyed) return () => {};

    const startListen = (e) => {
      if (!e.shiftKey) return;

      const rect = document.createElement('div');
      rect.style.cssText = `
        position: fixed;
        border: 2px solid #0084ff;
        background: rgba(0, 132, 255, 0.1);
        z-index: 9999;
        pointer-events: none;
      `;
      document.body.appendChild(rect);

      this._boxSelectState = {
        startX: e.clientX,
        startY: e.clientY,
        rect,
      };
    };

    const onMove = (e) => {
      if (!this._boxSelectState) return;

      const { startX, startY, rect } = this._boxSelectState;
      const currentX = e.clientX;
      const currentY = e.clientY;

      const minX = Math.min(startX, currentX);
      const minY = Math.min(startY, currentY);
      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);

      rect.style.left = minX + 'px';
      rect.style.top = minY + 'px';
      rect.style.width = width + 'px';
      rect.style.height = height + 'px';
    };

    const onEnd = (e) => {
      if (!this._boxSelectState) return;

      const { startX, startY, rect } = this._boxSelectState;
      rect.remove();

      const nw = map.unproject([Math.min(startX, e.clientX), Math.min(startY, e.clientY)]);
      const se = map.unproject([Math.max(startX, e.clientX), Math.max(startY, e.clientY)]);

      onSelect({
        _sw: { lng: nw.lng, lat: se.lat },
        _ne: { lng: se.lng, lat: nw.lat },
      });

      this._boxSelectState = null;
    };

    document.addEventListener('mousedown', startListen);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);

    this._boxSelectUnsubscribe = () => {
      document.removeEventListener('mousedown', startListen);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
      if (this._boxSelectState?.rect) {
        this._boxSelectState.rect.remove();
      }
      this._boxSelectState = null;
    };

    return this._boxSelectUnsubscribe;
  }

  // ==================== Measure Tool ====================

  /**
   * Enable measure tool: click to add points, double-click to finish.
   * @param {maplibregl.Map} map
   * @param {Function} onMeasure — fires with (distanceKm, areaKm2)
   * @returns {Function} unsubscribe function
   */
  enableMeasureTool(map, onMeasure) {
    if (!map || typeof onMeasure !== 'function' || this._destroyed) return () => {};

    const points = [];
    let polyline = null;

    const onClick = (e) => {
      points.push({ lng: e.lngLat.lng, lat: e.lngLat.lat });

      if (polyline) polyline.remove();

      // Draw polyline
      if (points.length > 1) {
        const coords = points.map((p) => [p.lng, p.lat]);

        if (!map.getSource('measure-source')) {
          map.addSource('measure-source', {
            type: 'geojson',
            data: {
              type: 'LineString',
              coordinates: coords,
            },
          });

          map.addLayer({
            id: 'measure-layer',
            type: 'line',
            source: 'measure-source',
            paint: {
              'line-color': '#0084ff',
              'line-width': 2,
            },
          });
        } else {
          map.getSource('measure-source').setData({
            type: 'LineString',
            coordinates: coords,
          });
        }
      }
    };

    const onDoubleClick = (e) => {
      if (points.length < 2) return;

      // Calculate distance (Haversine)
      let distance = 0;
      for (let i = 0; i < points.length - 1; i += 1) {
        const p1 = points[i];
        const p2 = points[i + 1];
        const dLat = (p2.lat - p1.lat) * Math.PI / 180;
        const dLon = (p2.lng - p1.lng) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2
          + Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
        distance += 6371 * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
      }

      // Calculate area if closed polygon
      let area = 0;
      if (points.length > 2 && Math.abs(points[0].lng - points[points.length - 1].lng) < 0.001) {
        const toRad = (deg) => deg * Math.PI / 180;
        for (let i = 0; i < points.length - 1; i += 1) {
          const p1 = points[i];
          const p2 = points[i + 1];
          area += (toRad(p2.lng - p1.lng)) * (2 + Math.sin(toRad(p1.lat)) + Math.sin(toRad(p2.lat)));
        }
        const R = 6371;
        area = Math.abs(area * R * R / (8 * Math.PI));
      }

      onMeasure(Math.round(distance * 100) / 100, Math.round(area * 100) / 100);

      // Cleanup
      if (map.getLayer('measure-layer')) map.removeLayer('measure-layer');
      if (map.getSource('measure-source')) map.removeSource('measure-source');

      points.length = 0;
    };

    map.on('click', onClick);
    map.on('dblclick', onDoubleClick);

    this._measureUnsubscribe = () => {
      map.off('click', onClick);
      map.off('dblclick', onDoubleClick);
      if (map.getLayer('measure-layer')) map.removeLayer('measure-layer');
      if (map.getSource('measure-source')) map.removeSource('measure-source');
      points.length = 0;
    };

    return this._measureUnsubscribe;
  }

  // ==================== Interaction Mode ====================

  /**
   * Set interaction mode and update cursor style.
   * @param {'default'|'build'|'measure'|'select'} mode
   * @param {maplibregl.Map} [map]
   */
  setInteractionMode(mode, map = null) {
    const validModes = ['default', 'build', 'measure', 'select'];
    if (!validModes.includes(mode)) return;

    this._interactionMode = mode;

    const cursorMap = {
      default: 'auto',
      build: 'crosshair',
      measure: 'cell',
      select: 'grab',
    };

    if (map) {
      const canvas = map.getCanvas();
      if (canvas) {
        canvas.style.cursor = cursorMap[mode];
      }
    }
  }

  getInteractionMode() {
    return this._interactionMode;
  }

  // ==================== Interaction Heatmap ====================

  /**
   * Record a click at a location for heatmap analytics.
   * @private
   */
  _recordInteractionHit(lngLat) {
    if (!lngLat) return;

    const latBucket = Math.floor(lngLat.lat / this._heatmapResolution);
    const lngBucket = Math.floor(lngLat.lng / this._heatmapResolution);
    const key = `${latBucket},${lngBucket}`;

    const count = (this._heatmapGrid.get(key) || 0) + 1;
    this._heatmapGrid.set(key, count);

    // Update bounds
    this._heatmapBounds.minLat = Math.min(this._heatmapBounds.minLat, latBucket * this._heatmapResolution);
    this._heatmapBounds.maxLat = Math.max(this._heatmapBounds.maxLat, (latBucket + 1) * this._heatmapResolution);
    this._heatmapBounds.minLng = Math.min(this._heatmapBounds.minLng, lngBucket * this._heatmapResolution);
    this._heatmapBounds.maxLng = Math.max(this._heatmapBounds.maxLng, (lngBucket + 1) * this._heatmapResolution);
  }

  /**
   * Get interaction heatmap for UX analytics.
   * @returns {InteractionHeatmap}
   */
  getInteractionHeatmap() {
    const minLatBucket = Math.floor(this._heatmapBounds.minLat / this._heatmapResolution);
    const maxLatBucket = Math.floor(this._heatmapBounds.maxLat / this._heatmapResolution);
    const minLngBucket = Math.floor(this._heatmapBounds.minLng / this._heatmapResolution);
    const maxLngBucket = Math.floor(this._heatmapBounds.maxLng / this._heatmapResolution);

    const grid = [];
    for (let latBucket = minLatBucket; latBucket <= maxLatBucket; latBucket += 1) {
      const row = [];
      for (let lngBucket = minLngBucket; lngBucket <= maxLngBucket; lngBucket += 1) {
        const key = `${latBucket},${lngBucket}`;
        row.push(this._heatmapGrid.get(key) || 0);
      }
      grid.push(row);
    }

    return {
      resolution: this._heatmapResolution,
      grid,
      bounds: this._heatmapBounds,
    };
  }

  /**
   * Check if engine is destroyed.
   * @returns {boolean}
   */
  isDestroyed() {
    return this._destroyed;
  }

  /**
   * Clean up everything.
   */
  destroy() {
    this._destroyed = true;

    // Cleanup abort controllers
    if (this._clickAbortController) {
      this._clickAbortController.abort();
      this._clickAbortController = null;
    }
    if (this._contextMenuAbortController) {
      this._contextMenuAbortController.abort();
      this._contextMenuAbortController = null;
    }

    // Cleanup popups
    if (this._popupRootRef) {
      try { this._popupRootRef.unmount(); } catch (e) { /* ignored */ }
      this._popupRootRef = null;
    }
    if (this._popupRef) {
      this._popupRef.remove();
      this._popupRef = null;
    }

    // Cleanup tooltips
    this._hideTooltip();

    // Cleanup context menus
    this._hideContextMenu();

    // Cleanup box select
    if (this._boxSelectUnsubscribe) {
      this._boxSelectUnsubscribe();
      this._boxSelectUnsubscribe = null;
    }
    if (this._boxSelectState?.rect) {
      this._boxSelectState.rect.remove();
    }
    this._boxSelectState = null;

    // Cleanup measure tool
    if (this._measureUnsubscribe) {
      this._measureUnsubscribe();
      this._measureUnsubscribe = null;
    }

    // Clear event handlers & callbacks
    this._eventHandlers.clear();
    this._popupOpenCallbacks.length = 0;
    this._popupCloseCallbacks.length = 0;

    // Reset state
    this._popupSessionId = 0;
    this._lastRequestTime = 0;
    this._interactionMode = 'default';
    this._heatmapGrid.clear();
    this._heatmapBounds = { minLat: Infinity, maxLat: -Infinity, minLng: Infinity, maxLng: -Infinity };
  }
}

// Singleton
export default new InteractionEngine();
