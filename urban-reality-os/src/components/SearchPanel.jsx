import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FAST } from '../animations/motion';

const SearchPanel = memo(function SearchPanel({ open, items, onSelect }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={FAST}
          style={{
            marginTop: 8,
            borderRadius: 14,
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(15, 23, 42, 0.82)',
            backdropFilter: 'blur(14px)',
            boxShadow: '0 12px 26px rgba(2,6,23,0.24)',
            padding: 8,
            pointerEvents: 'auto',
          }}
        >
          {items.map((item) => (
            <button key={item.id} onClick={() => onSelect(item)} style={rowStyle}>
              <div style={{ fontSize: 13, color: '#e2e8f0' }}>{item.title}</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>{item.subtitle}</div>
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
});

const rowStyle = {
  width: '100%',
  borderRadius: 10,
  border: '1px solid transparent',
  background: 'transparent',
  textAlign: 'left',
  cursor: 'pointer',
  padding: '8px 10px',
};

export default SearchPanel;
