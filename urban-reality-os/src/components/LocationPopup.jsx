import React, { useState, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";

const Section = ({ title, children, defaultOpen = true }) => {
    const [open, setOpen] = useState(defaultOpen);

    return (
        <div className="mt-3 rounded-xl bg-white/5 border border-white/10">
            <div
                onClick={() => setOpen(!open)}
                className="flex justify-between items-center px-3 py-2 cursor-pointer"
            >
                <h3 className="text-xs tracking-wider text-blue-400 font-semibold uppercase">
                    {title}
                </h3>

                <motion.span
                    animate={{ rotate: open ? 90 : 0 }}
                    className="text-gray-400 text-lg"
                >
                    ›
                </motion.span>
            </div>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                        className="px-3 pb-3 overflow-hidden"
                    >
                        {children}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

function LocationPopup({
    placeName,
    lat,
    lng,
    year,
    baseYear,

    realTimeAQI,
    finalAQI,

    rainfall,
    rainProbability,

    macroData,
    impact,
    demographics,

    analysis,
    analysisLoading,

    onSave
}) {
    /* ================= DATA PROCESSING ================= */
    const population = demographics?.population ?? impact?.population ?? macroData?.population?.value ?? null;
    const growthRate = demographics?.growthRate ?? null;
    const migrants = demographics?.migrantsPct ?? null;

    const pm25 = realTimeAQI?.pm25 ?? realTimeAQI?.components?.pm25;
    const pm10 = realTimeAQI?.pm10 ?? realTimeAQI?.components?.pm10;
    const aqiValue = finalAQI ?? realTimeAQI?.aqi ?? "N/A";

    const aqiNum = typeof aqiValue === 'number' ? aqiValue : parseInt(aqiValue);

    const getAQIColor = () => {
        if (isNaN(aqiNum)) return "text-gray-400";
        if (aqiNum <= 50) return "text-green-400";
        if (aqiNum <= 100) return "text-yellow-400";
        if (aqiNum <= 200) return "text-orange-400";
        return "text-red-400";
    };

    const formatPopulation = (num) => {
        if (!num) return "N/A";
        if (num >= 10000000) return `${(num / 10000000).toFixed(2)} Cr`;
        if (num >= 100000) return `${(num / 100000).toFixed(2)} L`;
        return num.toLocaleString();
    };

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            whileHover={{ scale: 1.02 }}
            className="w-[320px] p-4 rounded-2xl backdrop-blur-xl bg-slate-900/90 border border-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.8)] text-gray-200 font-[Inter] pointer-events-auto"
            onClick={(e) => e.stopPropagation()} // Prevent map clicks when interacting with popup
        >
            {/* HEADER */}
            <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-1">📍 {placeName || "Selected Location"}</h2>
                <span className="text-xs text-gray-400">
                    {lat?.toFixed(4)}° N, {lng?.toFixed(4)}° E
                </span>
            </div>

            {/* AQI SECTION */}
            <Section title="Air Quality">
                <div className="flex justify-between items-center">
                    <span className="text-sm">AQI</span>
                    <span className={`text-xl font-bold ${getAQIColor()}`}>
                        {aqiValue}
                    </span>
                </div>

                {/* ANIMATED BAR */}
                <div className="mt-2 h-2 rounded bg-slate-800 overflow-hidden relative">
                    {!isNaN(aqiNum) && (
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(aqiNum, 500) / 5}%` }} // Scale up to 500
                            transition={{ duration: 1, ease: "easeOut" }}
                            className="h-full bg-gradient-to-r from-green-400 via-yellow-400 to-red-500"
                        />
                    )}
                </div>

                {/* Sub Components (PM2.5, PM10) */}
                {(pm25 || pm10) && (
                    <div className="mt-3 flex gap-2 text-xs text-gray-400">
                        {pm25 && (
                            <div className="flex-1 bg-white/5 rounded px-2 py-1 flex justify-between">
                                <span>PM2.5</span> <strong className="text-gray-200">{pm25.toFixed(1)}</strong>
                            </div>
                        )}
                        {pm10 && (
                            <div className="flex-1 bg-white/5 rounded px-2 py-1 flex justify-between">
                                <span>PM10</span> <strong className="text-gray-200">{pm10.toFixed(1)}</strong>
                            </div>
                        )}
                    </div>
                )}
            </Section>

            {/* CLIMATE / WEATHER SECTION */}
            <Section title="Climate">
                <div className="flex justify-between text-sm mb-1">
                    <span>🌧 Rainfall</span>
                    <strong className="text-blue-200">{rainfall !== null ? `${rainfall} mm` : "0 mm"}</strong>
                </div>
                <div className="flex justify-between text-sm">
                    <span>☁ Rain Prob.</span>
                    <strong className="text-blue-100">{rainProbability !== null ? `${rainProbability}%` : "0%"}</strong>
                </div>
            </Section>

            {/* DEMOGRAPHICS SECTION */}
            <Section title="Demographics" defaultOpen={false}>
                <div className="flex justify-between items-end mb-2">
                    <span className="text-sm">👥 Population</span>
                    <strong className="text-base text-blue-400">{formatPopulation(population)}</strong>
                </div>
                {growthRate && (
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                        <span>Growth Rate</span>
                        <strong className="text-gray-200">{growthRate}%</strong>
                    </div>
                )}
                {migrants && (
                    <div className="flex justify-between text-xs text-gray-400">
                        <span>Migrants</span>
                        <strong className="text-gray-200">{migrants}%</strong>
                    </div>
                )}
            </Section>

            {/* AI SMART INSIGHTS SECTION */}
            {(analysis || analysisLoading) && (
                <div className="mt-3 p-3 rounded-xl bg-blue-900/20 border border-blue-500/20 text-sm">
                    {analysisLoading ? (
                        <div className="flex items-center gap-2 text-blue-300">
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                                className="w-3 h-3 rounded-full border-2 border-blue-400 border-t-transparent"
                            />
                            Generating AI Analysis...
                        </div>
                    ) : (
                        <div className="text-gray-300 leading-snug">
                            <span className="text-blue-400 font-semibold mb-1 flex items-center gap-1">✨ AI Smart Insights</span>
                            {analysis}
                        </div>
                    )}
                </div>
            )}

            {/* SAVE BUTTON */}
            {onSave && (
                <motion.button
                    whileTap={{ scale: 0.96 }}
                    whileHover={{ scale: 1.03 }}
                    onClick={() => onSave(placeName)}
                    className="w-full mt-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 text-white font-bold shadow-lg shadow-blue-500/25 border border-white/10"
                >
                    ⭐ Save Location
                </motion.button>
            )}
        </motion.div>
    );
}

export default memo(LocationPopup);
