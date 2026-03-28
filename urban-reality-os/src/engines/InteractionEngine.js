// ================================================
// InteractionEngine — Click, hover, popup lifecycle
// Pure JS — manages popup React root externally
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
  }

  /**
   * Initialize the popup instance.
   * @param {maplibregl.Popup} popup
   */
  initPopup(popup) {
    this._popupRef = popup;

    // Setup close handler
    popup.on('close', () => {
      try {
        if (this._popupRootRef) {
          this._popupRootRef.unmount();
          this._popupRootRef = null;
        }
      } catch (e) {
        console.warn('[InteractionEngine] Popup unmount failed:', e);
      }
    });
  }

  /**
   * Create a new popup session (increments counter, returns ID).
   */
  newSession() {
    return ++this._popupSessionId;
  }

  /**
   * Get current session ID.
   */
  getSessionId() {
    return this._popupSessionId;
  }

  /**
   * Check if a session is still the current one (guards stale updates).
   */
  isCurrentSession(sessionId) {
    return this._popupSessionId === sessionId;
  }

  /**
   * Track request time for race condition prevention.
   */
  markRequestTime() {
    this._lastRequestTime = Date.now();
    return this._lastRequestTime;
  }

  /**
   * Check if a request time is still the latest.
   */
  isLatestRequest(requestTime) {
    return this._lastRequestTime === requestTime;
  }

  /**
   * Get a new AbortController, cancelling any previous one.
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
    if (!this._popupRef || !map) return;

    try {
      // Clean up previous root
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
    } catch (err) {
      console.warn('[InteractionEngine] showPopup error:', err);
    }
  }

  /**
   * Update the current popup's content (re-render React root).
   * @param {React.ReactElement} element
   */
  updatePopup(element) {
    if (!this._popupRootRef) return;
    try {
      if (this._popupRef && this._popupRef.isOpen()) {
        this._popupRootRef.render(element);
      }
    } catch (err) {
      console.warn('[InteractionEngine] updatePopup error:', err);
    }
  }

  /**
   * Check if popup is currently open.
   */
  isPopupOpen() {
    return this._popupRef && this._popupRef.isOpen();
  }

  /**
   * Get the popup root for conditional rendering checks.
   */
  getPopupRoot() {
    return this._popupRootRef;
  }

  /**
   * Attach a map event handler with tracking for cleanup.
   * @param {maplibregl.Map} map
   * @param {string} event
   * @param {string|null} layerId — null for map-level events
   * @param {Function} handler
   * @returns {string} — key for later removal
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

  /**
   * Remove a tracked event handler.
   */
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

  /**
   * Remove all tracked event handlers.
   */
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
   * Clean up everything.
   */
  destroy() {
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
