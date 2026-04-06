/**
 * Animation Timeline
 * Manages all animation phases: terrain, buildings, lighting, traffic
 * Clean normalized progress for each phase
 */
export class Timeline {
  constructor() {
    this.phases = {
      terrain: [0, 2.5],      // Ground and road fade in
      build: [2.5, 7],        // Buildings rise
      lights: [4.5, 9],       // Window lighting
      traffic: [6.5, 12.5],   // Traffic movement
    };
  }

  /**
   * Get normalized progress (0-1) for a phase
   */
  getProgress(t, [start, end]) {
    return Math.min(Math.max((t - start) / (end - start), 0), 1);
  }

  terrain(t) {
    return this.getProgress(t, this.phases.terrain);
  }

  build(t) {
    return this.getProgress(t, this.phases.build);
  }

  lights(t) {
    return this.getProgress(t, this.phases.lights);
  }

  traffic(t) {
    return this.getProgress(t, this.phases.traffic);
  }

  /**
   * Sky transition timing
   */
  sky(t) {
    return Math.min(t / 6, 1);
  }

  /**
   * Overall sequence completion
   */
  overall(t) {
    return Math.min(t / 12.5, 1);
  }
}
