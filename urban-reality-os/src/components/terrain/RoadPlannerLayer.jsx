import { useEffect, useState, useRef, useCallback } from 'react';
import { useTerrain } from '../../hooks/map/useTerrain';

const ROAD_COLORS = {
  optimal: '#22c55e',    // Green
  good: '#f59e0b',       // Yellow
  poor: '#ef4444'        // Red
};

export default function RoadPlannerLayer({ map, isActive, onLoadingChange }) {
  const { getTerrainMetrics } = useTerrain();
  const [isPlanning, setIsPlanning] = useState(false);
  const [roadPath, setRoadPath] = useState([]);
  const [pathAnalysis, setPathAnalysis] = useState(null);
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const hoverPopupRef = useRef(null);

  const analyzePath = useCallback((path) => {
    if (path.length < 2) return null;

    let totalLength = 0;
    let totalSlope = 0;
    let maxSlope = 0;
    let slopeSum = 0;
    let pointCount = 0;

    for (let i = 1; i < path.length; i++) {
      const prev = path[i - 1];
      const curr = path[i];

      // Calculate distance
      const distance = Math.sqrt(
        Math.pow(curr[0] - prev[0], 2) + Math.pow(curr[1] - prev[1], 2)
      );
      totalLength += distance;

      // Get terrain metrics
      const metrics = getTerrainMetrics(map, { lng: curr[0], lat: curr[1] });
      slopeSum += metrics.slope;
      maxSlope = Math.max(maxSlope, metrics.slope);
      pointCount++;
    }

    const avgSlope = slopeSum / pointCount;

    // Determine path quality
    let quality = 'optimal';
    let issues = [];

    if (maxSlope > 30) {
      quality = 'poor';
      issues.push('Steep sections detected');
    } else if (maxSlope > 15) {
      quality = 'good';
      issues.push('Moderate slopes');
    }

    if (avgSlope > 20) {
      quality = quality === 'optimal' ? 'good' : 'poor';
      issues.push('High average slope');
    }

    return {
      totalLength: totalLength * 111000, // Convert to meters (rough approximation)
      avgSlope: Math.round(avgSlope * 10) / 10,
      maxSlope: Math.round(maxSlope * 10) / 10,
      quality,
      issues,
      costEstimate: Math.round(totalLength * 111000 * (1 + avgSlope / 100) * 50) // Rough cost calculation
    };
  }, [getTerrainMetrics, map]);

  const suggestAlternativeRoute = useCallback((start, end) => {
    // Simple A* pathfinding with terrain cost
    const gridSize = 0.001; // 100m grid
    const maxIterations = 100;
    let iterations = 0;

    const startGrid = [
      Math.round(start[0] / gridSize) * gridSize,
      Math.round(start[1] / gridSize) * gridSize
    ];
    const endGrid = [
      Math.round(end[0] / gridSize) * gridSize,
      Math.round(end[1] / gridSize) * gridSize
    ];

    // Simple greedy path: try to minimize slope changes
    const path = [start];
    let current = [...start];
    const visited = new Set();

    while (iterations < maxIterations) {
      const key = `${current[0].toFixed(4)},${current[1].toFixed(4)}`;
      if (visited.has(key)) break;
      visited.add(key);

      // Check if close to end
      const distanceToEnd = Math.sqrt(
        Math.pow(current[0] - end[0], 2) + Math.pow(current[1] - end[1], 2)
      );
      if (distanceToEnd < gridSize) {
        path.push(end);
        break;
      }

      // Try different directions
      const directions = [
        [gridSize, 0], [0, gridSize], [-gridSize, 0], [0, -gridSize],
        [gridSize, gridSize], [gridSize, -gridSize], [-gridSize, gridSize], [-gridSize, -gridSize]
      ];

      let bestNext = null;
      let bestScore = Infinity;

      for (const [dx, dy] of directions) {
        const next = [current[0] + dx, current[1] + dy];
        const metrics = getTerrainMetrics(map, { lng: next[0], lat: next[1] });
        const distanceCost = Math.sqrt(dx * dx + dy * dy);
        const slopeCost = metrics.slope * 10; // Penalize steep slopes
        const totalCost = distanceCost + slopeCost;

        if (totalCost < bestScore) {
          bestScore = totalCost;
          bestNext = next;
        }
      }

      if (!bestNext) break;

      path.push(bestNext);
      current = bestNext;
      iterations++;
    }

    return path.length > 1 ? path : null;
  }, [getTerrainMetrics, map]);

  useEffect(() => {
    if (!map || !isActive) return;

    onLoadingChange(true);

    try {
      // Add road planning layers
      if (!map.getSource('road-path')) {
        map.addSource('road-path', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        });
      }

      if (!map.getLayer('road-path-line')) {
        map.addLayer({
          id: 'road-path-line',
          type: 'line',
          source: 'road-path',
          paint: {
            'line-color': [
              'match',
              ['get', 'quality'],
              'optimal', ROAD_COLORS.optimal,
              'good', ROAD_COLORS.good,
              'poor', ROAD_COLORS.poor,
              ROAD_COLORS.optimal
            ],
            'line-width': 4,
            'line-opacity': 0.8
          }
        });
      }

      // Click to add path points
      const handleMapClick = (e) => {
        if (!isActive || !isPlanning) return;

        const coords = [e.lngLat.lng, e.lngLat.lat];
        setRoadPath(prev => {
          const newPath = [...prev, coords];

          if (newPath.length >= 2) {
            const analysis = analyzePath(newPath);
            setPathAnalysis(analysis);

            // Update map
            const feature = {
              type: 'Feature',
              properties: { quality: analysis?.quality || 'optimal' },
              geometry: {
                type: 'LineString',
                coordinates: newPath
              }
            };

            map.getSource('road-path').setData({
              type: 'FeatureCollection',
              features: [feature]
            });
          }

          return newPath;
        });
      };

      // Hover for terrain preview
      const handleMouseMove = (e) => {
        if (!isActive) return;

        const coords = e.lngLat;
        const metrics = getTerrainMetrics(map, coords);

        setHoveredPoint({
          lng: coords.lng,
          lat: coords.lat,
          slope: Math.round(metrics.slope * 10) / 10,
          elevation: Math.round(metrics.elevation),
          screenX: e.point.x,
          screenY: e.point.y
        });
      };

      const handleMouseLeave = () => {
        setHoveredPoint(null);
      };

      map.on('click', handleMapClick);
      map.on('mousemove', handleMouseMove);
      map.on('mouseleave', handleMouseLeave);

      onLoadingChange(false);

      return () => {
        map.off('click', handleMapClick);
        map.off('mousemove', handleMouseMove);
        map.off('mouseleave', handleMouseLeave);
      };

    } catch (error) {
      console.error('Error initializing road planner layer:', error);
      onLoadingChange(false);
    }
  }, [map, isActive, isPlanning, analyzePath, onLoadingChange]);

  const clearPath = () => {
    setRoadPath([]);
    setPathAnalysis(null);
    if (map?.getSource('road-path')) {
      map.getSource('road-path').setData({ type: 'FeatureCollection', features: [] });
    }
  };

  const suggestBetterRoute = () => {
    if (roadPath.length < 2) return;

    const start = roadPath[0];
    const end = roadPath[roadPath.length - 1];
    const alternative = suggestAlternativeRoute(start, end);

    if (alternative) {
      setRoadPath(alternative);
      const analysis = analyzePath(alternative);
      setPathAnalysis(analysis);

      const feature = {
        type: 'Feature',
        properties: { quality: analysis?.quality || 'optimal' },
        geometry: {
          type: 'LineString',
          coordinates: alternative
        }
      };

      map.getSource('road-path').setData({
        type: 'FeatureCollection',
        features: [feature]
      });
    }
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (!map) return;
      try {
        if (map.getLayer('road-path-line')) map.removeLayer('road-path-line');
        if (map.getSource('road-path')) map.removeSource('road-path');
      } catch (error) {
        console.error('Error cleaning up road planner layer:', error);
      }
    };
  }, [map]);

  if (!isActive) return null;

  return (
    <>
      {/* Control Panel */}
      <div
        style={{
          position: 'absolute',
          top: 100,
          right: 20,
          background: 'rgba(2, 6, 23, 0.9)',
          padding: 16,
          borderRadius: 12,
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.1)',
          minWidth: 300,
          zIndex: 100
        }}
      >
        <div style={{ marginBottom: 12 }}>
          <div style={{
            fontSize: 14,
            fontWeight: 600,
            color: '#f1f5f9'
          }}>
            🛣️ Terrain-Aware Road Planner
          </div>
          <div style={{
            fontSize: 12,
            color: '#94a3b8',
            marginTop: 4
          }}>
            Plan optimal routes considering terrain
          </div>
        </div>

        {/* Planning Toggle */}
        <button
          onClick={() => {
            setIsPlanning(!isPlanning);
            if (!isPlanning) {
              clearPath();
            }
          }}
          style={{
            width: '100%',
            padding: '10px',
            background: isPlanning ? 'rgba(96, 165, 250, 0.8)' : 'rgba(96, 165, 250, 0.6)',
            border: 'none',
            borderRadius: 8,
            color: 'white',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            marginBottom: 12
          }}
          onMouseEnter={(e) => {
            e.target.style.background = 'rgba(96, 165, 250, 1)';
          }}
          onMouseLeave={(e) => {
            e.target.style.background = isPlanning ? 'rgba(96, 165, 250, 0.8)' : 'rgba(96, 165, 250, 0.6)';
          }}
        >
          {isPlanning ? '🖱️ Click Points to Plan Route' : '🚀 Start Road Planning'}
        </button>

        {isPlanning && (
          <div style={{
            fontSize: 11,
            color: '#94a3b8',
            textAlign: 'center',
            marginBottom: 12
          }}>
            Click on map to add route points
          </div>
        )}

        {/* Path Analysis */}
        {pathAnalysis && (
          <div style={{
            background: 'rgba(255,255,255,0.05)',
            padding: 12,
            borderRadius: 8,
            marginBottom: 12
          }}>
            <div style={{
              fontSize: 12,
              fontWeight: 600,
              color: '#f1f5f9',
              marginBottom: 8
            }}>
              Route Analysis
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 10, color: '#94a3b8' }}>Length</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>
                  {Math.round(pathAnalysis.totalLength)}m
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#94a3b8' }}>Avg Slope</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>
                  {pathAnalysis.avgSlope}°
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#94a3b8' }}>Max Slope</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>
                  {pathAnalysis.maxSlope}°
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#94a3b8' }}>Quality</div>
                <div style={{
                  fontSize: 12,
                  fontWeight: 600,
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

        {/* Action Buttons */}
        {roadPath.length > 0 && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={suggestBetterRoute}
              style={{
                flex: 1,
                padding: '8px',
                background: 'rgba(34, 197, 94, 0.8)',
                border: 'none',
                borderRadius: 6,
                color: 'white',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.target.style.background = 'rgba(34, 197, 94, 1)';
              }}
              onMouseLeave={(e) => {
                e.target.style.background = 'rgba(34, 197, 94, 0.8)';
              }}
            >
              ✨ Optimize
            </button>
            <button
              onClick={clearPath}
              style={{
                flex: 1,
                padding: '8px',
                background: 'rgba(220, 53, 69, 0.8)',
                border: 'none',
                borderRadius: 6,
                color: 'white',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.target.style.background = 'rgba(220, 53, 69, 1)';
              }}
              onMouseLeave={(e) => {
                e.target.style.background = 'rgba(220, 53, 69, 0.8)';
              }}
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Legend */}
      <div
        style={{
          position: 'absolute',
          bottom: 120,
          right: 20,
          background: 'rgba(2, 6, 23, 0.9)',
          padding: 12,
          borderRadius: 8,
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.1)',
          zIndex: 100
        }}
      >
        <div style={{
          fontSize: 12,
          fontWeight: 600,
          color: '#f1f5f9',
          marginBottom: 8
        }}>
          Route Quality
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[
            { color: ROAD_COLORS.optimal, label: 'Optimal' },
            { color: ROAD_COLORS.good, label: 'Good' },
            { color: ROAD_COLORS.poor, label: 'Poor' }
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: 12,
                  height: 4,
                  background: item.color,
                  borderRadius: 2
                }}
              />
              <span style={{ fontSize: 11, color: '#e2e8f0' }}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Hover Tooltip */}
      {hoveredPoint && (
        <div
          ref={hoverPopupRef}
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
            Terrain Preview
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div>Elevation: {hoveredPoint.elevation}m</div>
            <div>Slope: {hoveredPoint.slope}°</div>
          </div>
        </div>
      )}
    </>
  );
}