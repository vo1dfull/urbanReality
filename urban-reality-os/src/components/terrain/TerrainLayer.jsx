import { useState, useEffect, useRef } from 'react';
import ElevationLayer from './ElevationLayer';
import FloodSimulationLayer from './FloodSimulationLayer';
import SuitabilityLayer from './SuitabilityLayer';
import HeatLayer from './HeatLayer';
import GreenCoverLayer from './GreenCoverLayer';
import RoadPlannerLayer from './RoadPlannerLayer';

const TERRAIN_SUB_LAYERS = [
  { id: 'elevation', label: 'Elevation', icon: '🏔️' },
  { id: 'flood', label: 'Flood Simulation', icon: '🌊' },
  { id: 'suitability', label: 'Land Suitability', icon: '🏗️' },
  { id: 'heat', label: 'Heat Map', icon: '🌡️' },
  { id: 'green', label: 'Green Cover', icon: '🌳' },
  { id: 'road', label: 'Road Planner', icon: '🛣️' }
];

export default function TerrainLayer({
  map,
  isActive,
  year,
  onLayerToggle,
  onSimulationStart
}) {
  const [expanded, setExpanded] = useState(false);
  const [activeSubLayers, setActiveSubLayers] = useState(new Set());
  const [loadingStates, setLoadingStates] = useState(new Map());

  const toggleSubLayer = (layerId) => {
    setActiveSubLayers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(layerId)) {
        newSet.delete(layerId);
      } else {
        newSet.add(layerId);
      }
      return newSet;
    });
  };

  const setLoading = (layerId, loading) => {
    setLoadingStates(prev => new Map(prev).set(layerId, loading));
  };

  if (!isActive) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 20,
        left: 80,
        background: 'rgba(2, 6, 23, 0.95)',
        padding: 16,
        borderRadius: 12,
        color: 'white',
        fontSize: 14,
        zIndex: 10,
        backdropFilter: 'blur(12px)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        minWidth: 280,
        maxWidth: 320,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        border: '1px solid rgba(255,255,255,0.1)',
        transform: `scale(${expanded ? 1 : 0.95})`,
        opacity: expanded ? 1 : 0.9,
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          cursor: 'pointer',
          marginBottom: 12
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <span style={{
          fontSize: 18,
          marginRight: 8,
          transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: 'transform 0.3s ease'
        }}>
          ▶
        </span>
        <span style={{
          fontSize: 16,
          fontWeight: 700,
          color: '#f1f5f9',
          letterSpacing: '-0.3px'
        }}>
          🏔️ Terrain Intelligence
        </span>
        <div style={{
          marginLeft: 'auto',
          fontSize: 12,
          color: '#60a5fa',
          background: 'rgba(96, 165, 250, 0.1)',
          padding: '2px 8px',
          borderRadius: 10,
          border: '1px solid rgba(96, 165, 250, 0.2)'
        }}>
          AI
        </div>
      </div>

      {/* Sub-layers */}
      <div style={{
        maxHeight: expanded ? '400px' : '0px',
        overflow: 'hidden',
        transition: 'max-height 0.4s ease'
      }}>
        {TERRAIN_SUB_LAYERS.map(layer => (
          <div key={layer.id} style={{ marginBottom: 8 }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                cursor: 'pointer',
                userSelect: 'none',
                padding: '8px 12px',
                borderRadius: 8,
                transition: 'all 0.2s ease',
                background: activeSubLayers.has(layer.id)
                  ? 'rgba(96, 165, 250, 0.1)'
                  : 'transparent',
                border: activeSubLayers.has(layer.id)
                  ? '1px solid rgba(96, 165, 250, 0.3)'
                  : '1px solid transparent'
              }}
              onMouseEnter={(e) => {
                if (!activeSubLayers.has(layer.id)) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                }
              }}
              onMouseLeave={(e) => {
                if (!activeSubLayers.has(layer.id)) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              <input
                type="checkbox"
                checked={activeSubLayers.has(layer.id)}
                onChange={() => toggleSubLayer(layer.id)}
                style={{
                  marginRight: 12,
                  cursor: 'pointer',
                  width: '18px',
                  height: '18px',
                  accentColor: '#60a5fa'
                }}
              />
              <span style={{
                fontSize: 16,
                marginRight: 8
              }}>
                {layer.icon}
              </span>
              <span style={{
                fontSize: 14,
                fontWeight: 500,
                color: activeSubLayers.has(layer.id) ? '#e2e8f0' : '#94a3b8',
                flex: 1
              }}>
                {layer.label}
              </span>
              {loadingStates.get(layer.id) && (
                <div style={{
                  width: 16,
                  height: 16,
                  border: '2px solid rgba(96, 165, 250, 0.3)',
                  borderTop: '2px solid #60a5fa',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }} />
              )}
              {activeSubLayers.has(layer.id) && !loadingStates.get(layer.id) && (
                <span style={{
                  color: '#60a5fa',
                  fontSize: 12,
                  marginLeft: 'auto'
                }}>
                  ✓
                </span>
              )}
            </label>
          </div>
        ))}
      </div>

      {/* Render active sub-layer components */}
      {activeSubLayers.has('elevation') && (
        <ElevationLayer
          map={map}
          isActive={true}
          onLoadingChange={(loading) => setLoading('elevation', loading)}
        />
      )}

      {activeSubLayers.has('flood') && (
        <FloodSimulationLayer
          map={map}
          isActive={true}
          year={year}
          onLoadingChange={(loading) => setLoading('flood', loading)}
          onSimulationStart={onSimulationStart}
        />
      )}

      {activeSubLayers.has('suitability') && (
        <SuitabilityLayer
          map={map}
          isActive={true}
          onLoadingChange={(loading) => setLoading('suitability', loading)}
        />
      )}

      {activeSubLayers.has('heat') && (
        <HeatLayer
          map={map}
          isActive={true}
          year={year}
          onLoadingChange={(loading) => setLoading('heat', loading)}
        />
      )}

      {activeSubLayers.has('green') && (
        <GreenCoverLayer
          map={map}
          isActive={true}
          onLoadingChange={(loading) => setLoading('green', loading)}
        />
      )}

      {activeSubLayers.has('road') && (
        <RoadPlannerLayer
          map={map}
          isActive={true}
          onLoadingChange={(loading) => setLoading('road', loading)}
        />
      )}
    </div>
  );
}