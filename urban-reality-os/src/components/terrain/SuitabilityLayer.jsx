import { useEffect, useState } from 'react';
import LayerEngine from '../../engines/LayerEngine';
import InteractionEngine from '../../engines/InteractionEngine';

const SUITABILITY_TYPES = {
  housing: { label: 'Housing', icon: '🏠' },
  commercial: { label: 'Commercial', icon: '🏢' },
  industrial: { label: 'Industrial', icon: '🏭' }
};

export default function SuitabilityLayer({ map, isActive }) {
  const [suitabilityType, setSuitabilityType] = useState('housing');
  const [hoveredPoint, setHoveredPoint] = useState(null);

  useEffect(() => {
    if (!map || !isActive) return;

    const plugin = LayerEngine.getPlugin('terrainSuitability');
    if (plugin) {
      plugin.updateGrid(map, suitabilityType);
    }

    const handleMouseMove = (e) => {
      const features = map.queryRenderedFeatures(e.point, { layers: ['suitability-fill'] });
      if (features.length > 0) {
        setHoveredPoint({
          lng: e.lngLat.lng,
          lat: e.lngLat.lat,
          suitability: Math.round(features[0].properties.suitability * 100),
          factors: {
            slope: features[0].properties.slope,
            roads: features[0].properties.roads,
            water: features[0].properties.water,
            infrastructure: features[0].properties.infrastructure
          },
          screenX: e.point.x,
          screenY: e.point.y
        });
      } else {
        setHoveredPoint(null);
      }
    };

    const handleMouseLeave = () => setHoveredPoint(null);

    const moveKey = InteractionEngine.attachEvent(map, 'mousemove', null, handleMouseMove);
    const leaveKey = InteractionEngine.attachEvent(map, 'mouseleave', 'suitability-fill', handleMouseLeave);

    return () => {
      InteractionEngine.detachEvent(map, moveKey);
      InteractionEngine.detachEvent(map, leaveKey);
      setHoveredPoint(null);
    };
  }, [map, isActive, suitabilityType]);

  if (!isActive) return null;

  return (
    <>
      <div
        style={{
          position: 'absolute', top: 100, right: 20,
          background: 'rgba(2, 6, 23, 0.9)', padding: 12, borderRadius: 8,
          backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)',
          zIndex: 100
        }}
      >
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>
            🏗️ Land Suitability
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4 }}>
          {Object.entries(SUITABILITY_TYPES).map(([key, config]) => (
            <button
              key={key}
              onClick={() => setSuitabilityType(key)}
              style={{
                padding: '6px 8px', borderRadius: 6,
                border: suitabilityType === key ? '2px solid #60a5fa' : '1px solid rgba(255,255,255,0.2)',
                background: suitabilityType === key ? 'rgba(96, 165, 250, 0.1)' : 'transparent',
                color: suitabilityType === key ? '#60a5fa' : '#94a3b8',
                fontSize: 11, fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s ease',
                whiteSpace: 'nowrap'
              }}
            >
              {config.icon} {config.label}
            </button>
          ))}
        </div>
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
          Suitability Legend
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[
            { color: '#2e7d32', label: 'High (75-100%)' },
            { color: '#7cb342', label: 'Good (50-75%)' },
            { color: '#fbc02d', label: 'Moderate (25-50%)' },
            { color: '#f57c00', label: 'Low (0-25%)' },
            { color: '#d32f2f', label: 'Unsuitable' }
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
            Land Suitability: {hoveredPoint.suitability}%
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10 }}>
            <div>Slope: {Math.round(hoveredPoint.factors.slope * 100)}%</div>
            <div>Roads: {Math.round(hoveredPoint.factors.roads * 100)}%</div>
            <div>Water: {Math.round(hoveredPoint.factors.water * 100)}%</div>
            <div>Infrastructure: {Math.round(hoveredPoint.factors.infrastructure * 100)}%</div>
          </div>
        </div>
      )}
    </>
  );
}