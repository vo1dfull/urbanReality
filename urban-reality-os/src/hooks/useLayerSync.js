// ================================================
// useLayerSync — Syncs Zustand layer toggles to map
// Also handles style switching with layer recovery
// ✅ useShallow prevents new-reference re-renders on objects
// ================================================
import { useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import useMapStore from '../store/useMapStore';
import MapEngine from '../engines/MapEngine';
import LayerEngine from '../engines/LayerEngine';
import FacilityEngine from '../engines/FacilityEngine';
import DataEngine from '../engines/DataEngine';
import { OPENWEATHER_KEY } from '../constants/mapConstants';

export default function useLayerSync() {
  // ✅ useShallow: prevents re-render when individual layer values are unchanged
  const layers = useMapStore(useShallow((s) => s.layers));
  const terrainSubLayers = useMapStore(useShallow((s) => s.terrainSubLayers));
  const terrainMode = useMapStore((s) => s.terrainMode);
  const year = useMapStore((s) => s.year);
  const loading = useMapStore((s) => s.loading);
  const mapStyle = useMapStore((s) => s.mapStyle);
  const setAqiGeo = useMapStore((s) => s.setAqiGeo);

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
    
    // Sync Terrain Plugins
    const elevationPlugin = LayerEngine.getPlugin('terrainElevation');
    if (elevationPlugin) elevationPlugin.toggleMode(map, terrainSubLayers.elevation, terrainMode);

    const floodPlugin = LayerEngine.getPlugin('terrainFlood');
    if (floodPlugin && !terrainSubLayers.flood) floodPlugin.stopSimulation(map);

    const suitabilityPlugin = LayerEngine.getPlugin('terrainSuitability');
    if (suitabilityPlugin) suitabilityPlugin.toggle(map, terrainSubLayers.suitability);

    const heatPlugin = LayerEngine.getPlugin('terrainHeat');
    // For heat, pass year and an empty green zones set (managed by UI)
    if (heatPlugin) heatPlugin.toggle(map, terrainSubLayers.heat, year, new Set());

    const greenPlugin = LayerEngine.getPlugin('terrainGreen');
    if (greenPlugin) greenPlugin.toggle(map, terrainSubLayers.green);

    const roadPlugin = LayerEngine.getPlugin('terrainRoad');
    if (roadPlugin && !terrainSubLayers.road) roadPlugin.clearPath(map);

  }, [layers, terrainSubLayers, terrainMode, year, loading]);

  // ── Style Switching ──
  useEffect(() => {
    if (loading) return;
    const map = MapEngine.getMap();
    if (!map) return;

    // Skip initial
    if (isInitialLoad.current) {
      styleRef.current = mapStyle;
      isInitialLoad.current = false;
      return;
    }

    if (styleRef.current === mapStyle) return;
    styleRef.current = mapStyle;

    MapEngine.switchStyle(mapStyle, (recoveredMap) => {
      // Recover all layers after style change
      const state = useMapStore.getState();
      LayerEngine.recoverAllLayers(recoveredMap, state);

      // Re-init facility coverage canvas
      if (state.facilityData) {
        FacilityEngine.destroy(recoveredMap);
        FacilityEngine.initCoverageCanvas(recoveredMap);
      }
    });
  }, [mapStyle, loading]);

  // ── AQI Periodic Refresh ──
  useEffect(() => {
    if (loading || !layers.aqi || !OPENWEATHER_KEY) return;

    const computeAqiDigest = (geo) => {
      const features = geo?.features || [];
      let sum = 0;
      for (const feature of features) {
        sum += Number(feature.properties?.aqi ?? 0);
      }
      return `${features.length}-${sum}`;
    };

    const refreshAQIData = async () => {
      const map = MapEngine.getMap();
      if (!map) return;
      const aqiData = await DataEngine.fetchAllCitiesAQI();
      if (aqiData && aqiData.features?.length > 0) {
        const plugin = LayerEngine.getPlugin('aqi');
        if (plugin) plugin.update(map, { aqiGeo: aqiData });

        const nextDigest = computeAqiDigest(aqiData);
        if (nextDigest !== aqiDigestRef.current) {
          setAqiGeo(aqiData);
          aqiDigestRef.current = nextDigest;
        }
      }
    };

    refreshAQIData();
    aqiRefreshIntervalRef.current = setInterval(() => {
      if (!document.hidden) refreshAQIData();
    }, 300000); // 5 minutes — skips refresh when tab hidden

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

    const { facilityData, facilityViewMode } = useMapStore.getState();
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
      // Clear canvas when no facilities active
      FacilityEngine.renderCoverage(map, facilityData, layers, 'coverage');
    }

    return () => {
      FacilityEngine.detachListeners(map);
    };
  }, [layers.hospitals, layers.policeStations, layers.fireStations, loading]);
}
