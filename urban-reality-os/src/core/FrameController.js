// ================================================
// core/FrameController.js — High-Performance Animation Controller
// 🔥 PERF: Frame-budget aware — skips low-priority tasks when over budget
// 🔥 PERF: Ring buffer for FPS (no Array.shift allocation)
// 🔥 PERF: Priority system (critical > normal > idle)
// 🔥 PERF: Auto-downclocks idle tasks on low FPS
// 🔥 PERF: Zero allocation in hot loop (pre-allocated objects)
// ================================================

/** @type {number} Target frame time in ms (60fps) */
const FRAME_BUDGET_MS = 16.0;

/** @type {number} Minimum FPS before triggering quality reduction */
const LOW_FPS_THRESHOLD = 30;

/** @type {number} Ring buffer size for FPS samples */
const FPS_RING_SIZE = 64; // power of 2 for fast modulo

/** @typedef {'critical'|'normal'|'idle'} TaskPriority */
const PRIORITY_CRITICAL = 0;
const PRIORITY_NORMAL = 1;
const PRIORITY_IDLE = 2;

const PRIORITY_MAP = { critical: PRIORITY_CRITICAL, normal: PRIORITY_NORMAL, idle: PRIORITY_IDLE };

class FrameController {
  constructor() {
    this._tasks = new Map();
    this._running = false;
    this._paused = false;
    this._rafId = null;
    this._nextId = 0;
    this._destroyed = false;

    // Pre-sorted task arrays by priority (rebuilt on add/remove)
    this._criticalTasks = [];
    this._normalTasks = [];
    this._idleTasks = [];
    this._tasksDirty = false;

    // FPS tracking — ring buffer (no allocation)
    this._fpsRing = new Float64Array(FPS_RING_SIZE);
    this._fpsRingIdx = 0;
    this._fpsRingFilled = 0;
    this._lastFrameTime = 0;
    this._fps = 60;
    this._fpsCallbacks = [];
    this._fpsUpdateCounter = 0;

    // Frame budget tracking
    this._frameBudgetExceeded = 0; // consecutive frames over budget
    this._idleMultiplier = 1; // increases on low FPS to skip idle tasks

    // Pre-allocated emit object (avoid GC)
    this._fpsEvent = { fps: 60, isLow: false };

    // Visibility handler
    this._visibilityHandler = () => {
      if (document.hidden) {
        this._stopLoop();
      } else if (this._tasks.size > 0 && !this._paused) {
        this._startLoop();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this._visibilityHandler);
    }
  }

  /**
   * Add a task to the global loop.
   * @param {Function} fn
   * @param {number} interval — minimum ms between calls (0 = every frame)
   * @param {string} [label]
   * @param {TaskPriority} [priority='normal']
   * @returns {number} task ID
   */
  add(fn, interval = 0, label = '', priority = 'normal') {
    if (this._destroyed) return -1;
    const id = ++this._nextId;
    this._tasks.set(id, {
      fn,
      interval,
      lastRun: 0,
      label: label || `task-${id}`,
      priority: PRIORITY_MAP[priority] ?? PRIORITY_NORMAL,
    });
    this._tasksDirty = true;
    if (!this._paused) this._startLoop();
    return id;
  }

  /**
   * Remove a task by ID.
   */
  remove(id) {
    this._tasks.delete(id);
    this._tasksDirty = true;
    if (this._tasks.size === 0) this._stopLoop();
  }

  pause() {
    this._paused = true;
    this._stopLoop();
  }

  resume() {
    this._paused = false;
    if (this._tasks.size > 0 && !document.hidden) this._startLoop();
  }

  isPaused() { return this._paused; }

  onFPS(cb) {
    this._fpsCallbacks.push(cb);
    return () => {
      const idx = this._fpsCallbacks.indexOf(cb);
      if (idx >= 0) this._fpsCallbacks.splice(idx, 1);
    };
  }

  getFPS() { return this._fps; }
  isLowFPS() { return this._fps < LOW_FPS_THRESHOLD; }

  /**
   * Rebuild priority-sorted task arrays from the map.
   * Only called when tasks change (add/remove), NOT every frame.
   * @private
   */
  _rebuildTaskArrays() {
    this._criticalTasks.length = 0;
    this._normalTasks.length = 0;
    this._idleTasks.length = 0;
    for (const task of this._tasks.values()) {
      if (task.priority === PRIORITY_CRITICAL) this._criticalTasks.push(task);
      else if (task.priority === PRIORITY_NORMAL) this._normalTasks.push(task);
      else this._idleTasks.push(task);
    }
    this._tasksDirty = false;
  }

  /**
   * @private
   */
  _startLoop() {
    if (this._running) return;
    this._running = true;
    this._lastFrameTime = performance.now();

    const loop = (timestamp) => {
      if (!this._running) return;

      // ── FPS tracking (ring buffer — zero allocation) ──
      const delta = timestamp - this._lastFrameTime;
      this._lastFrameTime = timestamp;
      this._fpsRing[this._fpsRingIdx] = delta;
      this._fpsRingIdx = (this._fpsRingIdx + 1) & (FPS_RING_SIZE - 1); // fast modulo
      if (this._fpsRingFilled < FPS_RING_SIZE) this._fpsRingFilled++;

      this._fpsUpdateCounter++;
      if (this._fpsUpdateCounter >= 30) {
        this._fpsUpdateCounter = 0;
        let sum = 0;
        for (let i = 0; i < this._fpsRingFilled; i++) sum += this._fpsRing[i];
        const avg = sum / this._fpsRingFilled;
        this._fps = avg > 0 ? (1000 / avg + 0.5) | 0 : 60; // fast round

        // Adaptive idle multiplier
        if (this._fps < 25) {
          this._idleMultiplier = 4; // run idle tasks 4× less often
          this._frameBudgetExceeded++;
        } else if (this._fps < 40) {
          this._idleMultiplier = 2;
          this._frameBudgetExceeded = Math.max(0, this._frameBudgetExceeded - 1);
        } else {
          this._idleMultiplier = 1;
          this._frameBudgetExceeded = 0;
        }

        // Notify FPS subscribers (reuse object)
        this._fpsEvent.fps = this._fps;
        this._fpsEvent.isLow = this._fps < LOW_FPS_THRESHOLD;
        for (let i = 0; i < this._fpsCallbacks.length; i++) {
          try { this._fpsCallbacks[i](this._fpsEvent); } catch (_) {}
        }
      }

      // Rebuild task arrays if dirty
      if (this._tasksDirty) this._rebuildTaskArrays();

      const frameStart = performance.now();

      // ── CRITICAL tasks: ALWAYS run ──
      for (let i = 0; i < this._criticalTasks.length; i++) {
        const task = this._criticalTasks[i];
        if (task.interval > 0) {
          if (timestamp - task.lastRun < task.interval) continue;
          task.lastRun = timestamp;
        }
        try { task.fn(timestamp); } catch (e) { console.error('[FC] Critical task error:', e); }
      }

      // ── NORMAL tasks: run if within budget ──
      const afterCritical = performance.now();
      const criticalCost = afterCritical - frameStart;
      const remainingBudget = FRAME_BUDGET_MS - criticalCost;

      if (remainingBudget > 2) {
        for (let i = 0; i < this._normalTasks.length; i++) {
          const task = this._normalTasks[i];
          if (task.interval > 0) {
            if (timestamp - task.lastRun < task.interval) continue;
            task.lastRun = timestamp;
          }
          try { task.fn(timestamp); } catch (e) { console.error('[FC] Normal task error:', e); }

          // Check budget after each task
          if (performance.now() - frameStart > FRAME_BUDGET_MS) break;
        }
      }

      // ── IDLE tasks: only run if budget remains AND not throttled ──
      const afterNormal = performance.now();
      const totalCost = afterNormal - frameStart;

      if (totalCost < FRAME_BUDGET_MS * 0.75) {
        for (let i = 0; i < this._idleTasks.length; i++) {
          const task = this._idleTasks[i];
          const adjustedInterval = task.interval * this._idleMultiplier;
          if (adjustedInterval > 0) {
            if (timestamp - task.lastRun < adjustedInterval) continue;
            task.lastRun = timestamp;
          }
          try { task.fn(timestamp); } catch (e) { console.error('[FC] Idle task error:', e); }

          if (performance.now() - frameStart > FRAME_BUDGET_MS) break;
        }
      }

      this._rafId = requestAnimationFrame(loop);
    };

    this._rafId = requestAnimationFrame(loop);
  }

  _stopLoop() {
    if (!this._running) return;
    this._running = false;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  start() { if (!this._paused) this._startLoop(); }
  stop() { this._stopLoop(); }
  isRunning() { return this._running; }
  getTaskCount() { return this._tasks.size; }

  getStats() {
    return {
      taskCount: this._tasks.size,
      running: this._running,
      paused: this._paused,
      fps: this._fps,
      isLowFPS: this.isLowFPS(),
      idleMultiplier: this._idleMultiplier,
      tasks: Array.from(this._tasks.values()).map(t => t.label),
    };
  }

  destroy() {
    this._destroyed = true;
    this._tasks.clear();
    this._stopLoop();
    this._fpsCallbacks.length = 0;
    this._criticalTasks.length = 0;
    this._normalTasks.length = 0;
    this._idleTasks.length = 0;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
    }
  }
}

export default new FrameController();
