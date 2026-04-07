// ================================================
// NasaEventPanel — Event detail popup for NASA EONET events
// ================================================
import { CATEGORY_COLORS, DEFAULT_COLOR } from '../engines/NasaEngine';

const CATEGORY_LABELS = {
  wildfires:    '🔥 Wildfire',
  floods:       '🌊 Flood',
  severeStorms: '⛈️ Storm',
  volcanoes:    '🌋 Volcano',
  drought:      '🏜️ Drought',
};

function formatDate(dateStr) {
  if (!dateStr) return 'Unknown date';
  try { return new Date(dateStr).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return dateStr; }
}

function getWorldviewUrl(coordinates) {
  if (!coordinates || coordinates.length < 2) return 'https://worldview.earthdata.nasa.gov/';
  const [lng, lat] = coordinates;
  return `https://worldview.earthdata.nasa.gov/?v=${lng-2},${lat-2},${lng+2},${lat+2}`;
}

function SeverityBar({ value = 0 }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? '#ef4444' : pct >= 50 ? '#f97316' : '#eab308';
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
        <span>Severity</span><span style={{ color, fontWeight: 700 }}>{pct}%</span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  );
}

export default function NasaEventPanel({ event, onClose }) {
  if (!event || !event.id || !event.title || !event.category) return null;

  const color        = CATEGORY_COLORS[event.category] ?? DEFAULT_COLOR;
  const label        = CATEGORY_LABELS[event.category] ?? event.category;
  const sources      = Array.isArray(event.sources) ? event.sources : [];
  const worldviewUrl = getWorldviewUrl(event.coordinates);
  const affectedPop  = event.affectedPop ? Number(event.affectedPop).toLocaleString() : null;
  const daysActive   = event.daysActive ?? null;
  const impactRadius = event.impactRadius ?? null;

  return (
    <div style={{
      position: 'fixed',
      top: 76,
      right: 16,
      zIndex: 25,
      width: 300,
      background: 'rgba(2,6,23,0.96)',
      border: `1px solid ${color}55`,
      borderRadius: 14,
      padding: '16px',
      color: '#e2e8f0',
      boxShadow: `0 12px 40px rgba(0,0,0,0.7), 0 0 0 1px ${color}22, 0 0 30px ${color}18`,
      backdropFilter: 'blur(16px)',
      fontFamily: 'system-ui, sans-serif',
      pointerEvents: 'auto',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <span style={{ background: color, color: '#fff', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          {label}
        </span>
        <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '0 2px' }}>×</button>
      </div>

      {/* Title */}
      <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: '#f1f5f9', lineHeight: 1.4 }}>{event.title}</h3>

      {/* Date + status */}
      <p style={{ margin: '0 0 12px', fontSize: 12, color: '#94a3b8' }}>
        📅 {formatDate(event.date)}
        {event.status === 'open' && <span style={{ marginLeft: 8, color: '#4ade80', fontWeight: 700 }}>● Active</span>}
        {daysActive !== null && <span style={{ marginLeft: 8, color: '#64748b' }}>{daysActive}d</span>}
      </p>

      {/* Severity bar */}
      {event.severity != null && <SeverityBar value={Number(event.severity)} />}

      {/* Stats row */}
      {(affectedPop || impactRadius) && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {impactRadius && (
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color }}>{impactRadius} km</div>
              <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>Impact radius</div>
            </div>
          )}
          {affectedPop && (
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#f97316' }}>~{affectedPop}</div>
              <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>Est. affected</div>
            </div>
          )}
        </div>
      )}

      {/* Sources */}
      {sources.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ margin: '0 0 4px', fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sources</p>
          {sources.map((src, i) => (
            <a key={i} href={src.url} target="_blank" rel="noopener noreferrer"
              style={{ display: 'block', fontSize: 12, color: '#60a5fa', textDecoration: 'none', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {src.id || src.url}
            </a>
          ))}
        </div>
      )}

      {/* Satellite button */}
      <a href={worldviewUrl} target="_blank" rel="noopener noreferrer"
        style={{ display: 'block', textAlign: 'center', background: color, color: '#fff', fontSize: 12, fontWeight: 700, padding: '9px 12px', borderRadius: 8, textDecoration: 'none' }}>
        🛰️ View Satellite Data
      </a>
    </div>
  );
}
