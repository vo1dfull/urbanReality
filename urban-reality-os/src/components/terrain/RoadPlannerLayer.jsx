import { useEffect, useState, useCallback } from 'react';
import LayerEngine from '../../engines/LayerEngine';
import InteractionEngine from '../../engines/InteractionEngine';
import { terrainEngine } from '../../engines/TerrainEngine';

const ROAD_COLORS = {
  optimal: '#22c55e',
  good: '#f59e0b',
  poor: '#ef4444'
};

export default function RoadPlannerLayer({ map, isActive }) {
  const [isPlanning, setIsPlanning] = useState(false);
  const [roadPath, setRoadPath] = useState([]);
  const [pathAnalysis, setPathAnalysis] = useState(null);
  const [hoveredPoint, setHoveredPoint] = useState(null);

  const analyzeAndDraw = useCallback((newPath) => {
    const plugin = LayerEngine.getPlugin('terrainRoad');
    if (!plugin || !map) return;

    if (newPath.length >= 2) {
      const analysis = plugin.analyzePath(map, newPath);
      setPathAnalysis(analysis);
      plugin.updatePath(map, newPath, analysis?.quality || 'optimal');
    } else {
      setPathAnalysis(null);
      plugin.updatePath(map, newPath, 'optimal');
    }
  }, [map]);

  const clearPath = useCallback(() => {
    setRoadPath([]);
    setPathAnalysis(null);
    const plugin = LayerEngine.getPlugin('terrainRoad');
    if (plugin && map) {
      plugin.clearPath(map);
    }
  }, [map]);

  const suggestBetterRoute = useCallback(() => {
    if (roadPath.length < 2) return;
    const plugin = LayerEngine.getPlugin('terrainRoad');
    if (!plugin || !map) return;

    const start = roadPath[0];
    const end = roadPath[roadPath.length - 1];
    const alternative = plugin.suggestAlternativeRoute(map, start, end);

    if (alternative) {
      setRoadPath(alternative);
      analyzeAndDraw(alternative);
    }
  }, [map, roadPath, analyzeAndDraw]);

  useEffect(() => {
    if (!map || !isActive) return;

    const handleMapClick = (e) => {
      if (!isPlanning) return;
      const coords = [e.lngLat.lng, e.lngLat.lat];
      setRoadPath(prev => {
        const newPath = [...prev, coords];
        analyzeAndDraw(newPath);
        return newPath;
      });
    };

    const handleMouseMove = (e) => {
      const metrics = terrainEngine.getTerrainMetrics(map, e.lngLat);
      setHoveredPoint({
        lng: e.lngLat.lng,
        lat: e.lngLat.lat,
        slope: Math.round(metrics.slope * 10) / 10,
        elevation: Math.round(metrics.elevation),
        screenX: e.point.x,
        screenY: e.point.y
      });
    };

    const handleMouseLeave = () => setHoveredPoint(null);

    const clickKey = InteractionEngine.attachEvent(map, 'click', null, handleMapClick);
    const moveKey = InteractionEngine.attachEvent(map, 'mousemove', null, handleMouseMove);
    const leaveKey = InteractionEngine.attachEvent(map, 'mouseleave', null, handleMouseLeave);

    return () => {
      InteractionEngine.detachEvent(map, clickKey);
      InteractionEngine.detachEvent(map, moveKey);
      InteractionEngine.detachEvent(map, leaveKey);
    };
  }, [map, isActive, isPlanning, analyzeAndDraw]);

  useEffect(() => {
    if (!isActive) clearPath();
  }, [isActive, clearPath]);

  if (!isActive) return null;

  return (
    <>
      <div
        style={{
          position: 'absolute', top: 100, right: 20,
          background: 'rgba(2, 6, 23, 0.9)', padding: 16, borderRadius: 12,
          backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)',
          minWidth: 300, zIndex: 100
        }}
      >
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>
            🛣️ Terrain-Aware Road Planner
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
            Plan optimal routes considering terrain
          </div>
        </div>

        <button
          onClick={() => {
            setIsPlanning(!isPlanning);
            if (!isPlanning) clearPath();
          }}
          style={{
            width: '100%', padding: '10px',
            background: isPlanning ? 'rgba(96, 165, 250, 0.8)' : 'rgba(96, 165, 250, 0.6)',
            border: 'none', borderRadius: 8,
            color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            transition: 'all 0.2s ease', marginBottom: 12
          }}
        >
          {isPlanning ? '🖱️ Click Points to Plan Route' : '🚀 Start Road Planning'}
        </button>

        {isPlanning && (
          <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', marginBottom: 12 }}>
            Click on map to add route points
          </div>
        )}

        {pathAnalysis && (
          <div style={{ background: 'rgba(255,255,255,0.05)', padding: 12, borderRadius: 8, marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#f1f5f9', marginBottom: 8 }}>Route Analysis</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 10, color: '#94a3b8' }}>Length</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>{Math.round(pathAnalysis.totalLength)}m</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#94a3b8' }}>Avg Slope</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>{pathAnalysis.avgSlope}°</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#94a3b8' }}>Max Slope</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>{pathAnalysis.maxSlope}°</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#94a3b8' }}>Quality</div>
                <div style={{
                  fontSize: 12, fontWeight: 600,
                  color: pathAnalysis.quality === 'optimal' ? ROAD_COLORS.optimal :
                    pathAnalysis.quality === 'good' ? ROAD_COLORS.good : ROAD_COLORS.poor
                }}>
                  {pathAnalysis.quality.toUpperCase()}
                </div>
              </div>
            </div>

            {pathAnalysis.issues.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>Issues:</div>
                {pathAnalysis.issues.map((issue, i) => (
                  <div key={i} style={{ fontSize: 11, color: '#f59e0b' }}>• {issue}</div>
                ))}
              </div>
            )}
            <div style={{ fontSize: 10, color: '#94a3b8' }}>
              Est. Cost: ₹{pathAnalysis.costEstimate.toLocaleString()}
            </div>
          </div>
        )}

        {roadPath.length > 0 && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={suggestBetterRoute}
              style={{
                flex: 1, padding: '8px', background: 'rgba(34, 197, 94, 0.8)',
                border: 'none', borderRadius: 6, color: 'white', fontSize: 12,
                fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s ease'
              }}
            >
              ✨ Optimize
            </button>
            <button
              onClick={clearPath}
              style={{
                flex: 1, padding: '8px', background: 'rgba(220, 53, 69, 0.8)',
                border: 'none', borderRadius: 6, color: 'white', fontSize: 12,
                fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s ease'
              }}
            >
              Clear
            </button>
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
          Route Quality
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[
            { color: ROAD_COLORS.optimal, label: 'Optimal' },
            { color: ROAD_COLORS.good, label: 'Good' },
            { color: ROAD_COLORS.poor, label: 'Poor' }
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 12, height: 4, background: item.color, borderRadius: 2 }} />
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
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Terrain Preview</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div>Elevation: {hoveredPoint.elevation}m</div>
            <div>Slope: {hoveredPoint.slope}°</div>
          </div>
        </div>
      )}
    </>
  );
}