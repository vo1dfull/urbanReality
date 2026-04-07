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
import eventBus from '../core/EventBus';

const STORAGE_KEY = 'urban.keybindings.v1';

const DEFAULT_BINDINGS = {
  'KeyF': 'toggleFacility',
  'Escape': 'closePanels',
  'KeyR': 'resetCamera',
  'KeyT': 'toggleTerrain',
  'KeyD': 'toggleDebug',
  'Digit1': 'toggleHospitals',
  'Digit2': 'togglePolice',
  'Digit3': 'toggleFire',
  'Ctrl+KeyK': 'commandPalette',
  'Ctrl+Shift+KeyX': 'macroRecord',
};

let _bindingMap = loadBindings();
let _macroRecording = false;
let _macroEvents = [];

function loadBindings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_BINDINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_BINDINGS, ...(parsed || {}) };
  } catch {
    return { ...DEFAULT_BINDINGS };
  }
}

export function setKeybinding(combo, command) {
  if (!combo || !command) return;
  _bindingMap[combo] = command;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_bindingMap)); } catch (_) {}
}

export function getKeybindings() {
  return { ..._bindingMap };
}

export function resetKeybindings() {
  _bindingMap = { ...DEFAULT_BINDINGS };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_bindingMap)); } catch (_) {}
}

function signatureFromEvent(e) {
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.shiftKey) parts.push('Shift');
  if (e.altKey) parts.push('Alt');
  parts.push(e.code || e.key);
  return parts.join('+');
}

function contextFromTarget(target) {
  const tag = target?.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) return 'editing';
  return 'global';
}

function runCommand(command, store, setFacilityCheckOpen) {
  switch (command) {
    case 'toggleFacility':
      setFacilityCheckOpen((prev) => !prev);
      return;
    case 'closePanels':
      store.setFacilityCheckOpen(false);
      store.setShowLayersMenu(false);
      store.setShowSuggestions(false);
      return;
    case 'resetCamera': {
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
      return;
    }
    case 'toggleTerrain':
      store.setMapStyle(store.mapStyle === 'terrain' ? 'default' : 'terrain');
      return;
    case 'toggleDebug':
      store.setDebugMode(!store.debugMode);
      return;
    case 'toggleHospitals':
      store.setLayers({ ...store.layers, hospitals: !store.layers.hospitals });
      return;
    case 'togglePolice':
      store.setLayers({ ...store.layers, policeStations: !store.layers.policeStations });
      return;
    case 'toggleFire':
      store.setLayers({ ...store.layers, fireStations: !store.layers.fireStations });
      return;
    case 'commandPalette':
      eventBus.emit('ui:command-palette-toggle', { open: true });
      return;
    case 'macroRecord':
      _macroRecording = !_macroRecording;
      if (!_macroRecording) {
        eventBus.emit('ui:macro-recorded', { events: _macroEvents.slice(0, 64) });
      } else {
        _macroEvents = [];
      }
      return;
    default:
      return;
  }
}

export default function useKeyboardShortcuts() {
  const setFacilityCheckOpen = useMapStore((s) => s.setFacilityCheckOpen);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.repeat) return;
      const context = contextFromTarget(e.target);
      if (context === 'editing' && !(e.ctrlKey || e.metaKey)) return;

      const store = useMapStore.getState();
      const signature = signatureFromEvent(e);
      const command = _bindingMap[signature] || _bindingMap[e.code] || _bindingMap[e.key];

      if (command) {
        e.preventDefault();
        if (_macroRecording && command !== 'macroRecord') {
          _macroEvents.push({ at: Date.now(), command });
          if (_macroEvents.length > 128) _macroEvents.shift();
        }
        runCommand(command, store, setFacilityCheckOpen);
        return;
      }

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
