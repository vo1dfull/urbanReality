import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const DOCK_SECTIONS = [
  {
    id: 'map',
    label: 'Map Style',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
        <line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>
      </svg>
    ),
    items: [
      { id: 'default', label: 'Standard', emoji: '🗺️' },
      { id: 'satellite', label: 'Satellite', emoji: '🛰️' },
      { id: 'terrain', label: 'Terrain', emoji: '🏔️' },
    ],
  },
  {
    id: 'data',
    label: 'Data Layers',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
      </svg>
    ),
    items: [
      { id: 'aqi', label: 'Air Quality', emoji: '💨' },
      { id: 'flood', label: 'Flood Zones', emoji: '🌊' },
      { id: 'traffic', label: 'Traffic', emoji: '🚦' },
    ],
  },
  {
    id: 'facilities',
    label: 'Facilities',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    ),
    items: [
      { id: 'hospitals', label: 'Hospitals', emoji: '🏥' },
      { id: 'policeStations', label: 'Police', emoji: '🚔' },
      { id: 'fireStations', label: 'Fire Dept.', emoji: '🔥' },
    ],
  },
];

export default function ControlDock({ layers, setLayers, mapStyle, setMapStyle }) {
  const [expandedSection, setExpandedSection] = useState(null);

  const handleMapStyle = (id) => setMapStyle(id);
  const handleLayerToggle = (id) => setLayers(prev => ({ ...prev, [id]: !prev[id] }));

  const isItemActive = (sectionId, itemId) => {
    if (sectionId === 'map') return mapStyle === itemId;
    return layers[itemId] || false;
  };

  return (
    <div className="fixed left-4 top-1/2 -translate-y-1/2 z-50 flex items-center gap-2">
      {/* Main Dock */}
      <div className="flex flex-col gap-2 p-2 rounded-2xl bg-slate-950/85 backdrop-blur-xl border border-white/10 shadow-2xl">
        {DOCK_SECTIONS.map((section) => {
          const isExpanded = expandedSection === section.id;
          const hasActive = DOCK_SECTIONS.find(s => s.id === section.id)?.items
            .some(item => isItemActive(section.id, item.id));

          return (
            <div key={section.id}>
              <motion.button
                onClick={() => setExpandedSection(isExpanded ? null : section.id)}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.94 }}
                className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 ${
                  isExpanded
                    ? 'bg-indigo-500/20 border border-indigo-500/40 text-indigo-300'
                    : hasActive
                    ? 'bg-blue-500/10 border border-blue-500/20 text-blue-400'
                    : 'bg-white/5 border border-transparent text-slate-400 hover:text-white hover:bg-white/10'
                }`}
                title={section.label}
              >
                {section.icon}
                {hasActive && !isExpanded && (
                  <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-blue-400" />
                )}
              </motion.button>
            </div>
          );
        })}

        {/* Divider */}
        <div className="w-full h-px bg-white/10 my-1" />

        {/* Fly Through */}
        <motion.button
          whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.94 }}
          className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/5 border border-transparent text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/20 transition-all"
          title="Cinematic Fly-Through"
          id="fly-through-btn"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
          </svg>
        </motion.button>
      </div>

      {/* Flyout Panel */}
      <AnimatePresence>
        {expandedSection && (
          <motion.div
            key={expandedSection}
            initial={{ opacity: 0, x: -12, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -12, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="rounded-2xl bg-slate-950/90 backdrop-blur-xl border border-white/10 shadow-2xl p-3 min-w-[180px]"
          >
            {(() => {
              const section = DOCK_SECTIONS.find(s => s.id === expandedSection);
              return (
                <>
                  <div className="text-[10px] font-bold tracking-widest text-slate-500 uppercase mb-2 px-1">
                    {section.label}
                  </div>
                  <div className="flex flex-col gap-1">
                    {section.items.map(item => {
                      const active = isItemActive(expandedSection, item.id);
                      return (
                        <motion.button
                          key={item.id}
                          whileHover={{ x: 2 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => expandedSection === 'map' ? handleMapStyle(item.id) : handleLayerToggle(item.id)}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium w-full text-left transition-all ${
                            active
                              ? 'bg-indigo-500/15 border border-indigo-500/30 text-white'
                              : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                          }`}
                        >
                          <span className="text-base">{item.emoji}</span>
                          <span className="flex-1">{item.label}</span>
                          {active && (
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 ml-auto flex-shrink-0" />
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
