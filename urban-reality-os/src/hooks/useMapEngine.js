// ================================================
// useMapEngine — Map initialization & data loading hook
// ================================================
import { useEffect, useRef } from 'react';
import useMapStore from '../store/useMapStore';
import MapEngine from '../engines/MapEngine';
import DataEngine from '../engines/DataEngine';
import { readSavedPlaces, addSavedPlace, updateSavedPlace, removeSavedPlace } from '../utils/savedPlaces';
import LayerEngine from '../engines/LayerEngine';
import FacilityEngine from '../engines/FacilityEngine';
import InteractionEngine from '../engines/InteractionEngine';
import PerformanceManager from '../core/PerformanceManager';
import eventBus, { EVENTS } from '../core/EventBus';
import { destroyImpactWorker } from './useInteractions';
import { createLogger } from '../core/Logger';
import maplibregl from 'maplibre-gl';
import FrameController from '../core/FrameController';

const log = createLogger('useMapEngine');

/** @type {number} Max initialization retries */
const MAX_INIT_RETRIES = 3;
const RETRY_DELAY = 2000;
const MAP_READY_TIMEOUT_MS = 6000;

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
    let readyFinalized = false;
    let readyTimeoutId = null;
    let watchdogUnsub = null;
    let centerDebounceId = null;
    let mapMoveHandler = null;

    const map = MapEngine.init(mapContainerRef.current);
    MapEngine.setLayerEngine(LayerEngine);
    DataEngine.setRealtimeLayerDispatcher(({ aqiGeo, facilityData }) => {
      const liveMap = MapEngine.getMap();
      if (!liveMap) return;
      const aqiPlugin = LayerEngine.getPlugin('aqi');
      if (aqiPlugin) {
        if (!aqiPlugin.isInitialized()) aqiPlugin.init(liveMap, { aqiGeo, visible: true });
        else aqiPlugin.update(liveMap, { aqiGeo });
      }
      const facilityPlugin = LayerEngine.getPlugin('facility');
      if (facilityPlugin && facilityData) {
        if (!facilityPlugin.isInitialized()) {
          facilityPlugin.init(liveMap, { facilityData, layers: useMapStore.getState().layers });
        } else {
          facilityPlugin.update(liveMap, facilityData, useMapStore.getState().layers);
        }
      }
    });
    useMapStore.getState().setSafeMode(PerformanceManager.isSafeMode());
    watchdogUnsub = FrameController.onWatchdog(() => {
      const state = useMapStore.getState();
      if (!state.safeMode) return;
      // Emergency degradation path during sustained frame overruns.
      state.setLayers((prev) => ({
        ...prev,
        traffic: false,
        flood: false,
        floodDepth: false,
      }));
    });

    const markReady = () => {
      if (!isMounted || readyFinalized) return;
      readyFinalized = true;
      setMapReady(true);
      setLoading(false);
    };

    // Create popup
    const popup = MapEngine.createPopup();
    InteractionEngine.initPopup(popup);

    // Saved places marker cache
    const savedPlaceMarkers = new Map();

    const clearSavedMarkers = () => {
      savedPlaceMarkers.forEach((marker) => marker.remove());
      savedPlaceMarkers.clear();
    };

    const createSavedMarker = (place) => {
      if (!place?.coords || typeof place.coords.lng !== 'number' || typeof place.coords.lat !== 'number') {
        console.warn('Skipped invalid place coordinates for saved place', place);
        return null;
      }

      const el = document.createElement('div');
      el.style.width = '16px';
      el.style.height = '16px';
      el.style.borderRadius = '50%';
      el.style.backgroundColor = '#f97316';
      el.style.boxShadow = '0 0 8px rgba(249,115,22,0.8)';
      el.style.cursor = 'pointer';
      el.title = place.name;
      el.dataset.savedId = place.id;
      el.onmouseenter = () => window.highlightSavedPlace?.(place.id);
      el.onmouseleave = () => window.highlightSavedPlace?.(null);

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([place.coords.lng, place.coords.lat])
        .addTo(map);

      marker.getElement().addEventListener('click', (ev) => {
        ev.stopPropagation();
        map.flyTo({ center: [place.coords.lng, place.coords.lat], zoom: 15, essential: true });
        useMapStore.getState().setActiveLocation({
          lat: place.coords.lat,
          lng: place.coords.lng,
          placeName: place.name,
          baseAQI: null,
          baseRainfall: null,
          baseTraffic: null,
          baseFloodRisk: null,
          worldBank: null,
          sessionId: null,
        });
      });

      savedPlaceMarkers.set(place.id, marker);
      return marker;
    };

    const renderSavedPlacesOnMap = () => {
      clearSavedMarkers();
      const places = readSavedPlaces();
      places
        .filter((place) => place?.coords && typeof place.coords.lng === 'number' && typeof place.coords.lat === 'number')
        .forEach((place) => createSavedMarker(place));
    };

    const highlightSavedMarker = (id) => {
      savedPlaceMarkers.forEach((marker, markerId) => {
        const el = marker.getElement();
        if (markerId === id) {
          el.style.transform = 'scale(1.4)';
          el.style.backgroundColor = '#22c55e';
          el.style.boxShadow = '0 0 12px rgba(34,197,94,0.85)';
        } else {
          el.style.transform = 'scale(1)';
          el.style.backgroundColor = '#f97316';
          el.style.boxShadow = '0 0 8px rgba(249,115,22,0.8)';
        }
      });
    };

    window.flyToSavedPlace = (id) => {
      const place = readSavedPlaces().find((item) => item.id === id);
      if (!place || !map || !place.coords || typeof place.coords.lng !== 'number' || typeof place.coords.lat !== 'number') return;
      map.flyTo({ center: [place.coords.lng, place.coords.lat], zoom: 15, essential: true });
      highlightSavedMarker(id);
    };

    window.highlightSavedPlace = (id) => {
      highlightSavedMarker(id || null);
    };

    window.addSavedPlace = async (place) => {
      const saved = addSavedPlace(place);
      renderSavedPlacesOnMap();
      return saved;
    };

    window.editSavedPlace = async (id, updates) => {
      const updated = updateSavedPlace(id, updates);
      renderSavedPlacesOnMap();
      return updated;
    };

    window.deleteSavedPlace = async (id) => {
      const updated = removeSavedPlace(id);
      renderSavedPlacesOnMap();
      return updated;
    };

    // Map click selects coordinate and offers save flow via tooltip/modal
    let clickCandidateMarker = null;
    const clearClickCandidate = () => {
      if (clickCandidateMarker) {
        clickCandidateMarker.remove();
        clickCandidateMarker = null;
      }
      useMapStore.getState().setSavedPlaceDraft(null);
      useMapStore.getState().setShowSaveLocationTooltip(false);
    };

    map.on('click', (e) => {
      const lat = e.lngLat.lat;
      const lng = e.lngLat.lng;

      // Keep this interaction minimal (Google Maps-like) and not repetitive
      clearClickCandidate();

      clickCandidateMarker = new maplibregl.Marker({ color: '#38bdf8' })
        .setLngLat([lng, lat])
        .addTo(map);

      useMapStore.getState().setSavedPlaceDraft({ coords: { lat, lng }, name: `Custom Location`, type: 'custom' });
      useMapStore.getState().setShowSaveLocationTooltip(true);
      useMapStore.getState().setShowSaveLocationModal(false);
    });

    // Provide method for external cleanup (e.g., Cancel button)
    window.clearSavedPlaceDraft = clearClickCandidate;

    // Initial render of existing saved places
    renderSavedPlacesOnMap();

    // ── PHASE 1: Make map interactive ASAP ──
    map.once('load', () => {
      if (!isMounted) return;
      try {
        map.getCanvas().style.pointerEvents = 'auto';
      } catch (_) {}

      mapMoveHandler = () => {
        if (centerDebounceId) clearTimeout(centerDebounceId);
        centerDebounceId = setTimeout(() => {
          if (!isMounted || document.hidden) return;
          const center = map.getCenter();
          DataEngine.fetchRealtimeGeoForLocation(center.lat, center.lng, { debounceMs: 180 }).catch(() => null);
        }, 250);
      };
      map.on('moveend', mapMoveHandler);
      mapMoveHandler();

      const scheduleIdleTask = (task) => {
        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
          requestIdleCallback(task, { timeout: 600 });
        } else {
          setTimeout(task, 400);
        }
      };

      // Mark map ready immediately — show UI and let tiles continue loading quietly
      markReady();

      // Defer secondary data loads until the browser is idle
      scheduleIdleTask(() => {
        if (!isMounted) return;
        loadBackgroundData(isMounted);
      });
    });

    // Fallback readiness paths for environments where 'load' can be delayed/missed.
    map.once('idle', () => {
      try {
        map.getCanvas().style.pointerEvents = 'auto';
      } catch (_) {}
      markReady();
    });
    map.once('styledata', () => {
      if (map.loaded()) markReady();
    });

    // Hard timeout so the loading overlay never blocks the app indefinitely.
    readyTimeoutId = setTimeout(() => {
      if (!isMounted || readyFinalized) return;
      log.warn('Map ready timeout reached; forcing UI ready state');
      markReady();
    }, MAP_READY_TIMEOUT_MS);

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
          const safeMode = storeState.safeMode ?? PerformanceManager.isSafeMode();
          const basePayload = {
            aqiGeo: aqiData,
            floodData: staticData.floodData,
            facilityData: staticData.facilityData,
            layers: storeState.layers,
            terrainSubLayers: storeState.terrainSubLayers,
            terrainMode: storeState.terrainMode,
            year: storeState.year,
          };

          // Safe mode: keep startup ultra-light, then lazily load heavy plugins.
          if (safeMode) {
            LayerEngine.initAllLayers(currentMap, {
              ...basePayload,
              layers: { ...storeState.layers, flood: false, floodDepth: false, traffic: false },
              terrainSubLayers: {
                elevation: false, flood: false, suitability: false, heat: false, green: false, road: false,
              },
            });
          } else {
            LayerEngine.initAllLayers(currentMap, basePayload);
          }

          if (staticData.facilityData) {
            FacilityEngine.initCoverageCanvas(currentMap);
          }

          if (safeMode) {
            setTimeout(() => {
              if (!isMounted) return;
              const mapRef = MapEngine.getMap();
              if (!mapRef) return;
              const stateNow = useMapStore.getState();
              LayerEngine.syncAllToggles(mapRef, stateNow.layers);
            }, 1500);
          }
        }
        setDataReady(true);
        log.info('All data loaded');

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
      if (readyTimeoutId) {
        clearTimeout(readyTimeoutId);
        readyTimeoutId = null;
      }
      if (watchdogUnsub) {
        watchdogUnsub();
        watchdogUnsub = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (centerDebounceId) {
        clearTimeout(centerDebounceId);
        centerDebounceId = null;
      }
      if (mapMoveHandler && MapEngine.getMap()) {
        try { MapEngine.getMap().off('moveend', mapMoveHandler); } catch (_) {}
      }
      DataEngine.setRealtimeLayerDispatcher(null);
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
