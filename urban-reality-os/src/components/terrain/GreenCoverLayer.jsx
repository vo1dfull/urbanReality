import { useEffect, useState, useRef } from 'react';

const GREEN_COVER_COLORS = [
  [0, '#8B4513'],     // Brown (no vegetation)
  [0.2, '#DAA520'],   // Goldenrod
  [0.4, '#9ACD32'],   // Yellow green
  [0.6, '#32CD32'],   // Lime green
  [0.8, '#228B22'],   // Forest green
  [1, '#006400']      // Dark green (dense vegetation)
];

export default function GreenCoverLayer({ map, isActive, onLoadingChange }) {
  const [greenCoverData, setGreenCoverData] = useState(null);
  const [environmentScore, setEnvironmentScore] = useState(65);
  const [isAddingZone, setIsAddingZone] = useState(false);
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const hoverPopupRef = useRef(null);

  // Mock NDVI (Normalized Difference Vegetation Index) data
  // In real app, this would come from satellite imagery APIs
  const getNDVI = (lng, lat) => {
    // Simulate vegetation patterns
    const urbanCenterDist = Math.sqrt(
      Math.pow(lng - 77.209, 2) + Math.pow(lat - 28.6139, 2)
    );

    // Parks and green areas
    const parkEffect = Math.exp(-Math.pow(urbanCenterDist - 0.005, 2) / 0.0001);
    const riverEffect = Math.exp(-Math.pow(urbanCenterDist - 0.002, 2) / 0.00005);

    // Base vegetation (sparse in urban areas)
    let ndvi = Math.max(0.1, 0.8 - urbanCenterDist * 5);

    // Add park and river effects
    ndvi += parkEffect * 0.3;
    ndvi += riverEffect * 0.4;

    // Add some random variation
    ndvi += (Math.sin(lng * 1000) * Math.cos(lat * 1000)) * 0.1;

    return Math.max(0, Math.min(1, ndvi));
  };

  const calculateEnvironmentScore = (greenFeatures) => {
    if (!greenFeatures) return 65;

    // Base score
    let score = 65;

    // Green cover percentage (from NDVI data)
    const avgNDVI = greenFeatures.reduce((sum, f) => sum + f.properties.ndvi, 0) / greenFeatures.length;
    score += avgNDVI * 20; // 0-20 points for vegetation density

    // Number of green zones added by user
    const userGreenZones = greenFeatures.filter(f => f.properties.isUserAdded).length;
    score += userGreenZones * 2; // 2 points per user-added green zone

    // Biodiversity bonus (simulated)
    score += Math.min(10, userGreenZones * 0.5);

    return Math.min(100, Math.max(0, Math.round(score)));
  };

  useEffect(() => {
    if (!map || !isActive) return;

    onLoadingChange(true);

    try {
      // Generate green cover data
      const bounds = map.getBounds();
      const features = [];
      const step = 0.0005; // Fine grid for vegetation map

      for (let lng = bounds.getWest(); lng <= bounds.getEast(); lng += step) {
        for (let lat = bounds.getSouth(); lat <= bounds.getNorth(); lat += step) {
          const ndvi = getNDVI(lng, lat);

          features.push({
            type: 'Feature',
            properties: { ndvi, isUserAdded: false },
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

      const data = { type: 'FeatureCollection', features };
      setGreenCoverData(data);
      setEnvironmentScore(calculateEnvironmentScore(features));

      // Add green cover source
      if (!map.getSource('green-cover-data')) {
        map.addSource('green-cover-data', {
          type: 'geojson',
          data
        });
      } else {
        map.getSource('green-cover-data').setData(data);
      }

      // Add green cover layer
      if (!map.getLayer('green-cover-fill')) {
        map.addLayer({
          id: 'green-cover-fill',
          type: 'fill',
          source: 'green-cover-data',
          paint: {
            'fill-color': [
              'interpolate',
              ['linear'],
              ['get', 'ndvi'],
              ...GREEN_COVER_COLORS.flat()
            ],
            'fill-opacity': 0.7
          }
        });
      }

      // Add user-added green zones source
      if (!map.getSource('user-green-zones')) {
        map.addSource('user-green-zones', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        });
      }

      if (!map.getLayer('user-green-zones-fill')) {
        map.addLayer({
          id: 'user-green-zones-fill',
          type: 'circle',
          source: 'user-green-zones',
          paint: {
            'circle-radius': 12,
            'circle-color': '#22c55e',
            'circle-opacity': 0.9,
            'circle-stroke-width': 3,
            'circle-stroke-color': '#16a34a'
          }
        });
      }

      // Click to add green zones
      const handleMapClick = (e) => {
        if (!isActive || !isAddingZone) return;

        const coords = [e.lngLat.lng, e.lngLat.lat];

        // Add to user green zones
        const currentData = map.getSource('user-green-zones')._data;
        const newFeature = {
          type: 'Feature',
          properties: { isUserAdded: true },
          geometry: {
            type: 'Point',
            coordinates: coords
          }
        };

        const newFeatures = [...currentData.features, newFeature];
        map.getSource('user-green-zones').setData({
          type: 'FeatureCollection',
          features: newFeatures
        });

        // Update environment score
        setEnvironmentScore(prev => Math.min(100, prev + 2));

        setIsAddingZone(false);
      };

      // Hover for NDVI
      const handleMouseMove = (e) => {
        if (!isActive) return;

        const coords = e.lngLat;
        const ndvi = getNDVI(coords.lng, coords.lat);

        setHoveredPoint({
          lng: coords.lng,
          lat: coords.lat,
          ndvi: Math.round(ndvi * 100),
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
      console.error('Error initializing green cover layer:', error);
      onLoadingChange(false);
    }
  }, [map, isActive, isAddingZone, onLoadingChange]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (!map) return;
      try {
        if (map.getLayer('green-cover-fill')) map.removeLayer('green-cover-fill');
        if (map.getLayer('user-green-zones-fill')) map.removeLayer('user-green-zones-fill');
        if (map.getSource('green-cover-data')) map.removeSource('green-cover-data');
        if (map.getSource('user-green-zones')) map.removeSource('user-green-zones');
      } catch (error) {
        console.error('Error cleaning up green cover layer:', error);
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
          minWidth: 280,
          zIndex: 100
        }}
      >
        <div style={{ marginBottom: 12 }}>
          <div style={{
            fontSize: 14,
            fontWeight: 600,
            color: '#f1f5f9'
          }}>
            🌳 Green Cover Analysis
          </div>
          <div style={{
            fontSize: 12,
            color: '#94a3b8',
            marginTop: 4
          }}>
            NDVI-based vegetation density
          </div>
        </div>

        {/* Environment Score */}
        <div style={{
          background: 'rgba(255,255,255,0.05)',
          padding: 12,
          borderRadius: 8,
          marginBottom: 12,
          textAlign: 'center'
        }}>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
            Environment Score
          </div>
          <div style={{
            fontSize: 24,
            fontWeight: 700,
            color: environmentScore > 80 ? '#22c55e' : environmentScore > 60 ? '#f59e0b' : '#ef4444'
          }}>
            {environmentScore}/100
          </div>
          <div style={{
            fontSize: 10,
            color: '#94a3b8',
            marginTop: 4
          }}>
            {environmentScore > 80 ? 'Excellent' : environmentScore > 60 ? 'Good' : 'Needs Improvement'}
          </div>
        </div>

        {/* Add Green Zone Button */}
        <button
          onClick={() => setIsAddingZone(!isAddingZone)}
          style={{
            width: '100%',
            padding: '10px',
            background: isAddingZone ? 'rgba(34, 197, 94, 0.8)' : 'rgba(34, 197, 94, 0.6)',
            border: 'none',
            borderRadius: 8,
            color: 'white',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            marginBottom: 8
          }}
          onMouseEnter={(e) => {
            e.target.style.background = 'rgba(34, 197, 94, 1)';
          }}
          onMouseLeave={(e) => {
            e.target.style.background = isAddingZone ? 'rgba(34, 197, 94, 0.8)' : 'rgba(34, 197, 94, 0.6)';
          }}
        >
          {isAddingZone ? '🖱️ Click to Add Green Zone' : '➕ Add Green Zone'}
        </button>

        {isAddingZone && (
          <div style={{
            fontSize: 11,
            color: '#94a3b8',
            textAlign: 'center',
            marginTop: 4
          }}>
            Click on the map to plant trees
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
            Vegetation: {hoveredPoint.ndvi}%
          </div>
          <div style={{ fontSize: 10, color: '#94a3b8' }}>
            NDVI Index
          </div>
        </div>
      )}
    </>
  );
}