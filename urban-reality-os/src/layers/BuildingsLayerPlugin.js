// ================================================
// Buildings Layer Plugin — 3D extruded buildings
// ================================================
import BaseLayerPlugin from './BaseLayerPlugin';
import { simulationEngine } from '../engines/SimulationEngine';
import DataEngine from '../engines/DataEngine';
import eventBus from '../core/EventBus';
import { createLogger } from '../core/Logger';

const log = createLogger('BuildingsLayerPlugin');
const WINDOW_PULSE_MS = 120;
const TERRAIN_EXAGGERATION = 1.4;
const CRITICAL_TYPES = ['hospital', 'school', 'police'];

export default class BuildingsLayerPlugin extends BaseLayerPlugin {
  constructor() {
    super('buildings');
    this._worker = null;
    this._simulationUnsub = null;
    this._pulseInterval = null;
    this._pulsePhase = 0;
    this._criticalFeatureIds = new Set();
    this._pendingUpdate = false;
    this._requestId = 0;
    this._lastHandledRequestId = 0;
    this._map = null;
    this._boundMoveEnd = null;
    this._facilityData = null;
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
      minzoom: 14,
      paint: {
        'fill-extrusion-color': [
          'case',
          ['boolean', ['feature-state', 'isCritical'], false],
          ['interpolate', ['linear'], ['feature-state', 'pulsePhase'], 0, '#fecaca', 0.5, '#dc2626', 1, '#fecaca'],
          ['interpolate', ['linear'], ['feature-state', 'submersionRatio'], 0, '#475569', 1, '#f97316'],
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
        'fill-extrusion-opacity': [
          'case',
          ['boolean', ['feature-state', 'isCritical'], false],
          0.88,
          ['boolean', ['feature-state', 'isSubmerged'], false],
          0.68,
          0.94,
        ],
        'fill-extrusion-ambient-occlusion-intensity': 0.85,
      },
    });

    this.initialized = true;
    this._ensureWorker();
    this._startSimulationSubscription(map);
    this._startPulseAnimation();
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
    const sourceLayer = 'building';
    let features = map.queryRenderedFeatures({ layers: ['3d-buildings'] });
    const layer = map.getLayer('3d-buildings');
    const currentZoom = map.getZoom();
    const layerVisibility = layer ? map.getLayoutProperty('3d-buildings', 'visibility') : 'none';

    if (!features || features.length === 0) {
      if (currentZoom < 14 || layerVisibility === 'none') {
        return;
      }
      features = map.querySourceFeatures('openmaptiles', { sourceLayer });
    }

    if (!features || features.length === 0) return;

    const buildings = [];
    for (let i = 0; i < features.length; i += 1) {
      const feature = features[i];
      if (!feature || !feature.properties) continue;

      const id = this._getFeatureId(feature, sourceLayer, i);
      if (id == null) continue;

      const props = feature.properties;
      const height = this._getNumeric(props.render_height ?? props.height ?? props['height:float'] ?? 0);
      const base = this._getNumeric(props.render_min_height ?? props.min_height ?? 0);
      const geometry = feature.geometry;
      const bbox = this._geometryBBox(geometry);
      if (!bbox) continue;

      const centroid = this._geometryCentroid(geometry, bbox);
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
    for (const update of data.updates) {
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
  }

  _scheduleUpdate(map, state) {
    if (this._pendingUpdate) return;
    this._pendingUpdate = true;
    requestAnimationFrame(() => {
      this._pendingUpdate = false;
      this.updateSubmersionState(map, state);
    });
  }

  _startPulseAnimation() {
    if (this._pulseInterval) return;
    this._pulseInterval = setInterval(() => {
      this._pulsePhase = (this._pulsePhase + 0.08) % 1;
      if (!this._map || this._criticalFeatureIds.size === 0) return;
      for (const id of this._criticalFeatureIds) {
        try {
          this._map.setFeatureState(
            { source: 'openmaptiles', sourceLayer: 'building', id },
            { pulsePhase: this._pulsePhase }
          );
        } catch (err) {
          // ignore missing IDs
        }
      }
    }, WINDOW_PULSE_MS);
  }

  _stopPulseAnimation() {
    if (this._pulseInterval) {
      clearInterval(this._pulseInterval);
      this._pulseInterval = null;
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

    if (this._pulseInterval) {
      this._stopPulseAnimation();
    }

    if (this._worker) {
      this._worker.terminate();
      this._worker = null;
    }

    this._criticalFeatureIds.clear();
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

  _geometryBBox(geometry) {
    if (!geometry || !geometry.coordinates) return null;
    const points = [];

    if (geometry.type === 'Polygon') {
      geometry.coordinates.forEach((ring) => ring.forEach((coord) => points.push(coord)));
    } else if (geometry.type === 'MultiPolygon') {
      geometry.coordinates.forEach((polygon) => polygon.forEach((ring) => ring.forEach((coord) => points.push(coord))));
    }

    if (points.length === 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const [lng, lat] of points) {
      minX = Math.min(minX, lng);
      minY = Math.min(minY, lat);
      maxX = Math.max(maxX, lng);
      maxY = Math.max(maxY, lat);
    }

    return { minX, minY, maxX, maxY };
  }

  _geometryCentroid(geometry, bbox) {
    if (geometry && geometry.type && geometry.coordinates) {
      const points = [];
      if (geometry.type === 'Polygon') {
        geometry.coordinates[0].forEach((coord) => points.push(coord));
      } else if (geometry.type === 'MultiPolygon') {
        geometry.coordinates[0][0].forEach((coord) => points.push(coord));
      }
      if (points.length > 0) {
        const avg = points.reduce((acc, [lng, lat]) => {
          acc.lng += lng;
          acc.lat += lat;
          return acc;
        }, { lng: 0, lat: 0 });
        return { lng: avg.lng / points.length, lat: avg.lat / points.length };
      }
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
      for (const item of items) {
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
}
