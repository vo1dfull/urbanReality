// ================================================
// useMapEngine — Map initialization & data loading hook
// Bridges MapEngine + DataEngine + LayerEngine → Zustand
// ================================================
import { useEffect, useRef } from 'react';
import useMapStore from '../store/useMapStore';
import MapEngine from '../engines/MapEngine';
import DataEngine from '../engines/DataEngine';
import LayerEngine from '../engines/LayerEngine';
import FacilityEngine from '../engines/FacilityEngine';
import InteractionEngine from '../engines/InteractionEngine';
import maplibregl from 'maplibre-gl';

export default function useMapEngine() {
  const mapContainerRef = useRef(null);
  const initializedRef = useRef(false);

  const setMapInstance = useMapStore((s) => s.setMapInstance);
  const setMapReady = useMapStore((s) => s.setMapReady);
  const setLoading = useMapStore((s) => s.setLoading);
  const setError = useMapStore((s) => s.setError);
  const setAqiGeo = useMapStore((s) => s.setAqiGeo);
  const setFloodData = useMapStore((s) => s.setFloodData);
  const setFacilityData = useMapStore((s) => s.setFacilityData);
  const setCityDemo = useMapStore((s) => s.setCityDemo);
  const setMacroData = useMapStore((s) => s.setMacroData);

  useEffect(() => {
    if (!mapContainerRef.current || initializedRef.current) return;
    initializedRef.current = true;
    let isMounted = true;

    const map = MapEngine.init(mapContainerRef.current);
    setMapInstance(map);

    // Create popup
    const popup = MapEngine.createPopup();
    InteractionEngine.initPopup(popup);

    const loadMapData = async () => {
      try {
        setLoading(true);
        setError(null);

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

        // Fetch heavier datasets in the background
        const [aqiData, staticData, macroData] = await Promise.all([
          DataEngine.fetchAllCitiesAQI(),
          DataEngine.fetchStaticData(),
          DataEngine.fetchWorldBankData(),
        ]);

        if (!isMounted) return;

        if (aqiData) setAqiGeo(aqiData);
        if (staticData.floodData) setFloodData(staticData.floodData);
        if (staticData.facilityData) setFacilityData(staticData.facilityData);
        if (staticData.cityDemo) setCityDemo(staticData.cityDemo);
        if (macroData) setMacroData(macroData);

        const currentMap = MapEngine.getMap();
        if (currentMap) {
          LayerEngine.initAllLayers(currentMap, {
            ...useMapStore.getState(),
            aqiGeo: aqiData,
            floodData: staticData.floodData,
            facilityData: staticData.facilityData,
          });

          if (staticData.facilityData) {
            FacilityEngine.initCoverageCanvas(currentMap);
          }
        }
      } catch (err) {
        console.error('[useMapEngine] Error initializing map:', err);
        if (isMounted) {
          setError('Failed to initialize map data. Please refresh the page.');
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
        // Freeze MapLibre's render loop: prevents GPU/CPU burn on inactive tabs
        currentMap.stop();
      } else {
        // Resume rendering when tab becomes active again
        requestAnimationFrame(() => currentMap.triggerRepaint());
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Load saved location markers
    try {
      const savedLocations = JSON.parse(localStorage.getItem('savedLocations') || '[]');
      // Defer marker addition until map is loaded
      map.once('load', () => {
        if (!isMounted) return;
        savedLocations.forEach((loc) => {
          new maplibregl.Marker({ color: '#f97316' })
            .setLngLat([loc.lng, loc.lat])
            .addTo(map);
        });
      });
    } catch (e) {
      console.warn('[useMapEngine] Could not load saved locations', e);
    }

    // Expose saveLocation globally
    window.saveLocation = async (name, lat, lng) => {
      try {
        const savedLocations = JSON.parse(localStorage.getItem('savedLocations') || '[]');
        savedLocations.push({ name: name || 'Pinned Location', lat, lng, timestamp: Date.now() });
        localStorage.setItem('savedLocations', JSON.stringify(savedLocations));
        alert('Location saved locally');
        const currentMap = MapEngine.getMap();
        if (currentMap) {
          new maplibregl.Marker({ color: '#f59e0b' })
            .setLngLat([lng, lat])
            .addTo(currentMap);
        }
        return true;
      } catch (err) {
        console.error('saveLocation error', err);
        alert('Could not save location');
        return false;
      }
    };

    // Cleanup
    return () => {
      isMounted = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      delete window.saveLocation;
      InteractionEngine.destroy();
      FacilityEngine.destroy(MapEngine.getMap());
      LayerEngine.destroyAll(MapEngine.getMap());
      MapEngine.destroy();
      setMapInstance(null);
      setMapReady(false);
      initializedRef.current = false;
    };
  }, []);

  return { mapContainerRef };
}
