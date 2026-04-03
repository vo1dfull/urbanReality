import { memo } from 'react';
import SearchBar from '../../components/SearchBar';

const TopBar = memo(function TopBar({
  mapRef,
  onLocationSelect,
  onFlyThrough,
  onToggleFlood,
  floodMode,
  loading,
  mapReady,
}) {
  return (
    <div style={{
      position: 'fixed',
      top: 16,
      left: 84,
      right: 356,
      zIndex: 20,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      pointerEvents: 'none',
      justifyContent: 'center',
    }}>
      <div style={{ flex: 1, maxWidth: 740, pointerEvents: 'auto' }}>
        <SearchBar mapRef={mapRef} onLocationSelect={onLocationSelect} />
      </div>
      <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto' }}>
        <ActionButton onClick={onFlyThrough} disabled={loading || !mapReady}>
          Fly Through
        </ActionButton>
        <ActionButton onClick={onToggleFlood} disabled={loading || !mapReady} active={floodMode}>
          {floodMode ? 'Stop Simulation' : 'Start Simulation'}
        </ActionButton>
      </div>
    </div>
  );
});

const ActionButton = memo(function ActionButton({ onClick, disabled, active, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        height: 38,
        borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.14)',
        background: active ? 'rgba(37,99,235,0.75)' : 'rgba(8, 15, 35, 0.82)',
        color: '#e2e8f0',
        padding: '0 14px',
        fontSize: 12,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        backdropFilter: 'blur(10px)',
        transition: 'transform 180ms cubic-bezier(0.4,0,0.2,1), background 180ms cubic-bezier(0.4,0,0.2,1)',
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.transform = 'scale(1.03)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      onMouseDown={(e) => { if (!disabled) e.currentTarget.style.transform = 'scale(0.98)'; }}
      onMouseUp={(e) => { if (!disabled) e.currentTarget.style.transform = 'scale(1.03)'; }}
    >
      {children}
    </button>
  );
});

export default TopBar;
