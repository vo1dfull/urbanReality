// ================================================
// useLayerSync — Syncs Zustand layer toggles to map
// Also handles style switching with layer recovery
// ✅ useShallow prevents new-reference re-renders on objects
// ✅ EventBus emissions on sync complete
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
import { createLogger } from '../core/Logger';

const log = createLogger('useLayerSync');

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
    
    // Sync Terrain Plugins
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

    eventBus.emit(EVENTS.LAYERS_SYNCED, { layers, terrainSubLayers });

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

    eventBus.emit(EVENTS.MAP_STYLE_CHANGE, { style: mapStyle });

    MapEngine.switchStyle(mapStyle, (recoveredMap) => {
      const state = useMapStore.getState();
      LayerEngine.recoverAllLayers(recoveredMap, state);

      if (state.facilityData || DataEngine.getFacilityData()) {
        FacilityEngine.destroy(recoveredMap);
        FacilityEngine.initCoverageCanvas(recoveredMap);
      }

      eventBus.emit(EVENTS.MAP_STYLE_RECOVERED, { style: mapStyle });
      log.info(`Style recovered: ${mapStyle}`);
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
      try {
        const aqiData = await DataEngine.fetchAllCitiesAQI();
        if (aqiData && aqiData.features?.length > 0) {
          const plugin = LayerEngine.getPlugin('aqi');
          if (plugin) plugin.update(map, { aqiGeo: aqiData });

          const nextDigest = computeAqiDigest(aqiData);
          if (nextDigest !== aqiDigestRef.current) {
            DataEngine.setAqiGeo(aqiData);
            aqiDigestRef.current = nextDigest;
          }
        }
      } catch (err) {
        log.warn('AQI refresh failed:', err);
      }
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
