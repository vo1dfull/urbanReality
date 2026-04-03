// ================================================
// useLayerSync — Syncs Zustand layer toggles to map
// 🔥 PERF: Direct Zustand subscription to avoid React hook rerenders
// 🔥 PERF: Deferred EventBus emit for sync events
// 🔥 PERF: moveend for coverages instead of move
// ================================================
import { useEffect, useRef } from 'react';
import useMapStore from '../store/useMapStore';
import MapEngine from '../engines/MapEngine';
import LayerEngine from '../engines/LayerEngine';
import FacilityEngine from '../engines/FacilityEngine';
import DataEngine from '../engines/DataEngine';
import eventBus, { EVENTS } from '../core/EventBus';
import { OPENWEATHER_KEY } from '../constants/mapConstants';
import FrameController from '../core/FrameController';

export default function useLayerSync() {
  const styleRef = useRef(null);
  const isInitialLoad = useRef(true);
  const aqiRefreshTaskRef = useRef(null);
  const aqiDigestRef = useRef('');
  const lastStateRef = useRef({
    layers: null,
    terrainSubLayers: null,
    terrainMode: null,
    year: null,
    mapStyle: null,
    loading: null,
  });

  // ── Layer Toggle Sync + Style Switching (direct subscription)
  useEffect(() => {
    const unsub = useMapStore.subscribe((state) => {
      const map = MapEngine.getMap();
      const prev = lastStateRef.current;
      const nextState = {
        layers: state.layers,
        terrainSubLayers: state.terrainSubLayers,
        terrainMode: state.terrainMode,
        year: state.year,
        mapStyle: state.mapStyle,
        loading: state.loading,
      };

      if (!map || state.loading) {
        lastStateRef.current = nextState;
        return;
      }

      if (isInitialLoad.current) {
        styleRef.current = state.mapStyle;
        isInitialLoad.current = false;
      }

      const hasLayerUpdate =
        state.layers !== prev.layers ||
        state.terrainSubLayers !== prev.terrainSubLayers ||
        state.terrainMode !== prev.terrainMode ||
        state.year !== prev.year;

      if (hasLayerUpdate) {
        LayerEngine.syncAllToggles(map, state.layers);

        const elevationPlugin = LayerEngine.getPlugin('terrainElevation');
        if (elevationPlugin) elevationPlugin.toggleMode(map, state.terrainSubLayers.elevation, state.terrainMode);

        const floodPlugin = LayerEngine.getPlugin('terrainFlood');
        if (floodPlugin && !state.terrainSubLayers.flood) floodPlugin.stopSimulation(map);

        const suitabilityPlugin = LayerEngine.getPlugin('terrainSuitability');
        if (suitabilityPlugin) suitabilityPlugin.toggle(map, state.terrainSubLayers.suitability);

        const heatPlugin = LayerEngine.getPlugin('terrainHeat');
        if (heatPlugin) {
          const gz = new Set(state.greenZones || []);
          heatPlugin.toggle(map, state.terrainSubLayers.heat, state.year, gz, state.layers);
        }

        const greenPlugin = LayerEngine.getPlugin('terrainGreen');
        if (greenPlugin) greenPlugin.toggle(map, state.terrainSubLayers.green);

        const roadPlugin = LayerEngine.getPlugin('terrainRoad');
        if (roadPlugin && !state.terrainSubLayers.road) roadPlugin.clearPath(map);

        syncHillshade(map, state.terrainSubLayers.hillshade);

        eventBus.emitDeferred(EVENTS.LAYERS_SYNCED, null);
      }

      if (state.mapStyle !== prev.mapStyle && styleRef.current !== state.mapStyle) {
        if (!isInitialLoad.current) {
          eventBus.emit(EVENTS.MAP_STYLE_CHANGE, state.mapStyle);

          MapEngine.switchStyle(state.mapStyle, (recoveredMap) => {
            const currentState = useMapStore.getState();
            LayerEngine.recoverAllLayers(recoveredMap, currentState);

            const facilityData = currentState.facilityData || DataEngine.getFacilityData();
            if (facilityData) {
              FacilityEngine.destroy(recoveredMap);
              FacilityEngine.initCoverageCanvas(recoveredMap);
            }

            eventBus.emitDeferred(EVENTS.MAP_STYLE_RECOVERED, state.mapStyle);
          });
        }
        styleRef.current = state.mapStyle;
      }

      lastStateRef.current = nextState;
    });

    return unsub;
  }, []);

  // ── AQI Periodic Refresh (5min) — uses fresh store state inside timer
  useEffect(() => {
    const refreshAQIData = async () => {
      const state = useMapStore.getState();
      if (state.loading || !state.layers.aqi || !OPENWEATHER_KEY) return;

      const map = MapEngine.getMap();
      if (!map || document.hidden) return;

      try {
        const aqiData = await DataEngine.fetchAllCitiesAQI();
        if (aqiData?.features?.length > 0) {
          const plugin = LayerEngine.getPlugin('aqi');
          if (plugin) plugin.update(map, { aqiGeo: aqiData });

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
    aqiRefreshTaskRef.current = FrameController.add(() => {
      if (!document.hidden) refreshAQIData();
    }, 300000, 'aqi-refresh', 'idle');

    return () => {
      if (aqiRefreshTaskRef.current !== null) {
        FrameController.remove(aqiRefreshTaskRef.current);
        aqiRefreshTaskRef.current = null;
      }
    };
  }, []);

  // ── Facility Coverage Canvas Sync — keep canvas rendering out of React rerenders
  useEffect(() => {
    const map = MapEngine.getMap();
    if (!map) return;

    const facilityData = DataEngine.getFacilityData();
    if (!facilityData) return;

    const renderFn = () => {
      const currentState = useMapStore.getState();
      FacilityEngine.renderCoverage(map, facilityData, currentState.layers, currentState.facilityViewMode);
    };

    renderFn();
    const currentState = useMapStore.getState();
    const shouldAnimate = currentState.layers.hospitals || currentState.layers.policeStations || currentState.layers.fireStations || currentState.layers.schools;
    if (shouldAnimate) {
      FacilityEngine.attachListeners(map, renderFn);
    } else {
      FacilityEngine.detachListeners(map);
      FacilityEngine.renderCoverage(map, facilityData, currentState.layers, 'coverage');
    }

    const unsub = useMapStore.subscribe(() => {
      const state = useMapStore.getState();
      const active = state.layers.hospitals || state.layers.policeStations || state.layers.fireStations || state.layers.schools;
      if (active) {
        FacilityEngine.attachListeners(map, renderFn);
      } else {
        FacilityEngine.detachListeners(map);
        FacilityEngine.renderCoverage(map, facilityData, state.layers, 'coverage');
      }
    });

    return () => {
      if (unsub) unsub();
      FacilityEngine.detachListeners(map);
    };
  }, []);
}

function syncHillshade(map, enabled) {
  if (!map) return;
  try {
    if (!map.getSource('terrain-rgb-dem')) {
      map.addSource('terrain-rgb-dem', {
        type: 'raster-dem',
        url: 'https://api.maptiler.com/tiles/terrain-rgb/tiles.json?key=UQBNCVHquLf1PybiywBt',
        tileSize: 256,
      });
    }
    if (!map.getLayer('terrain-hillshade')) {
      map.addLayer({
        id: 'terrain-hillshade',
        type: 'hillshade',
        source: 'terrain-rgb-dem',
        paint: {
          'hillshade-exaggeration': 0.55,
          'hillshade-illumination-direction': 325,
        },
        layout: { visibility: enabled ? 'visible' : 'none' },
      });
    } else {
      map.setLayoutProperty('terrain-hillshade', 'visibility', enabled ? 'visible' : 'none');
    }
  } catch (_) {
    // ignore unsupported runtime/style states
  }
}
