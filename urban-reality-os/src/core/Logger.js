// ================================================
// core/Logger.js — Structured production logger
// ✅ Backward compatible createLogger API
// ✅ Correlation IDs + sampling + batching
// ✅ Optional remote sink with compression hooks
// ✅ Ring-buffer log history for DebugPanel
// ================================================

const IS_DEV = typeof import.meta !== 'undefined' && import.meta.env?.DEV;

/** @typedef {'debug'|'info'|'warn'|'error'} LogLevel */
const LEVEL_PRIORITY = { debug: 0, info: 1, warn: 2, error: 3 };
const MODULE_COLORS = ['#60a5fa', '#34d399', '#f472b6', '#fbbf24', '#a78bfa', '#f87171', '#38bdf8'];
const LOG_HISTORY_MAX = 2000;

let _minLevel = IS_DEV ? 'debug' : 'warn';
let _sampleRate = 1;
let _colorIndex = 0;
let _traceCounter = 0;
let _batchTimer = null;

const _moduleColorMap = new Map();
const _history = new Array(LOG_HISTORY_MAX);
const _batchQueue = [];
const _timers = new Map();

let _historySize = 0;
let _historyIdx = 0;
let _remoteConfig = {
  endpoint: '',
  flushIntervalMs: 4000,
  batchSize: 50,
  enabled: false,
  headers: {},
};

function nowISO() {
  return new Date().toISOString();
}

function getModuleColor(module) {
  if (!_moduleColorMap.has(module)) {
    _moduleColorMap.set(module, MODULE_COLORS[_colorIndex % MODULE_COLORS.length]);
    _colorIndex++;
  }
  return _moduleColorMap.get(module);
}

function shouldLog(level) {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[_minLevel]) return false;
  if (_sampleRate >= 1) return true;
  return Math.random() <= _sampleRate;
}

function safeSerialize(args) {
  if (!args || args.length === 0) return null;
  if (args.length === 1) return args[0];
  return args;
}

function pushHistory(entry) {
  _history[_historyIdx] = entry;
  _historyIdx = (_historyIdx + 1) % LOG_HISTORY_MAX;
  if (_historySize < LOG_HISTORY_MAX) _historySize++;
}

function scheduleRemoteFlush() {
  if (!_remoteConfig.enabled || !_remoteConfig.endpoint || _batchTimer !== null) return;
  _batchTimer = setTimeout(flushRemoteBatch, _remoteConfig.flushIntervalMs);
}

async function flushRemoteBatch() {
  if (_batchTimer !== null) {
    clearTimeout(_batchTimer);
    _batchTimer = null;
  }
  if (!_remoteConfig.enabled || !_remoteConfig.endpoint || _batchQueue.length === 0) return;

  const count = Math.min(_batchQueue.length, _remoteConfig.batchSize);
  const batch = _batchQueue.splice(0, count);

  try {
    await fetch(_remoteConfig.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ..._remoteConfig.headers,
      },
      body: JSON.stringify({ logs: batch }),
    });
  } catch (_) {
    // Keep best-effort reliability without crashing callers.
    for (let i = batch.length - 1; i >= 0; i--) {
      _batchQueue.unshift(batch[i]);
    }
  }

  if (_batchQueue.length > 0) scheduleRemoteFlush();
}

function emit(level, module, traceId, args) {
  const entry = {
    ts: nowISO(),
    level,
    module,
    traceId: traceId || null,
    payload: safeSerialize(args),
  };

  pushHistory(entry);
  if (_remoteConfig.enabled) {
    _batchQueue.push(entry);
    if (_batchQueue.length >= _remoteConfig.batchSize) {
      void flushRemoteBatch();
    } else {
      scheduleRemoteFlush();
    }
  }

  if (!IS_DEV && level !== 'error') return;

  const color = getModuleColor(module);
  const line = [`%c[${entry.ts}] %c[${module}]%c`, 'color:#64748b', `color:${color};font-weight:bold`, 'color:inherit'];
  if (level === 'debug') console.debug(line[0], line[1], line[2], line[3], ...args);
  else if (level === 'info') console.info(line[0], line[1], line[2], line[3], ...args);
  else if (level === 'warn') console.warn(line[0], line[1], line[2], line[3], ...args);
  else console.error(line[0], line[1], line[2], line[3], ...args);
}

export function createTraceId(prefix = 'trace') {
  _traceCounter++;
  return `${prefix}-${Date.now().toString(36)}-${_traceCounter.toString(36)}`;
}

export function createLogger(module) {
  const scopedModule = module || 'App';

  return {
    debug(...args) {
      if (!shouldLog('debug')) return;
      emit('debug', scopedModule, null, args);
    },

    info(...args) {
      if (!shouldLog('info')) return;
      emit('info', scopedModule, null, args);
    },

    warn(...args) {
      if (!shouldLog('warn')) return;
      emit('warn', scopedModule, null, args);
    },

    error(...args) {
      if (!shouldLog('error')) return;
      emit('error', scopedModule, null, args);
    },

    withTrace(traceId) {
      const tid = traceId || createTraceId(scopedModule.toLowerCase());
      return {
        debug: (...args) => shouldLog('debug') && emit('debug', scopedModule, tid, args),
        info: (...args) => shouldLog('info') && emit('info', scopedModule, tid, args),
        warn: (...args) => shouldLog('warn') && emit('warn', scopedModule, tid, args),
        error: (...args) => shouldLog('error') && emit('error', scopedModule, tid, args),
      };
    },

    time(label) {
      _timers.set(`${scopedModule}:${label}`, performance.now());
    },

    timeEnd(label, warnThreshold = 50) {
      const key = `${scopedModule}:${label}`;
      const start = _timers.get(key);
      if (start === undefined) return;
      _timers.delete(key);
      const duration = performance.now() - start;
      if (duration > warnThreshold) emit('warn', scopedModule, null, [`⏱ ${label}: ${duration.toFixed(2)}ms (SLOW)`]);
      else emit('debug', scopedModule, null, [`⏱ ${label}: ${duration.toFixed(2)}ms`]);
    },

    group(label) {
      if (!IS_DEV) return;
      console.groupCollapsed(`[${scopedModule}] ${label}`);
    },

    groupEnd() {
      if (!IS_DEV) return;
      console.groupEnd();
    },
  };
}

export function setRemoteLogging(config = {}) {
  _remoteConfig = {
    ..._remoteConfig,
    ...config,
    enabled: Boolean(config.enabled ?? _remoteConfig.enabled),
  };
  if (_remoteConfig.enabled) scheduleRemoteFlush();
}

export function flushLogs() {
  return flushRemoteBatch();
}

export function getLogHistory(limit = 200) {
  const count = Math.min(limit, _historySize);
  const out = new Array(count);
  for (let i = 0; i < count; i++) {
    const idx = (_historyIdx - 1 - i + LOG_HISTORY_MAX) % LOG_HISTORY_MAX;
    out[count - 1 - i] = _history[idx];
  }
  return out;
}

export function clearLogHistory() {
  _historySize = 0;
  _historyIdx = 0;
}

export function setLogLevel(level) {
  if (LEVEL_PRIORITY[level] !== undefined) _minLevel = level;
}

export function getLogLevel() {
  return _minLevel;
}

export function setLogSampling(rate) {
  _sampleRate = Math.max(0, Math.min(1, Number(rate) || 0));
}

const defaultLogger = createLogger('App');
export default defaultLogger;
