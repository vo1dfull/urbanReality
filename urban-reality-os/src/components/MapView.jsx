// ================================================
// MapView.jsx — Thin Orchestrator
// ✅ Uses grouped selectors (store/selectors.js) → far fewer re-renders
// ✅ UI split: MapCanvas, PanelRoot, OverlayRoot rendered separately
// ================================================
import { useCallback, useRef, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import 'maplibre-gl/dist/maplibre-gl.css';

// Store — grouped selectors
import useMapStore from '../store/useMapStore';
import {
  useMapState,
  useLayers,
  useFloodState,
  useFacilityState,
  useUIToggles,
} from '../store/selectors';

// Hooks
import useMapEngine from '../hooks/useMapEngine';
import useLayerSync from '../hooks/useLayerSync';
import useInteractions from '../hooks/useInteractions';
import useCameraControls from '../hooks/useCameraControls';
import useFloodAnimation from '../hooks/useFloodAnimation';
import useYearProjection from '../hooks/useYearProjection';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';

// Engines
import MapEngine from '../engines/MapEngine';
import InteractionEngine from '../engines/InteractionEngine';

// UI Components
import TerrainController from './terrain/TerrainController';
import CoordinateDisplay from './CoordinateDisplay';
import MapMenu from './MapMenu';
import SearchBar from './SearchBar';
import TimeSlider from './TimeSlider';
import EconomicPanel from './EconomicPanel';
import CitySuggestions from './CitySuggestions';
import FacilityStatsPanel from './FacilityStatsPanel';
import FacilityListPanel from './FacilityListPanel';

import { BASE_YEAR, MAX_YEAR, IMPACT_MODEL } from '../constants/mapConstants';

export default function MapView() {
  // ── Hooks ──
  const { mapContainerRef } = useMapEngine();
  useLayerSync();
  useInteractions();
  const { startCityFlyThrough } = useCameraControls();
  useFloodAnimation();
  useYearProjection();
  useKeyboardShortcuts();

  // ── Grouped selectors (minimal re-renders) ──
  const { loading, error, mapReady, mapStyle } = useMapState();
  const layers = useLayers();
  const { floodMode } = useFloodState();
  const { facilityData, facilityCheckOpen, facilityViewMode, hoveredFacility } = useFacilityState();
  const { showLayersMenu, showSuggestions } = useUIToggles();

  // ── Individual setters (stable refs — won't cause re-renders) ──
  const setError = useMapStore((s) => s.setError);
  const setMapStyle = useMapStore((s) => s.setMapStyle);
  const setLayers = useMapStore((s) => s.setLayers);
  const year = useMapStore((s) => s.year);
  const setYear = useMapStore((s) => s.setYear);
  const impactData = useMapStore((s) => s.impactData);
  const demographics = useMapStore((s) => s.demographics);
  const urbanAnalysis = useMapStore((s) => s.urbanAnalysis);
  const analysisLoading = useMapStore((s) => s.analysisLoading);
  const setFacilityCheckOpen = useMapStore((s) => s.setFacilityCheckOpen);
  const setShowLayersMenu = useMapStore((s) => s.setShowLayersMenu);
  const setFacilityViewMode = useMapStore((s) => s.setFacilityViewMode);
  const setFloodMode = useMapStore((s) => s.setFloodMode);

  // ── Stable mapRef (set once on mount) ──
  const mapRef = useRef(null);
  useEffect(() => {
    mapRef.current = MapEngine.getMap();
  }, []);

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
      {/* ── MAP CANVAS (bottom layer) ── */}
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%', position: 'fixed', top: 0, left: 0, background: '#020617' }} />

      {/* ── PANEL ROOT (mid layer — isolated from map re-renders) ── */}
      <PanelRoot
        loading={loading}
        error={error}
        setError={setError}
        mapStyle={mapStyle}
        setMapStyle={setMapStyle}
        layers={layers}
        setLayers={setLayers}
        year={year}
        setYear={setYear}
        mapRef={mapRef}
        facilityCheckOpen={facilityCheckOpen}
        setFacilityCheckOpen={setFacilityCheckOpen}
        showLayersMenu={showLayersMenu}
        setShowLayersMenu={setShowLayersMenu}
        showSuggestions={showSuggestions}
        facilityViewMode={facilityViewMode}
        setFacilityViewMode={setFacilityViewMode}
        floodMode={floodMode}
        facilityData={facilityData}
        impactData={impactData}
        demographics={demographics}
        urbanAnalysis={urbanAnalysis}
        analysisLoading={analysisLoading}
        mapReady={mapReady}
        onLocationSelect={handleLocationSelect}
        onToggleFlood={toggleFloodMode}
        startCityFlyThrough={startCityFlyThrough}
      />

      {/* ── OVERLAY ROOT (top layer — tooltips, popups) ── */}
      <OverlayRoot hoveredFacility={hoveredFacility} mapStyle={mapStyle} year={year} mapRef={mapRef} />
    </>
  );
}

// ══════════════════════════════════════════════════
// PanelRoot — All UI panels in one isolated subtree
// Re-renders independently from the map canvas
// ══════════════════════════════════════════════════
function PanelRoot({
  loading, error, setError,
  mapStyle, setMapStyle,
  layers, setLayers,
  year, setYear,
  mapRef,
  facilityCheckOpen, setFacilityCheckOpen,
  showLayersMenu, setShowLayersMenu,
  showSuggestions,
  facilityViewMode, setFacilityViewMode,
  floodMode, facilityData,
  impactData, demographics, urbanAnalysis, analysisLoading,
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

      <MapMenu layers={layers} setLayers={setLayers} mapStyle={mapStyle} setMapStyle={setMapStyle} mapRef={mapRef} />
      <TerrainController map={mapRef.current} isActive={mapStyle === 'terrain'} year={year} />
      <SearchBar mapRef={mapRef} onLocationSelect={onLocationSelect} />
      <TimeSlider year={year} setYear={setYear} baseYear={BASE_YEAR} minYear={BASE_YEAR} maxYear={MAX_YEAR} />

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
}

// ══════════════════════════════════════════════════
// OverlayRoot — Top-layer tooltips and popups
// Re-renders only when hover/popup state changes
// ══════════════════════════════════════════════════
function OverlayRoot({ hoveredFacility, mapStyle, year, mapRef }) {
  return (
    <>
      {hoveredFacility && (
        <div style={{
          position: 'fixed', left: hoveredFacility.x + 15, top: hoveredFacility.y + 15,
          background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
          padding: '12px 16px', color: '#f8fafc', zIndex: 1000,
          pointerEvents: 'none', minWidth: 180, boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          willChange: 'transform',
          transform: 'translateZ(0)',
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
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ opacity: 0.8 }}>Available Units:</span>
              <span style={{ color: '#fbbf24', fontWeight: 600 }}>{hoveredFacility.availableUnits || '3'}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ══════════════════════════════════════════════════
// Sub-components (private to MapView)
// ══════════════════════════════════════════════════

function LayerBarButton({ label, active, activeColor = '#3b82f6', onClick, thumbnail, labelColor }) {
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
}

function SatelliteThumbnail() {
  return (
    <div style={{ width: 50, height: 46, borderRadius: 8, overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #8b7355 0%, #6b5842 25%, #4a3d2e 50%, #8b7355 75%, #a69075 100%)' }} />
      <div style={{ position: 'absolute', inset: 0, background: "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.08) 3px,rgba(0,0,0,0.08) 6px),repeating-linear-gradient(90deg,transparent,transparent 3px,rgba(0,0,0,0.08) 3px,rgba(0,0,0,0.08) 6px),radial-gradient(circle at 30% 40%,rgba(100,150,100,0.3) 0%,transparent 45%),radial-gradient(circle at 70% 65%,rgba(80,120,80,0.3) 0%,transparent 40%)" }} />
      <div style={{ position: 'absolute', top: '48%', left: '18%', width: '64%', height: 2, background: '#d4a574', transform: 'rotate(15deg)', opacity: 0.8 }} />
      <div style={{ position: 'absolute', top: '28%', left: '10%', width: '80%', height: 2, background: '#d4a574', transform: 'rotate(-10deg)', opacity: 0.8 }} />
    </div>
  );
}

function TerrainThumbnail() {
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
}

function TrafficThumbnail() {
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
}

function TrafficLegend() {
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
}
