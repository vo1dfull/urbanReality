// ================================================
// DebugPanel.jsx — Dev-only debug overlay
// ✅ FPS monitor (real-time from FrameController)
// ✅ Active tasks list
// ✅ Cache stats (CacheEngine)
// ✅ EventBus listener counts
// ✅ Map stats (zoom, center, pitch)
// ✅ Interaction stats
// ✅ Toggle via 'D' keyboard shortcut
// ================================================
import { useState, useEffect, memo, useMemo, useRef, Component } from 'react';
import useMapStore from '../store/useMapStore';
import FrameController from '../core/FrameController';
import CacheEngine from '../core/CacheEngine';
import eventBus from '../core/EventBus';
import { getLogHistory, setLogLevel, getLogLevel } from '../core/Logger';
import MapEngine from '../engines/MapEngine';
import InteractionEngine from '../engines/InteractionEngine';
import DataEngine from '../engines/DataEngine';
import PerformanceManager from '../core/PerformanceManager';
import { useDebugMode } from '../store/selectors';

const DebugPanelView = memo(function DebugPanelView() {
  const debugMode = useDebugMode();
  const qualityLevel = useMapStore(s => s.qualityLevel);
  const [stats, setStats] = useState(null);
  const [activeTab, setActiveTab] = useState('performance');
  const [filterText, setFilterText] = useState('');
  const [fpsSeries, setFpsSeries] = useState([]);
  const [frameSeries, setFrameSeries] = useState([]);
  const [eventStream, setEventStream] = useState([]);
  const [panelPos, setPanelPos] = useState({ x: 10, y: 10 });
  const [panelSize, setPanelSize] = useState({ w: 420, h: 520 });
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const dragOrigin = useRef(null);

  useEffect(() => {
    if (!debugMode) return;

    const updateStats = () => {
      try {
        const frameStats = FrameController.getStats?.() || {};
        const cacheStats = CacheEngine.getStats?.() || {};
        const mapStats = MapEngine.getStats?.() || null;
        const eventsStats = eventBus.getStats?.() || {};
        const interactionStats = InteractionEngine.getStats?.() || {};
        const dataStats = DataEngine.getStats?.() || {};
        const perf = typeof performance !== 'undefined' ? performance : null;

        setStats({
          frame: frameStats,
          cache: cacheStats,
          eventBus: eventsStats,
          map: mapStats,
          interactions: interactionStats,
          dataEngine: dataStats,
          perfManager: {
            tier: PerformanceManager.getTier?.() ?? 'unknown',
            safeMode: PerformanceManager.isSafeMode?.() ?? false,
            profile: PerformanceManager.getDeviceProfile?.(),
          },
          memory: perf?.memory ? {
            usedJS: Math.round(perf.memory.usedJSHeapSize / 1048576),
            totalJS: Math.round(perf.memory.totalJSHeapSize / 1048576),
          } : null,
        });
      } catch {
        setStats((prev) => prev || {
          frame: {},
          cache: {},
          eventBus: {},
          map: null,
          interactions: {},
          dataEngine: {},
          perfManager: { tier: 'unknown', safeMode: false },
          memory: null,
        });
      }
    };

    updateStats();
    const taskId = FrameController.add(updateStats, 2500, 'debug-panel-stats', 'idle');
    return () => {
      if (taskId !== -1) FrameController.remove(taskId);
    };
  }, [debugMode]);

  // FPS from FrameController
  const [fps, setFps] = useState(60);
  useEffect(() => {
    if (!debugMode) return;
    const unsub = FrameController.onFPS(({ fps: f } = {}) => {
      if (!Number.isFinite(f)) return;
      setFps(f);
      setFpsSeries((prev) => {
        const next = prev.length >= 120 ? prev.slice(1) : prev.slice();
        next.push(f);
        return next;
      });
      setFrameSeries((prev) => {
        const ft = f > 0 ? 1000 / f : 0;
        const next = prev.length >= 120 ? prev.slice(1) : prev.slice();
        next.push(ft);
        return next;
      });
    });

    const unsubTrace = eventBus.subscribeTrace?.((trace) => {
      if (!trace || typeof trace !== 'object') return;
      setEventStream((prev) => {
        const next = prev.length >= 200 ? prev.slice(1) : prev.slice();
        next.push(trace);
        return next;
      });
    });

    return () => {
      unsub?.();
      unsubTrace?.();
    };
  }, [debugMode]);

  useEffect(() => {
    if (!debugMode) return;
    const onMove = (e) => {
      if (dragging && dragOrigin.current) {
        const dx = e.clientX - dragOrigin.current.x;
        const dy = e.clientY - dragOrigin.current.y;
        setPanelPos({ x: dragOrigin.current.px + dx, y: dragOrigin.current.py + dy });
      }
      if (resizing && dragOrigin.current) {
        const dx = e.clientX - dragOrigin.current.x;
        const dy = e.clientY - dragOrigin.current.y;
        setPanelSize({
          w: Math.max(320, Math.min(window.innerWidth - 20, dragOrigin.current.w + dx)),
          h: Math.max(320, Math.min(window.innerHeight - 20, dragOrigin.current.h + dy)),
        });
      }
    };
    const onUp = () => {
      setDragging(false);
      setResizing(false);
      dragOrigin.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [debugMode, dragging, resizing]);

  const logs = useMemo(() => {
    const items = getLogHistory(250);
    if (!filterText) return items;
    const needle = filterText.toLowerCase();
    return items.filter((l) => safeSerialize(l).toLowerCase().includes(needle));
  }, [filterText, stats]);

  if (!debugMode || !stats) return null;

  const fpsColor = fps >= 50 ? '#4ade80' : fps >= 30 ? '#fbbf24' : '#f87171';

  const tabs = [
    ['performance', 'Performance'],
    ['events', 'Events'],
    ['cache', 'Cache'],
    ['memory', 'Memory'],
    ['map', 'Map'],
  ];

  const panelStyle = {
    position: 'fixed',
    top: panelPos.y,
    left: panelPos.x,
    width: panelSize.w,
    height: panelSize.h,
    zIndex: 10000,
    background: 'rgba(0, 0, 0, 0.88)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: '10px 12px',
    color: '#e2e8f0',
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    fontSize: 11,
    overflow: 'hidden',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    userSelect: 'none',
    display: 'flex',
    flexDirection: 'column',
  };

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, cursor: 'move' }}
        onMouseDown={(e) => {
          setDragging(true);
          dragOrigin.current = { x: e.clientX, y: e.clientY, px: panelPos.x, py: panelPos.y };
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 12, color: '#60a5fa' }}>🔧 Debug Panel</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            value={getLogLevel()}
            onChange={(e) => setLogLevel(e.target.value)}
            style={{ background: 'rgba(255,255,255,0.08)', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, fontSize: 10 }}
          >
            <option value="debug">debug</option>
            <option value="info">info</option>
            <option value="warn">warn</option>
            <option value="error">error</option>
          </select>
          <button
            onClick={() => useMapStore.getState().setDebugMode(false)}
            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14 }}
          >✕</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {tabs.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            style={{
              padding: '6px 8px',
              borderRadius: 6,
              border: activeTab === id ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.12)',
              background: activeTab === id ? 'rgba(56,189,248,0.18)' : 'rgba(255,255,255,0.04)',
              color: activeTab === id ? '#bae6fd' : '#cbd5e1',
              fontSize: 10,
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {activeTab === 'performance' && (
          <>
            <Section title="Performance">
              <Row label="FPS" value={<span style={{ color: fpsColor, fontWeight: 700 }}>{fps}</span>} />
              <Row label="Quality" value={qualityLevel} />
              <Row label="Tier" value={stats.perfManager?.tier ?? 'unknown'} />
              <Row label="Safe Mode" value={stats.perfManager?.safeMode ? 'ON' : 'OFF'} />
              {stats.memory && <Row label="Memory" value={`${stats.memory.usedJS}/${stats.memory.totalJS} MB`} />}
            </Section>
            <MiniGraph title="FPS (5s)" series={fpsSeries} color="#60a5fa" max={120} />
            <MiniGraph title="Frame Time (ms)" series={frameSeries} color="#fbbf24" max={40} />

            <Section title="FrameController">
              <Row label="Tasks" value={stats.frame.taskCount} />
              <Row label="Running" value={stats.frame.running ? '✅' : '❌'} />
              <Row label="Paused" value={stats.frame.paused ? '⏸️' : '▶️'} />
              <Row label="Fixed Step" value={stats.frame?.fixedTimestep ? 'ON' : 'OFF'} />
            </Section>
          </>
        )}

        {activeTab === 'events' && (
          <>
            <Section title="EventBus">
              <Row label="Active Events" value={stats.eventBus?.events?.length ?? 0} />
              <Row label="Listeners" value={stats.eventBus?.totalListeners ?? 0} />
              <Row label="Total Emits" value={stats.eventBus?.emitCount ?? 0} />
              <Row label="History" value={stats.eventBus?.historySize || 0} />
            </Section>
            <Section title="Live Stream">
              <div style={{ maxHeight: 240, overflow: 'auto', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: 6 }}>
                {eventStream.slice(-80).map((ev, idx) => (
                  <div key={idx} style={{ color: '#94a3b8', fontSize: 10, padding: '2px 0' }}>
                    {new Date(ev?.ts || Date.now()).toLocaleTimeString()} {String(ev?.event || 'event')} {Number.isFinite(ev?.duration) ? `${ev.duration.toFixed(2)}ms` : ''}
                  </div>
                ))}
              </div>
            </Section>
          </>
        )}

        {activeTab === 'cache' && (
          <>
            <Section title="Cache">
              <Row label="Entries" value={`${stats.cache?.size ?? 0}/${stats.cache?.maxSize ?? 0}`} />
              <Row label="Hit Rate" value={stats.cache?.hitRate ?? '0%'} />
              <Row label="Hits/Miss" value={`${stats.cache?.hits ?? 0}/${stats.cache?.misses ?? 0}`} />
              <Row label="Inflight" value={stats.cache?.inflightCount ?? 0} />
              <Row label="Evictions" value={stats.cache?.evictions || 0} />
            </Section>
            <Section title="Keys">
              <div style={{ maxHeight: 220, overflow: 'auto', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: 6 }}>
                {(Array.isArray(CacheEngine.keys?.()) ? CacheEngine.keys() : []).slice(0, 200).map((k) => (
                  <div key={k} style={{ color: '#93c5fd', fontSize: 10, padding: '2px 0' }}>{k}</div>
                ))}
              </div>
            </Section>
          </>
        )}

        {activeTab === 'memory' && (
          <>
            <Section title="Memory">
              {stats.memory ? (
                <>
                  <Row label="Used JS" value={`${stats.memory.usedJS} MB`} />
                  <Row label="Total JS" value={`${stats.memory.totalJS} MB`} />
                </>
              ) : (
                <Row label="Heap API" value="Not supported" />
              )}
            </Section>
            <Section title="Logs">
              <input
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="Filter logs"
                style={{ width: '100%', marginBottom: 6, background: 'rgba(255,255,255,0.08)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, fontSize: 10, padding: '4px 6px' }}
              />
              <div style={{ maxHeight: 220, overflow: 'auto', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: 6 }}>
                {logs.slice(-100).map((l, i) => (
                  <div key={i} style={{ fontSize: 10, color: '#94a3b8', padding: '2px 0' }}>
                    [{l.level ?? 'info'}] {l.module ?? 'app'} {typeof l.payload === 'string' ? l.payload : safeSerialize(l.payload)}
                  </div>
                ))}
              </div>
            </Section>
          </>
        )}

        {activeTab === 'map' && (
          <>
            {stats.map && (
              <Section title="Map">
                <Row label="Zoom" value={stats.map?.zoom ?? '-'} />
                <Row label="Center" value={formatCenter(stats.map?.center)} />
                <Row label="Pitch" value={stats.map?.pitch != null ? `${stats.map.pitch}°` : '-'} />
                <Row label="Bearing" value={stats.map?.bearing != null ? `${stats.map.bearing}°` : '-'} />
                <Row label="Style" value={stats.map?.style ?? '-'} />
              </Section>
            )}
            <Section title="Interactions">
              <Row label="Clicks" value={stats.interactions?.clicks ?? 0} />
              <Row label="Hovers" value={stats.interactions?.hovers ?? 0} />
              <Row label="Popups" value={stats.interactions?.popups ?? 0} />
            </Section>
            <Section title="DataEngine">
              <Row label="Req Avg ms" value={Math.round(stats.dataEngine?.avgResponseTime || 0)} />
              <Row label="Pending" value={stats.dataEngine?.pendingRequests ?? 0} />
              <Row label="Dedup Rate" value={`${stats.dataEngine?.deduplicationRate ?? 0}%`} />
            </Section>
          </>
        )}
      </div>

      {/* Keyboard hint */}
      <div style={{ marginTop: 8, fontSize: 10, color: '#475569', textAlign: 'center' }}>
        Press <kbd style={{ background: 'rgba(255,255,255,0.1)', padding: '1px 5px', borderRadius: 3 }}>D</kbd> to toggle
      </div>

      <div
        style={{
          position: 'absolute',
          right: 6,
          bottom: 6,
          width: 14,
          height: 14,
          borderRadius: 3,
          border: '1px solid rgba(255,255,255,0.2)',
          cursor: 'nwse-resize',
          background: 'rgba(255,255,255,0.08)',
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
          setResizing(true);
          dragOrigin.current = { x: e.clientX, y: e.clientY, w: panelSize.w, h: panelSize.h };
        }}
      />
    </div>
  );
});

class DebugPanelBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error('[DebugPanel] render failed', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          position: 'fixed',
          top: 12,
          right: 12,
          zIndex: 10000,
          background: 'rgba(0,0,0,0.85)',
          color: '#fca5a5',
          border: '1px solid rgba(248,113,113,0.4)',
          borderRadius: 8,
          padding: '10px 12px',
          fontSize: 11,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        }}>
          Debug panel crashed. Press D to close.
        </div>
      );
    }
    return this.props.children;
  }
}

function MiniGraph({ title, series, color, max }) {
  const points = series.length;
  if (points === 0) return null;
  const width = 360;
  const height = 52;
  const path = [];
  for (let i = 0; i < points; i++) {
    const x = (i / Math.max(1, points - 1)) * width;
    const y = height - Math.min(height, (series[i] / max) * height);
    path.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`);
  }

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, color: '#64748b', marginBottom: 3 }}>{title}</div>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ height: 52, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6 }}>
        <path d={path.join(' ')} fill="none" stroke={color} strokeWidth="1.8" />
      </svg>
    </div>
  );
}

// Sub-components
function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
      <span style={{ color: '#94a3b8' }}>{label}</span>
      <span style={{ color: '#e2e8f0' }}>{value}</span>
    </div>
  );
}

function formatCenter(center) {
  if (!Array.isArray(center) || center.length < 2) return '-';
  const lng = Number.isFinite(center[0]) ? center[0] : '-';
  const lat = Number.isFinite(center[1]) ? center[1] : '-';
  return `${lng}, ${lat}`;
}

function safeSerialize(value) {
  if (typeof value === 'string') return value;
  try {
    const seen = new WeakSet();
    return JSON.stringify(value, (key, val) => {
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val)) return '[Circular]';
        seen.add(val);
      }
      return val;
    });
  } catch {
    return String(value);
  }
}

export default function DebugPanel() {
  return (
    <DebugPanelBoundary>
      <DebugPanelView />
    </DebugPanelBoundary>
  );
}
