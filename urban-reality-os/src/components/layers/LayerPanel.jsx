// ================================================
// LayerPanel — Expandable Map Details panel
// Compact, minimal Google Maps-style controls
// ================================================
import { motion, AnimatePresence } from 'framer-motion';
import useMapStore from '../../store/useMapStore';
import LayerToggleGrid from './LayerToggleGrid';

const baseMapOptions = [
  { id: 'default', label: 'Street', icon: '🗺️', value: 'default' },
  { id: 'satellite', label: 'Satellite', icon: '🛰️', value: 'satellite' },
  { id: 'terrain', label: 'Terrain', icon: '🏔️', value: 'terrain' },
];

const overlayOptions = (layers) => [
  { id: 'traffic', label: 'Traffic', icon: '🚦', isActive: !!layers.traffic, description: 'Live traffic flow' },
  { id: 'aqi', label: 'Air Quality', icon: '💨', isActive: !!layers.aqi, description: 'AQI pollution layer' },
  { id: 'flood', label: 'Flood Risk', icon: '🌊', isActive: !!layers.flood, description: 'Rain and flood zones' },
  { id: 'hospitals', label: 'Hospitals', icon: '🏥', isActive: !!layers.hospitals, description: 'Healthcare access' },
  { id: 'policeStations', label: 'Police', icon: '🚔', isActive: !!layers.policeStations, description: 'Public safety sites' },
  { id: 'fireStations', label: 'Fire', icon: '🔥', isActive: !!layers.fireStations, description: 'Fire station locations' },
];

const terrainOptions = (terrainSubLayers) => [
  { id: 'elevation', label: 'Elevation', icon: '⛰️', isActive: !!terrainSubLayers.elevation, description: 'Height contours' },
  { id: 'hillshade', label: 'Hillshade', icon: '🌤️', isActive: !!terrainSubLayers.hillshade, description: 'Hillshade shading' },
  { id: 'flood', label: 'Flood', icon: '🌊', isActive: !!terrainSubLayers.flood, description: 'Terrain flood zones' },
];

const LayerPanel = ({ isOpen, onClose }) => {
  const mapStyle = useMapStore((state) => state.mapStyle);
  const setMapStyle = useMapStore((state) => state.setMapStyle);
  const layers = useMapStore((state) => state.layers);
  const setLayers = useMapStore((state) => state.setLayers);
  const terrainSubLayers = useMapStore((state) => state.terrainSubLayers);
  const setTerrainSubLayers = useMapStore((state) => state.setTerrainSubLayers);

  const baseSelection = baseMapOptions.map((option) => ({
    ...option,
    isActive: option.value === mapStyle,
  }));

  const overlaySelection = overlayOptions(layers);
  const terrainSelection = terrainOptions(terrainSubLayers);

  const handleBaseMapSelect = (value) => {
    setMapStyle(value);
  };

  const handleToggleLayer = (layerId) => {
    setLayers((prev) => ({ ...prev, [layerId]: !prev[layerId] }));
  };

  const handleToggleTerrainSubLayer = (subLayerId) => {
    setTerrainSubLayers((prev) => ({ ...prev, [subLayerId]: !prev[subLayerId] }));
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.28)',
              zIndex: 1200,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          <motion.div
            style={{
              position: 'fixed',
              left: 20,
              right: 20,
              bottom: 20,
              borderRadius: 24,
              background: 'rgba(255,255,255,0.98)',
              boxShadow: '0 28px 80px rgba(15, 23, 42, 0.18)',
              zIndex: 1201,
              maxHeight: '76vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 240, damping: 29 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '18px 20px', borderBottom: '1px solid rgba(15, 23, 42, 0.06)' }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>Map Details</div>
                <div style={{ color: '#475569', fontSize: 14, lineHeight: 1.5 }}>Pick a base map and toggle the most important overlays without leaving the map.</div>
              </div>
              <button
                onClick={onClose}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 14,
                  border: 'none',
                  background: 'rgba(15, 23, 42, 0.06)',
                  color: '#0f172a',
                  cursor: 'pointer',
                  fontSize: 18,
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '18px 20px', overflowY: 'auto' }}>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Base map</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                  {baseSelection.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => handleBaseMapSelect(option.value)}
                      style={{
                        borderRadius: 16,
                        padding: '14px 10px',
                        border: option.isActive ? '1px solid rgba(14, 165, 233, 0.95)' : '1px solid rgba(148, 163, 184, 0.25)',
                        background: option.isActive ? 'rgba(14, 165, 233, 0.14)' : 'rgba(241, 245, 249, 0.92)',
                        color: option.isActive ? '#0f172a' : '#475569',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 6,
                        cursor: 'pointer',
                        minHeight: 110,
                      }}
                    >
                      <span style={{ fontSize: 22 }}>{option.icon}</span>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Overlays</div>
                <LayerToggleGrid layers={overlaySelection} onToggle={handleToggleLayer} columns={2} />
              </div>

              {mapStyle === 'terrain' && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Terrain controls</div>
                  <LayerToggleGrid layers={terrainSelection} onToggle={handleToggleTerrainSubLayer} columns={2} />
                </div>
              )}

              <div style={{ padding: '16px', borderRadius: 18, background: 'rgba(240, 249, 255, 0.9)', border: '1px solid rgba(14, 165, 233, 0.12)' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>Quick tip</div>
                <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>Use the base map buttons for instant style changes. Traffic and AQI sync automatically to the underlying map layer engine.</div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default LayerPanel;