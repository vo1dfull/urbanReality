// ================================================
// LayerToggleGrid — Grid of layer toggles for the panel
// iOS-style animated switches with smooth transitions
// ================================================
import { motion } from 'framer-motion';

const LayerToggle = ({ label, icon, isActive, onToggle, disabled = false, description }) => {
  return (
    <motion.div
      className="layer-toggle"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderRadius: 12,
        background: 'rgba(255, 255, 255, 0.6)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(0, 0, 0, 0.04)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.2s ease',
      }}
      whileHover={!disabled ? {
        background: 'rgba(255, 255, 255, 0.8)',
        scale: 1.02,
        transition: { duration: 0.2 }
      } : {}}
      whileTap={!disabled ? {
        scale: 0.98,
        transition: { duration: 0.1 }
      } : {}}
      onClick={!disabled ? onToggle : undefined}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: isActive ? 'rgba(14, 165, 233, 0.1)' : 'rgba(0, 0, 0, 0.05)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            transition: 'all 0.2s ease',
          }}
        >
          {icon}
        </div>
        <div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: '#1f2937',
              marginBottom: 2,
            }}
          >
            {label}
          </div>
          {description && (
            <div
              style={{
                fontSize: 12,
                color: '#6b7280',
                lineHeight: '1.3',
              }}
            >
              {description}
            </div>
          )}
        </div>
      </div>

      {/* Animated Switch */}
      <div
        style={{
          position: 'relative',
          width: 44,
          height: 24,
          borderRadius: 12,
          background: isActive ? '#0ea5e9' : 'rgba(0, 0, 0, 0.1)',
          transition: 'background 0.2s ease',
          cursor: 'pointer',
        }}
      >
        <motion.div
          style={{
            position: 'absolute',
            top: 2,
            left: 2,
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: 'white',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
          }}
          animate={{
            x: isActive ? 20 : 0,
          }}
          transition={{
            type: 'spring',
            stiffness: 500,
            damping: 30,
          }}
        />
      </div>
    </motion.div>
  );
};

const LayerToggleGrid = ({ layers, onToggle, columns = 1 }) => {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: 8,
      }}
    >
      {layers.map((layer) => (
        <LayerToggle
          key={layer.id}
          label={layer.label}
          icon={layer.icon}
          isActive={layer.isActive}
          onToggle={() => onToggle(layer.id)}
          disabled={layer.disabled}
          description={layer.description}
        />
      ))}
    </div>
  );
};

export default LayerToggleGrid;