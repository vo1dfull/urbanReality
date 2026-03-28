import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';

const BASE_YEAR = 2025;
const MAX_YEAR = 2040;

export default function TimelineBar({ year, setYear }) {
  const [isDragging, setIsDragging] = useState(false);
  const trackRef = useRef(null);

  const pct = ((year - BASE_YEAR) / (MAX_YEAR - BASE_YEAR)) * 100;

  const getYearFromEvent = (e) => {
    const rect = trackRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(BASE_YEAR + ratio * (MAX_YEAR - BASE_YEAR));
  };

  const handlePointerDown = (e) => {
    e.preventDefault();
    setIsDragging(true);
    setYear(getYearFromEvent(e));
  };

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e) => { if (trackRef.current) setYear(getYearFromEvent(e)); };
    const onUp = () => setIsDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isDragging]);

  const yearsBetween = Array.from({ length: MAX_YEAR - BASE_YEAR + 1 }, (_, i) => BASE_YEAR + i)
    .filter(y => y % 5 === 0);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2" style={{ width: 480, maxWidth: 'calc(100vw - 80px)' }}>

      {/* Year Bubble */}
      <motion.div
        animate={{ x: `calc(${pct}% - 50%)` }}
        transition={{ type: 'spring', stiffness: 400, damping: 35 }}
        className="px-3 py-1 rounded-full bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-500/40 pointer-events-none select-none"
        style={{ willChange: 'transform' }}
      >
        {year}
      </motion.div>

      {/* Glass Bar */}
      <div className="w-full rounded-2xl bg-slate-950/85 backdrop-blur-xl border border-white/10 shadow-2xl px-5 py-3">
        <div
          ref={trackRef}
          className="relative h-1.5 bg-slate-800 rounded-full cursor-pointer"
          onMouseDown={handlePointerDown}
        >
          {/* Fill */}
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-indigo-600 to-indigo-400 rounded-full pointer-events-none"
            style={{ width: `${pct}%` }}
          />

          {/* Thumb */}
          <motion.div
            animate={{ left: `${pct}%` }}
            transition={{ type: 'spring', stiffness: 400, damping: 35 }}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white shadow-lg shadow-indigo-500/50 border-2 border-indigo-400 pointer-events-none"
            style={{ willChange: 'left' }}
          />
        </div>

        {/* Year Labels */}
        <div className="flex justify-between mt-2 px-0.5">
          {yearsBetween.map(y => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={`text-[10px] font-bold transition-colors ${year === y ? 'text-indigo-400' : 'text-slate-600 hover:text-slate-400'}`}
            >
              {y}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
