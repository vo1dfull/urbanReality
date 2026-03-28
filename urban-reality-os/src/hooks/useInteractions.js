// ================================================
// useInteractions — Map click/hover interaction hook
// ✅ Facility mousemove is THROTTLED (100ms)
// ✅ AQI layer mousemove is THROTTLED (100ms)
// ✅ calculateImpactModel runs in impactWorker (off main thread)
// ================================================
import { useEffect, useRef } from 'react';
import { startTransition } from 'react';
import useMapStore from '../store/useMapStore';
import MapEngine from '../engines/MapEngine';
import DataEngine from '../engines/DataEngine';
import InteractionEngine from '../engines/InteractionEngine';
import LayerEngine from '../engines/LayerEngine';
import { throttle } from '../utils/cache';
import {
  BASE_YEAR,
  MAX_YEAR,
  IMPACT_MODEL,
  OPENWEATHER_KEY,
} from '../constants/mapConstants';

// ── Worker singleton ──
// Vite handles ?worker imports; we construct it inline for portability
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

/** Send work to impactWorker, resolve with result. */
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

export default function useInteractions() {
  const loading = useMapStore((s) => s.loading);
  const layers = useMapStore((s) => s.layers);
  const lastAQIRef = useRef(null);
  const yearRef = useRef(useMapStore.getState().year);

  // Keep yearRef in sync without re-subscribing on every render
  useEffect(() => {
    return useMapStore.subscribe(
      (state) => state.year,
      (year) => { yearRef.current = year; },
      { fireImmediately: true }
    );
  }, []);

  // ── Map Click Handler ──
  useEffect(() => {
    if (loading) return;
    const map = MapEngine.getMap();
    if (!map) return;

    let lastClickTime = 0;

    const handleMapClick = async (e) => {
      // ── Debounce: prevent rapid-click request storms ──
      const now = Date.now();
      if (now - lastClickTime < 300) return;
      lastClickTime = now;

      const { lng, lat } = e.lngLat;
      const y = yearRef.current;
      const macroData = DataEngine.getMacroData();

      const sessionId = InteractionEngine.newSession();
      const requestTime = InteractionEngine.markRequestTime();
      const controller = InteractionEngine.getClickAbortController();
      const signal = controller.signal;

      const store = useMapStore.getState();

      // Show loading state immediately
      store.setLocationData({
        placeName: 'Analyzing…',
        lat, lng,
        year: y,
        finalAQI: null,
        realTimeAQI: lastAQIRef.current,
        rainfall: 0,
        impact: null,
        demographics: null,
        analysis: null,
        analysisLoading: true,
      });
      store.setUiMode('location');
      store.setActiveLocation({ lat, lng, isInitialLoading: true, sessionId });
      store.setAnalysisLoading(true);
      store.setUrbanAnalysis(null);

      try {
        const { placeName, realTimeAQI, rainData, trafficJson } =
          await DataEngine.fetchLocationData(lat, lng, signal);

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
          for (const f of aqiGeo.features) {
            const [fx, fy] = f.geometry.coordinates;
            const d = (lat - fy) ** 2 + (lng - fx) ** 2;
            if (d < bestDist && Number.isFinite(f.properties?.aqi)) {
              bestDist = d;
              nearestVal = f.properties.aqi;
            }
          }
        }

        const finalAQI = realTimeAQI?.aqi ?? nearestVal ?? IMPACT_MODEL.baseAQI;

        // ── Impact model → Web Worker (off main thread) ──
        const impact = await runImpactWorker({
          year: y,
          baseYear: BASE_YEAR,
          populationBase: macroData?.population?.value,
          aqi: finalAQI,
          rainfallMm: rainfall,
          trafficCongestion: projectedTraffic,
          floodRisk: FloodRisk,
          worldBank: macroData,
        });

        const nextImpactData = {
          zone: `${placeName} (${y})`,
          people: impact.peopleAffected,
          loss: impact.economicLossCr,
          risk: impact.risk,
        };

        const nextDemographics = {
          population: impact.population,
          growthRate: 1.6,
          tfr: 1.9,
          migrantsPct: 21,
        };

        const nextActiveLocation = {
          lat, lng, placeName,
          baseAQI: finalAQI,
          baseRainfall: rainfall,
          baseTraffic: currentTrafficFactor,
          baseFloodRisk: FloodRisk,
          worldBank: macroData,
          sessionId,
        };

        const nextLocationData = {
          placeName, lat, lng,
          year: y,
          finalAQI,
          realTimeAQI,
          rainfall,
          impact,
          demographics: nextDemographics,
          analysis: null,
          analysisLoading: true,
        };

        startTransition(() => {
          const s = useMapStore.getState();
          s.setImpactData(nextImpactData);
          s.setLocationPopulation(null);
          s.setDemographics(nextDemographics);
          s.setActiveLocation(nextActiveLocation);
          if (InteractionEngine.isCurrentSession(sessionId)) {
            s.setLocationData(nextLocationData);
          }
        });

        // AI Analysis (background)
        (async () => {
          try {
            if (!InteractionEngine.isCurrentSession(sessionId)) return;

            const aiPayload = {
              zone: placeName,
              year: y,
              baseYear: BASE_YEAR,
              aqi: realTimeAQI?.aqi,
              rainfallMm: rainfall,
              traffic: projectedTraffic,
              floodRisk: FloodRisk,
              peopleAffected: impact.peopleAffected,
              economicLossCr: impact.economicLossCr,
            };

            const analysis = await DataEngine.fetchAIAnalysis(aiPayload);

            if (!InteractionEngine.isCurrentSession(sessionId)) return;

            if (InteractionEngine.isLatestRequest(requestTime)) {
              const s = useMapStore.getState();
              s.setLocationData((prev) =>
                prev ? { ...prev, analysis: analysis || 'No analysis available.', analysisLoading: false } : null
              );
              s.setUrbanAnalysis(analysis || 'No analysis available.');
              s.setAnalysisLoading(false);
            }
          } catch (err) {
            if (InteractionEngine.isLatestRequest(requestTime) && InteractionEngine.isCurrentSession(sessionId)) {
              const s = useMapStore.getState();
              console.error('[useInteractions] AI Analysis Failed', err);
              s.setUrbanAnalysis(null);
              s.setAnalysisLoading(false);
              s.setLocationData((prev) =>
                prev ? { ...prev, analysis: null, analysisLoading: false } : null
              );
            }
          }
        })();
      } catch (fatalError) {
        console.error('[useInteractions] Fatal error:', fatalError);
        useMapStore.getState().setLocationData((prev) =>
          prev ? { ...prev, placeName: 'Error', analysis: 'Failed to load details', analysisLoading: false } : null
        );
      }
    };

    map.on('click', handleMapClick);
    return () => { map.off('click', handleMapClick); };
  }, [loading]);

  // ── AQI Layer Hover — THROTTLED ──
  useEffect(() => {
    if (loading || !layers.aqi) return;
    const map = MapEngine.getMap();
    if (!map || !map.getLayer('aqi-layer')) return;

    const handleAQIMouseMove = throttle((e) => {
      if (!map.getLayer('aqi-layer') || !e.features?.length) return;
      map.getCanvas().style.cursor = 'pointer';
    }, 100);

    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = '';
    };

    map.on('mousemove', 'aqi-layer', handleAQIMouseMove);
    map.on('mouseleave', 'aqi-layer', handleMouseLeave);

    return () => {
      map.off('mousemove', 'aqi-layer', handleAQIMouseMove);
      map.off('mouseleave', 'aqi-layer', handleMouseLeave);
    };
  }, [layers.aqi, loading]);

  // ── Facility Layer Hover — THROTTLED ──
  useEffect(() => {
    if (loading) return;
    const map = MapEngine.getMap();
    if (!map) return;

    const facilityPlugin = LayerEngine.getPlugin('facility');
    if (!facilityPlugin) return;

    const layerIds = facilityPlugin.getLayerIds();
    const setHoveredFacility = useMapStore.getState().setHoveredFacility;

    // Cursor state tracker
    let cursorSet = false;

    // ── Throttle: only propagate state change every 300ms max ──
    const handleFacilityMouseMove = throttle((e) => {
      if (!cursorSet) {
        map.getCanvas().style.cursor = 'pointer';
        cursorSet = true;
      }
      
      if (e.features?.length) {
        const store = useMapStore.getState();
        const currentHover = store.hoveredFacility;
        const newProps = e.features[0].properties;

        // HARD identity check
        if (
          currentHover &&
          currentHover.id === newProps.id &&
          currentHover.type === newProps.type
        ) {
          return; // 🔥 NO UPDATE
        }

        // Only update when truly different, providing initial x/y
        setHoveredFacility({
          id: newProps.id,
          type: newProps.type,
          name: newProps.name,
          responseTime: newProps.responseTime,
          coverageRadius: newProps.coverageRadius,
          availableUnits: newProps.availableUnits,
          startX: e.originalEvent.clientX,
          startY: e.originalEvent.clientY,
        });
      }
    }, 300);

    const handleFacilityMouseLeave = () => {
      if (cursorSet) {
        map.getCanvas().style.cursor = '';
        cursorSet = false;
      }
      setHoveredFacility(null);
    };

    layerIds.forEach((id) => {
      if (!map.getLayer(id)) return;
      map.on('mousemove', id, handleFacilityMouseMove);
      map.on('mouseleave', id, handleFacilityMouseLeave);
    });

    return () => {
      layerIds.forEach((id) => {
        if (!map.getLayer(id)) return;
        map.off('mousemove', id, handleFacilityMouseMove);
        map.off('mouseleave', id, handleFacilityMouseLeave);
      });
    };
  }, [loading, layers.hospitals, layers.policeStations, layers.fireStations]);
}
