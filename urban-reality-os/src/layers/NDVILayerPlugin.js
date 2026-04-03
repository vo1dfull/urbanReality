// ================================================
// NDVILayerPlugin — Real-time NDVI vegetation visualization
// Green intensity map from satellite data
// ================================================

import BaseLayerPlugin from './BaseLayerPlugin';

export default class NDVILayerPlugin extends BaseLayerPlugin {
  constructor() {
    super('ndvi', 'Vegetation (NDVI)');
    this.opacity = 0.7;
    this._sourceAdded = false;
  }

  init(map, data = null) {
    if (this.isInitialized()) return;

    this._map = map;
    this._ndviData = data || {};

    // Create NDVI raster source
    const sourceId = this.sourceId('raster');
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: this._generateNDVIFeatures(),
        },
      });
      this._sourceAdded = true;
    }

    // NDVI heatmap layer
    this._addLayer(map, {
      id: this.layerId('heatmap'),
      type: 'heatmap',
      source: sourceId,
      paint: {
        'heatmap-weight': ['interpolate', ['linear'], ['get', 'ndvi'], -1, 0, 1, 1],
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 9, 2],
        // Green colormap: low NDVI (yellow) → high NDVI (green)
        'heatmap-color': [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          0, 'rgba(100, 100, 100, 0)',       // gray (no vegetation)
          0.2, 'rgba(255, 255, 0, 0.4)',     // yellow (low)
          0.4, 'rgba(173, 255, 47, 0.5)',    // greenyellow (moderate)
          0.6, 'rgba(50, 205, 50, 0.6)',     // limegreen
          0.8, 'rgba(34, 139, 34, 0.7)',     // darkgreen
          1.0, 'rgba(0, 100, 0, 0.8)',       // darkgreen (high)
        ],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 1, 9, 15],
        'heatmap-opacity': this.opacity,
      },
    }, 'buildings');

    // Add classification overlay (discrete NDVI zones)
    const classSourceId = this.sourceId('classified');
    if (!map.getSource(classSourceId)) {
      map.addSource(classSourceId, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: this._generateClassifiedFeatures(),
        },
      });
    }

    this._addLayer(map, {
      id: this.layerId('classified'),
      type: 'fill',
      source: classSourceId,
      paint: {
        'fill-color': ['get', 'color'],
        'fill-opacity': 0.3,
      },
    }, 'buildings');

    this._setInitialized(true);
  }

  /**
   * Update NDVI data from satellite engine
   */
  updateNDVIData(ndviData = {}) {
    if (!this._map || !this.isInitialized()) return;

    this._ndviData = ndviData;

    const sourceId = this.sourceId('raster');
    const source = this._map.getSource(sourceId);

    if (source && source.setData) {
      source.setData({
        type: 'FeatureCollection',
        features: this._generateNDVIFeatures(),
      });
    }

    // Update classification
    const classSourceId = this.sourceId('classified');
    const classSource = this._map.getSource(classSourceId);

    if (classSource && classSource.setData) {
      classSource.setData({
        type: 'FeatureCollection',
        features: this._generateClassifiedFeatures(),
      });
    }
  }

  /**
   * Set opacity for blending with other layers
   */
  setOpacity(opacity) {
    if (!this._map || !this.isInitialized()) return;

    this.opacity = Math.max(0, Math.min(1, opacity));
    this._map.setPaintProperty(this.layerId('heatmap'), 'heatmap-opacity', this.opacity);
  }

  /**
   * Show/hide classification overlay
   */
  setClassifiedView(show = false) {
    if (!this._map || !this.isInitialized()) return;

    const visibility = show ? 'visible' : 'none';
    if (this._map.getLayer(this.layerId('classified'))) {
      this._map.setLayoutProperty(this.layerId('classified'), 'visibility', visibility);
    }
  }

  /**
   * Generate NDVI heatmap features
   */
  _generateNDVIFeatures() {
    const features = [];
    const { bounds = {}, ndviValues = null } = this._ndviData;

    if (!ndviValues) {
      // Generate heuristic NDVI points based on geographic location
      const grid = 0.01; // 0.01° grid (~1 km)
      const { north = 40.8128, south = 40.6128, east = -73.906, west = -74.106 } = bounds;

      for (let lat = south; lat <= north; lat += grid) {
        for (let lng = west; lng <= east; lng += grid) {
          // Heuristic NDVI: based on location patterns
          const ndvi = this._estimateNDVIAtLocation(lat, lng, bounds);

          if (Math.abs(ndvi) > 0.1) {
            // Only generate points for vegetated areas
            features.push({
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [lng, lat] },
              properties: { ndvi, weight: (ndvi + 1) / 2 },
            });
          }
        }
      }
    }

    return features;
  }

  /**
   * Generate classified NDVI zones
   */
  _generateClassifiedFeatures() {
    const features = [];
    const classifications = [
      { range: [0.5, 1.0], color: '#006400', label: 'Dense Forest' },
      { range: [0.3, 0.5], color: '#228B22', label: 'Moderate Vegetation' },
      { range: [0.1, 0.3], color: '#ADFF2F', label: 'Sparse Vegetation' },
      { range: [-0.1, 0.1], color: '#FFD700', label: 'Urban/Built-up' },
      { range: [-1.0, -0.1], color: '#4682B4', label: 'Water/Dense Urban' },
    ];

    // Create sample classification zones
    const zones = [
      { center: [40.783, -73.973], radius: 0.02, ndvi: 0.65, label: 'Central Park' },
      { center: [40.714, -74.007], radius: 0.015, ndvi: 0.1, label: 'Downtown Manhattan' },
      { center: [40.764, -73.980], radius: 0.025, ndvi: 0.25, label: 'Midtown' },
    ];

    for (const zone of zones) {
      const classification = classifications.find((c) => zone.ndvi >= c.range[0] && zone.ndvi <= c.range[1]);

      features.push({
        type: 'Feature',
        geometry: this._generateCirclePolygon(zone.center, zone.radius),
        properties: {
          ndvi: zone.ndvi,
          color: classification?.color || '#CCCCCC',
          label: zone.label,
        },
      });
    }

    return features;
  }

  /**
   * Estimate NDVI at a location (heuristic)
   */
  _estimateNDVIAtLocation(lat, lng, bounds = {}) {
    const centerLat = 40.7128;
    const centerLng = -74.006;

    // Near Central Park high NDVI
    const toCentralPark = Math.hypot(lat - 40.783, lng - (-73.973));
    if (toCentralPark < 0.03) {
      return 0.6 + Math.random() * 0.3;
    }

    // Rivers/water low NDVI
    const toWater = Math.min(
      Math.abs(lng + 74.016),    // Hudson River
      Math.abs(lat - 40.763)     // Harlem River
    );
    if (toWater < 0.01) {
      return -0.5 + Math.random() * 0.3;
    }

    // Default: urban with some green spaces
    return 0.15 + Math.random() * 0.2;
  }

  /**
   * Generate circle polygon
   */
  _generateCirclePolygon(center, radiusDegrees) {
    const points = [];
    const numPoints = 32;

    for (let i = 0; i <= numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      points.push([
        center[1] + radiusDegrees * Math.cos(angle),
        center[0] + radiusDegrees * Math.sin(angle),
      ]);
    }

    return { type: 'Polygon', coordinates: [points] };
  }

  destroy(map) {
    if (!map) return;

    if (map.getLayer(this.layerId('heatmap'))) {
      map.removeLayer(this.layerId('heatmap'));
    }
    if (map.getLayer(this.layerId('classified'))) {
      map.removeLayer(this.layerId('classified'));
    }

    if (map.getSource(this.sourceId('raster'))) {
      map.removeSource(this.sourceId('raster'));
    }
    if (map.getSource(this.sourceId('classified'))) {
      map.removeSource(this.sourceId('classified'));
    }

    this._setInitialized(false);
  }
}
