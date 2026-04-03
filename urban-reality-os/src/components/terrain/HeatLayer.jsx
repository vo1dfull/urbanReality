import { useEffect, useState } from 'react';
import useMapStore from '../../store/useMapStore';
import LayerEngine from '../../engines/LayerEngine';
import InteractionEngine from '../../engines/InteractionEngine';

export default function HeatLayer({ map, isActive }) {
  const year = useMapStore(s => s.year);
  const greenZones = useMapStore((s) => s.greenZones);
  const toggleGreenZone = useMapStore((s) => s.toggleGreenZone);
  const clearGreenZones = useMapStore((s) => s.clearGreenZones);
  const [hoveredPoint, setHoveredPoint] = useState(null);

  useEffect(() => {
    if (!map || !isActive) return;

    const handleMapClick = (e) => {
      toggleGreenZone(e.lngLat.lng, e.lngLat.lat);
    };

    const handleMouseMove = (e) => {
      const features = map.queryRenderedFeatures(e.point, { layers: ['heat-heatmap'] });
      if (features.length > 0) {
        setHoveredPoint({
          lng: e.lngLat.lng,
          lat: e.lngLat.lat,
          temperature: Math.round(features[0].properties.temperature * 10) / 10,
          screenX: e.point.x,
          screenY: e.point.y
        });
      } else {
        setHoveredPoint(null);
      }
    };

    const handleMouseLeave = () => setHoveredPoint(null);

    const clickKey = InteractionEngine.attachEvent(map, 'click', null, handleMapClick);
    const moveKey = InteractionEngine.attachEvent(map, 'mousemove', null, handleMouseMove);
    const leaveKey = InteractionEngine.attachEvent(map, 'mouseleave', 'heat-heatmap', handleMouseLeave);

    return () => {
      InteractionEngine.detachEvent(map, clickKey);
      InteractionEngine.detachEvent(map, moveKey);
      InteractionEngine.detachEvent(map, leaveKey);
      setHoveredPoint(null);
    };
  }, [map, isActive, toggleGreenZone]);

  if (!isActive) return null;

  return (
    <>
      <div
        style={{
          position: 'absolute', top: 100, right: 20,
          background: 'rgba(2, 6, 23, 0.9)', padding: 16, borderRadius: 12,
          backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)',
          minWidth: 280, zIndex: 100
        }}
      >
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>
            🌡️ Urban Heat Island
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
            Click to add/remove green zones
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <div style={{ background: 'rgba(255,255,255,0.05)', padding: 8, borderRadius: 6, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#94a3b8' }}>Green Zones</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#22c55e' }}>{greenZones.length}</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.05)', padding: 8, borderRadius: 6, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#94a3b8' }}>Year</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#60a5fa' }}>{year}</div>
          </div>
        </div>

        {greenZones.length > 0 && (
          <button
            onClick={clearGreenZones}
            style={{
              width: '100%', padding: '8px',
              background: 'rgba(220, 53, 69, 0.8)',
              border: 'none', borderRadius: 6,
              color: 'white', fontSize: 12, fontWeight: 500, cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            Clear All Green Zones
          </button>
        )}
      </div>

      <div
        style={{
          position: 'absolute', bottom: 120, right: 20,
          background: 'rgba(2, 6, 23, 0.9)', padding: 12, borderRadius: 8,
          backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)',
          zIndex: 100
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: '#f1f5f9', marginBottom: 8 }}>
          Temperature (°C)
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[
            { color: '#7c2d12', label: '45+ (Very Hot)' },
            { color: '#dc2626', label: '35-45 (Hot)' },
            { color: '#f97316', label: '30-35 (Warm)' },
            { color: '#f59e0b', label: '25-30 (Moderate)' },
            { color: '#10b981', label: '20-25 (Cool)' },
            { color: '#3b82f6', label: '15-20 (Cold)' }
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 12, height: 12, background: item.color, borderRadius: 2 }} />
              <span style={{ fontSize: 11, color: '#e2e8f0' }}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {hoveredPoint && (
        <div
          style={{
            position: 'absolute', left: hoveredPoint.screenX + 10, top: hoveredPoint.screenY - 10,
            background: 'rgba(2, 6, 23, 0.95)', padding: '8px 12px', borderRadius: 6,
            color: 'white', fontSize: 12, backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            zIndex: 1000, pointerEvents: 'none', transform: 'translateY(-100%)'
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            Temperature: {hoveredPoint.temperature}°C
          </div>
          <div style={{ fontSize: 10, color: '#94a3b8' }}>
            {hoveredPoint.lat.toFixed(4)}, {hoveredPoint.lng.toFixed(4)}
          </div>
        </div>
      )}
    </>
  );
}