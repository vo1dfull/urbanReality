import { useEffect, useState, useCallback } from 'react';
import useMapStore from '../../store/useMapStore';
import LayerEngine from '../../engines/LayerEngine';
import InteractionEngine from '../../engines/InteractionEngine';

export default function FloodSimulationLayer({
  map,
  isActive,
  year,
  onLoadingChange
}) {
  const [isSimulating, setIsSimulating] = useState(false);
  const [rainIntensity, setRainIntensity] = useState(50);
  const [waterLevel, setWaterLevel] = useState(1.0);
  const [simulationCenter, setSimulationCenter] = useState(null);

  // Stop simulation from engine
  const stopSimulation = useCallback(() => {
    setIsSimulating(false);
    setSimulationCenter(null);
    const plugin = LayerEngine.getPlugin('terrainFlood');
    if (plugin) plugin.stopSimulation(map);
  }, [map]);

  const startSimulation = useCallback((center) => {
    if (!map) return;
    setIsSimulating(true);
    setSimulationCenter(center);
    
    const plugin = LayerEngine.getPlugin('terrainFlood');
    if (plugin) {
      plugin.startSimulation(map, center, { rainIntensity, waterLevel });
    }
  }, [map, rainIntensity, waterLevel]);

  // Handle map clicks to place simulation center
  useEffect(() => {
    if (!map || !isActive) return;

    const handleMapClick = (e) => {
      if (isSimulating) return; // Prevent multiple
      const center = [e.lngLat.lng, e.lngLat.lat];
      startSimulation(center);
    };

    const key = InteractionEngine.attachEvent(map, 'click', null, handleMapClick);

    return () => {
      InteractionEngine.detachEvent(map, key);
      stopSimulation();
    };
  }, [map, isActive, isSimulating, startSimulation, stopSimulation]);

  // Restart if params change
  useEffect(() => {
    if (isSimulating && simulationCenter) {
      stopSimulation();
      // small delay to let worker clean up
      const t = setTimeout(() => startSimulation(simulationCenter), 50);
      return () => clearTimeout(t);
    }
  }, [rainIntensity, waterLevel]);

  if (!isActive) return null;

  return (
    <>
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
          <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9', marginBottom: 8 }}>
            🌊 Flood Simulation
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>
            Click on map to simulate flood at location
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#e2e8f0', marginBottom: 4 }}>
            Rain Intensity: {rainIntensity}mm/h
          </label>
          <input
            type="range" min="10" max="200"
            value={rainIntensity}
            onChange={(e) => setRainIntensity(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#60a5fa' }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#e2e8f0', marginBottom: 4 }}>
            Water Level: {waterLevel.toFixed(1)}x
          </label>
          <input
            type="range" min="0.1" max="3.0" step="0.1"
            value={waterLevel}
            onChange={(e) => setWaterLevel(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#60a5fa' }}
          />
        </div>

        {isSimulating && (
          <div style={{
            padding: 8,
            background: 'rgba(34, 197, 94, 0.1)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            borderRadius: 6,
            marginBottom: 8
          }}>
            <div style={{ fontSize: 12, color: '#22c55e', fontWeight: 500 }}>⚡ Simulation Active</div>
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>Click Stop below</div>
          </div>
        )}

        {isSimulating && (
          <button
            onClick={stopSimulation}
            style={{
              width: '100%', padding: '8px',
              background: 'rgba(220, 53, 69, 0.8)',
              border: 'none', borderRadius: 6,
              color: 'white', fontSize: 12, fontWeight: 500, cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            Stop Simulation
          </button>
        )}
      </div>

      {!isSimulating && (
        <div
          style={{
            position: 'absolute', bottom: 100, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(2, 6, 23, 0.9)', padding: '12px 20px', borderRadius: 8,
            color: 'white', fontSize: 14, backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.1)', zIndex: 100,
            animation: 'fadeIn 0.5s ease'
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>🌊 Flood Simulation Ready</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>Click on any location to start flood simulation</div>
        </div>
      )}
    </>
  );
}