// ================================================
// useLayerSync — Syncs Zustand layer toggles to map
// 🔥 PERF: Single useEffect with combined subscription
// 🔥 PERF: Deferred EventBus emit for sync events
// 🔥 PERF: moveend for coverages instead of move
// ================================================
import { useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import useMapStore from '../store/useMapStore';
import MapEngine from '../engines/MapEngine';
import LayerEngine from '../engines/LayerEngine';
import FacilityEngine from '../engines/FacilityEngine';
import DataEngine from '../engines/DataEngine';
import eventBus, { EVENTS } from '../core/EventBus';
import { OPENWEATHER_KEY } from '../constants/mapConstants';

export default function useLayerSync() {
  const layers = useMapStore(useShallow((s) => s.layers));
  const terrainSubLayers = useMapStore(useShallow((s) => s.terrainSubLayers));
  const terrainMode = useMapStore((s) => s.terrainMode);
  const year = useMapStore((s) => s.year);
  const loading = useMapStore((s) => s.loading);
  const mapStyle = useMapStore((s) => s.mapStyle);

  const styleRef = useRef(null);
  const isInitialLoad = useRef(true);
  const aqiRefreshIntervalRef = useRef(null);
  const aqiDigestRef = useRef('');

  // ── Layer Toggle Sync ──
  useEffect(() => {
    if (loading) return;
    const map = MapEngine.getMap();
    if (!map) return;

    LayerEngine.syncAllToggles(map, layers);

    // Sync terrain — only check plugins that are actually registered
    const elevationPlugin = LayerEngine.getPlugin('terrainElevation');
    if (elevationPlugin) elevationPlugin.toggleMode(map, terrainSubLayers.elevation, terrainMode);

    const floodPlugin = LayerEngine.getPlugin('terrainFlood');
    if (floodPlugin && !terrainSubLayers.flood) floodPlugin.stopSimulation(map);

    const suitabilityPlugin = LayerEngine.getPlugin('terrainSuitability');
    if (suitabilityPlugin) suitabilityPlugin.toggle(map, terrainSubLayers.suitability);

    const heatPlugin = LayerEngine.getPlugin('terrainHeat');
    if (heatPlugin) heatPlugin.toggle(map, terrainSubLayers.heat, year, new Set());

    const greenPlugin = LayerEngine.getPlugin('terrainGreen');
    if (greenPlugin) greenPlugin.toggle(map, terrainSubLayers.green);

    const roadPlugin = LayerEngine.getPlugin('terrainRoad');
    if (roadPlugin && !terrainSubLayers.road) roadPlugin.clearPath(map);

    // 🔥 Deferred emit — doesn't block the sync
    eventBus.emitDeferred(EVENTS.LAYERS_SYNCED, null);

  }, [layers, terrainSubLayers, terrainMode, year, loading]);

  // ── Style Switching ──
  useEffect(() => {
    if (loading) return;
    const map = MapEngine.getMap();
    if (!map) return;

    if (isInitialLoad.current) {
      styleRef.current = mapStyle;
      isInitialLoad.current = false;
      return;
    }

    if (styleRef.current === mapStyle) return;
    styleRef.current = mapStyle;

    eventBus.emit(EVENTS.MAP_STYLE_CHANGE, mapStyle);

    MapEngine.switchStyle(mapStyle, (recoveredMap) => {
      const state = useMapStore.getState();
      LayerEngine.recoverAllLayers(recoveredMap, state);

<<<<<<< Updated upstream
      if (state.facilityData || DataEngine.getFacilityData()) {
=======
      // Re-init facility coverage canvas
      const facilityData = state.facilityData || DataEngine.getFacilityData();
      if (facilityData) {
>>>>>>> Stashed changes
        FacilityEngine.destroy(recoveredMap);
        FacilityEngine.initCoverageCanvas(recoveredMap);
      }

      eventBus.emitDeferred(EVENTS.MAP_STYLE_RECOVERED, mapStyle);
    });
  }, [mapStyle, loading]);

  // ── AQI Periodic Refresh (5min) ──
  useEffect(() => {
    if (loading || !layers.aqi || !OPENWEATHER_KEY) return;

    const refreshAQIData = async () => {
      const map = MapEngine.getMap();
      if (!map || document.hidden) return;
      try {
        const aqiData = await DataEngine.fetchAllCitiesAQI();
        if (aqiData?.features?.length > 0) {
          const plugin = LayerEngine.getPlugin('aqi');
          if (plugin) plugin.update(map, { aqiGeo: aqiData });

          // Simple digest: length + sum — no string concat
          let sum = 0;
          const features = aqiData.features;
          for (let i = 0; i < features.length; i++) {
            sum += (features[i].properties?.aqi ?? 0);
          }
          const nextDigest = features.length * 1000 + sum;

          if (nextDigest !== aqiDigestRef.current) {
            DataEngine.setAqiGeo(aqiData);
            aqiDigestRef.current = nextDigest;
          }
        }
      } catch (_) {}
    };

    refreshAQIData();
    aqiRefreshIntervalRef.current = setInterval(() => {
      if (!document.hidden) refreshAQIData();
    }, 300000);

    return () => {
      if (aqiRefreshIntervalRef.current) {
        clearInterval(aqiRefreshIntervalRef.current);
        aqiRefreshIntervalRef.current = null;
      }
    };
  }, [layers.aqi, loading]);

  // ── Facility Coverage Canvas Sync ──
  useEffect(() => {
    const map = MapEngine.getMap();
    if (!map) return;

    const facilityData = DataEngine.getFacilityData();
    if (!facilityData) return;

    const shouldAnimate = layers.hospitals || layers.policeStations || layers.fireStations;

    const renderFn = () => {
      const currentState = useMapStore.getState();
      FacilityEngine.renderCoverage(map, facilityData, currentState.layers, currentState.facilityViewMode);
    };

    if (shouldAnimate) {
      renderFn();
      FacilityEngine.attachListeners(map, renderFn);
    } else {
      FacilityEngine.detachListeners(map);
      FacilityEngine.renderCoverage(map, facilityData, layers, 'coverage');
    }

    return () => {
      FacilityEngine.detachListeners(map);
    };
  }, [layers.hospitals, layers.policeStations, layers.fireStations, loading]);
}
