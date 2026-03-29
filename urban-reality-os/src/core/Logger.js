// ================================================
// core/Logger.js — Dev-only structured logging system
// ✅ Conditional output (only in development)
// ✅ Module-scoped loggers with color coding
// ✅ Performance timing utilities
// ✅ Zero overhead in production (tree-shaken)
// ================================================

const IS_DEV = typeof import.meta !== 'undefined' && import.meta.env?.DEV;

/**
 * @typedef {'debug'|'info'|'warn'|'error'} LogLevel
 */

const LEVEL_PRIORITY = { debug: 0, info: 1, warn: 2, error: 3 };

/** Minimum level to output (configurable at runtime) */
let _minLevel = IS_DEV ? 'debug' : 'warn';

/** Color palette for module tags */
const MODULE_COLORS = [
  '#60a5fa', '#34d399', '#f472b6', '#fbbf24', '#a78bfa',
  '#f87171', '#38bdf8', '#4ade80', '#fb923c', '#e879f9',
];
let _colorIndex = 0;
const _moduleColorMap = new Map();

function getModuleColor(module) {
  if (!_moduleColorMap.has(module)) {
    _moduleColorMap.set(module, MODULE_COLORS[_colorIndex % MODULE_COLORS.length]);
    _colorIndex++;
  }
  return _moduleColorMap.get(module);
}

/**
 * Create a scoped logger for a module.
 * @param {string} module — e.g. 'MapEngine', 'useInteractions'
 * @returns {{debug: Function, info: Function, warn: Function, error: Function, time: Function, timeEnd: Function, group: Function, groupEnd: Function}}
 */
export function createLogger(module) {
  const color = getModuleColor(module);

  const shouldLog = (level) => {
    if (!IS_DEV) return level === 'error'; // Only errors in production
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[_minLevel];
  };

  const prefix = (level) => {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false, fractionalSecondDigits: 2 });
    return [`%c[${timestamp}] %c[${module}]%c`, 'color: #64748b', `color: ${color}; font-weight: bold`, 'color: inherit'];
  };

  const timers = new Map();

  return {
    debug(...args) {
      if (shouldLog('debug')) {
        const [fmt, ...styles] = prefix('debug');
        console.debug(fmt, ...styles, ...args);
      }
    },

    info(...args) {
      if (shouldLog('info')) {
        const [fmt, ...styles] = prefix('info');
        console.info(fmt, ...styles, ...args);
      }
    },

    warn(...args) {
      if (shouldLog('warn')) {
        const [fmt, ...styles] = prefix('warn');
        console.warn(fmt, ...styles, ...args);
      }
    },

    error(...args) {
      if (shouldLog('error')) {
        const [fmt, ...styles] = prefix('error');
        console.error(fmt, ...styles, ...args);
      }
    },

    /**
     * Start a performance timer.
     * @param {string} label
     */
    time(label) {
      if (!IS_DEV) return;
      timers.set(label, performance.now());
    },

    /**
     * End a performance timer and log the duration.
     * @param {string} label
     * @param {number} [warnThreshold=50] — ms threshold for warning
     */
    timeEnd(label, warnThreshold = 50) {
      if (!IS_DEV) return;
      const start = timers.get(label);
      if (start === undefined) return;
      timers.delete(label);
      const duration = performance.now() - start;
      const [fmt, ...styles] = prefix('debug');
      if (duration > warnThreshold) {
        console.warn(fmt, ...styles, `⏱ ${label}: ${duration.toFixed(2)}ms (SLOW)`);
      } else {
        console.debug(fmt, ...styles, `⏱ ${label}: ${duration.toFixed(2)}ms`);
      }
    },

    /**
     * Start a collapsed console group.
     * @param {string} label
     */
    group(label) {
      if (!IS_DEV) return;
      const [fmt, ...styles] = prefix('debug');
      console.groupCollapsed(fmt + ' ' + label, ...styles);
    },

    /**
     * End a console group.
     */
    groupEnd() {
      if (!IS_DEV) return;
      console.groupEnd();
    },
  };
}

/**
 * Set the minimum logging level at runtime.
 * @param {LogLevel} level
 */
export function setLogLevel(level) {
  if (LEVEL_PRIORITY[level] !== undefined) {
    _minLevel = level;
  }
}

/**
 * Get current log level.
 * @returns {LogLevel}
 */
export function getLogLevel() {
  return _minLevel;
}

// Default logger for unscoped usage
const defaultLogger = createLogger('App');
export default defaultLogger;
