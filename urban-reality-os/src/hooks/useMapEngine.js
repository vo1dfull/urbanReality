// ================================================
// useMapEngine — Map initialization & data loading hook
// Bridges MapEngine + DataEngine + LayerEngine → Zustand
// ✅ Fixed: alert() replaced with store notification
// ✅ Fixed: Impact worker cleanup
// ✅ Added: Retry logic with exponential backoff
// ✅ Added: Graceful degradation (offline fallback)
// ✅ Added: Adaptive quality integration
// ================================================
import { useEffect, useRef } from 'react';
import useMapStore from '../store/useMapStore';
import MapEngine from '../engines/MapEngine';
import DataEngine from '../engines/DataEngine';
import LayerEngine from '../engines/LayerEngine';
import FacilityEngine from '../engines/FacilityEngine';
import InteractionEngine from '../engines/InteractionEngine';
import FrameController from '../core/FrameController';
import eventBus, { EVENTS } from '../core/EventBus';
import { destroyImpactWorker } from './useInteractions';
import { createLogger } from '../core/Logger';
import maplibregl from 'maplibre-gl';

const log = createLogger('useMapEngine');

/** @type {number} Max initialization retries */
const MAX_INIT_RETRIES = 3;
const RETRY_DELAY = 2000;

export default function useMapEngine() {
  const mapContainerRef = useRef(null);
  const initializedRef = useRef(false);

  const setMapReady = useMapStore((s) => s.setMapReady);
  const setLoading = useMapStore((s) => s.setLoading);
  const setError = useMapStore((s) => s.setError);
  const setDataReady = useMapStore((s) => s.setDataReady);
  const setMacroData = useMapStore((s) => s.setMacroData);

  useEffect(() => {
    if (!mapContainerRef.current || initializedRef.current) return;
    initializedRef.current = true;
    let isMounted = true;

    const map = MapEngine.init(mapContainerRef.current);

    // Create popup
    const popup = MapEngine.createPopup();
    InteractionEngine.initPopup(popup);

    const loadMapData = async (retryCount = 0) => {
      try {
        setLoading(true);
        setError(null);

        // Wait for map load with timeout
        await new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error('Map load timed out after 20 seconds'));
          }, 20000);

          MapEngine.waitForLoad()
            .then(() => {
              clearTimeout(timeoutId);
              resolve();
            })
            .catch((err) => {
              clearTimeout(timeoutId);
              reject(err);
            });
        });
        if (!isMounted) return;

        // Add terrain and make the map interactive immediately
        MapEngine.addTerrain();
        setMapReady(true);
        setLoading(false);

        eventBus.emit(EVENTS.MAP_READY, { style: MapEngine.getCurrentStyle() });
        log.info('Map loaded successfully');

        // Fetch heavier datasets in the background
        const [aqiData, staticData, macroData] = await Promise.all([
          DataEngine.fetchAllCitiesAQI(),
          DataEngine.fetchStaticData(),
          DataEngine.fetchWorldBankData(),
        ]);

        if (!isMounted) return;

        if (aqiData) DataEngine.setAqiGeo(aqiData);
        if (staticData.floodData) DataEngine.setFloodData(staticData.floodData);
        if (staticData.facilityData) DataEngine.setFacilityData(staticData.facilityData);
        if (staticData.cityDemo) DataEngine.setCityDemo(staticData.cityDemo);
        if (macroData) setMacroData(macroData);

        const currentMap = MapEngine.getMap();
        if (currentMap) {
          const storeState = useMapStore.getState();
          LayerEngine.initAllLayers(currentMap, {
            aqiGeo: aqiData,
            floodData: staticData.floodData,
            facilityData: staticData.facilityData,
            layers: storeState.layers,
            terrainSubLayers: storeState.terrainSubLayers,
            terrainMode: storeState.terrainMode,
            year: storeState.year,
          });

          if (staticData.facilityData) {
            FacilityEngine.initCoverageCanvas(currentMap);
          }
        }
        setDataReady(true);
        log.info('All data loaded');

        // ── Adaptive quality: subscribe to FPS updates ──
        FrameController.onFPS(({ fps, isLow }) => {
          if (!isMounted) return;
          const currentQuality = useMapStore.getState().qualityLevel;
          if (isLow && currentQuality !== 'low') {
            log.warn(`Low FPS detected (${fps}), reducing quality`);
            useMapStore.getState().setQualityLevel('medium');
            MapEngine.applyQuality('medium');
          }
        });

      } catch (err) {
        log.error('Error initializing map:', err);

        // Retry logic
        if (retryCount < MAX_INIT_RETRIES && isMounted) {
          log.info(`Retrying initialization (${retryCount + 1}/${MAX_INIT_RETRIES})...`);
          setError(`Loading failed. Retrying... (${retryCount + 1}/${MAX_INIT_RETRIES})`);
          await new Promise(r => setTimeout(r, RETRY_DELAY * Math.pow(2, retryCount)));
          if (isMounted) {
            return loadMapData(retryCount + 1);
          }
        }

        if (isMounted) {
          // Check if offline
          const isOffline = !navigator.onLine;
          const errorMsg = isOffline
            ? 'No internet connection. Map data cannot be loaded. Please check your connection and refresh.'
            : 'Failed to initialize map data. Please refresh the page.';
          setError(errorMsg);
          setLoading(false);
        }
      }
    };

    loadMapData();

    // ── Visibility change: pause map work when tab is hidden ──
    const handleVisibilityChange = () => {
      const currentMap = MapEngine.getMap();
      if (!currentMap) return;
      if (document.hidden) {
        currentMap.stop();
      } else {
        requestAnimationFrame(() => currentMap.triggerRepaint());
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Load saved location markers
    try {
      const savedLocations = JSON.parse(localStorage.getItem('savedLocations') || '[]');
      map.once('load', () => {
        if (!isMounted) return;
        savedLocations.forEach((loc) => {
          new maplibregl.Marker({ color: '#f97316' })
            .setLngLat([loc.lng, loc.lat])
            .addTo(map);
        });
      });
    } catch (e) {
      log.warn('Could not load saved locations', e);
    }

    // ✅ Fixed: saveLocation uses store notification instead of alert()
    window.saveLocation = async (name, lat, lng) => {
      try {
        const savedLocations = JSON.parse(localStorage.getItem('savedLocations') || '[]');
        savedLocations.push({ name: name || 'Pinned Location', lat, lng, timestamp: Date.now() });
        localStorage.setItem('savedLocations', JSON.stringify(savedLocations));
        useMapStore.getState().setNotification('📍 Location saved locally');
        // Auto-clear notification after 3 seconds
        setTimeout(() => useMapStore.getState().clearNotification(), 3000);
        const currentMap = MapEngine.getMap();
        if (currentMap) {
          new maplibregl.Marker({ color: '#f59e0b' })
            .setLngLat([lng, lat])
            .addTo(currentMap);
        }
        return true;
      } catch (err) {
        log.error('saveLocation error', err);
        useMapStore.getState().setNotification('❌ Could not save location');
        setTimeout(() => useMapStore.getState().clearNotification(), 3000);
        return false;
      }
    };

    // Cleanup
    return () => {
      isMounted = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      delete window.saveLocation;
      destroyImpactWorker(); // ✅ Fix: clean up worker
      InteractionEngine.destroy();
      FacilityEngine.destroy(MapEngine.getMap());
      LayerEngine.destroyAll(MapEngine.getMap());
      MapEngine.destroy();
      setMapReady(false);
      initializedRef.current = false;
      eventBus.emit(EVENTS.MAP_DESTROYED);
    };
  }, []);

  return { mapContainerRef };
}
