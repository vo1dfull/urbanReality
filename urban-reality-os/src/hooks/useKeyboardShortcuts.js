// ================================================
// useKeyboardShortcuts — Keyboard shortcut handler
// ✅ F: Toggle facility panel
// ✅ Escape: Close all panels
// ✅ R: Reset camera
// ✅ T: Toggle terrain mode
// ✅ D: Toggle debug panel
// ✅ 1-3: Quick facility layers toggle
// ================================================
import { useEffect } from 'react';
import useMapStore from '../store/useMapStore';
import MapEngine from '../engines/MapEngine';
import { MAP_CONFIG } from '../constants/mapConstants';

export default function useKeyboardShortcuts() {
  const setFacilityCheckOpen = useMapStore((s) => s.setFacilityCheckOpen);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = e.target?.tagName?.toLowerCase();
      if (e.repeat) return;
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return;

      const store = useMapStore.getState();

      const key = e.code || e.key;

      switch (key) {
        case 'f':
        case 'F':
        case 'KeyF':
          setFacilityCheckOpen((prev) => !prev);
          break;

        case 'Escape':
          // Close all panels
          store.setFacilityCheckOpen(false);
          store.setShowLayersMenu(false);
          store.setShowSuggestions(false);
          break;

        case 'r':
        case 'R':
        case 'KeyR': {
          // Reset camera
          const map = MapEngine.getMap();
          if (map) {
            map.flyTo({
              center: MAP_CONFIG.center,
              zoom: MAP_CONFIG.zoom,
              pitch: MAP_CONFIG.pitch,
              bearing: MAP_CONFIG.bearing,
              speed: 0.8,
              curve: 1.5,
            });
            store.setCameraState({ bearing: MAP_CONFIG.bearing, pitch: MAP_CONFIG.pitch });
          }
          break;
        }

        case 't':
        case 'T':
        case 'KeyT':
          // Toggle terrain mode
          store.setMapStyle(store.mapStyle === 'terrain' ? 'default' : 'terrain');
          break;

        case 'd':
        case 'D':
        case 'KeyD':
          // Toggle debug panel
          store.setDebugMode(!store.debugMode);
          break;

        case '1':
          // Toggle hospitals
          store.setLayers({ ...store.layers, hospitals: !store.layers.hospitals });
          break;

        case '2':
          // Toggle police stations
          store.setLayers({ ...store.layers, policeStations: !store.layers.policeStations });
          break;

        case '3':
          // Toggle fire stations
          store.setLayers({ ...store.layers, fireStations: !store.layers.fireStations });
          break;

        default:
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [setFacilityCheckOpen]);
}
