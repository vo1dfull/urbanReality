// ================================================
// NasaEventsLayerPlugin — NASA EONET live disaster intelligence layer
// 🔥 Pulse animation (rAF-based, not setInterval)
// 🔥 Zoom-based radius scaling
// 🔥 Impact zone fill per event
// 🔥 Cinematic click zoom
// 🔥 City impact integration via store
// ================================================
import BaseLayerPlugin from './BaseLayerPlugin';
import NasaEngine, { CATEGORY_COLORS, createImpactCircle } from '../engines/NasaEngine';
import DisasterEngine from '../engines/DisasterEngine';
import PredictionEngine from '../engines/PredictionEngine';
import { createLogger } from '../core/Logger';

const log = createLogger('NasaEventsLayerPlugin');

// ── Source / Layer IDs ─────────────────────────────────────────────────────

export const SOURCE_POINTS            = 'nasa-events-points';
export const SOURCE_POLYGONS          = 'nasa-events-polygons';
export const SOURCE_IMPACT_ZONES      = 'nasa-impact-zones';
export const SOURCE_PREDICTIONS       = 'nasa-predictions-points';
export const SOURCE_PRED_PATHS        = 'nasa-predictions-paths';
export const SOURCE_IMPACT_POPULATION = 'nasa-impact-population';
export const SOURCE_IMPACT_INFRA      = 'nasa-impact-infra';

export const LAYER_CLUSTER_CIRCLE  = 'nasa-cluster-circle';
export const LAYER_CLUSTER_COUNT   = 'nasa-cluster-count';
export const LAYER_UNCLUSTERED     = 'nasa-unclustered-point';
export const LAYER_GLOW            = 'nasa-glow';
export const LAYER_IMPACT_ZONES    = 'nasa-impact-zones-fill';
export const LAYER_POLYGON_FILL    = 'nasa-polygon-fill';
export const LAYER_POLYGON_OUTLINE = 'nasa-polygon-outline';
export const LAYER_PREDICTIONS     = 'nasa-predictions-layer';
export const LAYER_PRED_PATHS      = 'nasa-predictions-paths-layer';
export const LAYER_IMPACT_FILL     = 'nasa-impact-fill';
export const LAYER_IMPACT_INFRA    = 'nasa-impact-infra-circle';

// ── Category color expression ──────────────────────────────────────────────

export const categoryColorExpression = [
  'match', ['get', 'category'],
  'wildfires',    CATEGORY_COLORS.wildfires,
  'floods',       CATEGORY_COLORS.floods,
  'severeStorms', CATEGORY_COLORS.severeStorms,
  'volcanoes',    CATEGORY_COLORS.volcanoes,
  'drought',      CATEGORY_COLORS.drought,
  '#6b7280',
];

// ── Helpers ────────────────────────────────────────────────────────────────

function splitByGeometryType(geojson) {
  const features = geojson?.features ?? [];
  return {
    pointsFC:   { type: 'FeatureCollection', features: features.filter(f => f.geometry?.type === 'Point') },
    polygonsFC: { type: 'FeatureCollection', features: features.filter(f => f.geometry?.type === 'Polygon') },
  };
}

/** Build impact zone FeatureCollection from point features */
function buildImpactZones(pointFeatures) {
  const features = pointFeatures
    .filter(f => f.geometry?.type === 'Point')
    .map(f => {
      const [lng, lat] = f.geometry.coordinates;
      const radius = f.properties.impactRadius ?? 50;
      return {
        type: 'Feature',
        geometry: createImpactCircle(lng, lat, radius),
        properties: { ...f.properties },
      };
    });
  return { type: 'FeatureCollection', features };
}

// ── NasaEventsLayerPlugin ──────────────────────────────────────────────────

class NasaEventsLayerPlugin extends BaseLayerPlugin {
  constructor() {
    super('nasa-events');
    this._autoRefreshId       = null;
    this._updateQueue         = [];
    this._impactOverlayActive = false;
    this._map                 = null;
    this._initPromise         = null;
    this._pulseRafId          = null;
    this._pulseT              = 0;
    this._onUnclusteredEnter  = null;
    this._onUnclusteredLeave  = null;
    this._onUnclusteredClick  = null;
    this._onPolygonClick      = null;
    this._onClusterClick      = null;
    this._onClusterEnter      = null;
    this._onClusterLeave      = null;
  }

  // ── init ──────────────────────────────────────────────────────────────────

  async init(map, data) {
    if (!map) return;
    if (this.initialized) { this.toggle(map, data?.visible !== false); return; }
    if (this._initPromise) {
      try { await this._initPromise; } catch (_) {}
      this.toggle(map, data?.visible !== false);
      return;
    }
    this._initPromise = this._doInit(map, data);
    try {
      await this._initPromise;
    } catch (err) {
      log.error('init failed:', err);
    } finally {
      this._initPromise = null;
    }
  }

  async _doInit(map, data) {
    this._map = map;
    const params = data?.params ?? { status: 'open', limit: 50 };
    const visible = data?.visible !== false;

    let geojson = null;
    try { geojson = await NasaEngine.fetchEvents(params); }
    catch (err) { log.warn('fetchEvents failed during init:', err); }

    if (!map || typeof map.addLayer !== 'function') return;

    const { pointsFC, polygonsFC } = splitByGeometryType(geojson ?? { type: 'FeatureCollection', features: [] });
    const impactZonesFC = buildImpactZones(pointsFC.features);
    const vis = visible ? 'visible' : 'none';

    // ── Sources ──────────────────────────────────────────────────────────
    this._addSource(map, SOURCE_POINTS, {
      type: 'geojson', data: pointsFC,
      cluster: true, clusterRadius: 50, clusterMaxZoom: 10,
    });
    this._addSource(map, SOURCE_POLYGONS, { type: 'geojson', data: polygonsFC });
    this._addSource(map, SOURCE_IMPACT_ZONES, { type: 'geojson', data: impactZonesFC });

    // ── Impact zones (behind everything) ─────────────────────────────────
    this._addLayer(map, {
      id: LAYER_IMPACT_ZONES, type: 'fill',
      source: SOURCE_IMPACT_ZONES,
      layout: { visibility: vis },
      paint: {
        'fill-color': categoryColorExpression,
        'fill-opacity': ['interpolate', ['linear'], ['get', 'severity'], 0, 0.05, 1, 0.18],
      },
    });

    // ── Glow layer (large blurred circle behind marker) ───────────────────
    this._addLayer(map, {
      id: LAYER_GLOW, type: 'circle',
      source: SOURCE_POINTS,
      filter: ['!', ['has', 'point_count']],
      layout: { visibility: vis },
      paint: {
        'circle-color': categoryColorExpression,
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 14, 8, 28, 14, 50],
        'circle-blur': 1.0,
        'circle-opacity': 0.35,
      },
    });

    // ── Cluster circles ───────────────────────────────────────────────────
    this._addLayer(map, {
      id: LAYER_CLUSTER_CIRCLE, type: 'circle',
      source: SOURCE_POINTS,
      filter: ['has', 'point_count'],
      layout: { visibility: vis },
      paint: {
        'circle-color': ['step', ['get', 'point_count'], '#51bbd6', 10, '#f1c40f', 50, '#e74c3c'],
        'circle-radius': ['step', ['get', 'point_count'], 18, 10, 24, 50, 30],
        'circle-opacity': 0.92,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff',
      },
    });

    this._addLayer(map, {
      id: LAYER_CLUSTER_COUNT, type: 'symbol',
      source: SOURCE_POINTS,
      filter: ['has', 'point_count'],
      layout: {
        visibility: vis,
        'text-field': '{point_count_abbreviated}',
        'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
        'text-size': 12,
      },
      paint: { 'text-color': '#fff' },
    });

    // ── Individual event markers ──────────────────────────────────────────
    this._addLayer(map, {
      id: LAYER_UNCLUSTERED, type: 'circle',
      source: SOURCE_POINTS,
      filter: ['!', ['has', 'point_count']],
      layout: { visibility: vis },
      paint: {
        'circle-color': categoryColorExpression,
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 6, 8, 10, 14, 18],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff',
        'circle-opacity': 0.95,
      },
    });

    // ── Polygon events ────────────────────────────────────────────────────
    this._addLayer(map, {
      id: LAYER_POLYGON_FILL, type: 'fill',
      source: SOURCE_POLYGONS,
      layout: { visibility: vis },
      paint: { 'fill-color': categoryColorExpression, 'fill-opacity': 0.4 },
    });
    this._addLayer(map, {
      id: LAYER_POLYGON_OUTLINE, type: 'line',
      source: SOURCE_POLYGONS,
      layout: { visibility: vis },
      paint: { 'line-color': categoryColorExpression, 'line-width': 2 },
    });

    // ── Prediction path lines ─────────────────────────────────────────────
    this._addSource(map, SOURCE_PRED_PATHS, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
    this._addLayer(map, {
      id: LAYER_PRED_PATHS, type: 'line',
      source: SOURCE_PRED_PATHS,
      layout: { visibility: vis },
      paint: {
        'line-color': '#ffffff',
        'line-width': 1.5,
        'line-opacity': 0.35,
        'line-dasharray': [3, 3],
      },
    });

    // ── Prediction point circles ──────────────────────────────────────────
    this._addSource(map, SOURCE_PREDICTIONS, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
    this._addLayer(map, {
      id: LAYER_PREDICTIONS, type: 'circle',
      source: SOURCE_PREDICTIONS,
      layout: { visibility: vis },
      paint: {
        'circle-color': '#ffffff',
        'circle-radius': ['interpolate', ['linear'], ['get', 'stepIndex'], 1, 5, 5, 3],
        'circle-opacity': ['interpolate', ['linear'], ['get', 'stepIndex'], 1, 0.5, 5, 0.15],
        'circle-stroke-width': 1,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-opacity': 0.4,
      },
    });

    // ── Seed DisasterEngine with fetched events ───────────────────────────
    for (const feature of pointsFC.features) {
      DisasterEngine.createDisaster(feature);
    }

    this._attachListeners(map);
    if (visible) this._startPulse(map);

    this._autoRefreshId = NasaEngine.startAutoRefresh(params, (newData) => this.update(map, newData));
    this._setInitialized(true);

    for (const q of this._updateQueue) this.update(map, q);
    this._updateQueue = [];
  }

  // ── Pulse animation (rAF — no setInterval) ────────────────────────────────

  _startPulse(map) {
    if (this._pulseRafId) return;
    const animate = () => {
      this._pulseT += 0.04;
      const base   = 10;
      const radius = base + Math.sin(this._pulseT) * 3;
      try {
        if (map.getLayer(LAYER_UNCLUSTERED)) {
          map.setPaintProperty(LAYER_UNCLUSTERED, 'circle-radius', [
            'interpolate', ['linear'], ['zoom'],
            2, radius * 0.6, 8, radius, 14, radius * 1.8,
          ]);
        }
      } catch (_) {}
      this._pulseRafId = requestAnimationFrame(animate);
    };
    this._pulseRafId = requestAnimationFrame(animate);
  }

  _stopPulse() {
    if (this._pulseRafId) { cancelAnimationFrame(this._pulseRafId); this._pulseRafId = null; }
  }

  // ── toggle override ───────────────────────────────────────────────────────

  toggle(map, visible) {
    if (!map) return;
    const vis = visible ? 'visible' : 'none';
    for (const layerId of this.layerIds) {
      try { if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', vis); }
      catch (_) {}
    }
    if (visible) this._startPulse(map);
    else         this._stopPulse();
  }

  // ── Interactivity ─────────────────────────────────────────────────────────

  _attachListeners(map) {
    this._onUnclusteredEnter = () => { map.getCanvas().style.cursor = 'pointer'; };
    this._onUnclusteredLeave = () => { map.getCanvas().style.cursor = ''; };

    this._onUnclusteredClick = (e) => {
      if (!e.features?.length) return;
      const props = e.features[0].properties;
      const coords = e.features[0].geometry.coordinates;

      // Cinematic zoom to event
      map.flyTo({
        center: coords,
        zoom: Math.max(map.getZoom(), 5),
        pitch: 50,
        bearing: (Math.random() - 0.5) * 60,
        speed: 0.5,
        curve: 1.4,
        essential: true,
      });

      // Fire select event for panel
      map.fire('nasa:event:select', { feature: { ...props, coordinates: coords } });

      // City impact integration
      try {
        const { default: useMapStore } = require('../store/useMapStore');
        const store = useMapStore.getState();
        if (store.setActiveDisaster) {
          store.setActiveDisaster({
            type: props.category,
            severity: props.severity ?? 0.5,
            title: props.title,
            impactRadius: props.impactRadius ?? 50,
            affectedPop: props.affectedPop ?? 0,
            coordinates: coords,
          });
        }
      } catch (_) {}
    };

    this._onPolygonClick = (e) => {
      if (!e.features?.length) return;
      const props  = e.features[0].properties;
      const coords = e.lngLat;
      map.fire('nasa:event:select', { feature: { ...props, coordinates: [coords.lng, coords.lat] } });
    };

    this._onClusterClick = (e) => {
      if (!e.features?.length) return;
      map.easeTo({ center: e.features[0].geometry.coordinates, zoom: map.getZoom() + 3 });
    };

    this._onClusterEnter = () => { map.getCanvas().style.cursor = 'pointer'; };
    this._onClusterLeave = () => { map.getCanvas().style.cursor = ''; };

    map.on('mouseenter', LAYER_UNCLUSTERED,    this._onUnclusteredEnter);
    map.on('mouseleave', LAYER_UNCLUSTERED,    this._onUnclusteredLeave);
    map.on('click',      LAYER_UNCLUSTERED,    this._onUnclusteredClick);
    map.on('click',      LAYER_POLYGON_FILL,   this._onPolygonClick);
    map.on('click',      LAYER_CLUSTER_CIRCLE, this._onClusterClick);
    map.on('mouseenter', LAYER_CLUSTER_CIRCLE, this._onClusterEnter);
    map.on('mouseleave', LAYER_CLUSTER_CIRCLE, this._onClusterLeave);
  }

  _detachListeners(map) {
    if (!map) return;
    if (this._onUnclusteredEnter) map.off('mouseenter', LAYER_UNCLUSTERED,    this._onUnclusteredEnter);
    if (this._onUnclusteredLeave) map.off('mouseleave', LAYER_UNCLUSTERED,    this._onUnclusteredLeave);
    if (this._onUnclusteredClick) map.off('click',      LAYER_UNCLUSTERED,    this._onUnclusteredClick);
    if (this._onPolygonClick)     map.off('click',      LAYER_POLYGON_FILL,   this._onPolygonClick);
    if (this._onClusterClick)     map.off('click',      LAYER_CLUSTER_CIRCLE, this._onClusterClick);
    if (this._onClusterEnter)     map.off('mouseenter', LAYER_CLUSTER_CIRCLE, this._onClusterEnter);
    if (this._onClusterLeave)     map.off('mouseleave', LAYER_CLUSTER_CIRCLE, this._onClusterLeave);
  }

  // ── update ────────────────────────────────────────────────────────────────

  update(map, geojson) {
    if (!this.initialized) { this._updateQueue.push(geojson); return; }
    const { pointsFC, polygonsFC } = splitByGeometryType(geojson ?? { type: 'FeatureCollection', features: [] });
    const impactZonesFC = buildImpactZones(pointsFC.features);
    try { map.getSource(SOURCE_POINTS)?.setData(pointsFC); }       catch (_) {}
    try { map.getSource(SOURCE_POLYGONS)?.setData(polygonsFC); }   catch (_) {}
    try { map.getSource(SOURCE_IMPACT_ZONES)?.setData(impactZonesFC); } catch (_) {}

    // Update prediction layers
    try {
      const disasters = DisasterEngine.getAll();
      const { points, paths } = PredictionEngine.predictAll(disasters);
      map.getSource(SOURCE_PREDICTIONS)?.setData(points);
      map.getSource(SOURCE_PRED_PATHS)?.setData(paths);
    } catch (_) {}
  }

  // ── destroy ───────────────────────────────────────────────────────────────

  destroy(map) {
    this._stopPulse();
    DisasterEngine.stopLoop();
    NasaEngine.stopAutoRefresh(this._autoRefreshId);
    this._autoRefreshId = null;
    this._detachListeners(map);
    super.destroy(map);
    this._updateQueue = [];
  }

  // ── Impact Overlay ────────────────────────────────────────────────────────

  enableImpactOverlay(map, populationData, infrastructureData) {
    if (this._impactOverlayActive) this.disableImpactOverlay(map);
    const activeEvents = NasaEngine.getActiveEvents();
    if (!activeEvents?.features?.length) return;

    const centroids = activeEvents.features.map(f => {
      if (f.geometry.type === 'Point') return { lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] };
      const ring = f.geometry.coordinates[0];
      let sl = 0, sa = 0;
      for (const c of ring) { sl += c[0]; sa += c[1]; }
      return { lng: sl / ring.length, lat: sa / ring.length };
    });

    const hkm = (a, b) => {
      const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
      const h = Math.sin(dLat/2)**2 + Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)**2;
      return 2 * R * Math.asin(Math.sqrt(h));
    };

    const riskCells = (populationData?.features ?? []).filter(cell => {
      const c = cell.geometry?.coordinates;
      if (!c) return false;
      const pt = cell.geometry.type === 'Point' ? { lng: c[0], lat: c[1] } : (() => {
        const ring = c[0]; let sl = 0, sa = 0;
        for (const x of ring) { sl += x[0]; sa += x[1]; }
        return { lng: sl / ring.length, lat: sa / ring.length };
      })();
      return centroids.some(ec => hkm(ec, pt) <= 50);
    });

    const riskInfra = (infrastructureData?.features ?? []).filter(pt => {
      const c = pt.geometry?.coordinates;
      if (!c) return false;
      return centroids.some(ec => hkm(ec, { lng: c[0], lat: c[1] }) <= 50);
    });

    this._addSource(map, SOURCE_IMPACT_POPULATION, { type: 'geojson', data: { type: 'FeatureCollection', features: riskCells } });
    this._addLayer(map, { id: LAYER_IMPACT_FILL, type: 'fill', source: SOURCE_IMPACT_POPULATION,
      paint: { 'fill-color': ['interpolate', ['linear'], ['get', 'density'], 0, '#fef08a', 5000, '#ef4444'], 'fill-opacity': 0.45 } });

    this._addSource(map, SOURCE_IMPACT_INFRA, { type: 'geojson', data: { type: 'FeatureCollection', features: riskInfra } });
    this._addLayer(map, { id: LAYER_IMPACT_INFRA, type: 'circle', source: SOURCE_IMPACT_INFRA,
      paint: { 'circle-radius': 8, 'circle-color': 'transparent', 'circle-stroke-width': 2, 'circle-stroke-color': '#f97316' } });

    this._impactOverlayActive = true;
  }

  disableImpactOverlay(map) {
    if (!map) return;
    for (const id of [LAYER_IMPACT_FILL, LAYER_IMPACT_INFRA]) {
      try { if (map.getLayer(id)) map.removeLayer(id); } catch (_) {}
      const i = this.layerIds.indexOf(id); if (i !== -1) this.layerIds.splice(i, 1);
    }
    for (const id of [SOURCE_IMPACT_POPULATION, SOURCE_IMPACT_INFRA]) {
      try { if (map.getSource(id)) map.removeSource(id); } catch (_) {}
      const i = this.sourceIds.indexOf(id); if (i !== -1) this.sourceIds.splice(i, 1);
    }
    this._impactOverlayActive = false;
  }
}

export { NasaEventsLayerPlugin };
export default NasaEventsLayerPlugin;
