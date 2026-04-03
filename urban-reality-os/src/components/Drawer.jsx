import { memo, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { MEDIUM } from '../animations/motion';
import useMapStore from '../store/useMapStore';

const Drawer = memo(function Drawer({ open, onClose, safeMode, setSafeMode, onAction }) {
  const { user, logout } = useAuth();
  const setMapStyle = useMapStore((s) => s.setMapStyle);
  const [units, setUnits] = useState(() => localStorage.getItem('units') || 'km');
  const initials = (user?.name || 'Guest').split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  const stats = useMemo(() => {
    const read = (k) => {
      try { return JSON.parse(localStorage.getItem(k) || '[]').length; } catch { return 0; }
    };
    return {
      saved: read('savedLocations'),
      bookmarks: read('bookmarks'),
      recents: read('recentSearches'),
      projects: read('projects'),
    };
  }, [open]);

  const handleAction = (key) => {
    onAction?.(key);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={MEDIUM}
            onClick={onClose}
            style={{
              position: 'fixed', inset: 0, zIndex: 25,
              background: 'rgba(2,6,23,0.36)',
              pointerEvents: 'auto',
            }}
          />
          <motion.aside
            initial={{ x: -360, opacity: 0.6 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -360, opacity: 0.6 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            style={{
              position: 'fixed', top: 0, left: 0, bottom: 0, width: 360,
              zIndex: 26, pointerEvents: 'auto',
              borderRight: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(15, 23, 42, 0.9)', backdropFilter: 'blur(18px)',
              padding: 16, color: '#e2e8f0', overflow: 'auto',
            }}
          >
            <section style={{ marginBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 12 }}>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Account</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                <div style={{ width: 38, height: 38, borderRadius: 999, display: 'grid', placeItems: 'center', background: 'rgba(148,163,184,0.22)', fontWeight: 700 }}>{initials}</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{user?.name || 'Guest'}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>{user?.email || 'Sign in for sync'}</div>
                </div>
              </div>
              <button onClick={user ? logout : () => handleAction('signin')} style={btnStyle}>{user ? 'Sign out' : 'Sign in'}</button>
            </section>

            <Section
              title="Places"
              items={[
                [`Saved Places (${stats.saved})`, 'saved-places'],
                [`Bookmarks (${stats.bookmarks})`, 'bookmarks'],
                [`Recent Searches (${stats.recents})`, 'recent-searches'],
                [`Your Projects (${stats.projects})`, 'projects'],
              ]}
              onAction={handleAction}
            />
            <Section
              title="System"
              items={[
                ['Settings', 'settings'],
                ['Add Feature / Plugins', 'plugins'],
              ]}
              onAction={handleAction}
            />

            <section style={{ marginTop: 10 }}>
              <label style={{ display: 'grid', gap: 6, marginBottom: 10, fontSize: 13 }}>
                <span>Base Map</span>
                <select onChange={(e) => setMapStyle(e.target.value)} defaultValue="default" style={selectStyle}>
                  <option value="default">Street</option>
                  <option value="satellite">Satellite</option>
                  <option value="terrain">Terrain</option>
                </select>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                <span>Performance Mode</span>
                <input type="checkbox" checked={safeMode} onChange={() => { setSafeMode(!safeMode); onAction?.('performance-mode'); }} />
              </label>
              <label style={{ display: 'grid', gap: 6, marginTop: 10, fontSize: 13 }}>
                <span>Units</span>
                <select
                  value={units}
                  onChange={(e) => { setUnits(e.target.value); localStorage.setItem('units', e.target.value); }}
                  style={selectStyle}
                >
                  <option value="km">Kilometers</option>
                  <option value="miles">Miles</option>
                </select>
              </label>
            </section>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
});

function Section({ title, items, onAction }) {
  return (
    <section style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6 }}>{title}</div>
      <div style={{ display: 'grid', gap: 6 }}>
        {items.map(([label, key]) => (
          <button key={key} onClick={() => onAction?.(key)} style={rowStyle}>{label}</button>
        ))}
      </div>
    </section>
  );
}

const btnStyle = {
  marginTop: 8, borderRadius: 8, border: '1px solid rgba(255,255,255,0.14)',
  background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', padding: '6px 10px', cursor: 'pointer',
};
const rowStyle = {
  textAlign: 'left', borderRadius: 9, border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.03)', color: '#e2e8f0', padding: '8px 10px', cursor: 'pointer',
};
const selectStyle = {
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.14)',
  background: 'rgba(255,255,255,0.05)',
  color: '#e2e8f0',
  padding: '6px 8px',
};

export default Drawer;
