// ================================================
// DisasterEngine — Real-time disaster simulation
// Evolves NASA EONET events: growth, movement, intensity
// Uses FrameController for the game loop (not setInterval)
// ================================================
import FrameController from '../core/FrameController';
import { createLogger } from '../core/Logger';

const log = createLogger('DisasterEngine');

/** Growth rate multipliers per category */
const GROWTH_RATES = {
  wildfires:    0.08,  // fast spread
  floods:       0.05,
  severeStorms: 0.12,  // fastest — storms move
  volcanoes:    0.02,  // slow but relentless
  drought:      0.01,  // very slow
};

/** Speed multipliers (degrees/tick) per category */
const SPEED = {
  wildfires:    0.008,
  floods:       0.004,
  severeStorms: 0.018,
  volcanoes:    0.001,
  drought:      0.0005,
};

/** Player mitigation factors applied per city intervention */
const MITIGATION = {
  fireStation:  { wildfires: 0.5 },
  drainage:     { floods: 0.5 },
  greenZone:    { drought: 0.4, wildfires: 0.7 },
};

class DisasterEngine {
  constructor() {
    /** @type {Map<string, object>} id → disaster state */
    this.activeDisasters = new Map();
    this._taskId = null;
    this._onUpdate = null; // callback(disasters[]) after each tick
    this._tickCount = 0;
  }

  /**
   * Seed a disaster from a NASA EONET GeoJSON feature.
   * Idempotent — calling twice with the same id is a no-op.
   * @param {GeoJSONFeature} feature
   */
  createDisaster(feature) {
    const id = feature.properties?.id;
    if (!id || this.activeDisasters.has(id)) return;

    const category = feature.properties?.category ?? 'unknown';
    const baseRadius = feature.properties?.impactRadius ?? 20;

    this.activeDisasters.set(id, {
      id,
      // Deep-copy geometry so we can mutate coordinates
      geometry: {
        type: 'Point',
        coordinates: [...(feature.geometry?.coordinates ?? [0, 0])],
      },
      properties: { ...feature.properties },
      intensity:  1.0,
      radius:     baseRadius,
      growthRate: GROWTH_RATES[category] ?? 0.03,
      speed:      SPEED[category] ?? 0.005,
      direction:  Math.random() * Math.PI * 2, // radians
      alive:      true,
      category,
      ticksAlive: 0,
    });
  }

  /**
   * Advance all disasters by one simulation tick.
   * Called by FrameController — must be fast.
   * @param {object} [cityInterventions] — { fireStation, drainage, greenZone }
   */
  update(cityInterventions = {}) {
    this._tickCount++;

    for (const d of this.activeDisasters.values()) {
      if (!d.alive) continue;

      // Apply player mitigations
      let growthRate = d.growthRate;
      for (const [intervention, factors] of Object.entries(MITIGATION)) {
        if (cityInterventions[intervention] && factors[d.category] != null) {
          growthRate *= factors[d.category];
        }
      }

      // Grow radius
      d.radius += growthRate;

      // Increase intensity (capped at 10)
      d.intensity = Math.min(10, d.intensity + 0.02);

      // Move in current direction (wind/flow simulation)
      const speed = d.speed;
      d.geometry.coordinates[0] += Math.cos(d.direction) * speed;
      d.geometry.coordinates[1] += Math.sin(d.direction) * speed;

      // Slight direction drift (realistic meandering)
      d.direction += (Math.random() - 0.5) * 0.05;

      d.ticksAlive++;

      // Update properties for rendering
      d.properties.radius    = d.radius;
      d.properties.intensity = d.intensity;
      d.properties.severity  = Math.min(1, d.intensity / 10);
    }

    if (this._onUpdate) {
      try { this._onUpdate(this.getAll()); } catch (_) {}
    }
  }

  /**
   * Get all active disasters as GeoJSON features.
   * @returns {GeoJSONFeature[]}
   */
  getAll() {
    return Array.from(this.activeDisasters.values()).map(d => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [...d.geometry.coordinates] },
      properties: { ...d.properties, radius: d.radius, intensity: d.intensity },
    }));
  }

  /**
   * Start the FrameController game loop.
   * @param {Function} onUpdate — called after each tick with updated features
   * @param {Function} [getCityInterventions] — returns current intervention state
   */
  startLoop(onUpdate, getCityInterventions) {
    if (this._taskId !== null) return;
    this._onUpdate = onUpdate;

    // Run at ~10fps (100ms interval) — enough for smooth simulation, cheap on CPU
    this._taskId = FrameController.add(
      () => this.update(getCityInterventions?.() ?? {}),
      100,
      'disaster-sim',
      'normal'
    );
    log.info('DisasterEngine loop started');
  }

  stopLoop() {
    if (this._taskId !== null) {
      FrameController.remove(this._taskId);
      this._taskId = null;
    }
    this._onUpdate = null;
    log.info('DisasterEngine loop stopped');
  }

  clear() {
    this.activeDisasters.clear();
  }

  destroy() {
    this.stopLoop();
    this.clear();
  }
}

export default new DisasterEngine();
