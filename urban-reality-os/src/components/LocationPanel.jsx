import { memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const AQI_LEVELS = [
  { max: 50, label: 'Good', color: '#22c55e' },
  { max: 100, label: 'Moderate', color: '#eab308' },
  { max: 150, label: 'Unhealthy*', color: '#f97316' },
  { max: 200, label: 'Unhealthy', color: '#ef4444' },
  { max: 300, label: 'Very Unhealthy', color: '#a855f7' },
  { max: Infinity, label: 'Hazardous', color: '#7f1d1d' },
];

function getAQILevel(aqi) {
  return AQI_LEVELS.find(l => aqi <= l.max) || AQI_LEVELS[AQI_LEVELS.length - 1];
}

function MetricRow({ label, value, unit, accent }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
      <span className="text-xs text-slate-500 font-medium">{label}</span>
      <span className="text-sm font-bold" style={{ color: accent || '#f1f5f9' }}>
        {value}<span className="text-xs font-normal text-slate-500 ml-1">{unit}</span>
      </span>
    </div>
  );
}

function Accordion({ title, icon, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-white/5 first:border-0">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between py-3 text-left">
        <div className="flex items-center gap-2">
          <span className="text-sm">{icon}</span>
          <span className="text-xs font-bold tracking-widest uppercase text-slate-400">{title}</span>
        </div>
        <motion.span animate={{ rotate: open ? 90 : 0 }} className="text-slate-600 text-lg leading-none">›</motion.span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden pb-3"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function LocationPanel({ data, onClose }) {
  const { placeName, lat, lng, year, finalAQI, realTimeAQI, rainfall, impact, demographics, analysis, analysisLoading } = data;

  const aqiValue = finalAQI ?? realTimeAQI?.aqi;
  const aqiLevel = aqiValue != null ? getAQILevel(aqiValue) : null;
  const pm25 = realTimeAQI?.pm25;
  const pm10 = realTimeAQI?.pm10;
  const population = demographics?.population ?? impact?.population;

  const formatPop = (n) => {
    if (!n) return 'N/A';
    if (n >= 10000000) return `${(n / 10000000).toFixed(1)} Cr`;
    if (n >= 100000) return `${(n / 100000).toFixed(1)} L`;
    return n.toLocaleString();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-white leading-tight">{placeName || 'Selected Location'}</h2>
          <p className="text-xs text-slate-500 mt-0.5 font-mono">{lat?.toFixed(5)}° N {lng?.toFixed(5)}° E</p>
        </div>
        <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-slate-500 hover:text-white transition-colors flex-shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      {/* AQI Hero */}
      {aqiValue != null && (
        <div className="mb-4 p-3 rounded-xl" style={{ background: `${aqiLevel.color}12`, border: `1px solid ${aqiLevel.color}30` }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold tracking-widest uppercase" style={{ color: aqiLevel.color }}>Air Quality</span>
            <div className="flex items-center gap-1.5">
              <span className="text-2xl font-black" style={{ color: aqiLevel.color }}>{aqiValue}</span>
              <span className="text-xs font-semibold text-slate-400">{aqiLevel.label}</span>
            </div>
          </div>
          <div className="h-1 rounded-full bg-slate-800 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(aqiValue / 5, 100)}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
              className="h-full rounded-full"
              style={{ background: aqiLevel.color }}
            />
          </div>
          {(pm25 || pm10) && (
            <div className="flex gap-2 mt-2">
              {pm25 && <div className="flex-1 text-xs bg-white/5 rounded-lg px-2 py-1 flex justify-between"><span className="text-slate-500">PM2.5</span><strong className="text-slate-200">{pm25.toFixed(1)}</strong></div>}
              {pm10 && <div className="flex-1 text-xs bg-white/5 rounded-lg px-2 py-1 flex justify-between"><span className="text-slate-500">PM10</span><strong className="text-slate-200">{pm10.toFixed(1)}</strong></div>}
            </div>
          )}
        </div>
      )}

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-0">

        <Accordion title="Climate" icon="🌧️" defaultOpen>
          <MetricRow label="Rainfall" value={rainfall ?? 0} unit="mm" />
          {impact?.risk != null && <MetricRow label="Flood Risk" value={`${Math.round(impact.risk * 100)}`} unit="%" accent={impact.risk > 0.6 ? '#ef4444' : impact.risk > 0.3 ? '#f97316' : '#22c55e'} />}
        </Accordion>

        <Accordion title="Demographics" icon="👥">
          <MetricRow label="Population" value={formatPop(population)} accent="#818cf8" />
          {demographics?.growthRate && <MetricRow label="Growth Rate" value={demographics.growthRate} unit="%" />}
          {demographics?.migrantsPct && <MetricRow label="Migrants" value={demographics.migrantsPct} unit="%" />}
        </Accordion>

        {impact && (
          <Accordion title="Impact Model" icon="📊">
            <MetricRow label="Year" value={year} />
            {impact.peopleAffected != null && <MetricRow label="People at Risk" value={formatPop(impact.peopleAffected)} accent="#f97316" />}
            {impact.economicLossCr != null && <MetricRow label="Economic Loss" value={`₹${impact.economicLossCr.toFixed(0)} Cr`} accent="#ef4444" />}
          </Accordion>
        )}

        {(analysis || analysisLoading) && (
          <Accordion title="AI Insights" icon="✨" defaultOpen>
            {analysisLoading ? (
              <div className="flex items-center gap-2 text-indigo-400 text-xs py-2">
                <div className="w-3 h-3 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
                Generating AI analysis…
              </div>
            ) : (
              <p className="text-xs text-slate-400 leading-relaxed">{analysis}</p>
            )}
          </Accordion>
        )}
      </div>

      {/* Save Button */}
      <button className="mt-4 w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white text-sm font-bold transition-all shadow-lg shadow-indigo-500/20">
        ⭐ Save Location
      </button>
    </div>
  );
}

export default memo(LocationPanel);
