// ================================================
// Suitability Layer Plugin
// Handles AI land suitability heatmap rendering
// ================================================
import BaseLayerPlugin from '../BaseLayerPlugin';
import { terrainEngine } from '../../engines/TerrainEngine';

const SUITABILITY_TYPES = {
  housing: { weights: { slope: 0.3, roads: 0.4, water: 0.2, infrastructure: 0.1 } },
  commercial: { weights: { slope: 0.2, roads: 0.5, water: 0.1, infrastructure: 0.2 } },
  industrial: { weights: { slope: 0.4, roads: 0.3, water: 0.2, infrastructure: 0.1 } }
};

const SUITABILITY_COLORS = [
  [0, '#d32f2f'],     // Red (unsuitable)
  [0.25, '#f57c00'],  // Orange
  [0.5, '#fbc02d'],   // Yellow
  [0.75, '#7cb342'],  // Light green
  [1, '#2e7d32']      // Green (suitable)
];

const mockInfrastructure = {
  roads: [
    { lng: 77.2, lat: 28.6, type: 'highway' },
    { lng: 77.25, lat: 28.62, type: 'main' }
  ],
  water: [
    { lng: 77.22, lat: 28.58, type: 'river' }
  ],
  infrastructure: [
    { lng: 77.21, lat: 28.61, type: 'power' }
  ]
};

export default class SuitabilityLayerPlugin extends BaseLayerPlugin {
  constructor() {
    super('terrainSuitability');
    this.currentType = 'housing';
    this.data = { type: 'FeatureCollection', features: [] };
  }

  calculateSuitability(map, lng, lat, type) {
    const { slope } = terrainEngine.getTerrainMetrics(map, { lng, lat });
    const weights = SUITABILITY_TYPES[type].weights;

    let minRoadDist = Infinity;
    mockInfrastructure.roads.forEach(road => {
      const dist = Math.sqrt(Math.pow(lng - road.lng, 2) + Math.pow(lat - road.lat, 2));
      minRoadDist = Math.min(minRoadDist, dist);
    });
    const roadScore = Math.max(0, 1 - minRoadDist * 100);

    let minWaterDist = Infinity;
    mockInfrastructure.water.forEach(water => {
      const dist = Math.sqrt(Math.pow(lng - water.lng, 2) + Math.pow(lat - water.lat, 2));
      minWaterDist = Math.min(minWaterDist, dist);
    });
    const waterScore = Math.max(0, 1 - minWaterDist * 50);

    const slopeScore = Math.max(0, 1 - slope / 45);

    let minInfraDist = Infinity;
    mockInfrastructure.infrastructure.forEach(infra => {
      const dist = Math.sqrt(Math.pow(lng - infra.lng, 2) + Math.pow(lat - infra.lat, 2));
      minInfraDist = Math.min(minInfraDist, dist);
    });
    const infraScore = Math.max(0, 1 - minInfraDist * 200);

    const totalScore = (
      weights.slope * slopeScore +
      weights.roads * roadScore +
      weights.water * waterScore +
      weights.infrastructure * infraScore
    );

    return {
      score: Math.min(1, Math.max(0, totalScore)),
      factors: { slope: slopeScore, roads: roadScore, water: waterScore, infrastructure: infraScore }
    };
  }

  updateGrid(map, type) {
    this.currentType = type;
    if (!map) return;

    try {
      const bounds = map.getBounds();
      terrainEngine.prefetchGrid(map, bounds, 0.003);
      const features = [];
      const step = 0.003;

      for (let lng = bounds.getWest(); lng <= bounds.getEast(); lng += step) {
        for (let lat = bounds.getSouth(); lat <= bounds.getNorth(); lat += step) {
          const suitability = this.calculateSuitability(map, lng, lat, type);

          features.push({
            type: 'Feature',
            properties: {
              suitability: suitability.score,
              ...suitability.factors
            },
            geometry: {
              type: 'Polygon',
              coordinates: [[
                [lng, lat],
                [lng + step, lat],
                [lng + step, lat + step],
                [lng, lat + step],
                [lng, lat]
              ]]
            }
          });
        }
      }

      this.data = { type: 'FeatureCollection', features };
      if (map.getSource('suitability-data')) {
        map.getSource('suitability-data').setData(this.data);
      }
    } catch (error) {
      console.error('[SuitabilityLayerPlugin] Error updating grid:', error);
    }
  }

  init(map, data) {
    if (!map) return;

    try {
      this.updateGrid(map, this.currentType);

      this._addSource(map, 'suitability-data', {
        type: 'geojson',
        data: this.data
      });

      this._addLayer(map, {
        id: 'suitability-fill',
        type: 'fill',
        source: 'suitability-data',
        paint: {
          'fill-color': [
            'interpolate',
            ['linear'],
            ['get', 'suitability'],
            ...SUITABILITY_COLORS.flat()
          ],
          'fill-opacity': 0.6
        },
        layout: { visibility: data?.visible ? 'visible' : 'none' }
      });

      this.initialized = true;
    } catch (err) {
      console.error('[SuitabilityLayerPlugin] init error:', err);
    }
  }

  toggle(map, visible) {
    super.toggle(map, visible);
    if (visible && this.data.features.length === 0) {
      this.updateGrid(map, this.currentType);
    }
  }
}
