import { useEffect, useState, useRef, useCallback } from 'react';
import { useTerrain } from '../../hooks/map/useTerrain';

export default function FloodSimulationLayer({
  map,
  isActive,
  year,
  onLoadingChange,
  onSimulationStart
}) {
  const { getTerrainMetrics } = useTerrain();

  const [isSimulating, setIsSimulating] = useState(false);
  const [rainIntensity, setRainIntensity] = useState(50);
  const [waterLevel, setWaterLevel] = useState(1.0);
  const [simulationCenter, setSimulationCenter] = useState(null);
  const [floodRiskData, setFloodRiskData] = useState(null);

  const simulationRef = useRef(null);
  const workerRef = useRef(null);

  // Initialize flood layer + worker
  useEffect(() => {
    if (!map || !isActive) return;

    onLoadingChange(true);

    if (!workerRef.current) {
      workerRef.current = new Worker(new URL('../../workers/floodWorker.js', import.meta.url), { type: 'module' });
      workerRef.current.onmessage = ({ data }) => {
        if (!map || !map.getSource('flood-zones')) return;

        const features = data.features.map((feature) => {
          const trace = feature.properties.risk === 'high' ? 1 : feature.properties.risk === 'medium' ? 0.6 : 0.35;
          return {
            ...feature,
            properties: { ...feature.properties, trace }
          };
        });

        setFloodRiskData({ type: 'FeatureCollection', features });
        map.getSource('flood-zones').setData({ type: 'FeatureCollection', features });
      };
    }

    try {
      if (!map.getSource('flood-zones')) {
        map.addSource('flood-zones', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        });
      }

      if (!map.getLayer('flood-fill')) {
        map.addLayer({
          id: 'flood-fill',
          type: 'fill',
          source: 'flood-zones',
          paint: {
            'fill-color': [
              'interpolate',
              ['linear'],
              ['get', 'depth'],
              0, 'rgba(0, 123, 255, 0.1)',
              0.5, 'rgba(0, 123, 255, 0.35)',
              1.0, 'rgba(3, 169, 244, 0.4)',
              1.2, 'rgba(0, 123, 255, 0.55)'
            ],
            'fill-opacity': ['interpolate', ['linear'], ['get', 'depth'], 0, 0.25, 3.2, 0.75],
            'fill-outline-color': 'rgba(2, 136, 209, 0.9)'
          }
        });
      }

      if (!map.getLayer('flood-risk-heatmap')) {
        map.addLayer({
          id: 'flood-risk-heatmap',
          type: 'heatmap',
          source: 'flood-zones',
          paint: {
            'heatmap-weight': ['interpolate', ['linear'], ['get', 'trace'], 0, 0, 1, 1],
            'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 5, 0.7, 15, 1.8],
            'heatmap-color': [
              'interpolate',
              ['linear'],
              ['heatmap-density'],
              0, 'rgba(0, 123, 255, 0)',
              0.1, 'rgba(16, 185, 129, 0.4)',
              0.4, 'rgba(249, 168, 37, 0.5)',
              0.7, 'rgba(244, 63, 94, 0.68)',
              1, 'rgba(153, 27, 27, 0.95)'
            ],
            'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 5, 14, 15, 30],
            'heatmap-opacity': 0.8
          }
        });
        map.setLayoutProperty('flood-risk-heatmap', 'visibility', 'visible');
      }

      // Click to start simulation
      const handleMapClick = (e) => {
        if (!isActive || isSimulating) return;

        const center = [e.lngLat.lng, e.lngLat.lat];
        setSimulationCenter(center);
        startSimulation(center);
      };

      map.on('click', handleMapClick);

      onLoadingChange(false);

      return () => {
        map.off('click', handleMapClick);
      };

    } catch (error) {
      console.error('Error initializing flood layer:', error);
      onLoadingChange(false);
    }
  }, [map, isActive, onLoadingChange, isSimulating]);

  const startSimulation = useCallback((center) => {
    if (!map || isSimulating || !workerRef.current) return;

    setIsSimulating(true);
    onSimulationStart?.();

    const bounds = map.getBounds();
    const mapBounds = {
      west: bounds.getWest(),
      east: bounds.getEast(),
      south: bounds.getSouth(),
      north: bounds.getNorth()
    };

    workerRef.current.postMessage({ center, rainIntensity, waterLevel, mapBounds });

    const cancelFrame = requestAnimationFrame(() => {
      if (!map?.getSource('flood-zones')?.setData) return;
      map.getSource('flood-zones').setData({ type: 'FeatureCollection', features: floodRiskData?.features || [] });
    });

    simulationRef.current = cancelFrame;
  }, [map, isSimulating, rainIntensity, waterLevel, onSimulationStart, floodRiskData]);

  const stopSimulation = useCallback(() => {
    if (!map) return;

    setIsSimulating(false);
    setSimulationCenter(null);

    if (simulationRef.current) {
      cancelAnimationFrame(simulationRef.current);
      simulationRef.current = null;
    }

    if (map.getSource('flood-zones')) {
      map.getSource('flood-zones').setData({ type: 'FeatureCollection', features: [] });
    }
  }, [map]);

  // Update simulation when parameters change
  useEffect(() => {
    if (isSimulating && simulationCenter) {
      stopSimulation();
      setTimeout(() => startSimulation(simulationCenter), 100);
    }
  }, [rainIntensity, waterLevel, isSimulating, simulationCenter, startSimulation, stopSimulation]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (!map) return;
      try {
        stopSimulation();
        if (workerRef.current) {
          workerRef.current.terminate();
          workerRef.current = null;
        }
        if (map.getLayer('flood-fill')) map.removeLayer('flood-fill');
        if (map.getLayer('flood-risk-heatmap')) map.removeLayer('flood-risk-heatmap');
        if (map.getSource('flood-zones')) map.removeSource('flood-zones');
      } catch (error) {
        console.error('Error cleaning up flood layer:', error);
      }
    };
  }, [map, stopSimulation]);

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
          minWidth: 250,
          zIndex: 100
        }}
      >
        <div style={{ marginBottom: 12 }}>
          <div style={{
            fontSize: 14,
            fontWeight: 600,
            color: '#f1f5f9',
            marginBottom: 8
          }}>
            🌊 Flood Simulation
          </div>
          <div style={{
            fontSize: 12,
            color: '#94a3b8',
            marginBottom: 12
          }}>
            Click on map to simulate flood at location
          </div>
        </div>

        {/* Rain Intensity */}
        <div style={{ marginBottom: 12 }}>
          <label style={{
            display: 'block',
            fontSize: 12,
            color: '#e2e8f0',
            marginBottom: 4
          }}>
            Rain Intensity: {rainIntensity}mm/h
          </label>
          <input
            type="range"
            min="10"
            max="200"
            value={rainIntensity}
            onChange={(e) => setRainIntensity(Number(e.target.value))}
            style={{
              width: '100%',
              accentColor: '#60a5fa'
            }}
          />
        </div>

        {/* Water Level */}
        <div style={{ marginBottom: 12 }}>
          <label style={{
            display: 'block',
            fontSize: 12,
            color: '#e2e8f0',
            marginBottom: 4
          }}>
            Water Level: {waterLevel.toFixed(1)}x
          </label>
          <input
            type="range"
            min="0.1"
            max="3.0"
            step="0.1"
            value={waterLevel}
            onChange={(e) => setWaterLevel(Number(e.target.value))}
            style={{
              width: '100%',
              accentColor: '#60a5fa'
            }}
          />
        </div>

        {/* Simulation Status */}
        {isSimulating && (
          <div style={{
            padding: 8,
            background: 'rgba(34, 197, 94, 0.1)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            borderRadius: 6,
            marginBottom: 8
          }}>
            <div style={{
              fontSize: 12,
              color: '#22c55e',
              fontWeight: 500
            }}>
              ⚡ Simulation Active
            </div>
            <div style={{
              fontSize: 10,
              color: '#94a3b8',
              marginTop: 2
            }}>
              Click anywhere to stop
            </div>
          </div>
        )}

        {/* Stop Button */}
        {isSimulating && (
          <button
            onClick={stopSimulation}
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
            Stop Simulation
          </button>
        )}
      </div>

      {/* Instructions */}
      {!isSimulating && (
        <div
          style={{
            position: 'absolute',
            bottom: 100,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(2, 6, 23, 0.9)',
            padding: '12px 20px',
            borderRadius: 8,
            color: 'white',
            fontSize: 14,
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.1)',
            zIndex: 100,
            animation: 'fadeIn 0.5s ease'
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            🌊 Flood Simulation Ready
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>
            Click on any location to start flood simulation
          </div>
        </div>
      )}
    </>
  );
}