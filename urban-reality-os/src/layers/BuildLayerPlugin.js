// ================================================
// BuildLayerPlugin — Interactive build mode visualization
// Shows placed buildings, roads, green zones with edit controls
// ================================================

import BaseLayerPlugin from './BaseLayerPlugin';

export default class BuildLayerPlugin extends BaseLayerPlugin {
  constructor() {
    super('build', 'Building Mode');
    this.opacity = 0.85;
    this._sourceAdded = false;
    this._placements = new Map();
  }

  init(map, data = null) {
    if (this.isInitialized()) return;

    this._map = map;
    this._buildData = data || {};

    // Buildings source
    const buildingsSourceId = this.sourceId('buildings');
    if (!map.getSource(buildingsSourceId)) {
      map.addSource(buildingsSourceId, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: this._generateBuildingFeatures(),
        },
      });
    }

    // Building layers
    map.addLayer({
      id: this.layerId('buildings'),
      type: 'fill',
      source: buildingsSourceId,
      paint: {
        'fill-color': '#8B4513',  // Brown
        'fill-opacity': 0.7,
      },
    }, 'buildings');

    map.addLayer({
      id: this.layerId('buildings-outline'),
      type: 'line',
      source: buildingsSourceId,
      paint: {
        'line-color': '#654321',
        'line-width': 1,
      },
    }, this.layerId('buildings'));

    // Roads source
    const roadsSourceId = this.sourceId('roads');
    if (!map.getSource(roadsSourceId)) {
      map.addSource(roadsSourceId, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: this._generateRoadFeatures(),
        },
      });
    }

    // Road layers
    map.addLayer({
      id: this.layerId('roads'),
      type: 'line',
      source: roadsSourceId,
      paint: {
        'line-color': '#888888',
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 2, 14, 6],
      },
    }, this.layerId('buildings'));

    // Green zones source
    const greenSourceId = this.sourceId('green');
    if (!map.getSource(greenSourceId)) {
      map.addSource(greenSourceId, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: this._generateGreenFeatures(),
        },
      });
    }

    // Green zone layers
    map.addLayer({
      id: this.layerId('green'),
      type: 'fill',
      source: greenSourceId,
      paint: {
        'fill-color': '#00AA00',
        'fill-opacity': 0.5,
      },
    }, this.layerId('roads'));

    map.addLayer({
      id: this.layerId('green-outline'),
      type: 'line',
      source: greenSourceId,
      paint: {
        'line-color': '#006600',
        'line-width': 1,
      },
    }, this.layerId('green'));

    // Facilities source
    const facilitiesSourceId = this.sourceId('facilities');
    if (!map.getSource(facilitiesSourceId)) {
      map.addSource(facilitiesSourceId, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: this._generateFacilityFeatures(),
        },
      });
    }

    // Facility markers
    map.addLayer({
      id: this.layerId('facilities'),
      type: 'circle',
      source: facilitiesSourceId,
      paint: {
        'circle-radius': 6,
        'circle-color': '#FF0000',
        'circle-opacity': 0.8,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff',
      },
    }, this.layerId('green'));

    // Interactive events
    map.on('click', [this.layerId('buildings'), this.layerId('roads'), this.layerId('green'), this.layerId('facilities')], (e) => {
      const feature = e.features[0];
      this._showPlacementInfo(feature);
    });

    map.on('mouseenter', [this.layerId('buildings'), this.layerId('roads')], () => {
      map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', [this.layerId('buildings'), this.layerId('roads')], () => {
      map.getCanvas().style.cursor = '';
    });

    this._setInitialized(true);
  }

  /**
   * Add a new placement to the layer
   */
  addPlacement(placement) {
    if (!this._map || !this.isInitialized()) return;

    this._placements.set(placement.id, placement);

    const sourceId = this.sourceId(placement.type);
    const source = this._map.getSource(sourceId);

    if (source) {
      const features = this._generateFeaturesByType(placement.type);
      source.setData({
        type: 'FeatureCollection',
        features,
      });
    }
  }

  /**
   * Remove a placement
   */
  removePlacement(placementId, type) {
    if (!this._map || !this.isInitialized()) return;

    this._placements.delete(placementId);

    const sourceId = this.sourceId(type);
    const source = this._map.getSource(sourceId);

    if (source) {
      const features = this._generateFeaturesByType(type);
      source.setData({
        type: 'FeatureCollection',
        features,
      });
    }
  }

  /**
   * Show placement preview (before confirmation)
   */
  showPreview(placement) {
    if (!this._map || !this.isInitialized()) return;

    const feature = this._placementToFeature(placement);
    const sourceId = 'preview-' + placement.type;

    if (!this._map.getSource(sourceId)) {
      this._map.addSource(sourceId, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [feature] },
      });

      this._map.addLayer({
        id: this.layerId('preview-' + placement.type),
        type: feature.geometry.type === 'Point' ? 'circle' : 'fill',
        source: sourceId,
        paint: {
          'fill-color': '#FFFF00',
          'fill-opacity': 0.3,
          'circle-color': '#FFFF00',
          'circle-opacity': 0.5,
          'circle-radius': 6,
        },
      });
    } else {
      const source = this._map.getSource(sourceId);
      if (source) {
        source.setData({ type: 'FeatureCollection', features: [feature] });
      }
    }
  }

  /**
   * Clear preview
   */
  clearPreview(type) {
    if (!this._map) return;

    const sourceId = 'preview-' + type;
    if (this._map.getLayer(this.layerId('preview-' + type))) {
      this._map.removeLayer(this.layerId('preview-' + type));
    }
    if (this._map.getSource(sourceId)) {
      this._map.removeSource(sourceId);
    }
  }

  /**
   * Set opacity
   */
  setOpacity(opacity) {
    if (!this._map || !this.isInitialized()) return;

    this.opacity = Math.max(0, Math.min(1, opacity));

    ['buildings', 'roads', 'green', 'facilities'].forEach((type) => {
      const layer = this.layerId(type);
      if (this._map.getLayer(layer)) {
        const paintProp = type === 'roads' ? 'line-opacity' : 'fill-opacity';
        this._map.setPaintProperty(layer, paintProp, this.opacity);
      }
    });
  }

  /**
   * Generate building features
   */
  _generateBuildingFeatures() {
    const features = [];

    for (const placement of this._placements.values()) {
      if (placement.type === 'building') {
        features.push(this._placementToFeature(placement));
      }
    }

    return features;
  }

  /**
   * Generate road features
   */
  _generateRoadFeatures() {
    const features = [];

    for (const placement of this._placements.values()) {
      if (placement.type === 'road') {
        features.push(this._placementToFeature(placement));
      }
    }

    return features;
  }

  /**
   * Generate green zone features
   */
  _generateGreenFeatures() {
    const features = [];

    for (const placement of this._placements.values()) {
      if (placement.type === 'greenZone') {
        features.push(this._placementToFeature(placement));
      }
    }

    return features;
  }

  /**
   * Generate facility features
   */
  _generateFacilityFeatures() {
    const features = [];

    for (const placement of this._placements.values()) {
      if (placement.type === 'facility') {
        features.push(this._placementToFeature(placement));
      }
    }

    return features;
  }

  /**
   * Helper: Convert placement to GeoJSON feature
   */
  _placementToFeature(placement) {
    const { type, location, dimensions = {} } = placement;
    const { width = 1, height = 1 } = dimensions;
    const { lng, lat } = location;

    let geometry;

    if (type === 'facility') {
      geometry = { type: 'Point', coordinates: [lng, lat] };
    } else {
      // Create polygon from dimensions
      const halfWidth = (width * 0.001) / 2;
      const halfHeight = (height * 0.001) / 2;

      geometry = {
        type: 'Polygon',
        coordinates: [
          [
            [lng - halfWidth, lat - halfHeight],
            [lng + halfWidth, lat - halfHeight],
            [lng + halfWidth, lat + halfHeight],
            [lng - halfWidth, lat + halfHeight],
            [lng - halfWidth, lat - halfHeight],
          ],
        ],
      };
    }

    return {
      type: 'Feature',
      geometry,
      properties: {
        id: placement.id,
        type: placement.type,
        cost: placement.cost,
        confirmed: placement.confirmed,
      },
    };
  }

  /**
   * Generate features by type from stored placements
   */
  _generateFeaturesByType(type) {
    const features = [];

    for (const placement of this._placements.values()) {
      if (placement.type === type) {
        features.push(this._placementToFeature(placement));
      }
    }

    return features;
  }

  /**
   * Show info popup for placement
   */
  _showPlacementInfo(feature) {
    const { properties } = feature;
    const html = `
<div style="font-size: 12px; padding: 8px;">
  <strong>${properties.type.toUpperCase()}</strong><br/>
  Cost: ${properties.cost} credits<br/>
  Status: ${properties.confirmed ? 'Confirmed' : 'Preview'}
</div>
    `;

    const popup = new maplibregl.Popup()
      .setLngLat(
        feature.geometry.type === 'Point'
          ? feature.geometry.coordinates
          : feature.geometry.coordinates[0][0]
      )
      .setHTML(html)
      .addTo(this._map);
  }

  destroy(map) {
    if (!map) return;

    // Remove all layers
    ['buildings', 'buildings-outline', 'roads', 'green', 'green-outline', 'facilities'].forEach((type) => {
      if (map.getLayer(this.layerId(type))) {
        map.removeLayer(this.layerId(type));
      }
    });

    // Remove all sources
    ['buildings', 'roads', 'green', 'facilities'].forEach((type) => {
      if (map.getSource(this.sourceId(type))) {
        map.removeSource(this.sourceId(type));
      }
    });

    this._placements.clear();
    this._setInitialized(false);
  }
}
