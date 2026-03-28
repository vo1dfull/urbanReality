// ================================================
// core/FrameController.js — Global Animation Frame Controller
// ✅ ONE loop for all animations (flood, coverage, camera, etc.)
// ✅ Auto-pauses when tab is hidden (visibilitychange)
// ✅ Prevents runaway CPU from independent rAF/setInterval loops
// ================================================

class FrameController {
  constructor() {
    this._tasks = new Map(); // id → { fn, interval, lastRun }
    this._running = false;
    this._rafId = null;
    this._nextId = 0;

    // Auto-pause when tab is hidden
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.stop();
        } else if (this._tasks.size > 0) {
          this.start();
        }
      });
    }
  }

  /**
   * Add a task to the global loop.
   * @param {Function} fn — called every frame (receives timestamp)
   * @param {number} interval — minimum ms between calls (0 = every frame)
   * @returns {number} task ID for removal
   */
  add(fn, interval = 0) {
    const id = ++this._nextId;
    this._tasks.set(id, { fn, interval, lastRun: 0 });
    this.start();
    return id;
  }

  /**
   * Remove a task by ID.
   */
  remove(id) {
    this._tasks.delete(id);
    if (this._tasks.size === 0) {
      this.stop();
    }
  }

  /**
   * Start the global loop (no-op if already running).
   */
  start() {
    if (this._running) return;
    this._running = true;

    const loop = (timestamp) => {
      if (!this._running) return;

      for (const [, task] of this._tasks) {
        if (task.interval > 0) {
          if (timestamp - task.lastRun >= task.interval) {
            task.lastRun = timestamp;
            try { task.fn(timestamp); } catch (e) { console.error('[FrameController] Task error:', e); }
          }
        } else {
          try { task.fn(timestamp); } catch (e) { console.error('[FrameController] Task error:', e); }
        }
      }

      this._rafId = requestAnimationFrame(loop);
    };

    this._rafId = requestAnimationFrame(loop);
  }

  /**
   * Stop the global loop.
   */
  stop() {
    if (!this._running) return;
    this._running = false;
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  /**
   * Check if loop is active.
   */
  isRunning() {
    return this._running;
  }

  /**
   * Remove all tasks and stop.
   */
  destroy() {
    this._tasks.clear();
    this.stop();
  }
}

// Singleton
export default new FrameController();
