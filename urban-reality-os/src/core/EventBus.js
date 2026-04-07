// ================================================
// core/EventBus.js — Enterprise event system
// ✅ Backward-compatible on/off/emit/emitDeferred APIs
// ✅ Wildcard namespaces: map:* and *
// ✅ Event history/replay + latency tracing
// ✅ Priority queue batching + lifecycle hooks
// ✅ Listener fault isolation with circuit breaker
// ================================================

const HISTORY_LIMIT = 1000;
const PRIORITY = { high: 0, normal: 1, low: 2 };

class EventBusClass {
  constructor() {
    this._listeners = new Map();
    this._emitCount = 0;
    this._deferredQueue = [];
    this._deferScheduled = false;

    this._history = new Array(HISTORY_LIMIT);
    this._historySize = 0;
    this._historyIdx = 0;

    this._priorityQueues = [[], [], []];
    this._priorityScheduled = false;
    this._traceEnabled = true;
    this._traceSubscribers = new Set();
    this._listenerFailures = new WeakMap();
    this._started = true;
  }

  init() {
    this._started = true;
    return this;
  }

  start() {
    this._started = true;
  }

  stop() {
    this._started = false;
  }

  destroy() {
    this.stop();
    this.clear();
    this._traceSubscribers.clear();
    this._deferredQueue.length = 0;
    this._priorityQueues[0].length = 0;
    this._priorityQueues[1].length = 0;
    this._priorityQueues[2].length = 0;
    this._historySize = 0;
    this._historyIdx = 0;
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
    if (!this._started) return;
    this._emitCount++;
    const startedAt = performance.now();

    this._emitToArray(event, this._listeners.get(event), data);

    // Namespace wildcard support: map:move -> map:* plus global *
    const namespaceIdx = event.indexOf(':');
    if (namespaceIdx > 0) {
      const nsEvent = `${event.slice(0, namespaceIdx)}:*`;
      this._emitToArray(nsEvent, this._listeners.get(nsEvent), data);
    }
    if (event !== '*') {
      this._emitToArray('*', this._listeners.get('*'), { event, data });
    }

    if (this._traceEnabled) {
      const duration = performance.now() - startedAt;
      this._pushHistory({
        ts: Date.now(),
        event,
        duration,
        listenerCount: this.listenerCount(event),
      });
      const trace = { event, duration, ts: Date.now() };
      for (const cb of this._traceSubscribers) {
        try { cb(trace); } catch (_) {}
      }
    }
  }

  _emitToArray(eventName, arr, data) {
    if (!arr || arr.length === 0) return;

    for (let i = 0, len = arr.length; i < len; i++) {
      const cb = arr[i];
      if (!this._canRunListener(cb)) continue;
      const start = performance.now();
      try {
        cb(data);
        this._markListenerSuccess(cb);
      } catch (e) {
        this._markListenerFailure(cb);
        console.error(`[EventBus] Error in "${eventName}":`, e);
      }
      if (this._traceEnabled && this._traceSubscribers.size > 0) {
        const listenerDuration = performance.now() - start;
        if (listenerDuration > 8) {
          const trace = { event: eventName, phase: 'listener', duration: listenerDuration, ts: Date.now() };
          for (const sub of this._traceSubscribers) {
            try { sub(trace); } catch (_) {}
          }
        }
      }
    }
  }

  _canRunListener(cb) {
    const state = this._listenerFailures.get(cb);
    if (!state) return true;
    if (!state.openUntil) return true;
    return Date.now() >= state.openUntil;
  }

  _markListenerSuccess(cb) {
    const state = this._listenerFailures.get(cb);
    if (!state) return;
    state.failures = 0;
    state.openUntil = 0;
  }

  _markListenerFailure(cb) {
    let state = this._listenerFailures.get(cb);
    if (!state) {
      state = { failures: 0, openUntil: 0 };
      this._listenerFailures.set(cb, state);
    }
    state.failures++;
    if (state.failures >= 5) {
      state.openUntil = Date.now() + 10_000;
    }
  }

  /**
   * Safe emit with error handling — use for user-facing events.
   * @param {string} event
   * @param {*} data
   */
  emitSafe(event, data) {
    if (!this._started) return;
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
    if (!this._started) return;
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
    if (!this._started) return;
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

  emitQueued(event, data, priority = 'normal') {
    if (!this._started) return;
    const p = PRIORITY[priority] ?? PRIORITY.normal;
    this._priorityQueues[p].push(event, data);
    if (this._priorityScheduled) return;
    this._priorityScheduled = true;
    queueMicrotask(() => {
      this._priorityScheduled = false;
      for (let pr = 0; pr < this._priorityQueues.length; pr++) {
        const q = this._priorityQueues[pr];
        for (let i = 0; i < q.length; i += 2) {
          this.emit(q[i], q[i + 1]);
        }
        q.length = 0;
      }
    });
  }

  subscribeTrace(cb) {
    this._traceSubscribers.add(cb);
    return () => this._traceSubscribers.delete(cb);
  }

  enableTracing(enabled) {
    this._traceEnabled = !!enabled;
  }

  _pushHistory(item) {
    this._history[this._historyIdx] = item;
    this._historyIdx = (this._historyIdx + 1) % HISTORY_LIMIT;
    if (this._historySize < HISTORY_LIMIT) this._historySize++;
  }

  getHistory(limit = 100) {
    const count = Math.min(limit, this._historySize);
    const out = new Array(count);
    for (let i = 0; i < count; i++) {
      const idx = (this._historyIdx - 1 - i + HISTORY_LIMIT) % HISTORY_LIMIT;
      out[count - 1 - i] = this._history[idx];
    }
    return out;
  }

  replay(event, listener, limit = 50) {
    if (typeof listener !== 'function') return;
    const history = this.getHistory(limit);
    for (let i = 0; i < history.length; i++) {
      const item = history[i];
      if (item.event === event) {
        try { listener(item); } catch (_) {}
      }
    }
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
    return {
      events,
      totalListeners,
      emitCount: this._emitCount,
      queuedEvents: this._priorityQueues[0].length + this._priorityQueues[1].length + this._priorityQueues[2].length,
      deferredEvents: this._deferredQueue.length / 2,
      historySize: this._historySize,
      tracing: this._traceEnabled,
    };
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
