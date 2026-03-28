import { useEffect, useState, useRef } from 'react';
import { useTerrain } from '../../hooks/map/useTerrain';

const ELEVATION_COLORS = [
  [0, '#2d5016'],      // Deep green (low elevation)
  [100, '#4a7c59'],    // Green
  [300, '#7cb342'],    // Light green
  [600, '#c0ca33'],    // Yellow-green
  [1000, '#fdd835'],   // Yellow
  [1500, '#fb8c00'],   // Orange
  [2000, '#f4511e'],   // Red-orange
  [2500, '#d32f2f'],   // Red
  [3000, '#8d6e63']    // Brown (high elevation)
];

const SLOPE_COLORS = [
  [0, '#2e7d32'],      // Green (flat)
  [5, '#66bb6a'],      // Light green
  [15, '#ffee58'],     // Yellow
  [30, '#ff9800'],     // Orange
  [45, '#f44336'],     // Red
  [60, '#8d6e63']      // Brown (steep)
];

export default function ElevationLayer({ map, isActive, onLoadingChange }) {
  const { getTerrainMetrics } = useTerrain();
  const [mode, setMode] = useState('elevation'); // 'elevation' or 'slope'
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const hoverPopupRef = useRef(null);

  useEffect(() => {
    if (!map || !isActive) return;

    onLoadingChange(true);

    try {
      // Add elevation source if not exists
      if (!map.getSource('elevation-data')) {
        map.addSource('elevation-data', {
          type: 'vector',
          url: 'https://api.maptiler.com/tiles/contours/tiles.json?key=UQBNCVHquLf1PybiywBt'
        });
      }

      // Add elevation layer
      if (!map.getLayer('elevation-fill')) {
        map.addLayer({
          id: 'elevation-fill',
          type: 'fill',
          source: 'elevation-data',
          'source-layer': 'contour',
          paint: {
            'fill-color': [
              'interpolate',
              ['linear'],
              ['get', 'ele'],
              ...ELEVATION_COLORS.flat()
            ],
            'fill-opacity': 0.6
          }
        });
      }

      // Add slope layer (initially hidden)
      if (!map.getLayer('slope-fill')) {
        map.addLayer({
          id: 'slope-fill',
          type: 'fill',
          source: 'elevation-data',
          'source-layer': 'contour',
          paint: {
            'fill-color': [
              'interpolate',
              ['linear'],
              ['get', 'slope'],
              ...SLOPE_COLORS.flat()
            ],
            'fill-opacity': 0.6
          }
        });
        map.setLayoutProperty('slope-fill', 'visibility', 'none');
      }

      // Add hover interaction
      const handleMouseMove = (e) => {
        if (!isActive) return;

        const features = map.queryRenderedFeatures(e.point, {
          layers: ['elevation-fill', 'slope-fill']
        });

        if (features.length > 0) {
          const coords = e.lngLat;
          const metrics = getTerrainMetrics(map, coords);

          setHoveredPoint({
            lng: coords.lng,
            lat: coords.lat,
            elevation: Math.round(metrics.elevation),
            slope: Math.round(metrics.slope * 100) / 100,
            screenX: e.point.x,
            screenY: e.point.y
          });
        } else {
          setHoveredPoint(null);
        }
      };

      const handleMouseLeave = () => {
        setHoveredPoint(null);
      };

      map.on('mousemove', handleMouseMove);
      map.on('mouseleave', 'elevation-fill', handleMouseLeave);
      map.on('mouseleave', 'slope-fill', handleMouseLeave);

      onLoadingChange(false);

      return () => {
        map.off('mousemove', handleMouseMove);
        map.off('mouseleave', 'elevation-fill', handleMouseLeave);
        map.off('mouseleave', 'slope-fill', handleMouseLeave);
      };

    } catch (error) {
      console.error('Error initializing elevation layer:', error);
      onLoadingChange(false);
    }
  }, [map, isActive, getTerrainMetrics, onLoadingChange]);

  // Toggle between elevation and slope
  useEffect(() => {
    if (!map || !isActive) return;

    try {
      if (mode === 'elevation') {
        map.setLayoutProperty('elevation-fill', 'visibility', 'visible');
        map.setLayoutProperty('slope-fill', 'visibility', 'none');
      } else {
        map.setLayoutProperty('elevation-fill', 'visibility', 'none');
        map.setLayoutProperty('slope-fill', 'visibility', 'visible');
      }
    } catch (error) {
      console.error('Error toggling elevation mode:', error);
    }
  }, [map, isActive, mode]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (!map) return;
      try {
        if (map.getLayer('elevation-fill')) {
          map.removeLayer('elevation-fill');
        }
        if (map.getLayer('slope-fill')) {
          map.removeLayer('slope-fill');
        }
        if (map.getSource('elevation-data')) {
          map.removeSource('elevation-data');
        }
      } catch (error) {
        console.error('Error cleaning up elevation layer:', error);
      }
    };
  }, [map]);

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