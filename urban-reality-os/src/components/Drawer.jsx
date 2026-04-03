import { memo, useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useMapStore from '../store/useMapStore';
import { readSavedPlaces, removeSavedPlace, updateSavedPlace } from '../utils/savedPlaces';
import { MEDIUM } from '../animations/motion';
import { AccountSection } from '../ui/components/AccountSection';

const Drawer = memo(function Drawer({ open, onClose, safeMode, setSafeMode, onAction, onRequestLogin }) {
  const setMapStyle = useMapStore((s) => s.setMapStyle);
  const [units, setUnits] = useState(() => localStorage.getItem('units') || 'km');
  const [savedPlaces, setSavedPlaces] = useState(() => readSavedPlaces());
  const [virtualWindow, setVirtualWindow] = useState({ start: 0, end: 20 });
  const savedListRef = useRef(null);

  useEffect(() => {
    const update = () => setSavedPlaces(readSavedPlaces());
    window.addEventListener('savedPlacesUpdated', update);
    return () => window.removeEventListener('savedPlacesUpdated', update);
  }, []);

  useEffect(() => {
    setSavedPlaces(readSavedPlaces());
  }, [open]);

  const [virtualization, setVirtualization] = useState(false);

  useEffect(() => {
    setVirtualization(savedPlaces.length > 100);
  }, [savedPlaces.length]);

  const handleSavedListScroll = useCallback((e) => {
    if (!virtualization) return;
    const itemHeight = 56;
    const scrollTop = e.target.scrollTop;
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - 2);
    const end = Math.min(savedPlaces.length, start + 12);
    setVirtualWindow({ start, end });
  }, [savedPlaces.length, virtualization]);

  // Get stats from localStorage
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
  }, [open, savedPlaces.length]);

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
            {/* New Account Section */}
            <AccountSection onRequestLogin={onRequestLogin} />

            <section style={{ marginTop: 14, marginBottom: 12 }}>
              <div style={{ fontSize: 12, marginBottom: 8, fontWeight: 600 }}>Saved Places</div>
              <div
                ref={savedListRef}
                onScroll={handleSavedListScroll}
                style={{
                  maxHeight: 260,
                  overflowY: 'auto',
                  border: '1px solid rgba(148,163,184,0.35)',
                  borderRadius: 10,
                  padding: 5,
                  background: 'rgba(15, 23, 42, 0.78)',
                }}
              >
                {savedPlaces.length === 0 && <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: 10 }}>No saved places yet.</div>}

                {savedPlaces.length > 0 && (
                  <div style={{ position: 'relative', height: savedPlaces.length > 100 ? `${savedPlaces.length * 56}px` : 'auto' }}>
                    <div style={{ position: 'absolute', top: (virtualization ? virtualWindow.start * 56 : 0), left: 0, right: 0 }}>
                      { (virtualization ? savedPlaces.slice(virtualWindow.start, virtualWindow.end) : savedPlaces).map((place, index) => (
                        <motion.div
                          key={place.id}
                          initial={{ x: -30, opacity: 0 }}
                          animate={{ x: 0, opacity: 1 }}
                          transition={{ duration: 0.25, delay: (virtualization ? index * 0.02 : index * 0.01) }}
                          onMouseEnter={() => window.highlightSavedPlace?.(place.id)}
                          onMouseLeave={() => window.highlightSavedPlace?.(null)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '7px 8px',
                            borderRadius: 8,
                            marginBottom: 6,
                            background: 'rgba(100,116,139,0.23)',
                            border: '1px solid rgba(148,163,184,0.2)'
                          }}
                        >
                          <div>
                            <span style={{ marginRight: 6 }}>{place.type === 'home' ? '🏠' : place.type === 'work' ? '💼' : place.type === 'landmark' ? '📍' : place.type === 'favorite' ? '⭐' : '📌'}</span>
                            <strong style={{ color: '#e2e8f0' }}>{place.name}</strong>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>
                              {place.coords && typeof place.coords.lat === 'number' && typeof place.coords.lng === 'number'
                                ? `${place.coords.lat.toFixed(4)}, ${place.coords.lng.toFixed(4)}`
                                : 'Coordinates unavailable'}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 5 }}>
                            <button onClick={() => window.flyToSavedPlace?.(place.id)} style={{ border: 'none', borderRadius: 5, padding: '4px 6px', background: 'rgba(59,130,246,0.8)', color: '#fff', cursor: 'pointer', fontSize: 11 }}>Go</button>
                            <button onClick={() => {
                              const newName = window.prompt('Edit place name', place.name);
                              if (newName) {
                                updateSavedPlace(place.id, { name: newName });
                                setSavedPlaces(readSavedPlaces());
                              }
                            }} style={{ border: 'none', borderRadius: 5, padding: '4px 6px', background: 'rgba(168,85,247,0.85)', color: '#fff', cursor: 'pointer', fontSize: 11 }}>Edit</button>
                            <button onClick={() => { removeSavedPlace(place.id); setSavedPlaces(readSavedPlaces()); }} style={{ border: 'none', borderRadius: 5, padding: '4px 6px', background: 'rgba(239,68,68,0.9)', color: '#fff', cursor: 'pointer', fontSize: 11 }}>Del</button>
                          </div>
                        </motion.div>
                      )) }
                    </div>
                  </div>
                )}
              </div>
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
