import FrameController from './FrameController';

const LOW_END_MEMORY_GB = 4;
const LOW_END_CORES = 4;

class PerformanceManager {
  constructor() {
    this._tier = 'medium';
    this._safeMode = true;
    this._lastDowngradeAt = 0;
    this._watchdogTaskId = null;
    this._listeners = new Set();
    this._classifyDevice();
    this._startWatchdog();
  }

  _classifyDevice() {
    const memory = navigator.deviceMemory || 8;
    const cores = navigator.hardwareConcurrency || 8;
    const reducedMotion = typeof window !== 'undefined'
      && window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (memory <= LOW_END_MEMORY_GB || cores <= LOW_END_CORES || reducedMotion) {
      this._tier = 'low';
      return;
    }
    if (memory >= 8 && cores >= 8) {
      this._tier = 'high';
      return;
    }
    this._tier = 'medium';
  }

  _startWatchdog() {
    if (this._watchdogTaskId !== null) return;
    this._watchdogTaskId = FrameController.add(() => {
      const fps = FrameController.getFPS();
      const now = Date.now();
      if (fps < 24 && now - this._lastDowngradeAt > 8000) {
        this._lastDowngradeAt = now;
        this._emit({
          type: 'degrade',
          tier: this._tier,
          fps,
          reason: 'watchdog_low_fps',
        });
      }
    }, 1000, 'perf-watchdog', 'critical');
  }

  onEvent(cb) {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  _emit(payload) {
    for (const cb of this._listeners) {
      try { cb(payload); } catch (_) {}
    }
  }

  getTier() {
    return this._tier;
  }

  isSafeMode() {
    return this._safeMode;
  }

  setSafeMode(enabled) {
    this._safeMode = !!enabled;
    this._emit({ type: 'safe_mode', enabled: this._safeMode });
  }

  getConfig() {
    if (this._tier === 'low') {
      return { floodPointBudget: 900, buildingBudget: 80, uiEffects: false };
    }
    if (this._tier === 'high') {
      return { floodPointBudget: 2600, buildingBudget: 220, uiEffects: true };
    }
    return { floodPointBudget: 2000, buildingBudget: 140, uiEffects: true };
  }

  destroy() {
    if (this._watchdogTaskId !== null) {
      FrameController.remove(this._watchdogTaskId);
      this._watchdogTaskId = null;
    }
    this._listeners.clear();
  }
}

export default new PerformanceManager();
