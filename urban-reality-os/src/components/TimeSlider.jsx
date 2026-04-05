import useMapStore from '../store/useMapStore';
import { BASE_YEAR, MAX_YEAR } from '../constants/mapConstants';
import { simulationEngine } from '../engines/SimulationEngine';
import { useEffect, useState } from 'react';
import mapEngine from '../engines/MapEngine';

export default function TimeSlider() {
  const year = useMapStore((s) => s.year);
  const setYear = useMapStore((s) => s.setYear);
  const macroData = useMapStore((s) => s.macroData);
  const [skyTime, setSkyTime] = useState(12); // Default to noon

  useEffect(() => {
    simulationEngine.setYear(year, {
      population: macroData?.population?.value,
      populationGrowthRate: 0.019,
      infrastructureCapacity: 1.0,
      environmentIndex: 0.55,
      baseRisk: 0.28,
    });
  }, [year, macroData]);

  // Update sky time when slider changes
  useEffect(() => {
    mapEngine.setTime(skyTime);
  }, [skyTime]);

  return (
    <div
      style={{
        position: "absolute",
        bottom: 30,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 20,
        background: "rgba(2,6,23,0.9)",
        padding: "14px 20px",
        borderRadius: 14,
        color: "white",
        width: 360,
        boxShadow: "0 15px 40px rgba(0,0,0,0.6)",
        backdropFilter: "blur(8px)"
      }}
    >
      <div style={{ marginBottom: 8 }}>
        <b>🕒 Simulation Year:</b> {year}
      </div>

      <input
        type="range"
        min={BASE_YEAR}
        max={MAX_YEAR}
        step="1"
        value={year}
        onChange={e => setYear(Number(e.target.value))}
        style={{ width: "100%" }}
      />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12,
          opacity: 0.7,
          marginBottom: 12
        }}
      >
        <span>{BASE_YEAR}</span>
        <span>2030</span>
        <span>2035</span>
        <span>{MAX_YEAR}</span>
      </div>

      <div style={{ marginBottom: 8 }}>
        <b>🌅 Sky Time:</b> {Math.floor(skyTime)}:{String(Math.floor((skyTime % 1) * 60)).padStart(2, '0')}
      </div>

      <input
        type="range"
        min="0"
        max="24"
        step="0.5"
        value={skyTime}
        onChange={e => setSkyTime(Number(e.target.value))}
        style={{ width: "100%" }}
      />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12,
          opacity: 0.7
        }}
      >
        <span>🌙 00:00</span>
        <span>🌅 06:00</span>
        <span>☀️ 12:00</span>
        <span>🌇 18:00</span>
        <span>🌙 24:00</span>
      </div>
    </div>
  );
}
