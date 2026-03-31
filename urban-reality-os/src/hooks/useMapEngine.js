// ================================================
// useMapEngine — Map initialization & data loading hook
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

    // ── PHASE 1: Make map interactive ASAP ──
    map.once('load', () => {
      if (!isMounted) return;

      const scheduleIdleTask = (task) => {
        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
          requestIdleCallback(task, { timeout: 600 });
        } else {
          setTimeout(task, 400);
        }
      };

      scheduleIdleTask(() => {
        if (!isMounted) return;
        MapEngine.addTerrain();
      });

      // Mark map ready immediately — show UI and let tiles continue loading quietly
      setMapReady(true);
      setLoading(false);

      // Defer secondary data loads until the browser is idle
      scheduleIdleTask(() => {
        if (!isMounted) return;
        loadBackgroundData(isMounted);
      });
    });

    // Handle map load errors
    map.once('error', (e) => {
      if (!isMounted) return;
      console.error('[useMapEngine] Map error:', e);
      setError('Map failed to load. Please refresh.');
      setLoading(false);
    });

    async function loadBackgroundData(mounted) {
      try {
        // Fire all fetches in parallel — don't await sequentially
        const [aqiData, staticData, macroData] = await Promise.all([
          DataEngine.fetchAllCitiesAQI().catch(() => null),
          DataEngine.fetchStaticData().catch(() => ({ floodData: null, facilityData: null, cityDemo: null })),
          DataEngine.fetchWorldBankData().catch(() => null),
        ]);

        if (!mounted || !isMounted) return;

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
        let lowFPSCount = 0;
        let highFPSCount = 0;

        FrameController.onFPS(({ fps }) => {
          if (!isMounted) return;
          const currentQuality = useMapStore.getState().qualityLevel;
          const targetQuality = FrameController.getQualityHint();

          if (targetQuality !== currentQuality) {
            // Priority: Downgrade faster than upgrade
            if (fps < 40) lowFPSCount++;
            else lowFPSCount = 0;

            if (fps > 55) highFPSCount++;
            else highFPSCount = 0;

            if (lowFPSCount >= 3 || highFPSCount >= 10) {
              log.info(`Adaptive Quality: Switching from ${currentQuality} to ${targetQuality} (FPS: ${fps})`);
              useMapStore.getState().setQualityLevel(targetQuality);
              MapEngine.applyQuality(targetQuality);
              lowFPSCount = 0;
              highFPSCount = 0;
            }
          } else {
            lowFPSCount = 0;
            highFPSCount = 0;
          }
        });

      } catch (err) {
        console.error('[useMapEngine] Background data error:', err);
        // Map is still usable even if data fails
      }
    }

    // ── Visibility change ──
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

    // Load saved location markers (deferred)
    map.once('load', () => {
      if (!isMounted) return;
      try {
        const savedLocations = JSON.parse(localStorage.getItem('savedLocations') || '[]');
        savedLocations.forEach((loc) => {
          new maplibregl.Marker({ color: '#f97316' })
            .setLngLat([loc.lng, loc.lat])
            .addTo(map);
        });
      } catch (_) {}
    });

    // ✅ Fixed: saveLocation uses store notification instead of alert()
    window.saveLocation = async (name, lat, lng) => {
      try {
        const savedLocations = JSON.parse(localStorage.getItem('savedLocations') || '[]');
        savedLocations.push({ name: name || 'Pinned Location', lat, lng, timestamp: Date.now() });
        localStorage.setItem('savedLocations', JSON.stringify(savedLocations));

        // Use notification instead of alert
        const store = useMapStore.getState();
        if (store.setNotification) {
          store.setNotification('Location saved!');
        }

        const currentMap = MapEngine.getMap();
        if (currentMap) {
          new maplibregl.Marker({ color: '#f59e0b' })
            .setLngLat([lng, lat])
            .addTo(currentMap);
        }
        return true;
      } catch (err) {
        console.error('saveLocation error', err);
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
