import { useEffect } from 'react';
import useMapStore from '../../store/useMapStore';
import InteractionEngine from '../../engines/InteractionEngine';
import LayerEngine from '../../engines/LayerEngine';
import { terrainEngine } from '../../engines/TerrainEngine';

export default function ElevationLayer({ map, isActive, year, onLoadingChange }) {
  const mode = useMapStore((s) => s.terrainMode);
  const setMode = useMapStore((s) => s.setTerrainMode);
  const hoveredPoint = useMapStore((s) => s.terrainHoveredPoint);
  const setHoveredPoint = useMapStore((s) => s.setTerrainHoveredPoint);

  // Setup hover interaction using engine
  useEffect(() => {
    if (!isActive || !map) {
      setHoveredPoint(null);
      return;
    }

    const handleMouseMove = (e) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: ['elevation-fill', 'slope-fill']
      });

      if (features.length > 0) {
        const metrics = terrainEngine.getTerrainMetrics(map, e.lngLat);
        setHoveredPoint({
          lng: e.lngLat.lng,
          lat: e.lngLat.lat,
          elevation: Math.round(metrics.elevation),
          slope: Math.round(metrics.slope * 100) / 100,
          screenX: e.point.x,
          screenY: e.point.y
        });
      } else {
        setHoveredPoint(null);
      }
    };

    const handleMouseLeave = () => setHoveredPoint(null);

    const moveKey = InteractionEngine.attachEvent(map, 'mousemove', null, handleMouseMove);
    const leaveKeyEle = InteractionEngine.attachEvent(map, 'mouseleave', 'elevation-fill', handleMouseLeave);
    const leaveKeySlope = InteractionEngine.attachEvent(map, 'mouseleave', 'slope-fill', handleMouseLeave);

    return () => {
      InteractionEngine.detachEvent(map, moveKey);
      InteractionEngine.detachEvent(map, leaveKeyEle);
      InteractionEngine.detachEvent(map, leaveKeySlope);
      setHoveredPoint(null);
    };
  }, [map, isActive]);

  if (!isActive) return null;

  return (
    <>
      {/* Mode Toggle */}
      <div
        style={{
          position: 'absolute',
          top: 100,
          right: 20,
          background: 'rgba(2, 6, 23, 0.9)',
          padding: 12,
          borderRadius: 8,
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.1)',
          zIndex: 100
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => setMode('elevation')}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: mode === 'elevation' ? '2px solid #60a5fa' : '1px solid rgba(255,255,255,0.2)',
              background: mode === 'elevation' ? 'rgba(96, 165, 250, 0.1)' : 'transparent',
              color: mode === 'elevation' ? '#60a5fa' : '#94a3b8',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            Elevation
          </button>
          <button
            onClick={() => setMode('slope')}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: mode === 'slope' ? '2px solid #60a5fa' : '1px solid rgba(255,255,255,0.2)',
              background: mode === 'slope' ? 'rgba(96, 165, 250, 0.1)' : 'transparent',
              color: mode === 'slope' ? '#60a5fa' : '#94a3b8',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            Slope
          </button>
        </div>
      </div>

      {/* Hover Tooltip */}
      {hoveredPoint && (
        <div
          style={{
            position: 'absolute',
            left: hoveredPoint.screenX + 10,
            top: hoveredPoint.screenY - 10,
            background: 'rgba(2, 6, 23, 0.95)',
            padding: '8px 12px',
            borderRadius: 6,
            color: 'white',
            fontSize: 12,
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            zIndex: 1000,
            pointerEvents: 'none',
            transform: 'translateY(-100%)'
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {mode === 'elevation' ? 'Elevation' : 'Slope'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {mode === 'elevation' ? (
              <div>Altitude: {hoveredPoint.elevation}m</div>
            ) : (
              <div>Slope: {hoveredPoint.slope}°</div>
            )}
            <div style={{ fontSize: 10, color: '#94a3b8' }}>
              {hoveredPoint.lat.toFixed(4)}, {hoveredPoint.lng.toFixed(4)}
            </div>
          </div>
        </div>
      )}
    </>
  );
}