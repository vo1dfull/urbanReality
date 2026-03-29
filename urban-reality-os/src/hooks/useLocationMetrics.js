import { useEffect, useRef, useState } from "react";
import FrameController from "../core/FrameController";

/* ---------- MOCK FALLBACK (NEVER FAILS) ---------- */
const MOCK_DATA = {
  terrain: {
    elevation: 215,
    slope: 3.2,
    floodRisk: 0.18
  },
  aqi: {
    value: 92,
    pm25: 38,
    pm10: 71,
    category: "Moderate"
  },
  population: {
    total: 28450,
    density: 11200,
    growthRate: 1.6
  }
};

/* ---------- SMOOTH INTERPOLATION ---------- */
function smoothNumber(prev, next, factor = 0.15) {
  if (!Number.isFinite(prev)) return next;
  if (!Number.isFinite(next)) return prev;
  return prev + (next - prev) * factor;
}

/* ---------- CONVERGENCE CHECK ---------- */
const CONVERGE_THRESHOLD = 0.1;

function hasConverged(current, target) {
  if (!current || !target) return false;

  const checks = [
    [current.aqi?.value, target.aqi?.value],
    [current.terrain?.elevation, target.terrain?.elevation],
    [current.terrain?.slope, target.terrain?.slope],
    [current.terrain?.floodRisk, target.terrain?.floodRisk],
    [current.population?.total, target.population?.total],
    [current.population?.density, target.population?.density],
    [current.population?.growthRate, target.population?.growthRate],
  ];

  return checks.every(([a, b]) => {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return true;
    return Math.abs(a - b) < CONVERGE_THRESHOLD;
  });
}

/**
 * @param {object} options
 * @param {object} options.coords
 * @param {Function} options.fetchAQI
 * @param {Function} options.fetchTerrain
 * @param {Function} options.fetchPopulation
 */
export function useLocationMetrics({
  coords,
  fetchAQI,
  fetchTerrain,
  fetchPopulation
}) {
  const [data, setData] = useState(MOCK_DATA);
  const taskIdRef = useRef(null);
  // ✅ Ref-stabilize callbacks to prevent dependency churn
  const fetchAQIRef = useRef(fetchAQI);
  const fetchTerrainRef = useRef(fetchTerrain);
  const fetchPopulationRef = useRef(fetchPopulation);

  // Keep refs fresh
  fetchAQIRef.current = fetchAQI;
  fetchTerrainRef.current = fetchTerrain;
  fetchPopulationRef.current = fetchPopulation;

  useEffect(() => {
    if (!coords) return;

    let cancelled = false;

    async function load() {
      try {
        const [aqiRes, terrainRes, populationRes] = await Promise.allSettled([
          fetchAQIRef.current(coords),
          fetchTerrainRef.current(coords),
          fetchPopulationRef.current(coords)
        ]);

        const nextData = {
          aqi: aqiRes.status === "fulfilled" ? aqiRes.value : MOCK_DATA.aqi,
          terrain:
            terrainRes.status === "fulfilled" ? terrainRes.value : MOCK_DATA.terrain,
          population:
            populationRes.status === "fulfilled" ? populationRes.value : MOCK_DATA.population
        };

        const animate = () => {
          if (cancelled) return;

          setData((prev) => {
            if (hasConverged(prev, nextData)) {
              if (taskIdRef.current !== null) {
                FrameController.remove(taskIdRef.current);
                taskIdRef.current = null;
              }
              return nextData;
            }

            return {
              aqi: {
                ...nextData.aqi,
                value: smoothNumber(prev.aqi?.value, nextData.aqi.value)
              },
              terrain: {
                elevation: smoothNumber(prev.terrain?.elevation, nextData.terrain.elevation),
                slope: smoothNumber(prev.terrain?.slope, nextData.terrain.slope),
                floodRisk: smoothNumber(prev.terrain?.floodRisk, nextData.terrain.floodRisk)
              },
              population: {
                total: smoothNumber(prev.population?.total, nextData.population.total),
                density: smoothNumber(prev.population?.density, nextData.population.density),
                growthRate: smoothNumber(prev.population?.growthRate, nextData.population.growthRate)
              }
            };
          });
        };

        if (taskIdRef.current !== null) {
          FrameController.remove(taskIdRef.current);
          taskIdRef.current = null;
        }

        // ✅ Run at ~30fps instead of 60fps — halves React state updates
        taskIdRef.current = FrameController.add(animate, 32, 'location-metrics');
      } catch (e) {
        setData(MOCK_DATA);
      }
    }

    load();

    return () => {
      cancelled = true;
      if (taskIdRef.current !== null) {
        FrameController.remove(taskIdRef.current);
        taskIdRef.current = null;
      }
    };
  }, [coords]); // ✅ Only rerun when coords change — fetchers are ref-stable

  return data;
}

export default useLocationMetrics;
