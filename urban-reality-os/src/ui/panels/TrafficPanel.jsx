import { memo } from 'react';

const TrafficPanel = memo(function TrafficPanel({ layers, setLayers }) {
  return (
    <div>
      <Header title="Traffic Operations" subtitle="Live congestion and flow visibility" />
      <button
        onClick={() => setLayers((prev) => ({ ...prev, traffic: !prev.traffic }))}
        style={{
          width: '100%',
          borderRadius: 10,
          border: layers.traffic ? '1px solid rgba(248,113,113,0.7)' : '1px solid rgba(255,255,255,0.1)',
          background: layers.traffic ? 'rgba(239,68,68,0.16)' : 'rgba(255,255,255,0.03)',
          color: '#e2e8f0',
          padding: '10px 12px',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>Traffic Layer</span>
        <span>{layers.traffic ? 'Enabled' : 'Disabled'}</span>
      </button>
    </div>
  );
});

const Header = ({ title, subtitle }) => (
  <div style={{ marginBottom: 12 }}>
    <div style={{ fontSize: 14, color: '#f1f5f9', fontWeight: 600 }}>{title}</div>
    <div style={{ fontSize: 12, color: '#94a3b8' }}>{subtitle}</div>
  </div>
);

export default TrafficPanel;
