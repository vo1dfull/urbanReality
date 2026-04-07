// ================================================
// NasaFilterBar — Category filter + live indicator for NASA EONET layer
// ================================================
import { CATEGORY_COLORS } from '../engines/NasaEngine';

const FILTERS = [
  { id: 'all',          label: 'All',      emoji: '🌍' },
  { id: 'wildfires',    label: 'Wildfires', emoji: '🔥' },
  { id: 'floods',       label: 'Floods',    emoji: '🌊' },
  { id: 'severeStorms', label: 'Storms',    emoji: '⛈️' },
  { id: 'volcanoes',    label: 'Volcanoes', emoji: '🌋' },
  { id: 'drought',      label: 'Drought',   emoji: '🏜️' },
];

/**
 * @param {{
 *   activeFilter: string,
 *   onFilterChange: (category: string) => void,
 *   isLoading: boolean,
 *   isLive: boolean,
 *   isStale: boolean,
 *   lastUpdated: Date | null
 * }} props
 */
export default function NasaFilterBar({ activeFilter, onFilterChange, isLoading, isLive, isStale, lastUpdated }) {
  return (
    <div style={{
      position: 'fixed',
      top: 14,
      right: 80,
      zIndex: 20,
      background: 'rgba(2,6,23,0.92)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 12,
      padding: '10px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      backdropFilter: 'blur(12px)',
      fontFamily: 'system-ui, sans-serif',
      minWidth: 200,
      pointerEvents: 'auto',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          NASA Events
        </span>
        <LiveIndicator isLoading={isLoading} isLive={isLive} isStale={isStale} lastUpdated={lastUpdated} />
      </div>

      {/* Filter buttons */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {FILTERS.map(({ id, label, emoji }) => {
          const isActive = activeFilter === id;
          const color = id === 'all' ? '#6b7280' : (CATEGORY_COLORS[id] ?? '#6b7280');
          return (
            <button
              key={id}
              disabled={isLoading}
              onClick={() => onFilterChange(id)}
              aria-pressed={isActive}
              style={{
                background: isActive ? `${color}33` : 'transparent',
                border: `1px solid ${isActive ? color : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 20,
                color: isActive ? color : '#94a3b8',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                fontSize: 11,
                fontWeight: isActive ? 700 : 400,
                padding: '4px 8px',
                opacity: isLoading ? 0.5 : 1,
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
              }}
            >
              {emoji} {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LiveIndicator({ isLoading, isLive, isStale, lastUpdated }) {
  if (isLoading) {
    return (
      <span style={{ fontSize: 10, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
        Loading…
      </span>
    );
  }

  if (isStale) {
    return (
      <span style={{ fontSize: 10, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#6b7280', display: 'inline-block' }} />
        STALE
      </span>
    );
  }

  if (isLive) {
    return (
      <span style={{ fontSize: 10, color: '#4ade80', display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: '#4ade80',
          display: 'inline-block',
          animation: 'nasaPulse 1.5s ease-in-out infinite',
        }} />
        LIVE
        {lastUpdated && (
          <span style={{ color: '#64748b', marginLeft: 4 }}>
            {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
        <style>{`
          @keyframes nasaPulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.4; transform: scale(1.4); }
          }
        `}</style>
      </span>
    );
  }

  return null;
}
