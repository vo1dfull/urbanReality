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
    this._started = false;
    this._battery = { level: 1, charging: true, supported: false };
    this._thermalRisk = 'low';
    this._fpsWindow = [];
    this._deviceProfile = {
      memory: navigator.deviceMemory || 8,
      cores: navigator.hardwareConcurrency || 8,
    };

    this._classifyDevice();
    this.init();
  }

  init() {
    if (this._started) return this;
    this._started = true;
    this._initBatteryAwareness();
    this._startWatchdog();
    return this;
  }

  start() {
    this.init();
  }

  stop() {
    this._started = false;
    if (this._watchdogTaskId !== null) {
      FrameController.remove(this._watchdogTaskId);
      this._watchdogTaskId = null;
    }
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
      this._fpsWindow.push(fps);
      if (this._fpsWindow.length > 20) this._fpsWindow.shift();

      const now = Date.now();
      const predictedDrop = this._predictDrop();

      if ((fps < 24 || predictedDrop) && now - this._lastDowngradeAt > 8000) {
        this._lastDowngradeAt = now;
        this._thermalRisk = this._estimateThermalRisk();
        this._emit({
          type: 'degrade',
          tier: this._tier,
          fps,
          reason: predictedDrop ? 'predictive_drop' : 'watchdog_low_fps',
          thermalRisk: this._thermalRisk,
          battery: this._battery,
        });
      }
    }, 1000, 'perf-watchdog', 'critical');
  }

  async _initBatteryAwareness() {
    try {
      if (navigator.getBattery) {
        const b = await navigator.getBattery();
        this._battery = { level: b.level, charging: b.charging, supported: true };
        const update = () => {
          this._battery = { level: b.level, charging: b.charging, supported: true };
          if (!b.charging && b.level < 0.2) {
            this._emit({ type: 'battery_low', level: b.level });
          }
        };
        b.addEventListener('levelchange', update);
        b.addEventListener('chargingchange', update);
      }
    } catch (_) {}
  }

  _predictDrop() {
    if (this._fpsWindow.length < 6) return false;
    const recent = this._fpsWindow[this._fpsWindow.length - 1];
    const older = this._fpsWindow[Math.max(0, this._fpsWindow.length - 6)];
    return recent < older - 8;
  }

  _estimateThermalRisk() {
    const avg = this._fpsWindow.length
      ? this._fpsWindow.reduce((a, b) => a + b, 0) / this._fpsWindow.length
      : 60;
    if (!this._battery.charging && this._battery.level < 0.25 && avg < 35) return 'high';
    if (avg < 42) return 'medium';
    return 'low';
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
    const batteryConstrained = this._battery.supported && !this._battery.charging && this._battery.level < 0.25;

    if (this._tier === 'low') {
      return { floodPointBudget: 900, buildingBudget: 80, uiEffects: false, geometryDensity: 0.55, effectsScale: 0.6 };
    }
    if (this._tier === 'high') {
      return {
        floodPointBudget: batteryConstrained ? 2100 : 2600,
        buildingBudget: batteryConstrained ? 180 : 220,
        uiEffects: !batteryConstrained,
        geometryDensity: batteryConstrained ? 0.85 : 1,
        effectsScale: batteryConstrained ? 0.8 : 1,
      };
    }
    return {
      floodPointBudget: batteryConstrained ? 1500 : 2000,
      buildingBudget: batteryConstrained ? 120 : 140,
      uiEffects: !batteryConstrained,
      geometryDensity: batteryConstrained ? 0.8 : 0.9,
      effectsScale: batteryConstrained ? 0.75 : 0.9,
    };
  }

  getDeviceProfile() {
    return {
      ...this._deviceProfile,
      tier: this._tier,
      battery: this._battery,
      thermalRisk: this._thermalRisk,
    };
  }

  destroy() {
    this.stop();
    this._listeners.clear();
  }
}

export default new PerformanceManager();
