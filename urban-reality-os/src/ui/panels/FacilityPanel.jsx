import { memo } from 'react';

const FacilityPanel = memo(function FacilityPanel({
  layers,
  setLayers,
  facilityData,
  facilityViewMode,
  setFacilityViewMode,
}) {
  const counts = {
    hospitals: facilityData?.hospitals?.length || 0,
    policeStations: facilityData?.policeStations?.length || 0,
    fireStations: facilityData?.fireStations?.length || 0,
  };

  return (
    <div>
      <Header title="Facility Intelligence" subtitle="Coverage, critical gaps, and response overlays" />
      {['hospitals', 'policeStations', 'fireStations'].map((key) => (
        <button
          key={key}
          onClick={() => setLayers((prev) => ({ ...prev, [key]: !prev[key] }))}
          style={rowButton(layers[key])}
        >
          <span style={{ textTransform: 'capitalize' }}>{key.replace(/([A-Z])/g, ' $1')}</span>
          <span>{counts[key]}</span>
        </button>
      ))}
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        {['coverage', 'gap', 'heatmap'].map((mode) => (
          <button
            key={mode}
            onClick={() => setFacilityViewMode(mode)}
            style={modeButton(facilityViewMode === mode)}
          >
            {mode}
          </button>
        ))}
      </div>
    </div>
  );
});

const Header = ({ title, subtitle }) => (
  <div style={{ marginBottom: 12 }}>
    <div style={{ fontSize: 14, color: '#f1f5f9', fontWeight: 600 }}>{title}</div>
    <div style={{ fontSize: 12, color: '#94a3b8' }}>{subtitle}</div>
  </div>
);

const rowButton = (active) => ({
  width: '100%',
  marginBottom: 8,
  padding: '10px 12px',
  borderRadius: 10,
  border: active ? '1px solid rgba(52,211,153,0.7)' : '1px solid rgba(255,255,255,0.1)',
  background: active ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.03)',
  color: '#e2e8f0',
  display: 'flex',
  justifyContent: 'space-between',
  cursor: 'pointer',
});

const modeButton = (active) => ({
  flex: 1,
  border: active ? '1px solid rgba(96,165,250,0.7)' : '1px solid rgba(255,255,255,0.1)',
  background: active ? 'rgba(59,130,246,0.2)' : 'transparent',
  color: '#cbd5e1',
  padding: '8px 10px',
  borderRadius: 8,
  textTransform: 'capitalize',
  cursor: 'pointer',
});

export default FacilityPanel;
