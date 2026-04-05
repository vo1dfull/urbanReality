// ================================================
// LayerCard — Individual layer toggle card
// Google Maps-style with smooth animations
// ================================================
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const LayerCard = ({
  id,
  icon,
  label,
  isActive,
  onClick,
  disabled = false,
  loading = false
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [ripple, setRipple] = useState(false);

  const handleClick = () => {
    if (disabled || loading) return;
    setRipple(true);
    onClick();
    setTimeout(() => setRipple(false), 300);
  };

  return (
    <motion.div
      className="layer-card"
      style={{
        position: 'relative',
        width: 56,
        height: 56,
        borderRadius: 12,
        background: isActive
          ? 'rgba(255, 255, 255, 0.95)'
          : 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(20px)',
        border: isActive
          ? '2px solid #0ea5e9'
          : '1px solid rgba(0, 0, 0, 0.08)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        overflow: 'hidden',
        boxShadow: isActive
          ? '0 4px 20px rgba(14, 165, 233, 0.3), 0 2px 8px rgba(0, 0, 0, 0.1)'
          : isHovered
          ? '0 8px 25px rgba(0, 0, 0, 0.15), 0 4px 12px rgba(0, 0, 0, 0.1)'
          : '0 2px 8px rgba(0, 0, 0, 0.08)',
      }}
      whileHover={!disabled && !loading ? {
        scale: 1.08,
        y: -2,
        transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] }
      } : {}}
      whileTap={!disabled && !loading ? {
        scale: 0.95,
        transition: { duration: 0.1 }
      } : {}}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      onClick={handleClick}
    >
      {/* Ripple effect */}
      {ripple && (
        <motion.div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: 0,
            height: 0,
            borderRadius: '50%',
            background: 'rgba(14, 165, 233, 0.3)',
            transform: 'translate(-50%, -50%)',
          }}
          animate={{
            width: 80,
            height: 80,
            opacity: [1, 0],
          }}
          transition={{ duration: 0.3 }}
        />
      )}

      {/* Loading shimmer */}
      {loading && (
        <motion.div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
            transform: 'translateX(-100%)',
          }}
          animate={{
            transform: 'translateX(100%)',
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
      )}

      {/* Icon */}
      <div
        style={{
          fontSize: 20,
          color: isActive ? '#0ea5e9' : '#374151',
          marginBottom: 2,
          transition: 'color 0.2s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </div>

      {/* Label */}
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: isActive ? '#0ea5e9' : '#6b7280',
          textAlign: 'center',
          lineHeight: '1.2',
          transition: 'color 0.2s ease',
        }}
      >
        {label}
      </div>

      {/* Active indicator */}
      {isActive && (
        <motion.div
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#0ea5e9',
          }}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.2 }}
        />
      )}
    </motion.div>
  );
};

export default LayerCard;