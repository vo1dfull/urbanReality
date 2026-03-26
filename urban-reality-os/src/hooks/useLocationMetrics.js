import { useEffect, useRef, useState } from "react";

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

export function useLocationMetrics({
  coords,
  fetchAQI,
  fetchTerrain,
  fetchPopulation
}) {
  const [data, setData] = useState(MOCK_DATA);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!coords) return;

    let cancelled = false;

    async function load() {
      try {
        const [aqiRes, terrainRes, populationRes] = await Promise.allSettled([
          fetchAQI(coords),
          fetchTerrain(coords),
          fetchPopulation(coords)
        ]);

        const nextData = {
          aqi: aqiRes.status === "fulfilled" ? aqiRes.value : MOCK_DATA.aqi,
          terrain:
            terrainRes.status === "fulfilled" ? terrainRes.value : MOCK_DATA.terrain,
          population:
            populationRes.status === "fulfilled" ? populationRes.value : MOCK_DATA.population
        };

        /* ---------- SMOOTH ANIMATION LOOP ---------- */
        const animate = () => {
          if (cancelled) return;

          setData((prev) => ({
            aqi: {
              ...nextData.aqi,
              value: smoothNumber(prev.aqi?.value, nextData.aqi.value)
            },
            terrain: {
              elevation: smoothNumber(
                prev.terrain?.elevation,
                nextData.terrain.elevation
              ),
              slope: smoothNumber(prev.terrain?.slope, nextData.terrain.slope),
              floodRisk: smoothNumber(
                prev.terrain?.floodRisk,
                nextData.terrain.floodRisk
              )
            },
            population: {
              total: smoothNumber(prev.population?.total, nextData.population.total),
              density: smoothNumber(prev.population?.density, nextData.population.density),
              growthRate: smoothNumber(
                prev.population?.growthRate,
                nextData.population.growthRate
              )
            }
          }));

          rafRef.current = requestAnimationFrame(animate);
        };

        // start the loop
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(animate);
      } catch (e) {
        setData(MOCK_DATA);
      }
    }

    load();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [coords, fetchAQI, fetchTerrain, fetchPopulation]);

  return data;
}

export default useLocationMetrics;
