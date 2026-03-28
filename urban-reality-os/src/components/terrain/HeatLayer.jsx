import { useEffect, useState, useRef } from 'react';
import { useTerrain } from '../../hooks/map/useTerrain';

const HEAT_COLORS = [
  [15, '#1e3a8a'],    // Blue (cool)
  [20, '#3b82f6'],    // Light blue
  [25, '#10b981'],   // Green
  [30, '#f59e0b'],    // Yellow
  [35, '#f97316'],   // Orange
  [40, '#dc2626'],   // Red
  [45, '#7c2d12']    // Dark red (hot)
];

export default function HeatLayer({ map, isActive, year, onLoadingChange }) {
  const { getTerrainMetrics } = useTerrain();
  const [heatData, setHeatData] = useState(null);
  const [greenZones, setGreenZones] = useState(new Set());
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const hoverPopupRef = useRef(null);

  // Mock building density data (in real app, this would come from satellite imagery)
  const getBuildingDensity = (lng, lat) => {
    // Simulate urban areas with higher density
    const urbanCenterDist = Math.sqrt(
      Math.pow(lng - 77.209, 2) + Math.pow(lat - 28.6139, 2)
    );
    return Math.max(0, Math.min(1, 1 - urbanCenterDist * 10));
  };

  const calculateHeatIndex = (lng, lat) => {
    const { elevation, slope } = getTerrainMetrics(map, { lng, lat });
    const buildingDensity = getBuildingDensity(lng, lat);

    // Green cover reduction (trees cool the area)
    const greenZoneKey = `${Math.round(lng * 1000)},${Math.round(lat * 1000)}`;
    const hasGreenZone = greenZones.has(greenZoneKey);
    const greenCover = hasGreenZone ? 0.8 : 0.2; // Trees significantly reduce heat

    // Base temperature (Delhi average)
    let temperature = 30; // Base temperature in Celsius

    // Urban heat island effect
    temperature += buildingDensity * 8; // Buildings trap heat

    // Elevation effect (higher = cooler)
    temperature -= elevation * 0.005;

    // Slope effect (steeper = more ventilation = cooler)
    temperature -= slope * 0.1;

    // Green cover effect
    temperature -= greenCover * 5;

    // Time-based variation (simulate seasonal changes)
    const yearOffset = (year - 2025) * 0.3; // Climate change effect
    temperature += yearOffset;

    return Math.max(15, Math.min(50, temperature));
  };

  useEffect(() => {
    if (!map || !isActive) return;

    onLoadingChange(true);

    try {
      // Generate heat map data
      const bounds = map.getBounds();
      const features = [];
      const step = 0.0005; // Fine grid for heat map

      for (let lng = bounds.getWest(); lng <= bounds.getEast(); lng += step) {
        for (let lat = bounds.getSouth(); lat <= bounds.getNorth(); lat += step) {
          const temperature = calculateHeatIndex(lng, lat);

          features.push({
            type: 'Feature',
            properties: { temperature },
            geometry: {
              type: 'Point',
              coordinates: [lng, lat]
            }
          });
        }
      }

      const data = { type: 'FeatureCollection', features };
      setHeatData(data);

      // Add heat source
      if (!map.getSource('heat-data')) {
        map.addSource('heat-data', {
          type: 'geojson',
          data
        });
      } else {
        map.getSource('heat-data').setData(data);
      }

      // Add heatmap layer
      if (!map.getLayer('heat-heatmap')) {
        map.addLayer({
          id: 'heat-heatmap',
          type: 'heatmap',
          source: 'heat-data',
          paint: {
            'heatmap-weight': [
              'interpolate',
              ['linear'],
              ['get', 'temperature'],
              15, 0,
              30, 0.5,
              45, 1
            ],
            'heatmap-intensity': 1,
            'heatmap-color': [
              'interpolate',
              ['linear'],
              ['heatmap-density'],
              0, 'rgba(30, 58, 138, 0)',
              0.2, 'rgba(59, 130, 246, 0.4)',
              0.4, 'rgba(245, 158, 11, 0.6)',
              0.6, 'rgba(249, 115, 22, 0.7)',
              0.8, 'rgba(220, 38, 38, 0.8)',
              1, 'rgba(124, 45, 18, 0.9)'
            ],
            'heatmap-radius': 25,
            'heatmap-opacity': 0.7
          }
        });
      }

      // Add green zones layer
      if (!map.getSource('green-zones')) {
        map.addSource('green-zones', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        });
      }

      if (!map.getLayer('green-zones-fill')) {
        map.addLayer({
          id: 'green-zones-fill',
          type: 'circle',
          source: 'green-zones',
          paint: {
            'circle-radius': 8,
            'circle-color': '#22c55e',
            'circle-opacity': 0.8,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#16a34a'
          }
        });
      }

      // Click to add/remove green zones
      const handleMapClick = (e) => {
        if (!isActive) return;

        const coords = [e.lngLat.lng, e.lngLat.lat];
        const key = `${Math.round(coords[0] * 1000)},${Math.round(coords[1] * 1000)}`;

        setGreenZones(prev => {
          const newSet = new Set(prev);
          if (newSet.has(key)) {
            newSet.delete(key);
          } else {
            newSet.add(key);
          }
          return newSet;
        });
      };

      // Hover for temperature
      const handleMouseMove = (e) => {
        if (!isActive) return;

        const coords = e.lngLat;
        const temperature = calculateHeatIndex(coords.lng, coords.lat);

        setHoveredPoint({
          lng: coords.lng,
          lat: coords.lat,
          temperature: Math.round(temperature * 10) / 10,
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
      console.error('Error initializing heat layer:', error);
      onLoadingChange(false);
    }
  }, [map, isActive, year, greenZones, onLoadingChange]);

  // Update green zones visualization
  useEffect(() => {
    if (!map || !isActive) return;

    const features = Array.from(greenZones).map(key => {
      const [lng, lat] = key.split(',').map(Number).map(x => x / 1000);
      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [lng, lat]
        }
      };
    });

    if (map.getSource('green-zones')) {
      map.getSource('green-zones').setData({
        type: 'FeatureCollection',
        features
      });
    }
  }, [greenZones, map, isActive]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (!map) return;
      try {
        if (map.getLayer('heat-heatmap')) map.removeLayer('heat-heatmap');
        if (map.getLayer('green-zones-fill')) map.removeLayer('green-zones-fill');
        if (map.getSource('heat-data')) map.removeSource('heat-data');
        if (map.getSource('green-zones')) map.removeSource('green-zones');
      } catch (error) {
        console.error('Error cleaning up heat layer:', error);
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
            🌡️ Urban Heat Island
          </div>
          <div style={{
            fontSize: 12,
            color: '#94a3b8',
            marginTop: 4
          }}>
            Click to add/remove green zones
          </div>
        </div>

        {/* Stats */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
          marginBottom: 12
        }}>
          <div style={{
            background: 'rgba(255,255,255,0.05)',
            padding: 8,
            borderRadius: 6,
            textAlign: 'center'
          }}>
            <div style={{ fontSize: 10, color: '#94a3b8' }}>Green Zones</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#22c55e' }}>
              {greenZones.size}
            </div>
          </div>
          <div style={{
            background: 'rgba(255,255,255,0.05)',
            padding: 8,
            borderRadius: 6,
            textAlign: 'center'
          }}>
            <div style={{ fontSize: 10, color: '#94a3b8' }}>Year</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#60a5fa' }}>
              {year}
            </div>
          </div>
        </div>

        {/* Clear Green Zones */}
        {greenZones.size > 0 && (
          <button
            onClick={() => setGreenZones(new Set())}
            style={{
              width: '100%',
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
            Clear All Green Zones
          </button>
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