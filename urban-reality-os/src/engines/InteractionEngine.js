// ================================================
// InteractionEngine — Click, hover, popup lifecycle
// Pure JS — manages popup React root externally
// ✅ isDestroyed guard prevents post-destroy updates
// ✅ Statistics tracking for debug panel
// ================================================
import maplibregl from 'maplibre-gl';
import { createRoot } from 'react-dom/client';

class InteractionEngine {
  constructor() {
    this._popupRef = null;
    this._popupRootRef = null;
    this._popupSessionId = 0;
    this._lastRequestTime = 0;
    this._clickAbortController = null;
    this._eventHandlers = new Map();
    this._destroyed = false;

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

    popup.on('close', () => {
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
   * @param {maplibregl.Map} map
   * @param {string} event
   * @param {string|null} layerId
   * @param {Function} handler
   * @returns {string}
   */
  attachEvent(map, event, layerId, handler) {
    const key = `${event}:${layerId || 'map'}:${Date.now()}`;
    if (layerId) {
      map.on(event, layerId, handler);
    } else {
      map.on(event, handler);
    }
    this._eventHandlers.set(key, { event, layerId, handler });
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

  /**
   * Clean up everything.
   */
  destroy() {
    this._destroyed = true;
    if (this._clickAbortController) {
      this._clickAbortController.abort();
      this._clickAbortController = null;
    }
    if (this._popupRootRef) {
      try { this._popupRootRef.unmount(); } catch (e) { /* ignored */ }
      this._popupRootRef = null;
    }
    if (this._popupRef) {
      this._popupRef.remove();
      this._popupRef = null;
    }
    this._eventHandlers.clear();
    this._popupSessionId = 0;
    this._lastRequestTime = 0;
  }
}

// Singleton
export default new InteractionEngine();
