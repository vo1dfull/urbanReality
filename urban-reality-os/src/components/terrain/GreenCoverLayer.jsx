import { useEffect, useState } from 'react';
import LayerEngine from '../../engines/LayerEngine';
import InteractionEngine from '../../engines/InteractionEngine';

export default function GreenCoverLayer({ map, isActive }) {
  const [environmentScore, setEnvironmentScore] = useState(65);
  const [isAddingZone, setIsAddingZone] = useState(false);
  const [hoveredPoint, setHoveredPoint] = useState(null);

  useEffect(() => {
    if (!map || !isActive) return;

    const plugin = LayerEngine.getPlugin('terrainGreen');
    if (plugin) {
      setEnvironmentScore(plugin.environmentScore);
    }

    const handleMapClick = (e) => {
      if (!isAddingZone || !plugin) return;
      plugin.addGreenZone(map, e.lngLat.lng, e.lngLat.lat);
      setEnvironmentScore(plugin.environmentScore);
      setIsAddingZone(false);
    };

    const handleMouseMove = (e) => {
      const features = map.queryRenderedFeatures(e.point, { layers: ['green-cover-fill'] });
      if (features.length > 0) {
        setHoveredPoint({
          lng: e.lngLat.lng,
          lat: e.lngLat.lat,
          ndvi: Math.round(features[0].properties.ndvi * 100),
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
    const leaveKey = InteractionEngine.attachEvent(map, 'mouseleave', 'green-cover-fill', handleMouseLeave);

    return () => {
      InteractionEngine.detachEvent(map, clickKey);
      InteractionEngine.detachEvent(map, moveKey);
      InteractionEngine.detachEvent(map, leaveKey);
      setHoveredPoint(null);
    };
  }, [map, isActive, isAddingZone]);

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
            🌳 Green Cover Analysis
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
            NDVI-based vegetation density
          </div>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.05)', padding: 12, borderRadius: 8, marginBottom: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Environment Score</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: environmentScore > 80 ? '#22c55e' : environmentScore > 60 ? '#f59e0b' : '#ef4444' }}>
            {environmentScore}/100
          </div>
          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
            {environmentScore > 80 ? 'Excellent' : environmentScore > 60 ? 'Good' : 'Needs Improvement'}
          </div>
        </div>

        <button
          onClick={() => setIsAddingZone(!isAddingZone)}
          style={{
            width: '100%', padding: '10px',
            background: isAddingZone ? 'rgba(34, 197, 94, 0.8)' : 'rgba(34, 197, 94, 0.6)',
            border: 'none', borderRadius: 8,
            color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            transition: 'all 0.2s ease', marginBottom: 8
          }}
        >
          {isAddingZone ? '🖱️ Click to Add Green Zone' : '➕ Add Green Zone'}
        </button>

        {isAddingZone && (
          <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', marginTop: 4 }}>
            Click on the map to plant trees
          </div>
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
          Vegetation Density
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[
            { color: '#006400', label: 'Dense (80-100%)' },
            { color: '#228B22', label: 'High (60-80%)' },
            { color: '#32CD32', label: 'Moderate (40-60%)' },
            { color: '#9ACD32', label: 'Low (20-40%)' },
            { color: '#DAA520', label: 'Sparse (0-20%)' }
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
            Vegetation: {hoveredPoint.ndvi}%
          </div>
          <div style={{ fontSize: 10, color: '#94a3b8' }}>NDVI Index</div>
        </div>
      )}
    </>
  );
}