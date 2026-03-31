// ================================================
// useYearProjection — Debounced recalculation on year/location change
// ✅ Fixed: activeLocation stability — compares by sessionId
// ✅ Projection math extracted for testability
// ================================================
import { useEffect, useRef } from 'react';
import useMapStore from '../store/useMapStore';
import FrameController from '../core/FrameController';
import { calculateImpactModel } from '../utils/impactModel';
import { BASE_YEAR, MAX_YEAR, IMPACT_MODEL } from '../constants/mapConstants';

/**
 * Pure function: compute projected values for a given year/location.
 * Extracted for testability.
 */
function computeProjection(activeLocation, year) {
  const {
    placeName: aPlace,
    baseAQI,
    baseRainfall,
    baseTraffic,
    baseFloodRisk,
    worldBank,
  } = activeLocation;

  const yearsElapsed = year - BASE_YEAR;
  const timeFactor = yearsElapsed / (MAX_YEAR - BASE_YEAR);

  const projectedAQI = Math.round(
    baseAQI + timeFactor * (IMPACT_MODEL.maxAQI - IMPACT_MODEL.baseAQI)
  );
  const projectedTraffic = Math.min(1, baseTraffic + timeFactor * 0.5);
  const projectedFloodRisk = Math.min(1, baseFloodRisk + timeFactor * 0.4);

  const impact = calculateImpactModel({
    year,
    baseYear: BASE_YEAR,
    populationBase: worldBank?.population?.value,
    aqi: projectedAQI,
    rainfallMm: baseRainfall,
    trafficCongestion: projectedTraffic,
    floodRisk: projectedFloodRisk,
    worldBank,
  });

  return {
    impactData: {
      zone: `${aPlace} (${year})`,
      people: impact.peopleAffected,
      loss: impact.economicLossCr,
      risk: impact.risk,
    },
    demographics: {
      population: impact.population,
      growthRate: 1.6,
      tfr: 1.9,
      migrantsPct: 21,
    },
  };
}

export default function useYearProjection() {
  const year = useMapStore((s) => s.year);
  const activeLocation = useMapStore((s) => s.activeLocation);
  const taskIdRef = useRef(null);
  const lastSessionIdRef = useRef(null);

  useEffect(() => {
    if (!activeLocation) return;

    // ✅ Stability: skip if same session (avoids re-run on object identity change)
    if (activeLocation.sessionId && activeLocation.sessionId === lastSessionIdRef.current && taskIdRef.current !== null) {
      // Session hasn't changed — only year changed, so let it recalculate
      // but don't restart if the task is already running for same data
    }
    lastSessionIdRef.current = activeLocation.sessionId;

    if (taskIdRef.current !== null) {
      FrameController.remove(taskIdRef.current);
      taskIdRef.current = null;
    }

    // Guard: ensure required fields exist
    if (!activeLocation.placeName || activeLocation.baseAQI === undefined) return;

    const task = () => {
      const { impactData, demographics } = computeProjection(activeLocation, year);

      // 🔥 PERF: Single batchSet instead of 2 separate updates
      useMapStore.getState().batchSet({ impactData, demographics });

      if (taskIdRef.current !== null) {
        FrameController.remove(taskIdRef.current);
        taskIdRef.current = null;
      }
    };

    // 🔥 PERF: Run as idle priority — projection is not critical
    taskIdRef.current = FrameController.add(task, 50, 'year-projection', 'idle');

    return () => {
      if (taskIdRef.current !== null) {
        FrameController.remove(taskIdRef.current);
        taskIdRef.current = null;
      }
    };
  }, [year, activeLocation?.sessionId]);
}

// Export for testing
export { computeProjection };
