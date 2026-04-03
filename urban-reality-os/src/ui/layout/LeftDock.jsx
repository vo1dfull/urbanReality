import { memo } from 'react';

const LeftDock = memo(function LeftDock({
  activePanel,
  setActivePanel,
  appMode,
  setAppMode,
}) {
  const items = [
    { id: 'terrain', label: 'Terrain', icon: '🏔️' },
    { id: 'traffic', label: 'Traffic', icon: '🚦' },
    { id: 'facility', label: 'Facility', icon: '🏥' },
  ];

  return (
    <div style={{ position: 'fixed', top: 16, left: 16, zIndex: 20, width: 56, pointerEvents: 'none' }}>
      <div style={dockCardStyle}>
        {items.map((item) => (
          <button
            className="ui-dock-btn"
            key={item.id}
            onClick={() => setActivePanel(item.id)}
            style={{
              ...dockButtonStyle,
              background: activePanel === item.id ? 'rgba(96,165,250,0.16)' : 'transparent',
              borderColor: activePanel === item.id ? 'rgba(96,165,250,0.6)' : 'rgba(255,255,255,0.08)',
              boxShadow: activePanel === item.id ? '0 0 14px rgba(96,165,250,0.25)' : 'none',
            }}
          >
            <span style={{ fontSize: 16 }}>{item.icon}</span>
          </button>
        ))}
      </div>

      <div style={{ ...dockCardStyle, marginTop: 12 }}>
        {['explore', 'simulation', 'planning'].map((mode) => (
          <button
            key={mode}
            onClick={() => setAppMode(mode)}
            style={{
              ...modeButtonStyle,
              background: appMode === mode ? 'rgba(96,165,250,0.18)' : 'transparent',
              color: appMode === mode ? '#e2e8f0' : '#94a3b8',
            }}
          >
            {mode[0].toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
});

const dockCardStyle = {
  pointerEvents: 'auto',
  display: 'grid',
  gap: 6,
  padding: 6,
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(8,12,28,0.64)',
  backdropFilter: 'blur(16px)',
};

const dockButtonStyle = {
  width: 42,
  height: 42,
  borderRadius: 11,
  border: '1px solid rgba(255,255,255,0.08)',
  color: '#e2e8f0',
  cursor: 'pointer',
  transition: 'all 180ms cubic-bezier(0.4,0,0.2,1)',
  transform: 'scale(1)',
};

const modeButtonStyle = {
  width: 42,
  height: 32,
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.08)',
  fontSize: 10,
  fontWeight: 600,
  cursor: 'pointer',
};

export default LeftDock;
