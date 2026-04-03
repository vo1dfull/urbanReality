// ================================================
// PredictionLayerPlugin — Visualize future city growth predictions
// Shows population heatmap, sprawl zones, infrastructure demand
// ================================================

import BaseLayerPlugin from './BaseLayerPlugin';

export default class PredictionLayerPlugin extends BaseLayerPlugin {
  constructor() {
    super('prediction', 'Prediction Forecast');
    this.opacity = 0.6;
    this.currentYear = 2050;
    this.currentScenario = 'moderate';
    this._sourceAdded = false;
  }

  init(map, data = null) {
    if (this.isInitialized()) return;

    this._map = map;
    this._predictionData = data || {};

    // Source for prediction heatmap
    const sourceId = this.sourceId('heatmap');
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: this._generatePredictionFeatures(),
        },
      });
      this._sourceAdded = true;
    }

    // Heatmap layer
    this._addLayer(map, {
      id: this.layerId('heatmap'),
      type: 'heatmap',
      source: sourceId,
      paint: {
        'heatmap-weight': ['interpolate', ['linear'], ['get', 'weight'], 0, 0, 100, 1],
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 9, 3],
        'heatmap-color': [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          0, 'rgba(0, 0, 255, 0)',
          0.2, 'rgba(65, 105, 225, 0.5)',
          0.4, 'rgba(0, 255, 0, 0.5)',
          0.6, 'rgba(255, 255, 0, 0.5)',
          0.8, 'rgba(255, 165, 0, 0.5)',
          1.0, 'rgba(255, 0, 0, 0.5)',
        ],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 2, 9, 20],
        'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 7, this.opacity, 9, this.opacity * 0.8],
      },
    }, this.baseLayerId());

    // Sprawl zones overlay
    const sprawlSourceId = this.sourceId('sprawl');
    if (!map.getSource(sprawlSourceId)) {
      map.addSource(sprawlSourceId, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: this._generateSprawlFeatures(),
        },
      });
    }

    this._addLayer(map, {
      id: this.layerId('sprawl'),
      type: 'fill',
      source: sprawlSourceId,
      paint: {
        'fill-color': '#FFD700',
        'fill-opacity': 0.25,
      },
    }, this.baseLayerId());

    // Outline
    this._addLayer(map, {
      id: this.layerId('sprawl-outline'),
      type: 'line',
      source: sprawlSourceId,
      paint: {
        'line-color': '#FFA500',
        'line-width': 2,
        'line-dasharray': [4, 2],
      },
    }, this.baseLayerId());

    this._setInitialized(true);
  }

  /**
   * Update prediction data (new forecast year/scenario)
   */
  updatePrediction(predictionData = {}, year = 2050, scenario = 'moderate') {
    if (!this._map || !this.isInitialized()) return;

    this.currentYear = year;
    this.currentScenario = scenario;
    this._predictionData = predictionData;

    const sourceId = this.sourceId('heatmap');
    const source = this._map.getSource(sourceId);

    if (source && source.setData) {
      source.setData({
        type: 'FeatureCollection',
        features: this._generatePredictionFeatures(),
      });
    }

    // Update sprawl zones
    const sprawlSourceId = this.sourceId('sprawl');
    const sprawlSource = this._map.getSource(sprawlSourceId);

    if (sprawlSource && sprawlSource.setData) {
      sprawlSource.setData({
        type: 'FeatureCollection',
        features: this._generateSprawlFeatures(),
      });
    }
  }

  /**
   * Set layer opacity
   */
  setOpacity(opacity) {
    if (!this._map || !this.isInitialized()) return;

    this.opacity = Math.max(0, Math.min(1, opacity));
    this._map.setPaintProperty(this.layerId('heatmap'), 'heatmap-opacity', this.opacity);
  }

  /**
   * Toggle infrastructure demand visualization
   */
  toggleInfrastructureDemand(show = true) {
    if (!this._map || !this.isInitialized()) return;

    const visibility = show ? 'visible' : 'none';
    if (this._map.getLayer(this.layerId('sprawl'))) {
      this._map.setLayoutProperty(this.layerId('sprawl'), 'visibility', visibility);
    }
  }

  /**
   * Generate prediction heatmap features
   */
  _generatePredictionFeatures() {
    const features = [];
    const { population = {}, sprawl = {} } = this._predictionData;

    if (population.population) {
      // Create heatmap points based on predicted population distribution
      // In production, would use actual prediction tiles
      const grid = 0.02; // 0.02° grid
      const centerLat = 40.7128;
      const centerLng = -74.006;

      for (let lat = centerLat - 0.1; lat <= centerLat + 0.1; lat += grid) {
        for (let lng = centerLng - 0.1; lng <= centerLng + 0.1; lng += grid) {
          // Distance-based weight (stronger near center)
          const dist = Math.hypot(lat - centerLat, lng - centerLng);
          const weight = Math.max(0, 100 * (1 - dist / 0.15));

          features.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [lng, lat] },
            properties: {
              weight,
              year: this.currentYear,
              scenario: this.currentScenario,
            },
          });
        }
      }
    }

    return features;
  }

  /**
   * Generate sprawl zone features
   */
  _generateSprawlFeatures() {
    const features = [];
    const { sprawl = {} } = this._predictionData;

    if (sprawl.expandableZones && Array.isArray(sprawl.expandableZones)) {
      for (const zone of sprawl.expandableZones.slice(0, 3)) {
        // Create polygon for each zone
        features.push({
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: this._generateZonePolygon(zone),
          },
          properties: {
            zone: zone.zone,
            priority: zone.priority,
            suitability: zone.suitabilityScore,
          },
        });
      }
    }

    return features;
  }

  /**
   * Generate polygon coordinates for a zone
   */
  _generateZonePolygon(zone) {
    // Heuristic: create irregular polygon for zone
    const centerLat = 40.7128 + Math.random() * 0.1 - 0.05;
    const centerLng = -74.006 + Math.random() * 0.1 - 0.05;
    const size = 0.02 + zone.suitabilityScore * 0.02;

    const points = [];
    for (let i = 0; i <= 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const radius = size * (0.8 + Math.random() * 0.4);
      points.push([
        centerLng + radius * Math.cos(angle),
        centerLat + radius * Math.sin(angle),
      ]);
    }

    return [points];
  }

  destroy(map) {
    if (!map) return;

    // Remove layers
    if (map.getLayer(this.layerId('heatmap'))) {
      map.removeLayer(this.layerId('heatmap'));
    }
    if (map.getLayer(this.layerId('sprawl'))) {
      map.removeLayer(this.layerId('sprawl'));
    }
    if (map.getLayer(this.layerId('sprawl-outline'))) {
      map.removeLayer(this.layerId('sprawl-outline'));
    }

    // Remove sources
    if (map.getSource(this.sourceId('heatmap'))) {
      map.removeSource(this.sourceId('heatmap'));
    }
    if (map.getSource(this.sourceId('sprawl'))) {
      map.removeSource(this.sourceId('sprawl'));
    }

    this._setInitialized(false);
  }
}
