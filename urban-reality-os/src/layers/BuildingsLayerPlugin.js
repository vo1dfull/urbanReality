// ================================================
// Buildings Layer Plugin — 3D extruded buildings
// 🔥 PERF: FrameController pulse (was setInterval 120ms)
// 🔥 PERF: Zero-allocation BBox/centroid (no temp arrays)
// 🔥 PERF: 500ms throttle gate on updateSubmersionState
// 🔥 PERF: 200-building cap per worker update
// 🔥 PERF: Pre-allocated buildings array (no GC per frame)
// 🔥 PERF: Zoom guard — skip when buildings not visible
// ================================================
import BaseLayerPlugin from './BaseLayerPlugin';
import { simulationEngine } from '../engines/SimulationEngine';
import DataEngine from '../engines/DataEngine';
import eventBus from '../core/EventBus';
import FrameController from '../core/FrameController';
import { createLogger } from '../core/Logger';
import useMapStore from '../store/useMapStore';

const log = createLogger('BuildingsLayerPlugin');
const TERRAIN_EXAGGERATION = 1.4;

/** @type {number} Minimum ms between submersion updates */
const UPDATE_THROTTLE_MS = 500;

/** @type {number} Maximum buildings per worker update (baseline) */
const MAX_BUILDINGS_PER_UPDATE = 200;

/** @type {number} Adaptive caps based on quality/FPS */
const MAX_BUILDINGS_LOW = 80;
const MAX_BUILDINGS_MEDIUM = 140;

/** @type {number} Minimum zoom to process buildings */
const MIN_ZOOM = 14;
const HIGH_DETAIL_ZOOM = 16;
const LOD_SYNC_MS = 250;

export default class BuildingsLayerPlugin extends BaseLayerPlugin {
  constructor() {
    super('buildings');
    this._worker = null;
    this._simulationUnsub = null;
    this._pulseTaskId = null;
    this._pulsePhase = 0;
    this._criticalFeatureIds = new Set();
    this._pendingUpdate = false;
    this._requestId = 0;
    this._lastHandledRequestId = 0;
    this._lastUpdateTime = 0;
    this._map = null;
    this._boundMoveEnd = null;
    this._facilityData = null;
    this._lodTimer = null;
    this._boundLodSync = null;

    // Pre-allocated reusable array — avoids GC per update
    this._buildingsBuffer = [];
  }

  init(map) {
    if (!map || this.initialized) return;
    if (!map.getSource('openmaptiles')) {
      log.warn('openmaptiles source not available, buildings layer will not initialize');
      return;
    }

    this._map = map;
    this._addLayer(map, {
      id: '3d-buildings',
      source: 'openmaptiles',
      'source-layer': 'building',
      type: 'fill-extrusion',
      minzoom: MIN_ZOOM,
      paint: {
        // Hyper-realistic facade colors: material-aware palette keyed off
        // building type → concrete/glass/brick tones, height-stratified.
        'fill-extrusion-color': [
          'case',
          // ── Simulation overrides (flood/critical) ─────────────────────────
          ['boolean', ['feature-state', 'isCritical'], false],
          ['interpolate', ['linear'], ['feature-state', 'pulsePhase'],
            0, '#fecaca', 0.5, '#dc2626', 1, '#fecaca'],
          ['boolean', ['feature-state', 'isSubmerged'], false],
          ['interpolate', ['linear'], ['feature-state', 'submersionRatio'],
            0, '#475569', 1, '#f97316'],
          // ── Material-aware day palette ─────────────────────────────────────
          // Low-rise (< 15 m): warm concrete/brick — #c2b280 → #b5a27a
          // Mid-rise (15–60 m): off-white/light concrete — #d6d0c4 → #bfbab0
          // High-rise (60–120 m): glass/steel curtain wall — #8fb4d0 → #a8cce0
          // Tower (> 120 m): reflective glass — #cce4f4 → #e8f4fc
          ['interpolate', ['linear'],
            ['coalesce',
              ['to-number', ['feature-state', 'adjustedHeight']],
              ['to-number', ['get', 'render_height']],
              ['to-number', ['get', 'height']],
              0,
            ],
            0,   '#b8a98a',   // ground storey — warm sandstone
            8,   '#c2b48e',   // low residential — brick/render
            15,  '#cec8bc',   // low-mid — light concrete
            30,  '#d4cec6',   // mid-rise — off-white panels
            50,  '#bfd0dd',   // upper mid — light curtain wall
            80,  '#a8c4d8',   // high-rise — steel/glass blue
            120, '#c0ddf0',   // tower base — reflective glass
            200, '#daeeff',   // supertall — bright specular sky reflection
          ],
        ],
        'fill-extrusion-height': [
          'coalesce',
          ['to-number', ['feature-state', 'adjustedHeight']],
          ['to-number', ['get', 'render_height']],
          ['to-number', ['get', 'height']],
          0,
        ],
        'fill-extrusion-base': [
          'coalesce',
          ['to-number', ['feature-state', 'adjustedBase']],
          ['to-number', ['get', 'render_min_height']],
          ['to-number', ['get', 'min_height']],
          0,
        ],
        // Smooth fade-in with near-full opacity at high zoom for realism
        'fill-extrusion-opacity': [
          'interpolate', ['linear'], ['zoom'],
          13.8, 0,
          14.2, 0.82,
          15.5, 0.92,
          17,   0.97,
        ],
        // Vertical gradient = roof lighter than facade (diffuse sky lighting)
        'fill-extrusion-vertical-gradient': true,
        // Deep contact shadow for grounding + soft edge AO
        'fill-extrusion-ambient-occlusion-intensity': 0.92,
        'fill-extrusion-ambient-occlusion-ground-radius': 20,
        // Floor-to-floor detail at high zoom
        'fill-extrusion-flood-light-intensity': 0.0,
      },
      layout: { visibility: 'none' },
    });

    this.initialized = true;
    this._ensureWorker();
    this._startSimulationSubscription(map);
  }

  onAdd(map, data) {
    if (data?.facilityData) this._facilityData = data.facilityData;
    this.init(map);
  }

  onRemove(map) {
    this.destroy(map);
  }

  update(map, data) {
    if (!map) return;
    if (data?.facilityData) {
      this._facilityData = data.facilityData;
    }
  }

  updateSubmersionState(map, simulationState) {
    if (!map || !this._worker || !simulationState) return;

    // 🔥 Zoom guard — skip when buildings aren't visible
    const currentZoom = map.getZoom();
    const effectiveMinZoom = FrameController.isLowFPS() ? MIN_ZOOM + 1 : MIN_ZOOM;
    if (currentZoom < effectiveMinZoom) return;

    // 🔥 Throttle gate — max one update per UPDATE_THROTTLE_MS
    const now = performance.now();
    if (now - this._lastUpdateTime < UPDATE_THROTTLE_MS) return;
    this._lastUpdateTime = now;

    const sourceLayer = 'building';
    // Query only currently visible/viewport buildings for bounded cost.
    let features = map.queryRenderedFeatures({ layers: ['3d-buildings'] });

    if (!features || features.length === 0) {
      const layer = map.getLayer('3d-buildings');
      const layerVisibility = layer ? map.getLayoutProperty('3d-buildings', 'visibility') : 'none';
      if (layerVisibility === 'none') return;
      features = map.querySourceFeatures('openmaptiles', { sourceLayer });
    }

    if (!features || features.length === 0) return;

    // 🔥 Cap features adaptively based on quality/FPS
    const adaptiveCap = this._getAdaptiveBuildingCap(map.getZoom());
    const featureCount = Math.min(features.length, adaptiveCap);

    // 🔥 Reuse pre-allocated array
    const buildings = this._buildingsBuffer;
    buildings.length = 0;

    for (let i = 0; i < featureCount; i++) {
      const feature = features[i];
      if (!feature || !feature.properties) continue;

      const id = this._getFeatureId(feature, sourceLayer, i);
      if (id == null) continue;

      const props = feature.properties;
      const height = this._getNumeric(props.render_height ?? props.height ?? props['height:float'] ?? 0);
      const base = this._getNumeric(props.render_min_height ?? props.min_height ?? 0);
      const geometry = feature.geometry;

      // 🔥 Zero-allocation BBox — inline without temp array
      const bbox = this._geometryBBoxInline(geometry);
      if (!bbox) continue;

      // 🔥 Zero-allocation centroid — inline without temp array
      const centroid = this._geometryCentroidInline(geometry, bbox);
      const capacity = this._computeCapacity(props, height, bbox);
      const footprintArea = this._estimateFootprintArea(bbox);

      buildings.push({
        id,
        baseHeight: base,
        height,
        capacity,
        centroid,
        bbox,
        footprintArea,
        properties: props,
      });
    }

    if (buildings.length === 0) return;

    const facilities = this._extractCriticalFacilities(this._facilityData ?? DataEngine.getFacilityData());
    const requestId = ++this._requestId;
    this._worker.postMessage({
      requestId,
      buildings,
      waterLevel: simulationState.waterLevel,
      facilities,
      exaggeration: TERRAIN_EXAGGERATION,
    });
  }

  _ensureWorker() {
    if (this._worker || typeof Worker === 'undefined') return;
    try {
      this._worker = new Worker(new URL('../workers/buildingSubmersionWorker.js', import.meta.url), { type: 'module' });
      this._worker.onmessage = ({ data }) => this._handleWorkerResponse(data);
      this._worker.onerror = (err) => log.warn('buildingSubmersionWorker error:', err);
    } catch (err) {
      log.warn('Could not initialize building submersion worker:', err);
      this._worker = null;
    }
  }

  _handleWorkerResponse(data) {
    if (!data || data.requestId == null || data.requestId < this._lastHandledRequestId) return;
    this._lastHandledRequestId = data.requestId;
    const map = this._map;
    if (!map || !Array.isArray(data.updates)) return;

    const criticalFeatureIds = new Set();
    const updates = data.updates;
    for (let i = 0; i < updates.length; i++) {
      const update = updates[i];
      const state = {
        isSubmerged: update.isSubmerged,
        submersionRatio: update.submersionRatio,
        isCritical: update.isCritical,
        criticalType: update.criticalType || null,
        impactSeverity: update.impactSeverity || 0,
        impactPersons: update.impactPersons || 0,
        adjustedHeight: update.adjustedHeight,
        adjustedBase: update.adjustedBase,
        pulsePhase: this._pulsePhase,
      };
      try {
        map.setFeatureState({ source: 'openmaptiles', sourceLayer: 'building', id: update.id }, state);
      } catch (err) {
        // ignore missing feature IDs
      }
      if (update.isCritical) {
        criticalFeatureIds.add(update.id);
      }
    }

    this._criticalFeatureIds = criticalFeatureIds;
    if (criticalFeatureIds.size > 0) {
      this._startPulseAnimation();
    } else {
      this._stopPulseAnimation();
    }

    eventBus.emitDeferred('buildings:impact-updated', {
      personsAffected: data.personsAffected,
      impactedBuildings: data.impactedCount,
      criticalBuildings: data.criticalCount,
      totalAreaAffected: data.totalAreaAffected,
    });
  }

  _startSimulationSubscription(map) {
    if (this._simulationUnsub) return;
    this._simulationUnsub = simulationEngine.subscribe((state) => {
      this._scheduleUpdate(map, state);
    });

    this._boundMoveEnd = () => {
      if (!this._map) return;
      this._scheduleUpdate(this._map, { ...simulationEngine.state });
    };
    map.on('moveend', this._boundMoveEnd);

    this._boundLodSync = () => {
      if (this._lodTimer !== null) return;
      this._lodTimer = setTimeout(() => {
        this._lodTimer = null;
        if (this._map) this._syncLODState(this._map);
      }, LOD_SYNC_MS);
    };
    map.on('zoom', this._boundLodSync);
    map.on('pitch', this._boundLodSync);
    this._syncLODState(map);
  }

  _syncLODState(map) {
    if (!map || !map.getLayer('3d-buildings')) return;
    const zoom = map.getZoom();
    const pitch = map.getPitch();
    // Show buildings at slightly lower pitch threshold so they appear
    // as soon as the camera tilts — matches Google Earth behaviour.
    // However, at zoom >= 16, hide the fill-extrusion to let RealisticBuildingRenderer take over.
    const shouldShowFillExtrusion = zoom >= MIN_ZOOM && pitch >= 20 && zoom < 16;
    try {
      map.setLayoutProperty('3d-buildings', 'visibility', shouldShowFillExtrusion ? 'visible' : 'none');

      // ── Hyper-realism LOD: scale AO radius + intensity with zoom ──────────
      let aoRadius, aoIntensity;
      if (zoom >= 17) {
        // Street-level: deep contact shadows, wide soft penumbra
        aoRadius = 24;
        aoIntensity = 0.95;
      } else if (zoom >= HIGH_DETAIL_ZOOM) {
        aoRadius = 18;
        aoIntensity = 0.90;
      } else {
        aoRadius = 12;
        aoIntensity = 0.80;
      }

      map.setPaintProperty('3d-buildings', 'fill-extrusion-vertical-gradient', true);
      map.setPaintProperty('3d-buildings', 'fill-extrusion-ambient-occlusion-ground-radius', aoRadius);
      map.setPaintProperty('3d-buildings', 'fill-extrusion-ambient-occlusion-intensity', aoIntensity);
    } catch (_) {
      // Style may be reloading; skip safely.
    }
  }

  _scheduleUpdate(map, state) {
    if (this._pendingUpdate) return;
    this._pendingUpdate = true;
    requestAnimationFrame(() => {
      this._pendingUpdate = false;
      this.updateSubmersionState(map, state);
    });
  }

  // 🔥 PERF: FrameController idle task at ~4fps (250ms) instead of setInterval(120ms)
  // Auto-throttled by FrameController when FPS is low
  _startPulseAnimation() {
    if (this._pulseTaskId !== null) return;
    this._pulseTaskId = FrameController.add(() => {
      this._pulsePhase = (this._pulsePhase + 0.08) % 1;
      if (!this._map || this._criticalFeatureIds.size === 0) return;

      // 🔥 Batch: single pulsePhase for all critical buildings
      const target = { source: 'openmaptiles', sourceLayer: 'building', id: null };
      const value = { pulsePhase: this._pulsePhase };
      for (const id of this._criticalFeatureIds) {
        target.id = id;
        try {
          this._map.setFeatureState(target, value);
        } catch (err) {
          // ignore missing IDs
        }
      }
    }, 250, 'building-pulse', 'idle');
  }

  _stopPulseAnimation() {
    if (this._pulseTaskId !== null) {
      FrameController.remove(this._pulseTaskId);
      this._pulseTaskId = null;
    }
  }

  /**
   * Switch building colors between day (height-based blue gradient) and
   * night (dark base + lit-window glow by height) modes.
   * Flood simulation overrides (isCritical, isSubmerged) are always preserved.
   * @param {boolean} isNight
   */
  setNightMode(isNight) {
    if (!this._map || !this._map.getLayer('3d-buildings')) return;
    try {
      const defaultColor = isNight
        ? // ── Night: dark concrete facades, amber/warm window glow scales with height ──
          ['interpolate', ['linear'],
            ['coalesce',
              ['to-number', ['feature-state', 'adjustedHeight']],
              ['to-number', ['get', 'render_height']],
              ['to-number', ['get', 'height']],
              0,
            ],
            0,   '#080c14',   // ground — near-black tarmac/base
            8,   '#0d1320',   // low storey — very dark concrete
            15,  '#111b2e',   // low-rise — dark navy, few windows
            30,  '#162038',   // mid-rise — faint lit-floor glow
            50,  '#1e2d4a',   // upper mid — office windows begin
            80,  '#233660',   // high-rise — warm amber office glow
            120, '#2a4278',   // tower — bright lit curtain wall
            200, '#344f90',   // supertall — brilliant blue-white crown
          ]
        : // ── Day: hyper-realistic material palette (warm concrete → glass/steel) ──
          ['interpolate', ['linear'],
            ['coalesce',
              ['to-number', ['feature-state', 'adjustedHeight']],
              ['to-number', ['get', 'render_height']],
              ['to-number', ['get', 'height']],
              0,
            ],
            0,   '#b8a98a',
            8,   '#c2b48e',
            15,  '#cec8bc',
            30,  '#d4cec6',
            50,  '#bfd0dd',
            80,  '#a8c4d8',
            120, '#c0ddf0',
            200, '#daeeff',
          ];

      // Preserve flood-simulation overrides
      const colorExpr = [
        'case',
        ['boolean', ['feature-state', 'isCritical'], false],
        ['interpolate', ['linear'], ['feature-state', 'pulsePhase'],
          0, '#fecaca', 0.5, '#dc2626', 1, '#fecaca'],
        ['boolean', ['feature-state', 'isSubmerged'], false],
        ['interpolate', ['linear'], ['feature-state', 'submersionRatio'],
          0, '#475569', 1, '#f97316'],
        defaultColor,
      ];

      this._map.setPaintProperty('3d-buildings', 'fill-extrusion-color', colorExpr);

      // Night: slightly higher opacity + deeper AO so dark buildings read crisply
      this._map.setPaintProperty('3d-buildings', 'fill-extrusion-opacity', [
        'interpolate', ['linear'], ['zoom'],
        13.8, 0,
        14.2, isNight ? 0.90 : 0.82,
        15.5, isNight ? 0.97 : 0.92,
        17,   isNight ? 1.00 : 0.97,
      ]);

      // Night AO: deeper shadow intensity for dramatic realism
      this._map.setPaintProperty(
        '3d-buildings',
        'fill-extrusion-ambient-occlusion-intensity',
        isNight ? 0.98 : 0.92,
      );
    } catch (_) {
      // Layer may not exist yet during style reload — safe to ignore
    }
  }

  destroy(map) {
    if (this._simulationUnsub) {
      this._simulationUnsub();
      this._simulationUnsub = null;
    }

    if (map && this._boundMoveEnd) {
      map.off('moveend', this._boundMoveEnd);
      this._boundMoveEnd = null;
    }
    if (map && this._boundLodSync) {
      map.off('zoom', this._boundLodSync);
      map.off('pitch', this._boundLodSync);
      this._boundLodSync = null;
    }
    if (this._lodTimer !== null) {
      clearTimeout(this._lodTimer);
      this._lodTimer = null;
    }

    this._stopPulseAnimation();

    if (this._worker) {
      this._worker.terminate();
      this._worker = null;
    }

    this._criticalFeatureIds.clear();
    this._buildingsBuffer.length = 0;
    this._map = null;
    super.destroy(map);
  }

  _getFeatureId(feature, sourceLayer, index) {
    if (feature.id != null) return feature.id;
    const props = feature.properties || {};
    if (props.osm_id != null) return props.osm_id;
    if (props.id != null) return props.id;
    return `${sourceLayer}:${index}`;
  }

  _getNumeric(value, fallback = 0) {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = parseFloat(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    }
    return fallback;
  }

  _estimateFootprintArea(bbox) {
    if (!bbox) return 40;
    const lat = (bbox.minY + bbox.maxY) / 2;
    const latMeters = 111320 * (bbox.maxY - bbox.minY);
    const lngMeters = 111320 * Math.cos((lat * Math.PI) / 180) * (bbox.maxX - bbox.minX);
    return Math.max(20, latMeters * lngMeters);
  }

  /**
   * 🔥 Zero-allocation BBox — iterates coordinates inline without temp arrays.
   * No .push(), no .forEach(), no intermediate arrays.
   */
  _geometryBBoxInline(geometry) {
    if (!geometry || !geometry.coordinates) return null;
    const coords = geometry.coordinates;
    const type = geometry.type;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let hasPoints = false;

    if (type === 'Polygon') {
      for (let r = 0; r < coords.length; r++) {
        const ring = coords[r];
        for (let c = 0; c < ring.length; c++) {
          const lng = ring[c][0], lat = ring[c][1];
          if (lng < minX) minX = lng;
          if (lat < minY) minY = lat;
          if (lng > maxX) maxX = lng;
          if (lat > maxY) maxY = lat;
          hasPoints = true;
        }
      }
    } else if (type === 'MultiPolygon') {
      for (let p = 0; p < coords.length; p++) {
        const polygon = coords[p];
        for (let r = 0; r < polygon.length; r++) {
          const ring = polygon[r];
          for (let c = 0; c < ring.length; c++) {
            const lng = ring[c][0], lat = ring[c][1];
            if (lng < minX) minX = lng;
            if (lat < minY) minY = lat;
            if (lng > maxX) maxX = lng;
            if (lat > maxY) maxY = lat;
            hasPoints = true;
          }
        }
      }
    }

    return hasPoints ? { minX, minY, maxX, maxY } : null;
  }

  /**
   * 🔥 Zero-allocation centroid — computed via running sum, no temp arrays.
   */
  _geometryCentroidInline(geometry, bbox) {
    if (!geometry || !geometry.type || !geometry.coordinates) {
      return bbox ? { lng: (bbox.minX + bbox.maxX) / 2, lat: (bbox.minY + bbox.maxY) / 2 } : { lng: 0, lat: 0 };
    }

    let sumLng = 0, sumLat = 0, count = 0;
    const coords = geometry.coordinates;

    if (geometry.type === 'Polygon' && coords[0]) {
      const ring = coords[0];
      for (let i = 0; i < ring.length; i++) {
        sumLng += ring[i][0];
        sumLat += ring[i][1];
        count++;
      }
    } else if (geometry.type === 'MultiPolygon' && coords[0] && coords[0][0]) {
      const ring = coords[0][0];
      for (let i = 0; i < ring.length; i++) {
        sumLng += ring[i][0];
        sumLat += ring[i][1];
        count++;
      }
    }

    if (count > 0) {
      return { lng: sumLng / count, lat: sumLat / count };
    }
    return bbox ? { lng: (bbox.minX + bbox.maxX) / 2, lat: (bbox.minY + bbox.maxY) / 2 } : { lng: 0, lat: 0 };
  }

  _computeCapacity(props, height, bbox) {
    const explicitCapacity = this._getNumeric(props.capacity ?? props.density ?? 0);
    if (explicitCapacity > 0) return explicitCapacity;
    const area = this._estimateFootprintArea(bbox);
    const floorCount = Math.max(1, Math.round(height / 3));
    return Math.max(10, Math.round(area * 0.12 * Math.max(1, floorCount / 2)));
  }

  _extractCriticalFacilities(facilityData) {
    if (!facilityData || typeof facilityData !== 'object') return [];
    const facilities = [];
    const addFacilities = (items, type) => {
      if (!Array.isArray(items)) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item && typeof item.lat === 'number' && typeof item.lng === 'number') {
          facilities.push({ ...item, type });
        }
      }
    };
    addFacilities(facilityData.hospitals, 'hospital');
    addFacilities(facilityData.schools || facilityData.school, 'school');
    addFacilities(facilityData.policeStations, 'police');
    return facilities;
  }

  /**
   * Adaptive cap for how many buildings we process in a single
   * submersion update, based on the current quality hint from
   * FrameController. This keeps heavy queries bounded on low-end
   * devices and under sustained low FPS.
   */
  _getAdaptiveBuildingCap(zoom = MIN_ZOOM) {
    if (zoom < HIGH_DETAIL_ZOOM) return Math.round(MAX_BUILDINGS_PER_UPDATE * 0.6);
    const perfMode = useMapStore.getState().perfMode;
    if (perfMode === 'low') return MAX_BUILDINGS_LOW;
    if (perfMode === 'high') return MAX_BUILDINGS_PER_UPDATE;

    const quality = FrameController.getQualityHint();
    if (quality === 'low') return MAX_BUILDINGS_LOW;
    if (quality === 'medium') return MAX_BUILDINGS_MEDIUM;
    return MAX_BUILDINGS_PER_UPDATE;
  }
}
