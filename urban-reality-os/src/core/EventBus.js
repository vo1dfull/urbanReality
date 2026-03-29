// ================================================
// core/EventBus.js — High-Performance Event System
// 🔥 PERF: Fast-path emit (no try-catch unless error)
// 🔥 PERF: Batch emit for high-frequency events
// 🔥 PERF: Deferred emit via microtask (non-blocking)
// 🔥 PERF: No object allocation in hot paths
// ================================================

class EventBusClass {
  constructor() {
    /** @type {Map<string, Function[]>} Using arrays for faster iteration than Set */
    this._listeners = new Map();
    this._emitCount = 0;
    this._deferredQueue = [];
    this._deferScheduled = false;
  }

  /**
   * Subscribe to an event.
   * @param {string} event
   * @param {Function} cb
   * @returns {Function} unsubscribe
   */
  on(event, cb) {
    let arr = this._listeners.get(event);
    if (!arr) {
      arr = [];
      this._listeners.set(event, arr);
    }
    arr.push(cb);
    return () => this.off(event, cb);
  }

  once(event, cb) {
    const wrapper = (data) => {
      cb(data);
      this.off(event, wrapper);
    };
    return this.on(event, wrapper);
  }

  off(event, cb) {
    const arr = this._listeners.get(event);
    if (!arr) return;
    const idx = arr.indexOf(cb);
    if (idx >= 0) arr.splice(idx, 1);
    if (arr.length === 0) this._listeners.delete(event);
  }

  /**
   * Emit an event synchronously — fast path.
   * 🔥 No forEach, no try-catch in hot path, no wildcard check for common events.
   * @param {string} event
   * @param {*} data
   */
  emit(event, data) {
    this._emitCount++;
    const arr = this._listeners.get(event);
    if (!arr || arr.length === 0) return;

    // Fast path: most events have 1-2 listeners
    if (arr.length === 1) {
      arr[0](data);
      return;
    }
    if (arr.length === 2) {
      arr[0](data);
      arr[1](data);
      return;
    }

    // General path
    for (let i = 0, len = arr.length; i < len; i++) {
      arr[i](data);
    }
  }

  /**
   * Safe emit with error handling — use for user-facing events.
   * @param {string} event
   * @param {*} data
   */
  emitSafe(event, data) {
    this._emitCount++;
    const arr = this._listeners.get(event);
    if (!arr) return;
    for (let i = 0, len = arr.length; i < len; i++) {
      try { arr[i](data); } catch (e) { console.error(`[EventBus] Error in "${event}":`, e); }
    }
    // Wildcard
    const wild = this._listeners.get('*');
    if (wild && event !== '*') {
      for (let i = 0, len = wild.length; i < len; i++) {
        try { wild[i]({ event, data }); } catch (_) {}
      }
    }
  }

  /**
   * Deferred emit — batches events to a microtask.
   * 🔥 Use for high-frequency events (flood:tick, facility:hover).
   * Does NOT block the current frame.
   * @param {string} event
   * @param {*} data
   */
  emitDeferred(event, data) {
    this._deferredQueue.push(event, data); // flat array, 2 items per event
    if (!this._deferScheduled) {
      this._deferScheduled = true;
      queueMicrotask(() => {
        this._deferScheduled = false;
        const queue = this._deferredQueue;
        this._deferredQueue = [];
        for (let i = 0; i < queue.length; i += 2) {
          this.emit(queue[i], queue[i + 1]);
        }
      });
    }
  }

  async emitAsync(event, data) {
    this._emitCount++;
    const arr = this._listeners.get(event);
    if (!arr) return;
    const promises = [];
    for (let i = 0; i < arr.length; i++) {
      try {
        const result = arr[i](data);
        if (result && typeof result.then === 'function') promises.push(result);
      } catch (e) { console.error(`[EventBus] Error in async "${event}":`, e); }
    }
    if (promises.length > 0) await Promise.allSettled(promises);
  }

  listenerCount(event) {
    return this._listeners.get(event)?.length ?? 0;
  }

  getStats() {
    let totalListeners = 0;
    const events = [];
    for (const [key, arr] of this._listeners) {
      if (arr.length > 0) {
        events.push(key);
        totalListeners += arr.length;
      }
    }
    return { events, totalListeners, emitCount: this._emitCount };
  }

  clear(event) {
    if (event) {
      this._listeners.delete(event);
    } else {
      this._listeners.clear();
    }
  }
}

const eventBus = new EventBusClass();
export default eventBus;

// ── Canonical event names ──
export const EVENTS = {
  MAP_READY: 'map:ready',
  MAP_DESTROYED: 'map:destroyed',
  MAP_STYLE_CHANGE: 'map:style-change',
  MAP_STYLE_RECOVERED: 'map:style-recovered',
  MAP_CLICK: 'map:click',
  MAP_MOVE: 'map:move',
  MAP_ZOOM: 'map:zoom',
  MAP_ERROR: 'map:error',
  LAYER_TOGGLED: 'layer:toggled',
  LAYERS_SYNCED: 'layers:synced',
  LOCATION_SELECTED: 'location:selected',
  LOCATION_DATA_READY: 'location:data-ready',
  LOCATION_ERROR: 'location:error',
  ANALYSIS_STARTED: 'analysis:started',
  ANALYSIS_READY: 'analysis:ready',
  ANALYSIS_ERROR: 'analysis:error',
  FLOOD_STARTED: 'flood:started',
  FLOOD_STOPPED: 'flood:stopped',
  FLOOD_TICK: 'flood:tick',
  FACILITY_HOVERED: 'facility:hovered',
  FACILITY_COVERAGE_RENDERED: 'facility:coverage-rendered',
  FLY_THROUGH_STARTED: 'camera:fly-through-started',
  FLY_THROUGH_STOPPED: 'camera:fly-through-stopped',
  CAMERA_RESET: 'camera:reset',
  FPS_UPDATE: 'system:fps-update',
  QUALITY_CHANGE: 'system:quality-change',
  DEBUG_TOGGLE: 'system:debug-toggle',
};
