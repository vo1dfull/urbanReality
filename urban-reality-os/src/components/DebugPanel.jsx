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
import { useState, useEffect, memo } from 'react';
import useMapStore from '../store/useMapStore';
import FrameController from '../core/FrameController';
import CacheEngine from '../core/CacheEngine';
import eventBus from '../core/EventBus';
import MapEngine from '../engines/MapEngine';
import InteractionEngine from '../engines/InteractionEngine';
import { useDebugMode } from '../store/selectors';

const DebugPanel = memo(function DebugPanel() {
  const debugMode = useDebugMode();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!debugMode) return;

    const updateStats = () => {
      setStats({
        frame: FrameController.getStats(),
        cache: CacheEngine.getStats(),
        eventBus: eventBus.getStats(),
        map: MapEngine.getStats(),
        interactions: InteractionEngine.getStats(),
        memory: performance?.memory ? {
          usedJS: Math.round(performance.memory.usedJSHeapSize / 1048576),
          totalJS: Math.round(performance.memory.totalJSHeapSize / 1048576),
        } : null,
      });
    };

    updateStats();
    const interval = setInterval(updateStats, 1000);
    return () => clearInterval(interval);
  }, [debugMode]);

  // FPS from FrameController
  const [fps, setFps] = useState(60);
  useEffect(() => {
    if (!debugMode) return;
    return FrameController.onFPS(({ fps: f }) => setFps(f));
  }, [debugMode]);

  if (!debugMode || !stats) return null;

  const fpsColor = fps >= 50 ? '#4ade80' : fps >= 30 ? '#fbbf24' : '#f87171';

  return (
    <div style={{
      position: 'fixed',
      top: 10,
      right: 10,
      zIndex: 10000,
      background: 'rgba(0, 0, 0, 0.88)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 12,
      padding: '12px 16px',
      color: '#e2e8f0',
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: 11,
      minWidth: 240,
      maxHeight: '80vh',
      overflow: 'auto',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      userSelect: 'none',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 12, color: '#60a5fa' }}>🔧 Debug Panel</span>
        <button
          onClick={() => useMapStore.getState().setDebugMode(false)}
          style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14 }}
        >✕</button>
      </div>

      {/* FPS */}
      <Section title="Performance">
        <Row label="FPS" value={<span style={{ color: fpsColor, fontWeight: 700 }}>{fps}</span>} />
        <Row label="Quality" value={useMapStore.getState().qualityLevel} />
        {stats.memory && (
          <Row label="Memory" value={`${stats.memory.usedJS}/${stats.memory.totalJS} MB`} />
        )}
      </Section>

      {/* FrameController */}
      <Section title="FrameController">
        <Row label="Tasks" value={stats.frame.taskCount} />
        <Row label="Running" value={stats.frame.running ? '✅' : '❌'} />
        <Row label="Paused" value={stats.frame.paused ? '⏸️' : '▶️'} />
        {stats.frame.tasks.length > 0 && (
          <div style={{ marginTop: 4, paddingLeft: 8, borderLeft: '2px solid rgba(255,255,255,0.1)' }}>
            {stats.frame.tasks.map((t, i) => (
              <div key={i} style={{ color: '#94a3b8', fontSize: 10 }}>• {t}</div>
            ))}
          </div>
        )}
      </Section>

      {/* CacheEngine */}
      <Section title="Cache">
        <Row label="Entries" value={`${stats.cache.size}/${stats.cache.maxSize}`} />
        <Row label="Hit Rate" value={stats.cache.hitRate} />
        <Row label="Hits/Miss" value={`${stats.cache.hits}/${stats.cache.misses}`} />
        <Row label="Inflight" value={stats.cache.inflightCount} />
      </Section>

      {/* EventBus */}
      <Section title="EventBus">
        <Row label="Active Events" value={stats.eventBus.events.length} />
        <Row label="Listeners" value={stats.eventBus.totalListeners} />
        <Row label="Total Emits" value={stats.eventBus.emitCount} />
      </Section>

      {/* Map */}
      {stats.map && (
        <Section title="Map">
          <Row label="Zoom" value={stats.map.zoom} />
          <Row label="Center" value={`${stats.map.center[0]}, ${stats.map.center[1]}`} />
          <Row label="Pitch" value={`${stats.map.pitch}°`} />
          <Row label="Bearing" value={`${stats.map.bearing}°`} />
          <Row label="Style" value={stats.map.style} />
        </Section>
      )}

      {/* Interactions */}
      <Section title="Interactions">
        <Row label="Clicks" value={stats.interactions.clicks} />
        <Row label="Hovers" value={stats.interactions.hovers} />
        <Row label="Popups" value={stats.interactions.popups} />
      </Section>

      {/* Keyboard hint */}
      <div style={{ marginTop: 8, fontSize: 10, color: '#475569', textAlign: 'center' }}>
        Press <kbd style={{ background: 'rgba(255,255,255,0.1)', padding: '1px 5px', borderRadius: 3 }}>D</kbd> to toggle
      </div>
    </div>
  );
});

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

export default DebugPanel;
