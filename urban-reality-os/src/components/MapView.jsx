// ================================================
// MapView.jsx — Thin Orchestrator
// ✅ Uses grouped selectors (store/selectors.js) → far fewer re-renders
// ✅ UI split: MapCanvas, PanelRoot, OverlayRoot rendered separately
// ✅ DebugPanel integration (toggle via D key)
// ✅ Notification system (replaces alert())
// ✅ useAnalysisState groups 4 fields into 1 subscription
// ================================================
import { useState, useCallback, useRef, useEffect, memo } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useShallow } from 'zustand/react/shallow';
import 'maplibre-gl/dist/maplibre-gl.css';

// Auth & Toast
import { ToastContainer } from '../ui/components/ToastContainer';
import { useOnlineStatus, useAuthSessionRestore } from '../hooks/useAuthSync';

// This headless component absorbs all background map subscriptions
// preventing MapView from re-rendering during simulations or timeline scrubbing.
const MapSyncOrchestrator = memo(function MapSyncOrchestrator({ mapReady }) {
  // Only run interaction hooks if map is ready
  if (!mapReady) return null;

  useLayerSync();
  useFloodAnimation();
  useYearProjection();
  useInteractions();
  useKeyboardShortcuts();
  useOnlineStatus();
  useAuthSessionRestore();
  return null;
});

// Store — grouped selectors
import useMapStore from '../store/useMapStore';
import {
  useLayers,
  useFloodState,
  useFacilityState,
  useUIToggles,
  usePanelState,
  useNotification,
} from '../store/selectors';

// Hooks
import useMapEngine from '../hooks/useMapEngine';
import useLayerSync from '../hooks/useLayerSync';
import useInteractions from '../hooks/useInteractions';
import useCameraControls from '../hooks/useCameraControls';
import useFloodAnimation from '../hooks/useFloodAnimation';
import useYearProjection from '../hooks/useYearProjection';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';
import useUrbanIntelligence from '../hooks/useUrbanIntelligence';

// Engines
import MapEngine from '../engines/MapEngine';
import InteractionEngine from '../engines/InteractionEngine';
import DataEngine from '../engines/DataEngine';
import FrameController from '../core/FrameController';

// UI Components
import CoordinateDisplay from './CoordinateDisplay';
import CitySuggestions from './CitySuggestions';
import FacilityListPanel from './FacilityListPanel';
import UrbanIntelligenceUI from './UrbanIntelligenceUI';
import DebugPanel from './DebugPanel';
import BottomBar from '../ui/layout/BottomBar';
import LayerSwitcher from '../ui/controls/LayerSwitcher';
import TerrainPanelUI from '../ui/panels/TerrainPanel';
import FacilityPanelUI from '../ui/panels/FacilityPanel';
import TrafficPanelUI from '../ui/panels/TrafficPanel';
import { panelSlideLeft } from '../ui/animations/transitions';
import Sidebar from '../ui/layout/Sidebar';
import { LoginModal } from '../ui/components/LoginModal';
import TopSearch from '../ui/layout/TopSearch';
import ContextCard from '../ui/layout/ContextCard';

import { BASE_YEAR, MAX_YEAR, IMPACT_MODEL } from '../constants/mapConstants';

export default function MapView() {
  // ── Hooks ──
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const { mapContainerRef } = useMapEngine();
  const { startCityFlyThrough } = useCameraControls();
  
  // ── Urban Intelligence System ──
  const { engines: urbanEngines, isReady: urbanReady, isInitialized: urbanInitialized, initError } = useUrbanIntelligence();
  console.log('[MapView] urbanInitialized:', urbanInitialized, 'urbanReady:', urbanReady, 'urbanEngines:', urbanEngines, 'initError:', initError);

  // ── Grouped selectors (minimal re-renders) ──
  const { loading, error, mapReady, mapStyle } = useMapStore(
    useShallow((s) => ({
      loading: s.loading,
      error: s.error,
      mapReady: s.mapReady,
      mapStyle: s.mapStyle,
    }))
  );
  const layers = useLayers();
  const { floodMode } = useFloodState();
  const { facilityViewMode } = useFacilityState();
  const { activePanel, appMode, buildMode } = usePanelState();
  const dataReady = useMapStore((s) => s.dataReady);
  const facilityData = dataReady ? DataEngine.getFacilityData() : null;
  const { showSuggestions } = useUIToggles();

  // ✅ Grouped analysis selector — 1 subscription instead of 4 separate ones
  const { impactData, demographics, urbanAnalysis, analysisLoading } = useMapStore(
    useShallow((s) => ({
      impactData: s.impactData,
      demographics: s.demographics,
      urbanAnalysis: s.urbanAnalysis,
      analysisLoading: s.analysisLoading,
    }))
  );
  const activeLocation = useMapStore((s) => s.activeLocation);
  const year = useMapStore((s) => s.year);
  const simulationState = useMapStore((s) => s.simulationState);
  const terrainSubLayers = useMapStore((s) => s.terrainSubLayers);

  // ── Individual setters (stable refs — won't cause re-renders) ──
  const setError = useMapStore((s) => s.setError);
  const setMapStyle = useMapStore((s) => s.setMapStyle);
  const setLayers = useMapStore((s) => s.setLayers);
  const setFacilityViewMode = useMapStore((s) => s.setFacilityViewMode);
  const setFloodMode = useMapStore((s) => s.setFloodMode);
  const setActivePanel = useMapStore((s) => s.setActivePanel);
  const setAppMode = useMapStore((s) => s.setAppMode);
  const setBuildMode = useMapStore((s) => s.setBuildMode);

  // ── Notification ──
  const notification = useNotification();

  // ── Stable mapRef — updates when map becomes ready ──
  const mapRef = useRef(null);
  useEffect(() => {
    mapRef.current = MapEngine.getMap();
  }, [mapReady]);

  // ── Callbacks ──
  const handleLocationSelect = useCallback((lng, lat, placeName) => {
    const map = MapEngine.getMap();
    if (!map) return;
    map.flyTo({
      center: [lng, lat],
      zoom: 14,
      pitch: 65,
      bearing: map.getBearing(),
      speed: 0.6,
      curve: 1.8,
      essential: true,
    });
    const sessionId = InteractionEngine.newSession();
    const store = useMapStore.getState();
    store.setActiveLocation({
      lat, lng, placeName,
      baseAQI: IMPACT_MODEL.baseAQI,
      baseRainfall: 0,
      baseTraffic: IMPACT_MODEL.baseTraffic,
      baseFloodRisk: IMPACT_MODEL.baseFloodRisk,
      worldBank: store.macroData,
      sessionId,
    });
  }, []);

  const toggleFloodMode = useCallback(() => {
    const state = useMapStore.getState();
    const newFloodMode = !state.floodMode;
    if (newFloodMode && !state.layers.floodDepth) {
      state.setLayers({ ...state.layers, floodDepth: true });
    }
    state.setFloodMode(newFloodMode);
  }, []);

  // ── Render ──
  return (
    <>
      {/* ── MAP CANVAS (bottom layer) — 🔥 CSS containment prevents layout thrashing ── */}
      <div ref={mapContainerRef} style={{
        width: '100%', height: '100%', position: 'fixed', top: 0, left: 0,
        zIndex: 0,
        pointerEvents: 'auto',
        background: '#020617',
        contain: 'strict',            /* 🔥 Prevents layout/paint from propagating */
        willChange: 'transform',      /* 🔥 Forces GPU compositing layer */
      }} />

      <MapSyncOrchestrator mapReady={mapReady} />

      {/* ── MODERN LAYOUT ROOT (strict non-overlapping zones) ── */}
      <ModernLayoutRoot
        loading={loading}
        error={error}
        setError={setError}
        mapStyle={mapStyle}
        setMapStyle={setMapStyle}
        layers={layers}
        setLayers={setLayers}
        mapRef={mapRef}
        activeLocation={activeLocation}
        showSuggestions={showSuggestions}
        facilityViewMode={facilityViewMode}
        setFacilityViewMode={setFacilityViewMode}
        floodMode={floodMode}
        facilityData={facilityData}
        year={year}
        simulationState={simulationState}
        terrainSubLayers={terrainSubLayers}
        impactData={impactData}
        demographics={demographics}
        urbanAnalysis={urbanAnalysis}
        analysisLoading={analysisLoading}
        activePanel={activePanel}
        appMode={appMode}
        buildMode={buildMode}
        setActivePanel={setActivePanel}
        setAppMode={setAppMode}
        setBuildMode={setBuildMode}
        mapReady={mapReady}
        onLocationSelect={handleLocationSelect}
        onToggleFlood={toggleFloodMode}
        startCityFlyThrough={startCityFlyThrough}
        onRequestLogin={() => setIsLoginOpen(true)}
      />

      {/* ── OVERLAY ROOT (top layer — tooltips, popups) ── */}
      <OverlayRoot mapStyle={mapStyle} mapRef={mapRef} />

      {/* ── FPS HUD ── */}
      <FPSHUD />

      {/* ── NOTIFICATION TOAST ── */}
      {notification && <NotificationToast message={notification} />}

      {/* ── TOAST CONTAINER (Auth & Global) ── */}
      <ToastContainer />

      {/* ── LOGIN MODAL ── */}
      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />

      {/* ── URBAN INTELLIGENCE UI ── */}
      {urbanInitialized && (
        <div style={{ position: 'relative', zIndex: 900 }}>
          <UrbanIntelligenceUI
            engines={(urbanEngines && Object.keys(urbanEngines).length > 0) ? urbanEngines : null}
            initError={initError}
            onPanelChange={(panel) => console.log('[UI] Panel changed:', panel)}
          />
        </div>
      )}
      {!urbanReady && urbanInitialized && !initError && (
        <div style={{
          position: 'fixed',
          bottom: 120,
          right: 20,
          padding: '12px 16px',
          background: 'rgba(255, 100, 100, 0.9)',
          color: 'white',
          borderRadius: '6px',
          fontSize: '12px',
          zIndex: 900,
        }}>
          ⚠️ Urban Intelligence initializing...
        </div>
      )}

      {/* ── DEBUG PANEL (Phase B) ── */}
      <DebugPanel />
    </>
  );
}

// ══════════════════════════════════════════════════
// NotificationToast — Auto-dismissing notification
// ══════════════════════════════════════════════════
// 🔥 PERF: Static style element — prevents injecting new <style> tags on every render
let _toastStyleInjected = false;
function _ensureToastStyle() {
  if (_toastStyleInjected) return;
  _toastStyleInjected = true;
  const style = document.createElement('style');
  style.textContent = '@keyframes slideUp{from{opacity:0;transform:translateX(-50%) translateY(10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}';
  document.head.appendChild(style);
}

const NotificationToast = memo(function NotificationToast({ message }) {
  _ensureToastStyle();
  return (
    <div style={{
      position: 'fixed',
      bottom: 80,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 10001,
      background: 'rgba(15, 23, 42, 0.95)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(255,255,255,0.15)',
      borderRadius: 12,
      padding: '10px 20px',
      color: '#f1f5f9',
      fontSize: 13,
      fontWeight: 500,
      fontFamily: "'Inter', sans-serif",
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      animation: 'slideUp 300ms ease-out',
    }}>
      {message}
    </div>
  );
});

// ══════════════════════════════════════════════════
// FPS HUD — Direct DOM manipulation for performance
// ══════════════════════════════════════════════════
const FPSHUD = memo(function FPSHUD() {
  const containerRef = useRef(null);
  const debugMode = useMapStore(s => s.debugMode);

  useEffect(() => {
    if (!debugMode || !containerRef.current) return;
    const unsub = FrameController.onFPS(({ fps }) => {
      if (containerRef.current) {
        containerRef.current.textContent = `${fps} FPS`;
        containerRef.current.style.color = fps >= 50 ? '#4ade80' : fps >= 30 ? '#fbbf24' : '#f87171';
      }
    });
    return unsub;
  }, [debugMode]);

  if (!debugMode) return null;

  return (
      <div ref={containerRef} style={{
      position: 'fixed', top: 12, left: 12, zIndex: 10000,
      background: 'rgba(5, 8, 16, 0.7)', padding: '4px 8px',
      borderRadius: '6px', fontFamily: "'Inter', sans-serif",
      fontSize: '11px', fontWeight: '700', color: '#4ade80',
      pointerEvents: 'none', border: '1px solid rgba(255,255,255,0.1)',
      backdropFilter: 'blur(4px)',
    }}>
      60 FPS
    </div>
  );
});

const ModernLayoutRoot = memo(function ModernLayoutRoot({
  loading, error, setError,
  mapStyle, setMapStyle, layers, setLayers, mapRef,
  activeLocation,
  year,
  simulationState,
  terrainSubLayers,
  showSuggestions,
  facilityViewMode, setFacilityViewMode,
  floodMode, facilityData,
  impactData, demographics, urbanAnalysis, analysisLoading,
  activePanel, appMode, buildMode,
  setActivePanel, setAppMode,
  mapReady, onLocationSelect, onToggleFlood, startCityFlyThrough,
  onRequestLogin,
}) {
  _ensureDockPolishStyle();
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10, pointerEvents: 'none' }}>
      {loading && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 11, background: 'rgba(2, 6, 23, 0.62)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', color: '#e2e8f0', pointerEvents: 'none' }}>
          Loading map data...
        </div>
      )}
      {error && (
        <div style={{ position: 'fixed', top: 76, left: 84, zIndex: 20, background: 'rgba(220, 38, 38, 0.85)', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 10, color: '#fff', padding: '8px 12px', pointerEvents: 'auto' }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 10, background: 'transparent', color: '#fff', border: 0, cursor: 'pointer' }}>x</button>
        </div>
      )}

      <Sidebar
        onAction={(key) => {
          const store = useMapStore.getState();
          if (key === 'saved-places' || key === 'bookmarks' || key === 'recent-searches') {
            store.setShowSuggestions(true);
            return;
          }
        if (key === 'projects') {
          const current = {
            id: `proj-${Date.now()}`,
            name: `Scenario ${new Date().toLocaleString()}`,
            mapStyle: store.mapStyle,
            layers: store.layers,
            terrainSubLayers: store.terrainSubLayers,
            year: store.year,
          };
          const prev = JSON.parse(localStorage.getItem('projects') || '[]');
          localStorage.setItem('projects', JSON.stringify([current, ...prev].slice(0, 20)));
          store.setNotification('Project snapshot saved.');
          return;
        }
        if (key === 'settings') {
          const units = localStorage.getItem('units') === 'miles' ? 'km' : 'miles';
          localStorage.setItem('units', units);
          store.setNotification(`Units switched to ${units}.`);
          return;
        }
        if (key === 'performance-mode') {
          const heavyOff = !store.safeMode;
          if (heavyOff) {
            store.setLayers((prev) => ({ ...prev, traffic: false, flood: false, floodDepth: false }));
            store.setTerrainSubLayers((prev) => ({ ...prev, heat: false, flood: false }));
          }
          store.setNotification(store.safeMode ? 'Performance mode enabled.' : 'Performance mode disabled.');
          return;
        }
        if (key === 'plugins') {
          store.setNotification('Plugin marketplace hook is ready.');
          return;
        }
        if (key === 'signin') {
          onRequestLogin?.();
          return;
        }
      }}
      onRequestLogin={onRequestLogin}
      />
      <div style={{ position: 'fixed', top: 14, left: 80, zIndex: 20, display: 'flex', alignItems: 'center', gap: 10, pointerEvents: 'none' }}>
        <TopSearch onLocationSelect={onLocationSelect} />
        <button className="interactive ui-dock-btn" onClick={startCityFlyThrough} style={floatingBtnStyle}>Fly Through</button>
        <button className="interactive ui-dock-btn" onClick={onToggleFlood} style={floatingBtnStyle}>{floodMode ? 'Stop Simulation' : 'Start Simulation'}</button>
      </div>

      <AnimatePresence mode="wait">
        {activePanel && (
          <motion.div
            key={activePanel}
            {...panelSlideLeft}
            style={{
              position: 'fixed',
              top: 76,
              left: 80,
              width: 312,
              maxHeight: 'calc(100vh - 168px)',
              zIndex: 20,
              borderRadius: 16,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(20,20,30,0.65)',
              backdropFilter: 'blur(16px)',
              boxShadow: '0 8px 20px rgba(2,6,23,0.24)',
              padding: 12,
              overflow: 'auto',
              pointerEvents: 'auto',
            }}
          >
            {activePanel === 'terrain' && <TerrainPanelUI map={mapRef.current} isActive={mapStyle === 'terrain'} />}
            {activePanel === 'traffic' && <TrafficPanelUI layers={layers} setLayers={setLayers} />}
            {activePanel === 'facility' && (
              <FacilityPanelUI layers={layers} setLayers={setLayers} facilityData={facilityData} facilityViewMode={facilityViewMode} setFacilityViewMode={setFacilityViewMode} />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <LayerSwitcher mapStyle={mapStyle} layers={layers} setLayers={setLayers} setMapStyle={setMapStyle} />
      <ContextCard
        activeLocation={activeLocation}
        impactData={impactData}
        demographics={demographics}
        facilityData={facilityData}
        year={year}
        layers={layers}
        mapStyle={mapStyle}
        terrainSubLayers={terrainSubLayers}
        simulationState={simulationState}
        onClose={() => useMapStore.getState().setActiveLocation(null)}
      />
      <BottomBar />
      <CitySuggestions map={mapRef.current} visible={showSuggestions} />
      <CoordinateDisplay mapRef={mapRef} />
      <FacilityListPanel facilityData={facilityData} layers={layers} mapRef={mapRef} />
    </div>
  );
});

let _dockPolishStyleInjected = false;
function _ensureDockPolishStyle() {
  if (_dockPolishStyleInjected || typeof document === 'undefined') return;
  _dockPolishStyleInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .ui-dock-btn:hover { transform: scale(1.08); }
    .ui-dock-btn:active { transform: scale(0.97); }
  `;
  document.head.appendChild(style);
}

const floatingBtnStyle = {
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(15,23,42,0.78)',
  color: '#e2e8f0',
  padding: '8px 12px',
  borderRadius: 12,
  cursor: 'pointer',
  backdropFilter: 'blur(12px)',
  boxShadow: '0 8px 18px rgba(2,6,23,0.2)',
};

// ══════════════════════════════════════════════════
// PanelRoot — All UI panels in one isolated subtree
// ✅ React.memo prevents re-renders from parent state changes
// ══════════════════════════════════════════════════
const PanelRoot = memo(function PanelRoot({
  loading, error, setError,
  mapStyle, setMapStyle,
  layers, setLayers,
  mapRef,
  facilityCheckOpen, setFacilityCheckOpen,
  showLayersMenu, setShowLayersMenu,
  showSuggestions,
  facilityViewMode, setFacilityViewMode,
  floodMode, facilityData,
  impactData, demographics, urbanAnalysis, analysisLoading,
  activePanel, appMode, buildMode,
  setActivePanel, setAppMode, setBuildMode,
  mapReady, onLocationSelect, onToggleFlood, startCityFlyThrough,
}) {
  return (
    <>
      {/* Loading Overlay */}
      {loading && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(2, 6, 23, 0.9)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, color: '#fff', fontSize: 18,
          backdropFilter: 'blur(8px)',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ marginBottom: 12, fontSize: 32 }}>🗺️</div>
            <div>Loading map data...</div>
            <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
              Initializing Urban Reality OS
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div style={{
          position: 'absolute', top: 120, right: 20, zIndex: 1000,
          background: 'rgba(220, 38, 38, 0.95)', color: '#fff',
          padding: '12px 18px', borderRadius: 8, maxWidth: 300,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          backdropFilter: 'blur(8px)',
        }}>
          <strong>⚠️ Error:</strong> {error}
          <button
            onClick={() => setError(null)}
            style={{
              marginLeft: 12, background: 'rgba(255,255,255,0.2)',
              border: 'none', color: '#fff', padding: '4px 8px',
              borderRadius: 4, cursor: 'pointer',
            }}
          >✕</button>
        </div>
      )}

      <LeftDock
        activePanel={activePanel}
        appMode={appMode}
        buildMode={buildMode}
        setActivePanel={setActivePanel}
        setAppMode={setAppMode}
        setBuildMode={setBuildMode}
        mapStyle={mapStyle}
        setMapStyle={setMapStyle}
        layers={layers}
        setLayers={setLayers}
        setFacilityCheckOpen={setFacilityCheckOpen}
        facilityCheckOpen={facilityCheckOpen}
      />
      <TerrainController map={mapRef.current} isActive={mapStyle === 'terrain'} />
      <SearchBar mapRef={mapRef} onLocationSelect={onLocationSelect} />
      <TimeSlider />
      <AnimatePresence>
        {activePanel === 'traffic' && (
          <motion.div
            initial={{ opacity: 0, x: -12, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -10, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
          >
            <TrafficPanel layers={layers} />
          </motion.div>
        )}
        {activePanel === 'facility' && (
          <motion.div
            initial={{ opacity: 0, x: -12, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -10, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
          >
            <FacilityPanel
              layers={layers}
              setLayers={setLayers}
              facilityData={facilityData}
              facilityViewMode={facilityViewMode}
              setFacilityViewMode={setFacilityViewMode}
            />
          </motion.div>
        )}
      </AnimatePresence>
      <InsightPanel
        insight={urbanAnalysis}
        loading={analysisLoading}
        impactData={impactData}
        demographics={demographics}
        appMode={appMode}
        buildMode={buildMode}
      />

      {/* ── Bottom-Left Layer Bar ── */}
      <div style={{ position: 'absolute', bottom: 20, left: 20, zIndex: 20 }}>
        {/* Facility Sub-Panel */}
        <div
          style={{
            position: 'absolute', bottom: 'calc(100% + 12px)', left: 0, width: 272,
            background: 'rgba(8, 12, 28, 0.88)',
            border: '1px solid rgba(255,255,255,0.12)',
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            borderRadius: 16,
            boxShadow: '0 12px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.07)',
            padding: '16px',
            pointerEvents: facilityCheckOpen ? 'all' : 'none',
            opacity: facilityCheckOpen ? 1 : 0,
            transform: facilityCheckOpen ? 'translateY(0px)' : 'translateY(10px)',
            transition: 'opacity 220ms ease, transform 220ms ease',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            willChange: 'transform, opacity',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>🏥</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', letterSpacing: '-0.2px' }}>Facility Check</span>
            </div>
            <span style={{ fontSize: 10, color: '#64748b', fontFamily: 'monospace', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 4 }}>F</span>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#64748b', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 8 }}>Layers</div>
            {[
              { key: 'hospitals', label: 'Hospitals', icon: '🏥', color: '#06b6d4' },
              { key: 'policeStations', label: 'Police Stations', icon: '🚔', color: '#8b5cf6' },
              { key: 'fireStations', label: 'Fire Stations', icon: '🔥', color: '#f97316' },
            ].map(({ key, label, icon, color }) => {
              const active = layers[key];
              return (
                <button
                  key={key}
                  onClick={() => setLayers((prev) => ({ ...prev, [key]: !prev[key] }))}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    padding: '8px 10px', marginBottom: 4, borderRadius: 10,
                    border: active ? `1px solid ${color}44` : '1px solid rgba(255,255,255,0.06)',
                    background: active ? `${color}18` : 'rgba(255,255,255,0.03)',
                    cursor: 'pointer', transition: 'all 180ms ease', textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 15 }}>{icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: active ? '#f1f5f9' : '#64748b', flex: 1, transition: 'color 180ms' }}>{label}</span>
                  <div style={{
                    width: 28, height: 16, borderRadius: 8,
                    background: active ? color : 'rgba(255,255,255,0.1)',
                    position: 'relative', transition: 'background 200ms ease', flexShrink: 0,
                  }}>
                    <div style={{
                      position: 'absolute', top: 2, left: active ? 14 : 2,
                      width: 12, height: 12, borderRadius: '50%', background: '#fff',
                      transition: 'left 200ms ease', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                    }} />
                  </div>
                </button>
              );
            })}
          </div>

          <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', marginBottom: 12 }} />

          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#64748b', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 8 }}>View Mode</div>
            <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 3 }}>
              {[
                { key: 'coverage', label: 'Coverage', icon: '🎯' },
                { key: 'gap', label: 'Gap', icon: '⚠️' },
                { key: 'heatmap', label: 'Heatmap', icon: '🔥' },
              ].map((mode) => (
                <button
                  key={mode.key}
                  onClick={() => setFacilityViewMode(mode.key)}
                  style={{
                    flex: 1, padding: '6px 4px', borderRadius: 8, border: 'none',
                    background: facilityViewMode === mode.key ? 'rgba(59,130,246,0.85)' : 'transparent',
                    color: facilityViewMode === mode.key ? '#fff' : '#64748b',
                    cursor: 'pointer', fontSize: 11, fontWeight: 600,
                    transition: 'all 180ms ease', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', gap: 2,
                    boxShadow: facilityViewMode === mode.key ? '0 2px 8px rgba(59,130,246,0.4)' : 'none',
                  }}
                >
                  <span>{mode.icon}</span>
                  <span>{mode.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Main Layer Bar */}
        <div style={{
          display: 'flex', gap: 6,
          background: 'rgba(8, 12, 28, 0.78)',
          border: '1px solid rgba(255,255,255,0.11)',
          backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          borderRadius: 18, padding: '8px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.07)',
        }}>
          <LayerBarButton
            label="Satellite"
            active={mapStyle === 'satellite'}
            onClick={() => { setMapStyle(mapStyle === 'satellite' ? 'default' : 'satellite'); setShowLayersMenu(false); setFacilityCheckOpen(false); }}
            thumbnail={<SatelliteThumbnail />}
          />
          <LayerBarButton
            label="Terrain"
            active={mapStyle === 'terrain'}
            onClick={() => { setMapStyle(mapStyle === 'terrain' ? 'default' : 'terrain'); setShowLayersMenu(false); setFacilityCheckOpen(false); }}
            thumbnail={<TerrainThumbnail />}
          />
          <div style={{ position: 'relative' }}>
            <LayerBarButton
              label="Traffic"
              active={layers.traffic}
              onClick={(e) => { e.stopPropagation(); setLayers((prev) => ({ ...prev, traffic: !prev.traffic })); setShowLayersMenu((prev) => !prev); setFacilityCheckOpen(false); }}
              thumbnail={<TrafficThumbnail />}
            />
            {showLayersMenu && <TrafficLegend />}
          </div>
          <LayerBarButton
            label="Facility"
            active={facilityCheckOpen || layers.hospitals || layers.policeStations || layers.fireStations}
            activeColor="#06b6d4"
            onClick={() => { setFacilityCheckOpen((prev) => !prev); setShowLayersMenu(false); }}
            thumbnail={
              <div style={{
                width: 50, height: 46, borderRadius: 8,
                background: (facilityCheckOpen || layers.hospitals || layers.policeStations || layers.fireStations) ? 'rgba(6,182,212,0.14)' : 'rgba(8,15,35,0.85)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                transition: 'background 200ms',
              }}>
                <span style={{
                  fontSize: 26, display: 'inline-block',
                  animation: (layers.hospitals || layers.policeStations || layers.fireStations) ? 'facilityPulse 2s ease-in-out infinite' : 'none',
                }}>🏥</span>
              </div>
            }
            labelColor={(facilityCheckOpen || layers.hospitals || layers.policeStations || layers.fireStations) ? '#67e8f9' : '#94a3b8'}
          />
        </div>
      </div>

      {/* CSS animations */}
      <style>{`
        @keyframes facilityPulse {
          0%, 100% { transform: scale(1); filter: drop-shadow(0 0 0px #06b6d4); }
          50% { transform: scale(1.12); filter: drop-shadow(0 0 6px #06b6d400) drop-shadow(0 0 8px #06b6d4bb); }
        }
      `}</style>

      {/* Camera Controls Info */}
      <div style={{
        position: 'absolute', bottom: 20, right: 20, zIndex: 10,
        background: 'rgba(2, 6, 23, 0.85)', padding: '12px 16px',
        borderRadius: 8, backdropFilter: 'blur(8px)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)', color: '#fff',
        fontSize: 12, lineHeight: 1.5, maxWidth: 200,
      }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>🖱️ Mouse Controls</div>
        <div style={{ opacity: 0.9 }}>
          <div>Right-click + Drag</div>
          <div style={{ marginTop: 4, fontSize: 11, opacity: 0.8 }}>
            Left/Right = Rotate<br />Up/Down = Tilt
          </div>
        </div>
        <div style={{ marginTop: 6, fontSize: 10, color: '#64748b' }}>
          Double-click = Smart Zoom
        </div>
      </div>

      {/* Control Buttons */}
      <div style={{ position: 'absolute', top: 20, left: 620, zIndex: 10, display: 'flex', gap: 10 }}>
        <button
          onClick={startCityFlyThrough}
          disabled={loading || !mapReady}
          style={{
            padding: '10px 16px', borderRadius: 8, border: 'none',
            background: loading || !mapReady ? '#374151' : '#020617',
            color: '#fff', cursor: loading || !mapReady ? 'not-allowed' : 'pointer',
            fontSize: 14, fontWeight: 500,
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)', transition: 'all 0.2s',
            opacity: loading || !mapReady ? 0.6 : 1,
            willChange: 'transform',
          }}
        >
          🎥 Fly Through City
        </button>
        <button
          onClick={onToggleFlood}
          disabled={loading || !mapReady}
          style={{
            padding: '10px 16px', borderRadius: 8, border: 'none',
            background: floodMode && layers.floodDepth ? '#2563eb' : loading || !mapReady ? '#374151' : '#020617',
            color: '#fff', cursor: loading || !mapReady ? 'not-allowed' : 'pointer',
            fontSize: 14, fontWeight: 500,
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)', transition: 'all 0.2s',
            opacity: loading || !mapReady ? 0.6 : 1,
            willChange: 'transform',
          }}
        >
          🌊 {floodMode ? 'Stop' : 'Start'} Flood Animation
        </button>
      </div>

      <EconomicPanel data={impactData} demographics={demographics} analysis={urbanAnalysis} analysisLoading={analysisLoading} />
      <CitySuggestions map={mapRef.current} visible={showSuggestions} />
      <FacilityStatsPanel facilityData={facilityData} layers={layers} facilityViewMode={facilityViewMode} />
      <CoordinateDisplay mapRef={mapRef} />
      <FacilityListPanel facilityData={facilityData} layers={layers} mapRef={mapRef} />
    </>
  );
});

// ══════════════════════════════════════════════════
// OverlayRoot — Top-layer tooltips and popups
// ✅ FIXED: Direct DOM manipulation eliminates 120fps re-renders
// ══════════════════════════════════════════════════
const OverlayRoot = memo(function OverlayRoot({ mapStyle, mapRef }) {
  const hoveredFacility = useMapStore(s => s.hoveredFacility);
  const tooltipRef = useRef(null);
  const rafRef = useRef(null);
  const pointerRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!hoveredFacility) return;

    const move = (e) => {
      pointerRef.current = { x: e.clientX, y: e.clientY };
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        if (tooltipRef.current) {
          tooltipRef.current.style.transform = `translate3d(${pointerRef.current.x + 15}px, ${pointerRef.current.y + 15}px, 0)`;
        }
      });
    };

    window.addEventListener('mousemove', move, { passive: true });

    if (tooltipRef.current && hoveredFacility.startX) {
      tooltipRef.current.style.transform = `translate3d(${hoveredFacility.startX + 15}px, ${hoveredFacility.startY + 15}px, 0)`;
    }

    return () => {
      window.removeEventListener('mousemove', move);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [hoveredFacility]);

  if (!hoveredFacility || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={tooltipRef}
      style={{
        position: 'fixed', left: 0, top: 0,
        background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
        padding: '12px 16px', color: '#f8fafc', zIndex: 30,
        pointerEvents: 'none', minWidth: 180, boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        willChange: 'transform',
      }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>{hoveredFacility.type === 'hospital' ? '🏥' : hoveredFacility.type === 'police' ? '🚔' : '🔥'}</span>
        {hoveredFacility.name || 'Facility'}
      </div>
      <div style={{ fontSize: 12, color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ opacity: 0.8 }}>Response Time:</span>
          <span style={{ color: '#60a5fa', fontWeight: 600 }}>{hoveredFacility.responseTime || '5'} min</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ opacity: 0.8 }}>Coverage Radius:</span>
          <span style={{ color: '#34d399', fontWeight: 600 }}>{hoveredFacility.coverageRadius || '2'} km</span>
        </div>
      </div>
    </div>,
    document.body
  );
});

// ══════════════════════════════════════════════════
// Sub-components (private to MapView)
// ══════════════════════════════════════════════════

const LayerBarButton = memo(function LayerBarButton({ label, active, activeColor = '#3b82f6', onClick, thumbnail, labelColor }) {
  const borderColor = active ? activeColor : 'rgba(255,255,255,0.08)';
  const bgColor = active ? `${activeColor}33` : 'rgba(255,255,255,0.04)';
  const textColor = labelColor || (active ? '#93c5fd' : '#94a3b8');

  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        width: 72, height: 76, borderRadius: 12,
        border: active ? `2px solid ${activeColor}` : `1px solid ${borderColor}`,
        background: bgColor, cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: 0, gap: 4,
        transition: 'all 180ms cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: active ? `0 0 0 2px ${activeColor}4d, 0 0 18px ${activeColor}40` : 'none',
        transform: active ? 'scale(1.02) translateZ(0)' : 'scale(1) translateZ(0)',
        willChange: 'transform',
      }}
    >
      {thumbnail}
      <span style={{ fontSize: 10, color: textColor, fontWeight: 700, letterSpacing: '0.3px', fontFamily: "'Inter', sans-serif" }}>{label}</span>
    </button>
  );
});

const SatelliteThumbnail = memo(function SatelliteThumbnail() {
  return (
    <div style={{ width: 50, height: 46, borderRadius: 8, overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #8b7355 0%, #6b5842 25%, #4a3d2e 50%, #8b7355 75%, #a69075 100%)' }} />
      <div style={{ position: 'absolute', inset: 0, background: "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.08) 3px,rgba(0,0,0,0.08) 6px),repeating-linear-gradient(90deg,transparent,transparent 3px,rgba(0,0,0,0.08) 3px,rgba(0,0,0,0.08) 6px),radial-gradient(circle at 30% 40%,rgba(100,150,100,0.3) 0%,transparent 45%),radial-gradient(circle at 70% 65%,rgba(80,120,80,0.3) 0%,transparent 40%)" }} />
      <div style={{ position: 'absolute', top: '48%', left: '18%', width: '64%', height: 2, background: '#d4a574', transform: 'rotate(15deg)', opacity: 0.8 }} />
      <div style={{ position: 'absolute', top: '28%', left: '10%', width: '80%', height: 2, background: '#d4a574', transform: 'rotate(-10deg)', opacity: 0.8 }} />
    </div>
  );
});

const TerrainThumbnail = memo(function TerrainThumbnail() {
  return (
    <div style={{ width: 50, height: 46, borderRadius: 8, overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #d4e8d4 0%, #c0d8c0 20%, #8bb08b 40%, #6b8f6b 60%, #4a6f4a 80%, #2a4f2a 100%)' }} />
      <svg width="50" height="46" style={{ position: 'absolute', top: 0, left: 0 }}>
        <path d="M 6 32 Q 16 20, 25 26 T 44 28" stroke="#4a6f4a" strokeWidth="1.2" fill="none" opacity="0.7" />
        <path d="M 4 37 Q 15 28, 24 33 T 42 35" stroke="#4a6f4a" strokeWidth="1.2" fill="none" opacity="0.7" />
        <path d="M 8 42 Q 18 36, 27 39 T 46 42" stroke="#4a6f4a" strokeWidth="1.2" fill="none" opacity="0.5" />
      </svg>
    </div>
  );
});

const TrafficThumbnail = memo(function TrafficThumbnail() {
  return (
    <div style={{ width: 50, height: 46, borderRadius: 8, background: 'rgba(8,15,35,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width="36" height="36" viewBox="0 0 36 36">
        <line x1="18" y1="0" x2="18" y2="36" stroke="#334155" strokeWidth="3" />
        <line x1="0" y1="18" x2="36" y2="18" stroke="#334155" strokeWidth="3" />
        <line x1="18" y1="0" x2="18" y2="14" stroke="#22c55e" strokeWidth="4" strokeLinecap="round" />
        <line x1="18" y1="22" x2="18" y2="36" stroke="#eab308" strokeWidth="4" strokeLinecap="round" />
        <line x1="0" y1="18" x2="14" y2="18" stroke="#dc2626" strokeWidth="4" strokeLinecap="round" />
        <line x1="22" y1="18" x2="36" y2="18" stroke="#22c55e" strokeWidth="4" strokeLinecap="round" />
      </svg>
    </div>
  );
});

const TrafficLegend = memo(function TrafficLegend() {
  return (
    <div
      data-layers-menu
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute', bottom: 'calc(100% + 10px)', left: 0,
        background: 'rgba(8,12,28,0.92)', border: '1px solid rgba(255,255,255,0.1)',
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        padding: '12px 14px', borderRadius: 12,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)', minWidth: 170,
        zIndex: 1000, fontFamily: "'Inter', sans-serif",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10, color: '#f1f5f9', letterSpacing: '-0.2px' }}>Live Traffic</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[
          { color: '#22c55e', label: 'Free-flowing' },
          { color: '#eab308', label: 'Slow' },
          { color: '#dc2626', label: 'Congested' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 28, height: 4, background: color, borderRadius: 2 }} />
            <span style={{ fontSize: 12, color: '#94a3b8' }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
});

const LeftDock = memo(function LeftDock({
  activePanel, appMode, buildMode,
  setActivePanel, setAppMode, setBuildMode,
  mapStyle, setMapStyle,
  layers, setLayers,
  setFacilityCheckOpen, facilityCheckOpen,
}) {
  const featureItems = [
    { id: 'terrain', label: 'Terrain', icon: '🏔️', active: activePanel === 'terrain' || mapStyle === 'terrain' },
    { id: 'traffic', label: 'Traffic', icon: '🚦', active: activePanel === 'traffic' || layers.traffic },
    { id: 'facility', label: 'Facility', icon: '🏥', active: activePanel === 'facility' || facilityCheckOpen },
  ];

  const modeItems = [
    { id: 'explore', label: 'Explore' },
    { id: 'simulation', label: 'Simulation' },
    { id: 'planning', label: 'Planning' },
  ];

  return (
    <div style={{ position: 'fixed', top: 22, left: 22, zIndex: 10005, display: 'flex', flexDirection: 'column', gap: 14, width: 92 }}>
      <div style={{ padding: 14, borderRadius: 18, background: 'rgba(8, 12, 28, 0.92)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(16px)', boxShadow: '0 28px 80px rgba(0,0,0,0.28)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.24em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 12, textAlign: 'center' }}>Features</div>
        <div style={{ display: 'grid', gap: 10 }}>
          {featureItems.map((item) => (
            <motion.button
              key={item.id}
              onClick={() => {
                const isActive = activePanel === item.id;
                if (item.id === 'terrain') {
                  setMapStyle(isActive ? 'default' : 'terrain');
                  setActivePanel(isActive ? null : 'terrain');
                  return;
                }
                if (item.id === 'traffic') {
                  setLayers((prev) => ({ ...prev, traffic: !prev.traffic }));
                  setActivePanel(isActive ? null : 'traffic');
                  return;
                }
                if (item.id === 'facility') {
                  setFacilityCheckOpen(!isActive);
                  setActivePanel(isActive ? null : 'facility');
                  return;
                }
              }}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.98 }}
              style={{
                borderRadius: 16,
                border: item.active ? '1px solid rgba(96,165,250,0.65)' : '1px solid rgba(255,255,255,0.08)',
                background: item.active ? 'rgba(96,165,250,0.16)' : 'rgba(255,255,255,0.05)',
                color: item.active ? '#e0f2fe' : '#cbd5e1',
                height: 72,
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer',
                transition: 'all 170ms ease',
                willChange: 'transform, box-shadow',
              }}
            >
              <span style={{ fontSize: 24 }}>{item.icon}</span>
              <span style={{ fontSize: 10, marginTop: 4, fontWeight: 700 }}>{item.label}</span>
            </motion.button>
          ))}
        </div>
      </div>

      <div style={{ padding: 14, borderRadius: 18, background: 'rgba(8, 12, 28, 0.92)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(16px)', boxShadow: '0 18px 50px rgba(0,0,0,0.22)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.24em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 12, textAlign: 'center' }}>Mode</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {modeItems.map((mode) => (
            <button
              key={mode.id}
              onClick={() => setAppMode(mode.id)}
              style={{
                width: '100%', padding: '10px 0', borderRadius: 14,
                border: appMode === mode.id ? '1px solid #60a5fa' : '1px solid rgba(255,255,255,0.08)',
                background: appMode === mode.id ? 'rgba(96,165,250,0.18)' : 'rgba(255,255,255,0.05)',
                color: appMode === mode.id ? '#f8fbff' : '#cbd5e1',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 180ms ease',
              }}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={() => setBuildMode((active) => !active)}
        style={{
          padding: '12px 0', borderRadius: 16,
          border: '1px solid rgba(255,255,255,0.1)',
          background: buildMode ? 'linear-gradient(135deg, #34d399, #22c55e)' : 'rgba(255,255,255,0.05)',
          color: buildMode ? '#081f0c' : '#e2e8f0',
          fontSize: 11,
          fontWeight: 700,
          cursor: 'pointer',
          boxShadow: buildMode ? '0 12px 32px rgba(34,197,94,0.22)' : 'none',
          transition: 'all 180ms ease',
        }}
      >
        {buildMode ? 'Build Mode Active' : 'Enter Build Mode'}
      </button>
    </div>
  );
});

const TrafficPanel = memo(function TrafficPanel({ layers }) {
  return (
    <div style={{ position: 'fixed', top: 120, left: 132, zIndex: 10003, width: 320, borderRadius: 24, padding: 18, background: 'rgba(5, 10, 22, 0.9)', border: '1px solid rgba(96,165,250,0.16)', backdropFilter: 'blur(22px)', boxShadow: '0 26px 80px rgba(0,0,0,0.35)', color: '#e2e8f0' }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span>🚦</span>
        <span>Traffic Operations</span>
      </div>
      <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 18 }}>Live flow analysis and congestion alerts for the current city view.</div>
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8' }}>
            <span>Layer status</span><strong style={{ color: layers.traffic ? '#60a5fa' : '#94a3b8' }}>{layers.traffic ? 'Enabled' : 'Disabled'}</strong>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <div style={{ width: layers.traffic ? '96%' : '8%', height: '100%', background: layers.traffic ? '#60a5fa' : '#475569', transition: 'width 320ms ease' }} />
          </div>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>Risk alert</div>
          <div style={{ padding: '12px 14px', borderRadius: 16, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(96,165,250,0.14)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fbbf24' }}>Moderate congestion</div>
            <div style={{ fontSize: 11, marginTop: 4, color: '#cbd5e1' }}>Traffic slowdowns are concentrated around arterial roads and bridge crossings.</div>
          </div>
        </div>
      </div>
    </div>
  );
});

const FacilityPanel = memo(function FacilityPanel({ layers, setLayers, facilityData, facilityViewMode, setFacilityViewMode }) {
  const counts = {
    hospitals: facilityData?.hospitals?.length || 0,
    policeStations: facilityData?.policeStations?.length || 0,
    fireStations: facilityData?.fireStations?.length || 0,
  };

  return (
    <div style={{ position: 'fixed', top: 120, left: 132, zIndex: 10003, width: 320, borderRadius: 24, padding: 18, background: 'rgba(5, 10, 22, 0.9)', border: '1px solid rgba(16,185,129,0.16)', backdropFilter: 'blur(22px)', boxShadow: '0 26px 80px rgba(0,0,0,0.35)', color: '#e2e8f0' }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span>🏥</span>
        <span>Facility Intelligence</span>
      </div>
      <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16 }}>Facility coverage, response readiness, and critical gap detection.</div>
      {['hospitals', 'policeStations', 'fireStations'].map((key) => (
        <button
          key={key}
          onClick={() => setLayers((prev) => ({ ...prev, [key]: !prev[key] }))}
          style={{
            width: '100%', padding: '12px 14px', borderRadius: 16,
            border: `1px solid ${layers[key] ? '#34d399' : 'rgba(255,255,255,0.08)'}`,
            background: layers[key] ? 'rgba(34,211,153,0.12)' : 'rgba(255,255,255,0.04)',
            color: layers[key] ? '#d1fae5' : '#cbd5e1',
            textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            transition: 'all 180ms ease',
          }}
        >
          <span style={{ textTransform: 'capitalize', fontSize: 13, fontWeight: 700 }}>{key.replace(/([A-Z])/g, ' $1')}</span>
          <span style={{ fontSize: 12, opacity: 0.9 }}>{counts[key]} active</span>
        </button>
      ))}
      <div style={{ marginTop: 16, padding: '14px 16px', borderRadius: 18, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 10 }}>View Mode</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {['coverage', 'gap', 'heatmap'].map((mode) => (
            <button
              key={mode}
              onClick={() => setFacilityViewMode(mode)}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 14,
                border: facilityViewMode === mode ? '1px solid #60a5fa' : '1px solid rgba(255,255,255,0.08)',
                background: facilityViewMode === mode ? 'rgba(96,165,250,0.16)' : 'transparent',
                color: facilityViewMode === mode ? '#f8fbff' : '#cbd5e1',
                textTransform: 'capitalize', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                transition: 'all 180ms ease',
              }}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
});
