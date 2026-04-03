import useMapStore from '../store/useMapStore';
import { BASE_YEAR, MAX_YEAR } from '../constants/mapConstants';
import { simulationEngine } from '../engines/SimulationEngine';
import { useEffect } from 'react';

export default function TimeSlider() {
  const year = useMapStore((s) => s.year);
  const setYear = useMapStore((s) => s.setYear);
  const macroData = useMapStore((s) => s.macroData);

  useEffect(() => {
    simulationEngine.setYear(year, {
      population: macroData?.population?.value,
      populationGrowthRate: 0.019,
      infrastructureCapacity: 1.0,
      environmentIndex: 0.55,
      baseRisk: 0.28,
    });
  }, [year, macroData]);

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
          opacity: 0.7
        }}
      >
        <span>{BASE_YEAR}</span>
        <span>2030</span>
        <span>2035</span>
        <span>{MAX_YEAR}</span>
      </div>
    </div>
  );
}
