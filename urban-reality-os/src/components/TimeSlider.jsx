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
        position: 'relative',
        zIndex: 'auto',
        background: 'rgba(20, 25, 40, 0.6)',
        padding: '12px 14px',
        borderRadius: 14,
        color: 'white',
        width: '100%',
        minWidth: 360,
        maxWidth: 420,
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
        backdropFilter: 'blur(14px)',
        transition: 'all 0.25s ease',
      }}
    >
      <div style={{ marginBottom: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.18, color: '#dbeafe' }}>Simulation Year</span>
        <span style={{ fontSize: 12, fontWeight: 800, color: '#f8fafc' }}>{year}</span>
      </div>

      <input
        type="range"
        min={BASE_YEAR}
        max={MAX_YEAR}
        step="1"
        value={year}
        onChange={e => setYear(Number(e.target.value))}
        style={{ width: '100%', marginBottom: 3, height: 14, accentColor: '#60a5fa' }}
      />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 10,
          opacity: 0.7,
          marginBottom: 6,
        }}
      >
        <span>{BASE_YEAR}</span>
        <span>2030</span>
        <span>2035</span>
        <span>{MAX_YEAR}</span>
      </div>

      <div style={{ marginBottom: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.18, color: '#dbeafe' }}>Sky Time</span>
        <span style={{ fontSize: 12, fontWeight: 800, color: '#f8fafc' }}>
          {Math.floor(skyTime)}:{String(Math.floor((skyTime % 1) * 60)).padStart(2, '0')}
        </span>
      </div>

      <input
        type="range"
        min="0"
        max="24"
        step="0.5"
        value={skyTime}
        onChange={e => setSkyTime(Number(e.target.value))}
        style={{ width: '100%', marginBottom: 3, height: 14, accentColor: '#60a5fa' }}
      />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 10,
          opacity: 0.7,
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
