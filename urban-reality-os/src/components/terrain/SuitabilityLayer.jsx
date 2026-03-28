import { useEffect, useState, useRef } from 'react';
import { useTerrain } from '../../hooks/map/useTerrain';

const SUITABILITY_TYPES = {
  housing: {
    label: 'Housing',
    icon: '🏠',
    weights: { slope: 0.3, roads: 0.4, water: 0.2, infrastructure: 0.1 }
  },
  commercial: {
    label: 'Commercial',
    icon: '🏢',
    weights: { slope: 0.2, roads: 0.5, water: 0.1, infrastructure: 0.2 }
  },
  industrial: {
    label: 'Industrial',
    icon: '🏭',
    weights: { slope: 0.4, roads: 0.3, water: 0.2, infrastructure: 0.1 }
  }
};

const SUITABILITY_COLORS = [
  [0, '#d32f2f'],     // Red (unsuitable)
  [0.25, '#f57c00'],  // Orange
  [0.5, '#fbc02d'],   // Yellow
  [0.75, '#7cb342'],  // Light green
  [1, '#2e7d32']      // Green (suitable)
];

export default function SuitabilityLayer({ map, isActive, onLoadingChange }) {
  const { getTerrainMetrics, prefetchTerrainGrid } = useTerrain();
  const [suitabilityType, setSuitabilityType] = useState('housing');
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const hoverPopupRef = useRef(null);

  // Mock data for roads and infrastructure (in real app, this would come from APIs)
  const mockInfrastructure = {
    roads: [
      { lng: 77.2, lat: 28.6, type: 'highway' },
      { lng: 77.25, lat: 28.62, type: 'main' }
    ],
    water: [
      { lng: 77.22, lat: 28.58, type: 'river' }
    ],
    infrastructure: [
      { lng: 77.21, lat: 28.61, type: 'power' }
    ]
  };

  const calculateSuitability = (lng, lat) => {
    const { elevation, slope } = getTerrainMetrics(map, { lng, lat });
    const weights = SUITABILITY_TYPES[suitabilityType].weights;

    // Distance to nearest road
    let minRoadDist = Infinity;
    mockInfrastructure.roads.forEach(road => {
      const dist = Math.sqrt(
        Math.pow(lng - road.lng, 2) + Math.pow(lat - road.lat, 2)
      );
      minRoadDist = Math.min(minRoadDist, dist);
    });
    const roadScore = Math.max(0, 1 - minRoadDist * 100); // Closer = better

    // Distance to water
    let minWaterDist = Infinity;
    mockInfrastructure.water.forEach(water => {
      const dist = Math.sqrt(
        Math.pow(lng - water.lng, 2) + Math.pow(lat - water.lat, 2)
      );
      minWaterDist = Math.min(minWaterDist, dist);
    });
    const waterScore = Math.max(0, 1 - minWaterDist * 50); // Moderate distance preferred

    // Slope score (flatter = better)
    const slopeScore = Math.max(0, 1 - slope / 45);

    // Infrastructure proximity
    let minInfraDist = Infinity;
    mockInfrastructure.infrastructure.forEach(infra => {
      const dist = Math.sqrt(
        Math.pow(lng - infra.lng, 2) + Math.pow(lat - infra.lat, 2)
      );
      minInfraDist = Math.min(minInfraDist, dist);
    });
    const infraScore = Math.max(0, 1 - minInfraDist * 200); // Closer = better for commercial

    const totalScore = (
      weights.slope * slopeScore +
      weights.roads * roadScore +
      weights.water * waterScore +
      weights.infrastructure * infraScore
    );

    return {
      score: Math.min(1, Math.max(0, totalScore)),
      factors: {
        slope: slopeScore,
        roads: roadScore,
        water: waterScore,
        infrastructure: infraScore
      }
    };
  };

  useEffect(() => {
    if (!map || !isActive) return;

    onLoadingChange(true);

    try {
      // Create suitability grid
      prefetchTerrainGrid(map, map.getBounds(), 0.003);
      const bounds = map.getBounds();
      const features = [];
      const step = 0.003; // Coarser grid for scalable suitability rendering

      for (let lng = bounds.getWest(); lng <= bounds.getEast(); lng += step) {
        for (let lat = bounds.getSouth(); lat <= bounds.getNorth(); lat += step) {
          const suitability = calculateSuitability(lng, lat);

          features.push({
            type: 'Feature',
            properties: {
              suitability: suitability.score,
              ...suitability.factors
            },
            geometry: {
              type: 'Polygon',
              coordinates: [[
                [lng, lat],
                [lng + step, lat],
                [lng + step, lat + step],
                [lng, lat + step],
                [lng, lat]
              ]]
            }
          });
        }
      }

      // Add suitability source
      if (!map.getSource('suitability-data')) {
        map.addSource('suitability-data', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features }
        });
      } else {
        map.getSource('suitability-data').setData({ type: 'FeatureCollection', features });
      }

      // Add suitability layer
      if (!map.getLayer('suitability-fill')) {
        map.addLayer({
          id: 'suitability-fill',
          type: 'fill',
          source: 'suitability-data',
          paint: {
            'fill-color': [
              'interpolate',
              ['linear'],
              ['get', 'suitability'],
              ...SUITABILITY_COLORS.flat()
            ],
            'fill-opacity': 0.6
          }
        });
      }

      // Add hover interaction
      const handleMouseMove = (e) => {
        if (!isActive) return;

        const features = map.queryRenderedFeatures(e.point, {
          layers: ['suitability-fill']
        });

        if (features.length > 0) {
          const coords = e.lngLat;
          const suitability = calculateSuitability(coords.lng, coords.lat);

          setHoveredPoint({
            lng: coords.lng,
            lat: coords.lat,
            suitability: Math.round(suitability.score * 100),
            factors: suitability.factors,
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
      map.on('mouseleave', 'suitability-fill', handleMouseLeave);

      onLoadingChange(false);

      return () => {
        map.off('mousemove', handleMouseMove);
        map.off('mouseleave', 'suitability-fill', handleMouseLeave);
      };

    } catch (error) {
      console.error('Error initializing suitability layer:', error);
      onLoadingChange(false);
    }
  }, [map, isActive, suitabilityType, onLoadingChange]);

  // Update layer when type changes
  useEffect(() => {
    if (!map || !isActive) return;

    try {
      const bounds = map.getBounds();
      const features = [];
      const step = 0.001;

      for (let lng = bounds.getWest(); lng <= bounds.getEast(); lng += step) {
        for (let lat = bounds.getSouth(); lat <= bounds.getNorth(); lat += step) {
          const suitability = calculateSuitability(lng, lat);

          features.push({
            type: 'Feature',
            properties: {
              suitability: suitability.score,
              ...suitability.factors
            },
            geometry: {
              type: 'Polygon',
              coordinates: [[
                [lng, lat],
                [lng + step, lat],
                [lng + step, lat + step],
                [lng, lat + step],
                [lng, lat]
              ]]
            }
          });
        }
      }

      if (map.getSource('suitability-data')) {
        map.getSource('suitability-data').setData({ type: 'FeatureCollection', features });
      }
    } catch (error) {
      console.error('Error updating suitability data:', error);
    }
  }, [suitabilityType, map, isActive]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (!map) return;
      try {
        if (map.getLayer('suitability-fill')) {
          map.removeLayer('suitability-fill');
        }
        if (map.getSource('suitability-data')) {
          map.removeSource('suitability-data');
        }
      } catch (error) {
        console.error('Error cleaning up suitability layer:', error);
      }
    };
  }, [map]);

  if (!isActive) return null;

  return (
    <>
      {/* Type Selector */}
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
        <div style={{ marginBottom: 8 }}>
          <div style={{
            fontSize: 14,
            fontWeight: 600,
            color: '#f1f5f9'
          }}>
            🏗️ Land Suitability
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4 }}>
          {Object.entries(SUITABILITY_TYPES).map(([key, config]) => (
            <button
              key={key}
              onClick={() => setSuitabilityType(key)}
              style={{
                padding: '6px 8px',
                borderRadius: 6,
                border: suitabilityType === key ? '2px solid #60a5fa' : '1px solid rgba(255,255,255,0.2)',
                background: suitabilityType === key ? 'rgba(96, 165, 250, 0.1)' : 'transparent',
                color: suitabilityType === key ? '#60a5fa' : '#94a3b8',
                fontSize: 11,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap'
              }}
            >
              {config.icon} {config.label}
            </button>
          ))}
        </div>
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
              <div
                style={{
                  width: 12,
                  height: 12,
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