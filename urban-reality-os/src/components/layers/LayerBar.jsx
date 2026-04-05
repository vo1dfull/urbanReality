// ================================================
// LayerBar — Compact Google Maps-style floating layer selector
// ================================================
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import useMapStore from '../../store/useMapStore';

const baseLayers = [
  { id: 'default', label: 'Map', icon: '🗺️', value: 'default' },
  { id: 'satellite', label: 'Satellite', icon: '🛰️', value: 'satellite' },
  { id: 'terrain', label: 'Terrain', icon: '🏔️', value: 'terrain' },
];

const LayerBar = ({ onOpenPanel }) => {
  const mapStyle = useMapStore((state) => state.mapStyle);
  const setMapStyle = useMapStore((state) => state.setMapStyle);
  const layers = useMapStore((state) => state.layers);

  const activeOverlayCount = useMemo(
    () => Object.values(layers).filter(Boolean).length,
    [layers]
  );

  const handleBaseLayer = (style) => {
    setMapStyle(style === mapStyle ? 'default' : style);
  };

  return (
    <motion.div
      style={{
        position: 'absolute',
        left: 20,
        bottom: 20,
        zIndex: 1100,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 56px)',
          gap: 10,
          padding: 8,
          background: 'rgba(255,255,255,0.92)',
          borderRadius: 18,
          border: '1px solid rgba(15, 23, 42, 0.08)',
          boxShadow: '0 18px 50px rgba(15, 23, 42, 0.12)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
        }}
      >
        {baseLayers.map((layer) => {
          const active = layer.value === mapStyle;
          return (
            <button
              key={layer.id}
              onClick={() => handleBaseLayer(layer.value)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                width: 56,
                height: 56,
                borderRadius: 16,
                border: active ? '1px solid rgba(14,165,233,0.95)' : '1px solid rgba(15,23,42,0.08)',
                background: active ? 'rgba(14,165,233,0.16)' : 'rgba(255,255,255,0.9)',
                color: active ? '#0f172a' : '#334155',
                fontSize: 12,
                cursor: 'pointer',
                transition: 'transform 200ms ease, background 200ms ease, border-color 200ms ease',
              }}
            >
              <span style={{ fontSize: 20 }}>{layer.icon}</span>
              <span style={{ lineHeight: 1.1 }}>{layer.label}</span>
            </button>
          );
        })}
      </div>

      <button
        onClick={onOpenPanel}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          padding: '12px 16px',
          minWidth: 170,
          borderRadius: 18,
          border: '1px solid rgba(15, 23, 42, 0.08)',
          background: 'rgba(255,255,255,0.96)',
          color: '#0f172a',
          fontSize: 14,
          fontWeight: 700,
          cursor: 'pointer',
          boxShadow: '0 18px 40px rgba(15, 23, 42, 0.1)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span>🧭</span>
          <span>Map details</span>
        </span>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 32,
          height: 32,
          borderRadius: 14,
          background: 'rgba(15, 23, 42, 0.06)',
          color: '#334155',
          fontSize: 12,
          fontWeight: 700,
        }}>
          {activeOverlayCount}
        </span>
      </button>
    </motion.div>
  );
};

export default LayerBar;