import { useEffect, useState } from 'react';
import ElevationLayer from './ElevationLayer';
import FloodSimulationLayer from './FloodSimulationLayer';
import SuitabilityLayer from './SuitabilityLayer';
import HeatLayer from './HeatLayer';
import GreenCoverLayer from './GreenCoverLayer';
import RoadPlannerLayer from './RoadPlannerLayer';
import useMapStore from '../../store/useMapStore';
import { useShallow } from 'zustand/react/shallow';

const SUB_LAYERS = [
  { id: 'elevation', label: 'Elevation Intelligence', icon: '🏔️' },
  { id: 'flood', label: 'Flood Simulation', icon: '🌊' },
  { id: 'suitability', label: 'Land Suitability AI', icon: '🧠' },
  { id: 'heat', label: 'Heat Dynamics', icon: '🌡️' },
  { id: 'green', label: 'Green Infrastructure', icon: '🌳' },
  { id: 'road', label: 'Infrastructure Planner', icon: '🛣️' }
];

export default function TerrainController({ map, isActive }) {
  const terrainSubLayers = useMapStore(useShallow((s) => s.terrainSubLayers));
  const toggleTerrainSubLayer = useMapStore((s) => s.toggleTerrainSubLayer);
  const setTerrainMode = useMapStore((s) => s.setTerrainMode);
  const terrainMode = useMapStore((s) => s.terrainMode);
  const year = useMapStore((s) => s.year);

  const [openPanel, setOpenPanel] = useState(true);

  // Cinematic activation transition + camera tilt
  useEffect(() => {
    if (!map || !isActive) return;

    map.easeTo({
      pitch: 65,
      bearing: -25,
      duration: 1200,
      easing: (t) => t * (2 - t)
    });

    const glow = document.querySelector('.terrain-intel-panel');
    if (glow) {
      glow.style.boxShadow = '0 14px 42px rgba(38, 166, 255, 0.45)';
      setTimeout(() => {
        if (glow) glow.style.boxShadow = '0 8px 26px rgba(0, 0, 0, 0.33)';
      }, 550);
    }
  }, [isActive, map]);

  if (!isActive) return null;

  return (
    <div
      className="terrain-intel-panel"
      style={{
        position: 'absolute',
        top: 20,
        left: 80,
        zIndex: 20,
        background: 'rgba(8, 14, 28, 0.85)',
        border: '1px solid rgba(199, 210, 254, 0.18)',
        borderRadius: 16,
        backdropFilter: 'blur(20px)',
        minWidth: 320,
        maxWidth: 360,
        padding: 14,
        boxShadow: '0 8px 26px rgba(0,0,0,0.35)',
        animation: 'slideUp 360ms ease'
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          marginBottom: 12,
          userSelect: 'none'
        }}
        onClick={() => setOpenPanel((p) => !p)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 22 }}>🏔️</span>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, color: '#e2e8f0' }}>Terrain Intelligence</h3>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>Cinematic AI simulation mode</span>
          </div>
        </div>
        <span style={{ fontSize: 14, color: '#60a5fa' }}>{openPanel ? '▼' : '▶'}</span>
      </div>

      <div style={{
        maxHeight: openPanel ? '400px' : '0px',
        overflow: 'hidden',
        transition: 'max-height 480ms cubic-bezier(0.23,1,0.32,1)'
      }}>
        <div style={{ marginBottom: 10, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: 8 }}>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>Terrain Core</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            <button
              onClick={() => { if (!terrainSubLayers.elevation) toggleTerrainSubLayer('elevation'); setTerrainMode('elevation'); }}
              style={{ ...modeBtn, ...(terrainSubLayers.elevation && terrainMode === 'elevation' ? modeBtnActive : null) }}
            >
              Elevation
            </button>
            <button
              onClick={() => { if (!terrainSubLayers.elevation) toggleTerrainSubLayer('elevation'); setTerrainMode('slope'); }}
              style={{ ...modeBtn, ...(terrainSubLayers.elevation && terrainMode === 'slope' ? modeBtnActive : null) }}
            >
              Slope
            </button>
            <button
              onClick={() => toggleTerrainSubLayer('hillshade')}
              style={{ ...modeBtn, ...(terrainSubLayers.hillshade ? modeBtnActive : null) }}
            >
              Hillshade
            </button>
          </div>
        </div>
        {SUB_LAYERS.map((layer) => {
          const active = terrainSubLayers[layer.id];
          return (
            <button
              key={layer.id}
              onClick={() => toggleTerrainSubLayer(layer.id)}
              style={{
                width: '100%',
                border: 'none',
                borderRadius: 8,
                background: active ? 'rgba(96, 165, 250, 0.18)' : 'rgba(255,255,255,0.02)',
                color: active ? '#e2e8f0' : '#94a3b8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                marginBottom: 8,
                cursor: 'pointer',
                boxShadow: active ? '0 8px 20px rgba(30, 143, 255, 0.2)' : 'none',
                transition: 'all 220ms ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.01)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>{layer.icon}{layer.label}</span>
              <span style={{ fontSize: 12 }}>{active ? 'ON' : 'OFF'}</span>
            </button>
          );
        })}
      </div>

      {/* Active module renders*/}
      <ElevationLayer
        map={map}
        isActive={terrainSubLayers.elevation}
      />

      <FloodSimulationLayer
        map={map}
        isActive={terrainSubLayers.flood}
      />

      <SuitabilityLayer
        map={map}
        isActive={terrainSubLayers.suitability}
      />

      <HeatLayer
        map={map}
        isActive={terrainSubLayers.heat}
      />

      <GreenCoverLayer
        map={map}
        isActive={terrainSubLayers.green}
      />

      <RoadPlannerLayer
        map={map}
        isActive={terrainSubLayers.road}
      />
    </div>
  );
}

const modeBtn = {
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 8,
  background: 'rgba(255,255,255,0.04)',
  color: '#cbd5e1',
  fontSize: 11,
  fontWeight: 700,
  padding: '7px 6px',
  cursor: 'pointer',
};

const modeBtnActive = {
  border: '1px solid rgba(96,165,250,0.8)',
  background: 'rgba(59,130,246,0.22)',
  color: '#e2e8f0',
};