import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const MAPTILER_KEY = 'UQBNCVHquLf1PybiywBt';

export default function CommandBar({ mapRef, onLocationSelect, uiMode }) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowSuggestions(false);
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!query || query.length < 2) { setSuggestions([]); setShowSuggestions(false); return; }
    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${MAPTILER_KEY}&limit=5&country=in`);
        const data = await res.json();
        if (data.features?.length > 0) { setSuggestions(data.features); setShowSuggestions(true); }
        else { setSuggestions([]); setShowSuggestions(false); }
      } catch { setSuggestions([]); setShowSuggestions(false); }
      finally { setIsLoading(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (feature) => {
    const [lng, lat] = feature.geometry.coordinates;
    const name = feature.place_name || feature.text || 'Selected';
    setQuery(name);
    setShowSuggestions(false);
    if (mapRef?.current && onLocationSelect) onLocationSelect(lng, lat, name);
  };

  const modeLabel = uiMode === 'terrain' ? '🏔️ Terrain Mode' : uiMode === 'location' ? '📍 Location Selected' : null;

  return (
    <div
      ref={containerRef}
      className="fixed top-5 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center"
      style={{ width: 520, maxWidth: 'calc(100vw - 80px)' }}
    >
      <motion.div
        animate={{ boxShadow: isFocused ? '0 0 0 1px rgba(99,102,241,0.5), 0 8px 32px rgba(0,0,0,0.6)' : '0 4px 24px rgba(0,0,0,0.5)' }}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-slate-950/85 backdrop-blur-xl border border-white/10"
      >
        {/* Logo mark */}
        <div className="flex-shrink-0 w-6 h-6 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="6" cy="6" r="5" stroke="#818cf8" strokeWidth="1.5"/>
            <circle cx="6" cy="6" r="2" fill="#818cf8"/>
          </svg>
        </div>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => { setIsFocused(true); if (suggestions.length > 0) setShowSuggestions(true); }}
          placeholder="Search city, district, landmark…"
          className="flex-1 bg-transparent text-white text-sm placeholder-slate-500 outline-none font-medium"
        />

        {isLoading && (
          <div className="w-4 h-4 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin flex-shrink-0" />
        )}
        {query && !isLoading && (
          <button onClick={() => { setQuery(''); setSuggestions([]); setShowSuggestions(false); }} className="text-slate-500 hover:text-white transition-colors flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        )}

        {modeLabel && (
          <div className="flex-shrink-0 text-[10px] font-bold tracking-widest uppercase text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-1 rounded-full whitespace-nowrap">
            {modeLabel}
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {showSuggestions && suggestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="w-full mt-2 rounded-2xl bg-slate-950/95 backdrop-blur-xl border border-white/10 shadow-2xl overflow-hidden"
          >
            {suggestions.map((feature, i) => (
              <button
                key={i}
                onClick={() => handleSelect(feature)}
                className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0"
              >
                <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{feature.text}</div>
                  <div className="text-xs text-slate-500 truncate">{feature.place_name}</div>
                </div>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
