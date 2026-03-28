// ================================================
// useYearProjection — Debounced recalculation on year/location change
// ================================================
import { useEffect, useRef } from 'react';
import useMapStore from '../store/useMapStore';
import FrameController from '../core/FrameController';
import InteractionEngine from '../engines/InteractionEngine';
import { calculateImpactModel } from '../utils/impactModel';
import { BASE_YEAR, MAX_YEAR, IMPACT_MODEL } from '../constants/mapConstants';

export default function useYearProjection() {
  const year = useMapStore((s) => s.year);
  const activeLocation = useMapStore((s) => s.activeLocation);
  const taskIdRef = useRef(null);

  useEffect(() => {
    if (!activeLocation) return;
    if (taskIdRef.current !== null) {
      FrameController.remove(taskIdRef.current);
      taskIdRef.current = null;
    }

    const task = () => {
      const {
        lat: aLat,
        lng: aLng,
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

      const updatedImpactData = {
        zone: `${aPlace} (${year})`,
        people: impact.peopleAffected,
        loss: impact.economicLossCr,
        risk: impact.risk,
      };

      const updatedDemographics = {
        population: impact.population,
        growthRate: 1.6,
        tfr: 1.9,
        migrantsPct: 21,
      };

      const store = useMapStore.getState();
      store.setImpactData(updatedImpactData);
      store.setDemographics(updatedDemographics);

      if (taskIdRef.current !== null) {
        FrameController.remove(taskIdRef.current);
        taskIdRef.current = null;
      }
    };

    taskIdRef.current = FrameController.add(task, 16);

    return () => {
      if (taskIdRef.current !== null) {
        FrameController.remove(taskIdRef.current);
        taskIdRef.current = null;
      }
    };
  }, [year, activeLocation]);
}
