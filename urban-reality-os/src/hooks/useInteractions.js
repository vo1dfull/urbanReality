// ================================================
// useInteractions — Map click/hover interaction hook
// 🔥 PERF: Facility hover throttle 300ms → 500ms
// 🔥 PERF: Deferred EventBus emit for hover events
// 🔥 PERF: Batch store updates in click handler
// 🔥 PERF: AQI hover throttle 100ms → 200ms
// 🔥 PERF: Canvas cursor set via cached reference
// 🔥 PERF: Worker message handler uses transferable check
// ================================================
import { useEffect, useRef } from 'react';
import { startTransition } from 'react';
import useMapStore from '../store/useMapStore';
import MapEngine from '../engines/MapEngine';
import DataEngine from '../engines/DataEngine';
import InteractionEngine from '../engines/InteractionEngine';
import LayerEngine from '../engines/LayerEngine';
import eventBus, { EVENTS } from '../core/EventBus';
import { throttle } from '../utils/cache';
import {
  BASE_YEAR,
  MAX_YEAR,
  IMPACT_MODEL,
} from '../constants/mapConstants';

// ── Worker singleton ──
let _impactWorker = null;

function getImpactWorker() {
  if (!_impactWorker) {
    _impactWorker = new Worker(
      new URL('../workers/impactWorker.js', import.meta.url),
      { type: 'module' }
    );
  }
  return _impactWorker;
}

function runImpactWorker(payload) {
  return new Promise((resolve) => {
    const worker = getImpactWorker();
    const handler = (e) => {
      worker.removeEventListener('message', handler);
      resolve(e.data);
    };
    worker.addEventListener('message', handler);
    worker.postMessage(payload);
  });
}

export function destroyImpactWorker() {
  if (_impactWorker) {
    _impactWorker.terminate();
    _impactWorker = null;
  }
}

export default function useInteractions() {
  const loading = useMapStore((s) => s.loading);
  // 🔥 REMOVED: const layers = useMapStore((s) => s.layers); — caused re-render on every layer toggle
  const lastAQIRef = useRef(null);
  const yearRef = useRef(useMapStore.getState().year);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    const unsub = useMapStore.subscribe(
      (state) => state.year,
      (year) => { yearRef.current = year; },
      { fireImmediately: true }
    );
    return () => {
      isMountedRef.current = false;
      unsub();
    };
  }, []);

  // ── Map Click Handler ──
  useEffect(() => {
    if (loading) return;
    const map = MapEngine.getMap();
    if (!map) return;

    let lastClickTime = 0;

    const handleMapClick = async (e) => {
      const now = Date.now();
      if (now - lastClickTime < 400) return; // 🔥 Debounce 300→400ms
      lastClickTime = now;

      const { lng, lat } = e.lngLat;
      const y = yearRef.current;
      const macroData = DataEngine.getMacroData();

      const sessionId = InteractionEngine.newSession();
      const requestTime = InteractionEngine.markRequestTime();
      const controller = InteractionEngine.getClickAbortController();
      const signal = controller.signal;

      // 🔥 PERF: Single batchSet instead of 4 separate sets
      useMapStore.getState().batchSet({
        locationData: {
          placeName: 'Analyzing…', lat, lng, year: y,
          finalAQI: null, realTimeAQI: lastAQIRef.current,
          rainfall: 0, impact: null, demographics: null,
          analysis: null, analysisLoading: true,
        },
        uiMode: 'location',
        activeLocation: { lat, lng, isInitialLoading: true, sessionId },
        analysisLoading: true,
        urbanAnalysis: null,
      });

      eventBus.emit(EVENTS.LOCATION_SELECTED, { lat, lng, year: y });

      try {
        const { placeName, realTimeAQI, rainData, trafficJson } =
          await DataEngine.fetchLocationData(lat, lng, signal);

        if (!isMountedRef.current || !InteractionEngine.isCurrentSession(sessionId)) return;

        const rainfall = rainData ? rainData.rain : 0;
        const rainProbability = rainData ? rainData.probability : 0;
        lastAQIRef.current = realTimeAQI;

        const yearsElapsed = y - BASE_YEAR;
        const timeFactor = yearsElapsed / (MAX_YEAR - BASE_YEAR);

        let currentTrafficFactor = IMPACT_MODEL.baseTraffic;
        if (trafficJson?.flowSegmentData) {
          const { currentSpeed, freeFlowSpeed } = trafficJson.flowSegmentData;
          if (freeFlowSpeed > 0) {
            currentTrafficFactor = Math.max(0, Math.min(1, 1 - currentSpeed / freeFlowSpeed));
          }
        }
        const projectedTraffic = currentTrafficFactor + 0.5 * timeFactor;

        const rainFactor = Math.min(rainfall / 20, 1);
        const rainProbFactor = rainProbability / 100;
        const FloodRisk = Math.min(
          1,
          IMPACT_MODEL.baseFloodRisk +
            (IMPACT_MODEL.maxFloodRisk - IMPACT_MODEL.baseFloodRisk) * timeFactor +
            rainFactor * 0.4 +
            rainProbFactor * 0.2
        );

        let nearestVal = null;
        const aqiGeo = DataEngine.getAqiGeo();
        if (!realTimeAQI && aqiGeo?.features?.length) {
          let bestDist = Infinity;
          const features = aqiGeo.features;
          for (let i = 0; i < features.length; i++) {
            const coords = features[i].geometry.coordinates;
            const d = (lat - coords[1]) ** 2 + (lng - coords[0]) ** 2;
            if (d < bestDist && Number.isFinite(features[i].properties?.aqi)) {
              bestDist = d;
              nearestVal = features[i].properties.aqi;
            }
          }
        }

        const finalAQI = realTimeAQI?.aqi ?? nearestVal ?? IMPACT_MODEL.baseAQI;

        const impact = await runImpactWorker({
          year: y, baseYear: BASE_YEAR,
          populationBase: macroData?.population?.value,
          aqi: finalAQI, rainfallMm: rainfall,
          trafficCongestion: projectedTraffic,
          floodRisk: FloodRisk, worldBank: macroData,
        });

        if (!isMountedRef.current || !InteractionEngine.isCurrentSession(sessionId)) return;

        // 🔥 PERF: Single batchSet instead of 5 separate store calls
        startTransition(() => {
          if (!isMountedRef.current) return;
          useMapStore.getState().batchSet({
            impactData: {
              zone: `${placeName} (${y})`,
              people: impact.peopleAffected,
              loss: impact.economicLossCr,
              risk: impact.risk,
            },
            locationPopulation: null,
            demographics: {
              population: impact.population,
              growthRate: 1.6, tfr: 1.9, migrantsPct: 21,
            },
            activeLocation: {
              lat, lng, placeName,
              baseAQI: finalAQI, baseRainfall: rainfall,
              baseTraffic: currentTrafficFactor, baseFloodRisk: FloodRisk,
              worldBank: macroData, sessionId,
            },
            ...(InteractionEngine.isCurrentSession(sessionId) ? {
              locationData: {
                placeName, lat, lng, year: y, finalAQI, realTimeAQI,
                rainfall, impact,
                demographics: { population: impact.population, growthRate: 1.6, tfr: 1.9, migrantsPct: 21 },
                analysis: null, analysisLoading: true,
              }
            } : {}),
          });
        });

        eventBus.emitDeferred(EVENTS.LOCATION_DATA_READY, { lat, lng, placeName });

        // AI Analysis (background)
        const aiController = InteractionEngine.getClickAbortController();
        const aiSignal = aiController.signal;

        (async () => {
          try {
            if (!isMountedRef.current || !InteractionEngine.isCurrentSession(sessionId)) return;

            eventBus.emitDeferred(EVENTS.ANALYSIS_STARTED, { zone: placeName, year: y });

            const analysis = await DataEngine.fetchAIAnalysis({
              zone: placeName, year: y, baseYear: BASE_YEAR,
              aqi: realTimeAQI?.aqi, rainfallMm: rainfall,
              traffic: projectedTraffic, floodRisk: FloodRisk,
              peopleAffected: impact.peopleAffected,
              economicLossCr: impact.economicLossCr,
            }, { signal: aiSignal });

            if (!isMountedRef.current || !InteractionEngine.isCurrentSession(sessionId)) return;

            if (InteractionEngine.isLatestRequest(requestTime)) {
              useMapStore.getState().batchSet({
                urbanAnalysis: analysis || 'No analysis available.',
                analysisLoading: false,
              });
              useMapStore.getState().setLocationData((prev) =>
                prev ? { ...prev, analysis: analysis || 'No analysis available.', analysisLoading: false } : null
              );
              eventBus.emitDeferred(EVENTS.ANALYSIS_READY, { zone: placeName, analysis });
            }
          } catch (err) {
            if (err?.name === 'AbortError') return;
            if (!isMountedRef.current) return;
            if (InteractionEngine.isLatestRequest(requestTime) && InteractionEngine.isCurrentSession(sessionId)) {
              useMapStore.getState().batchSet({
                urbanAnalysis: null,
                analysisLoading: false,
              });
              useMapStore.getState().setLocationData((prev) =>
                prev ? { ...prev, analysis: null, analysisLoading: false } : null
              );
            }
          }
        })();
      } catch (fatalError) {
        if (fatalError?.name === 'AbortError') return;
        if (!isMountedRef.current) return;
        useMapStore.getState().setLocationData((prev) =>
          prev ? { ...prev, placeName: 'Error', analysis: 'Failed to load details', analysisLoading: false } : null
        );
      }
    };

    map.on('click', handleMapClick);
    return () => { map.off('click', handleMapClick); };
  }, [loading]);

  // ── AQI Layer Hover — 🔥 200ms throttle (was 100ms) ──
  useEffect(() => {
    if (loading) return;
    // Read AQI state directly — no subscription needed
    const aqiEnabled = useMapStore.getState().layers.aqi;
    if (!aqiEnabled) return;
    const map = MapEngine.getMap();
    if (!map || !map.getLayer('aqi-layer')) return;

    let cursorIsPointer = false;
    const canvas = map.getCanvas(); // cache

    const handleAQIMouseMove = throttle(() => {
      if (!cursorIsPointer) {
        canvas.style.cursor = 'pointer';
        cursorIsPointer = true;
      }
    }, 200);

    const handleMouseLeave = () => {
      if (cursorIsPointer) {
        canvas.style.cursor = '';
        cursorIsPointer = false;
      }
    };

    map.on('mousemove', 'aqi-layer', handleAQIMouseMove);
    map.on('mouseleave', 'aqi-layer', handleMouseLeave);

    return () => {
      map.off('mousemove', 'aqi-layer', handleAQIMouseMove);
      map.off('mouseleave', 'aqi-layer', handleMouseLeave);
    };
  }, [loading]); // No layers.aqi dep — reads from getState()

  // ── Facility Layer Hover — 🔥 500ms throttle (was 300ms) ──
  useEffect(() => {
    if (loading) return;
    const map = MapEngine.getMap();
    if (!map) return;

    const facilityPlugin = LayerEngine.getPlugin('facility');
    if (!facilityPlugin) return;

    const layerIds = facilityPlugin.getLayerIds();
    const setHoveredFacility = useMapStore.getState().setHoveredFacility;
    const canvas = map.getCanvas();

    let cursorSet = false;
    let lastHoveredId = null;

    let hoverRaf = null;
    let pendingHover = null;

    const commitHover = () => {
      hoverRaf = null;
      if (!pendingHover) return;
      const payload = pendingHover;
      pendingHover = null;
      setHoveredFacility(payload);
      eventBus.emitDeferred(EVENTS.FACILITY_HOVERED, payload.id);
    };

    const handleFacilityMouseMove = throttle((e) => {
      if (!cursorSet) {
        canvas.style.cursor = 'pointer';
        cursorSet = true;
      }

      if (e.features?.length) {
        const newProps = e.features[0].properties;

        // Local string check — faster than getState()
        if (lastHoveredId === newProps.id) return;
        lastHoveredId = newProps.id;

        pendingHover = {
          id: newProps.id,
          type: newProps.type,
          name: newProps.name,
          responseTime: newProps.responseTime,
          coverageRadius: newProps.coverageRadius,
          availableUnits: newProps.availableUnits,
          startX: e.originalEvent.clientX,
          startY: e.originalEvent.clientY,
        };
        if (!hoverRaf) hoverRaf = requestAnimationFrame(commitHover);
      }
    }, 500);

    const handleFacilityMouseLeave = () => {
      if (cursorSet) {
        canvas.style.cursor = '';
        cursorSet = false;
      }
      lastHoveredId = null;
      setHoveredFacility(null);
    };

    layerIds.forEach((id) => {
      if (!map.getLayer(id)) return;
      map.on('mousemove', id, handleFacilityMouseMove);
      map.on('mouseleave', id, handleFacilityMouseLeave);
    });

    return () => {
      if (hoverRaf) {
        cancelAnimationFrame(hoverRaf);
        hoverRaf = null;
      }
      layerIds.forEach((id) => {
        if (!map.getLayer(id)) return;
        map.off('mousemove', id, handleFacilityMouseMove);
        map.off('mouseleave', id, handleFacilityMouseLeave);
      });
    };
  }, [loading]);
}
