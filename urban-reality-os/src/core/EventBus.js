// ================================================
// core/EventBus.js — Central decoupled event system
// ✅ Map emits events → hooks subscribe (no duplicate listeners)
// ✅ Wildcard support via '*'
// ✅ One-time subscriptions via .once()
// ================================================

class EventBusClass {
  constructor() {
    this._listeners = {};
  }

  on(event, cb) {
    if (!this._listeners[event]) {
      this._listeners[event] = new Set();
    }
    this._listeners[event].add(cb);
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
    this._listeners[event]?.delete(cb);
  }

  emit(event, data) {
    this._listeners[event]?.forEach((cb) => {
      try { cb(data); } catch (e) { console.error(`[EventBus] Error in "${event}" handler:`, e); }
    });
    this._listeners['*']?.forEach((cb) => {
      try { cb({ event, data }); } catch (e) { console.error('[EventBus] Wildcard error:', e); }
    });
  }

  clear(event) {
    if (event) {
      delete this._listeners[event];
    } else {
      this._listeners = {};
    }
  }
}

// Singleton
const eventBus = new EventBusClass();
export default eventBus;

// ── Canonical event names ──
export const EVENTS = {
  MAP_READY: 'map:ready',
  MAP_STYLE_CHANGE: 'map:style-change',
  MAP_CLICK: 'map:click',
  MAP_MOVE: 'map:move',
  MAP_ZOOM: 'map:zoom',
  LAYER_TOGGLED: 'layer:toggled',
  LAYERS_SYNCED: 'layers:synced',
  LOCATION_SELECTED: 'location:selected',
  LOCATION_DATA_READY: 'location:data-ready',
  ANALYSIS_READY: 'analysis:ready',
  FLOOD_STARTED: 'flood:started',
  FLOOD_STOPPED: 'flood:stopped',
  FLOOD_TICK: 'flood:tick',
  FACILITY_HOVERED: 'facility:hovered',
  FACILITY_COVERAGE_RENDERED: 'facility:coverage-rendered',
  FLY_THROUGH_STARTED: 'camera:fly-through-started',
  FLY_THROUGH_STOPPED: 'camera:fly-through-stopped',
};
