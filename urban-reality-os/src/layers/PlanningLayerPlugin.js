// ================================================
// PlanningLayerPlugin — RL optimization heatmap visualization
// Shows recommended building locations, strategy overlays
// ================================================

import BaseLayerPlugin from './BaseLayerPlugin';

export default class PlanningLayerPlugin extends BaseLayerPlugin {
  constructor() {
    super('planning', 'Planning Recommendations');
    this.opacity = 0.5;
    this.buildingType = 'park';
    this._sourceAdded = false;
  }

  init(map, data = null) {
    if (this.isInitialized()) return;

    this._map = map;
    this._planningData = data || {};

    // Heatmap source for optimization scores
    const heatmapSourceId = this.sourceId('heatmap');
    if (!map.getSource(heatmapSourceId)) {
      map.addSource(heatmapSourceId, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: this._generateHeatmapFeatures(),
        },
      });
      this._sourceAdded = true;
    }

    // Optimization heatmap layer
    map.addLayer({
      id: this.layerId('heatmap'),
      type: 'heatmap',
      source: heatmapSourceId,
      paint: {
        'heatmap-weight': ['interpolate', ['linear'], ['get', 'score'], 0, 0, 100, 1],
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 9, 3],
        'heatmap-color': [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          0, 'rgba(0, 0, 255, 0)',
          0.2, 'rgba(0, 0, 255, 0.3)',
          0.4, 'rgba(0, 255, 255, 0.5)',
          0.6, 'rgba(0, 255, 0, 0.6)',
          0.8, 'rgba(255, 255, 0, 0.6)',
          1.0, 'rgba(255, 0, 0, 0.7)',
        ],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 2, 9, 20],
        'heatmap-opacity': this.opacity,
      },
    }, 'buildings');

    // Recommendations marker source
    const markerSourceId = this.sourceId('recommendations');
    if (!map.getSource(markerSourceId)) {
      map.addSource(markerSourceId, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: this._generateRecommendationFeatures(),
        },
      });
    }

    // Recommendation markers
    map.addLayer({
      id: this.layerId('recommendations'),
      type: 'circle',
      source: markerSourceId,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'suitability'], 0, 4, 100, 8],
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.8,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff',
      },
    }, 'buildings');

    // Popup on click
    map.on('click', this.layerId('recommendations'), (e) => {
      const feature = e.features[0];
      new maplibregl.Popup()
        .setLngLat(feature.geometry.coordinates)
        .setHTML(`<strong>${feature.properties.type}</strong><br/>Suitability: ${feature.properties.suitability}%`)
        .addTo(map);
    });

    map.on('mouseenter', this.layerId('recommendations'), () => {
      map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', this.layerId('recommendations'), () => {
      map.getCanvas().style.cursor = '';
    });

    this._setInitialized(true);
  }

  /**
   * Update planning heatmap for different building types
   */
  updateRecommendations(buildingType = 'park', planningData = {}) {
    if (!this._map || !this.isInitialized()) return;

    this.buildingType = buildingType;
    this._planningData = planningData;

    const heatmapSourceId = this.sourceId('heatmap');
    const source = this._map.getSource(heatmapSourceId);

    if (source && source.setData) {
      source.setData({
        type: 'FeatureCollection',
        features: this._generateHeatmapFeatures(),
      });
    }

    // Update recommendations
    const markerSourceId = this.sourceId('recommendations');
    const markerSource = this._map.getSource(markerSourceId);

    if (markerSource && markerSource.setData) {
      markerSource.setData({
        type: 'FeatureCollection',
        features: this._generateRecommendationFeatures(),
      });
    }
  }

  /**
   * Set opacity
   */
  setOpacity(opacity) {
    if (!this._map || !this.isInitialized()) return;

    this.opacity = Math.max(0, Math.min(1, opacity));
    this._map.setPaintProperty(this.layerId('heatmap'), 'heatmap-opacity', this.opacity);
  }

  /**
   * Highlight a specific recommendation
   */
  highlightRecommendation(recommendationId) {
    if (!this._map || !this.isInitialized()) return;

    this._map.setFilter(this.layerId('recommendations'), [
      'all',
      ['==', ['get', 'id'], recommendationId],
      ['!=', ['get', 'id'], null],
    ]);
  }

  /**
   * Clear highlights
   */
  clearHighlights() {
    if (!this._map || !this.isInitialized()) return;

    this._map.setFilter(this.layerId('recommendations'), null);
  }

  /**
   * Generate heatmap features based on building type
   */
  _generateHeatmapFeatures() {
    const features = [];
    const { data = null } = this._planningData || {};

    if (data && data.data && data.width && data.height) {
      // Use actual heatmap data
      const width = data.width;
      const height = data.height;
      const bounds = data.bounds || { north: 40.8228, south: 40.7028, east: -73.906, west: -74.106 };

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          const value = data.data[idx];

          if (value > 50) {
            // Only show significant scores
            const lat = bounds.south + (y / height) * (bounds.north - bounds.south);
            const lng = bounds.west + (x / width) * (bounds.east - bounds.west);

            features.push({
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [lng, lat] },
              properties: { score: value, buildingType: this.buildingType },
            });
          }
        }
      }
    } else {
      // Generate heuristic heatmap
      const grid = 0.015;
      const centerLat = 40.7128;
      const centerLng = -74.006;

      for (let lat = centerLat - 0.1; lat <= centerLat + 0.1; lat += grid) {
        for (let lng = centerLng - 0.1; lng <= centerLng + 0.1; lng += grid) {
          // Score based on distance from center (building type specific)
          let score = 50;

          if (this.buildingType === 'park') {
            // Parks prefer edges
            const distFromCenter = Math.hypot(lat - centerLat, lng - centerLng);
            score = Math.round((distFromCenter / 0.15) * 100);
          } else if (this.buildingType === 'road') {
            // Roads prefer central areas with good connectivity
            const distFromCenter = Math.hypot(lat - centerLat, lng - centerLng);
            score = Math.round((1 - distFromCenter / 0.15) * 100);
          } else if (this.buildingType === 'facility') {
            // Facilities prefer accessible areas
            score = 50 + Math.random() * 30;
          }

          if (score > 30) {
            features.push({
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [lng, lat] },
              properties: { score: Math.min(100, score), buildingType: this.buildingType },
            });
          }
        }
      }
    }

    return features;
  }

  /**
   * Generate recommendation markers
   */
  _generateRecommendationFeatures() {
    const features = [];
    const { recommendations = [] } = this._planningData || {};

    if (Array.isArray(recommendations) && recommendations.length > 0) {
      for (const rec of recommendations.slice(0, 10)) {
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [rec.location.lng, rec.location.lat] },
          properties: {
            id: rec.id,
            type: this.buildingType,
            suitability: rec.suitability,
            color: this._getColorForSuitability(rec.suitability),
          },
        });
      }
    }

    return features;
  }

  /**
   * Get color based on suitability score
   */
  _getColorForSuitability(score) {
    if (score > 80) return '#00AA00'; // Green
    if (score > 60) return '#AAAA00'; // Yellow-green
    if (score > 40) return '#FFAA00'; // Orange
    return '#FF0000'; // Red
  }

  destroy(map) {
    if (!map) return;

    if (map.getLayer(this.layerId('heatmap'))) {
      map.removeLayer(this.layerId('heatmap'));
    }
    if (map.getLayer(this.layerId('recommendations'))) {
      map.removeLayer(this.layerId('recommendations'));
    }

    if (map.getSource(this.sourceId('heatmap'))) {
      map.removeSource(this.sourceId('heatmap'));
    }
    if (map.getSource(this.sourceId('recommendations'))) {
      map.removeSource(this.sourceId('recommendations'));
    }

    this._setInitialized(false);
  }
}
