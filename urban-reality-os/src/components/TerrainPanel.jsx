import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const TERRAIN_MODULES = [
  { id: 'elevation', label: 'Elevation', icon: '🏔️', description: 'Hillshade + slope analysis' },
  { id: 'flood', label: 'Flood Simulation', icon: '🌊', description: 'Click map to trigger water flow' },
  { id: 'suitability', label: 'Land Suitability', icon: '🏗️', description: 'AI-driven build feasibility' },
  { id: 'heat', label: 'Heat Dynamics', icon: '🌡️', description: 'Urban heat island effect' },
  { id: 'green', label: 'Green Cover', icon: '🌳', description: 'Vegetation density + NDVI' },
  { id: 'road', label: 'Road Planner', icon: '🛣️', description: 'Click to draw terrain-aware paths' },
];

function SliderControl({ label, value, onChange, min = 0, max = 100, accentColor = '#6366f1' }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</span>
        <span className="text-xs font-bold" style={{ color: accentColor }}>{value}%</span>
      </div>
      <input
        type="range" min={min} max={max} value={value}
        onChange={e => onChange(parseInt(e.target.value))}
        className="w-full h-1 rounded-full appearance-none cursor-pointer bg-slate-800"
        style={{ accentColor }}
      />
    </div>
  );
}

export default function TerrainPanel({ activeModules, toggleModule, simulationParams, updateParam, onClose }) {
  const [expandedModule, setExpandedModule] = useState(null);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-5 h-5 rounded bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2"><path d="M3 21l9-18 9 18H3z"/><path d="M3 21h18"/></svg>
            </div>
            <h2 className="text-sm font-bold text-white tracking-wide">Terrain Intelligence</h2>
          </div>
          <p className="text-[10px] text-indigo-400 font-bold tracking-widest uppercase">Simulation Engine</p>
        </div>
        <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-slate-500 hover:text-white transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      {/* Modules List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1">
        {TERRAIN_MODULES.map((mod) => {
          const isOn = activeModules.includes(mod.id);
          const isExpanded = expandedModule === mod.id;

          return (
            <div key={mod.id}>
              <div
                onClick={() => toggleModule(mod.id)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all select-none ${
                  isOn
                    ? 'bg-indigo-500/12 border border-indigo-500/25'
                    : 'hover:bg-white/5 border border-transparent'
                }`}
              >
                <span className={`text-lg transition-all ${isOn ? '' : 'grayscale opacity-40'}`}>{mod.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold" style={{ color: isOn ? '#f1f5f9' : '#64748b' }}>{mod.label}</div>
                  <div className="text-[10px] text-slate-600 truncate">{mod.description}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {isOn && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shadow-[0_0_6px_rgba(99,102,241,0.8)]" />}
                  {/* Expand arrow for flood and suitability */}
                  {(mod.id === 'flood' || mod.id === 'suitability') && (
                    <button
                      onClick={e => { e.stopPropagation(); setExpandedModule(isExpanded ? null : mod.id); }}
                      className="text-slate-600 hover:text-slate-400 transition-colors"
                    >
                      <motion.svg animate={{ rotate: isExpanded ? 90 : 0 }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></motion.svg>
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded Controls */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="mx-3 mb-2 p-3 rounded-xl bg-white/3 border border-white/5 space-y-3">
                      {mod.id === 'flood' && (
                        <>
                          <SliderControl
                            label="Rain Intensity"
                            value={simulationParams.rainIntensity}
                            onChange={v => updateParam('rainIntensity', v)}
                          />
                          <SliderControl
                            label="Water Retention"
                            value={simulationParams.waterRetention}
                            onChange={v => updateParam('waterRetention', v)}
                            accentColor="#3b82f6"
                          />
                          <p className="text-[10px] text-slate-600">Click anywhere on the map to trigger flood simulation at that point.</p>
                        </>
                      )}
                      {mod.id === 'suitability' && (
                        <>
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Development Type</div>
                          <div className="grid grid-cols-3 gap-1">
                            {['residential', 'commercial', 'industrial'].map(mode => (
                              <button
                                key={mode}
                                onClick={() => updateParam('suitabilityMode', mode)}
                                className={`py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${
                                  simulationParams.suitabilityMode === mode
                                    ? 'bg-indigo-500/20 border border-indigo-500/40 text-indigo-300'
                                    : 'bg-white/5 border border-transparent text-slate-500 hover:text-white'
                                }`}
                              >
                                {mode.slice(0, 4)}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* Status Footer */}
      <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
        <span className="text-[10px] text-slate-600 font-medium uppercase tracking-widest">System Status</span>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[10px] text-green-500 font-bold tracking-widest uppercase">Operational</span>
        </div>
      </div>
    </div>
  );
}
