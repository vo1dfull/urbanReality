import { memo, useMemo, useRef, useState } from 'react';

const CLICK_DEBOUNCE_MS = 120;

const LayerSwitcher = memo(function LayerSwitcher({ mapStyle, layers, setLayers, setMapStyle }) {
  const [hovered, setHovered] = useState(false);
  const lastClickRef = useRef(0);

  const activeLayer = useMemo(() => {
    if (mapStyle === 'terrain') return 'terrain';
    if (mapStyle === 'satellite') return 'satellite';
    if (layers.traffic) return 'traffic';
    if (layers.hospitals || layers.policeStations || layers.fireStations) return 'facilities';
    return null;
  }, [mapStyle, layers]);

  const handleSelect = (id) => {
    const now = performance.now();
    if (now - lastClickRef.current < CLICK_DEBOUNCE_MS) return;
    lastClickRef.current = now;

    if (id === 'terrain') {
      setMapStyle((mapStyle === 'terrain') ? 'default' : 'terrain');
      return;
    }
    if (id === 'satellite') {
      setMapStyle((mapStyle === 'satellite') ? 'default' : 'satellite');
      return;
    }
    if (id === 'traffic') {
      setLayers((prev) => ({ ...prev, traffic: !prev.traffic }));
      return;
    }
    if (id === 'facilities') {
      const enabled = layers.hospitals || layers.policeStations || layers.fireStations;
      setLayers((prev) => ({
        ...prev,
        hospitals: !enabled,
        policeStations: !enabled,
        fireStations: !enabled,
      }));
    }
  };

  const items = [
    { id: 'terrain', icon: '🏔️', label: 'Terrain' },
    { id: 'satellite', icon: '🛰️', label: 'Satellite' },
    { id: 'traffic', icon: '🚦', label: 'Traffic' },
    { id: 'facilities', icon: '🏥', label: 'Facilities' },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        left: 16,
        bottom: 16,
        zIndex: 20,
        pointerEvents: 'none',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        style={{
          pointerEvents: 'none',
          borderRadius: 18,
          border: '1px solid rgba(255,255,255,0.10)',
          background: 'rgba(8,12,28,0.62)',
          backdropFilter: 'blur(12px)',
          boxShadow: hovered ? '0 8px 20px rgba(2,6,23,0.25)' : '0 6px 16px rgba(2,6,23,0.18)',
          padding: hovered ? 12 : 10,
          transform: hovered ? 'translateY(-2px) scale(1.02)' : 'translateY(0) scale(1)',
          transition: 'transform 180ms cubic-bezier(0.4, 0, 0.2, 1), padding 180ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 180ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: hovered ? '1fr 1fr' : '1fr 1fr 1fr 1fr', gap: 10 }}>
          {items.map((item) => {
            const active = activeLayer === item.id;
            return (
              <button
                key={item.id}
                className="layer-button clickable control"
                onClick={() => handleSelect(item.id)}
                style={{
                  pointerEvents: 'auto',
                  minWidth: hovered ? 140 : 62,
                  height: hovered ? 56 : 54,
                  borderRadius: 11,
                  border: active ? '1px solid rgba(96,165,250,0.85)' : '1px solid rgba(255,255,255,0.12)',
                  background: active ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.04)',
                  color: '#e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: hovered ? 'flex-start' : 'center',
                  gap: 8,
                  padding: hovered ? '0 10px' : 0,
                  cursor: 'pointer',
                  boxShadow: active ? '0 0 0 1px rgba(96,165,250,0.25), 0 0 12px rgba(96,165,250,0.25)' : 'none',
                  transition: 'all 180ms cubic-bezier(0.4, 0, 0.2, 1)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.1)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
              >
                <span style={{ fontSize: 18 }}>{item.icon}</span>
                {hovered && (
                  <span style={{ display: 'grid', lineHeight: 1.1 }}>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{item.label}</span>
                    <span style={{ fontSize: 10, color: '#94a3b8' }}>Instant map update</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
});

export default LayerSwitcher;
