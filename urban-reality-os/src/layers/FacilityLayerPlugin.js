// ================================================
// Facility Layer Plugin — Hospital, Police, Fire point layers
// (Coverage canvas handled by FacilityEngine)
// ================================================
import BaseLayerPlugin from './BaseLayerPlugin';

const FACILITY_CONFIGS = {
  hospitals: {
    sourceId: 'hospitals',
    layerId: 'hospitals-layer',
    color: '#06b6d4',
  },
  policeStations: {
    sourceId: 'policeStations',
    layerId: 'police-layer',
    color: '#8b5cf6',
  },
  fireStations: {
    sourceId: 'fireStations',
    layerId: 'fire-layer',
    color: '#f97316',
  },
  schools: {
    sourceId: 'schools',
    layerId: 'schools-layer',
    color: '#22c55e',
  },
};

export default class FacilityLayerPlugin extends BaseLayerPlugin {
  constructor() {
    super('facility');
  }

  /**
   * @param {maplibregl.Map} map
   * @param {{ facilityData: object, layers: object }} data
   */
  init(map, data) {
    if (!map || !data?.facilityData) return;

    try {
      for (const [key, config] of Object.entries(FACILITY_CONFIGS)) {
        const items = data.facilityData[key];
        if (!items || !items.length) continue;

        const geojson = {
          type: 'FeatureCollection',
          features: items.map((item) => ({
            type: 'Feature',
            properties: item,
            geometry: { type: 'Point', coordinates: [item.lng, item.lat] },
          })),
        };

        this._addSource(map, config.sourceId, { type: 'geojson', data: geojson });
        this._addLayer(map, {
          id: config.layerId,
          type: 'circle',
          source: config.sourceId,
          paint: {
            'circle-radius': 8,
            'circle-color': config.color,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': 0.9,
          },
          layout: {
            visibility: data.layers?.[key] ? 'visible' : 'none',
          },
        });
      }

      this.initialized = true;
    } catch (err) {
      console.error('[FacilityLayerPlugin] init error:', err);
    }
  }

  /**
   * Toggle a specific facility sub-layer.
   * @param {maplibregl.Map} map
   * @param {boolean} visible — not used directly; use toggleByType instead
   */
  toggle(map, visible) {
    // no-op — use toggleByType for individual control
  }

  /**
   * Toggle a specific facility type layer.
   * @param {maplibregl.Map} map
   * @param {string} type — 'hospitals' | 'policeStations' | 'fireStations'
   * @param {boolean} visible
   */
  toggleByType(map, type, visible) {
    if (!map) return;
    const config = FACILITY_CONFIGS[type];
    if (!config) return;

    try {
      if (map.getLayer(config.layerId)) {
        map.setLayoutProperty(config.layerId, 'visibility', visible ? 'visible' : 'none');
      }
    } catch (err) {
      console.warn(`[FacilityLayerPlugin] toggleByType(${type}) error:`, err);
    }
  }

  update(map, facilityData = {}, layers = {}) {
    if (!map) return;
    for (const [key, config] of Object.entries(FACILITY_CONFIGS)) {
      const items = facilityData[key] || [];
      const source = map.getSource(config.sourceId);
      const geojson = {
        type: 'FeatureCollection',
        features: items.map((item) => ({
          type: 'Feature',
          properties: item,
          geometry: { type: 'Point', coordinates: [item.lng, item.lat] },
        })),
      };
      try {
        if (source?.setData) {
          source.setData(geojson);
        } else if (items.length) {
          this._addSource(map, config.sourceId, { type: 'geojson', data: geojson });
          this._addLayer(map, {
            id: config.layerId,
            type: 'circle',
            source: config.sourceId,
            paint: {
              'circle-radius': 8,
              'circle-color': config.color,
              'circle-stroke-width': 2,
              'circle-stroke-color': '#ffffff',
              'circle-opacity': 0.9,
            },
            layout: {
              visibility: layers[key] ? 'visible' : 'none',
            },
          });
        }
      } catch (err) {
        console.warn(`[FacilityLayerPlugin] update(${key}) error:`, err);
      }
    }
  }

  /**
   * Get the list of all facility layer IDs for event binding.
   */
  getLayerIds() {
    return Object.values(FACILITY_CONFIGS).map((c) => c.layerId);
  }
}
