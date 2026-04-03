// ================================================
// BuildEngine — SimCity-style interactive construction
// Place roads, buildings, green zones with real-time validation
// Multi-cell placements, budget forecasting, import/export support
// ================================================

import EventBus from '../core/EventBus';
import { createLogger } from '../core/Logger';

const log = createLogger('BuildEngine');

/**
 * @typedef {Object} BuildPlacement
 * @property {string} id
 * @property {string} type — 'road' | 'building' | 'greenZone' | 'facility'
 * @property {object} location — { lng, lat, elevation }
 * @property {object} dimensions — { width, height, depth }
 * @property {number} cost
 * @property {object} impact — { traffic, population, heat, flood }
 * @property {string} [zoneType] — 'residential' | 'commercial' | 'industrial' | 'mixedUse'
 * @property {number} timestamp
 */

/**
 * @typedef {Object} BudgetForecast
 * @property {number} currentSpend
 * @property {Object} projections — { 5: {spend, impact}, 10: {...}, 20: {...} }
 * @property {number} roi — estimated return on investment percentage
 * @property {number} avgImpactScore — average positive impact score
 */

/**
 * @typedef {Object} ImportResult
 * @property {boolean} success
 * @property {number} imported
 * @property {number} skipped
 * @property {string[]} errors
 */

/**
 * Zone configuration with cost and impact modifiers
 */
const ZONE_CONFIG = {
  residential: {
    costMultiplier: 1.0,
    population: 1.0,
    traffic: 0.8,
    heat: 1.2,
    noise: 1.0,
    accessibility: 1.0,
  },
  commercial: {
    costMultiplier: 1.4,
    population: 0.6,
    traffic: 1.3,
    heat: 0.9,
    noise: 1.3,
    accessibility: 1.2,
  },
  industrial: {
    costMultiplier: 1.2,
    population: 0.3,
    traffic: 1.4,
    heat: 1.5,
    noise: 1.5,
    accessibility: 0.9,
  },
  mixedUse: {
    costMultiplier: 1.6,
    population: 0.9,
    traffic: 1.1,
    heat: 1.1,
    noise: 1.1,
    accessibility: 1.3,
  },
};

export class BuildEngine {
  constructor() {
    this.state = {
      placements: new Map(),           // id -> BuildPlacement
      grid: new Map(),                 // grid cell -> occupied
      gridSize: 0.001,                 // 1 grid cell ≈ 111 meters at equator
      budget: 1000000,                 // in-game currency
      validationMode: 'strict',        // 'strict' | 'lenient'
      history: [],                     // placement history for undo
      historyIndex: -1,                // current position in history (for redo support)
      isBuilding: false,
      previewPlacement: null,          // current preview before confirmation
    };

    const MAX_HISTORY_DEPTH = 50;

    this.eventBus = EventBus;
    this._placementIdCounter = 0;
    this._destroyed = false;
    this._impactCache = new Map();    // placement -> impact
    this._validationCache = new Map();
    this._maxHistoryDepth = MAX_HISTORY_DEPTH;
  }

  /**
   * Place a road along multiple waypoints (polyline)
   * @param {Array<{lng: number, lat: number}>} waypoints - Array of coordinates
   * @param {object} [options] - { zoneType, width }
   * @returns {Promise<BuildPlacement[]>}
   */
  async placeRoad(waypoints = [], options = {}) {
    if (this._destroyed || !waypoints || waypoints.length < 2) {
      throw new Error('Road requires at least 2 waypoints');
    }

    const { zoneType = 'residential', width = 2 } = options;
    const placements = [];
    const collisions = [];

    try {
      this.state.isBuilding = true;

      // Discretize path into cells
      const roadCells = this._discretizePolyline(waypoints, width);

      // Check collisions first
      const collisionCheck = this._checkMultiCellCollisions(roadCells);
      if (collisionCheck.hasCollisions) {
        collisions.push(...collisionCheck.collisions);
        if (this.state.validationMode === 'strict') {
          throw new Error(`Road placement blocked by ${collisions.length} collisions`);
        }
        // In lenient mode, continue with available cells
      }

      // Place each valid cell
      let totalCost = 0;
      for (const cell of roadCells) {
        const gridKey = this._getGridKey(cell);
        if (!this.state.grid.has(gridKey)) {
          const cellPlacement = {
            id: `road-${++this._placementIdCounter}`,
            type: 'road',
            location: cell,
            dimensions: { width: 1, height: 1, depth: 0.1 },
            zoneType,
            cost: this._computePlacementCost('road', { width: 1, height: 1, depth: 0.1 }, zoneType),
            impact: this._estimateImpact('road', cell, { width: 1, height: 1 }, zoneType),
            confirmed: true,
            timestamp: Date.now(),
          };

          this.state.grid.set(gridKey, cellPlacement.id);
          this.state.placements.set(cellPlacement.id, cellPlacement);
          placements.push(cellPlacement);
          totalCost += cellPlacement.cost;
        }
      }

      // Deduct total cost
      this.state.budget -= totalCost;

      // Add to history
      this._pushHistory({
        action: 'placeRoad',
        placements,
        totalCost,
        timestamp: Date.now(),
      });

      this.eventBus.emit('build:road-placed', {
        placements,
        collisions,
        totalCost,
      });

      log.info(`Placed road with ${placements.length} cells (${collisions.length} collisions avoided)`);

      return placements;
    } finally {
      this.state.isBuilding = false;
    }
  }

  /**
   * Estimate cost range for a placement type and area
   * @param {string} type - 'building' | 'greenZone' | 'facility'
   * @param {number} areaSqMeters - Area in square meters
   * @param {string} [zoneType] - Zone type (for buildings)
   * @returns {{min: number, max: number, currency: string}}
   */
  estimateCostRange(type, areaSqMeters, zoneType = 'residential') {
    if (areaSqMeters <= 0) throw new Error('Area must be positive');

    const baseCosts = {
      building: 150000,    // INR per sq meter
      greenZone: 8000,     // INR per sq meter
      facility: 250000,    // INR per sq meter
    };

    const baseCost = baseCosts[type] || 100000;
    const zoneMultiplier = ZONE_CONFIG[zoneType]?.costMultiplier || 1.0;

    const min = Math.round(baseCost * areaSqMeters * zoneMultiplier * 0.8);
    const max = Math.round(baseCost * areaSqMeters * zoneMultiplier * 1.2);

    return {
      min,
      max,
      currency: 'INR',
      zoneType,
      areaSqMeters,
    };
  }

  /**
   * Get budget forecast based on current and projected placements
   * @param {BuildPlacement[]} placements - Placements to forecast
   * @returns {BudgetForecast}
   */
  getBudgetForecast(placements = null) {
    const allPlacements = placements || Array.from(this.state.placements.values());
    
    if (allPlacements.length === 0) {
      return {
        currentSpend: 0,
        projections: {
          5: { spend: 0, impact: 0, avgCost: 0 },
          10: { spend: 0, impact: 0, avgCost: 0 },
          20: { spend: 0, impact: 0, avgCost: 0 },
        },
        roi: 0,
        avgImpactScore: 0,
      };
    }

    const currentSpend = allPlacements.reduce((sum, p) => sum + p.cost, 0);
    const avgImpactScore = this._calculateAveragImpactScore(allPlacements);

    // Project over years: assume maintenance costs increase, positive impacts compound
    const maintenanceMultiplier = {
      5: 1.15,   // 15% additional cost over 5 years
      10: 1.35,  // 35% over 10 years
      20: 1.8,   // 80% over 20 years
    };

    const projections = {};
    for (const years of [5, 10, 20]) {
      const multiplier = maintenanceMultiplier[years];
      projections[years] = {
        spend: Math.round(currentSpend * multiplier),
        impact: Math.round(avgImpactScore * (0.8 + years * 0.02)), // Impact grows over time
        avgCost: Math.round((currentSpend * multiplier) / allPlacements.length),
      };
    }

    // ROI: (total positive impact / total spend) * 100
    const totalImpact = allPlacements.reduce((sum, p) => {
      const impacts = Object.values(p.impact || {}).filter(v => typeof v === 'number');
      return sum + impacts.reduce((a, b) => a + b, 0);
    }, 0);

    const roi = currentSpend > 0 ? Math.round((totalImpact / currentSpend) * 100) : 0;

    return {
      currentSpend,
      projections,
      roi,
      avgImpactScore: Math.round(avgImpactScore),
    };
  }

  /**
   * Export placements to GeoJSON or CSV format
   * @param {string} format - 'geojson' | 'csv'
   * @returns {string}
   */
  exportPlacements(format = 'geojson') {
    const placements = Array.from(this.state.placements.values());

    if (format === 'geojson') {
      const features = placements.map((p) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [p.location.lng, p.location.lat],
        },
        properties: {
          id: p.id,
          type: p.type,
          zoneType: p.zoneType || 'none',
          cost: p.cost,
          timestamp: p.timestamp,
          impact: JSON.stringify(p.impact),
          dimensions: JSON.stringify(p.dimensions),
        },
      }));

      return JSON.stringify({
        type: 'FeatureCollection',
        features,
        metadata: {
          totalPlacements: placements.length,
          totalCost: placements.reduce((sum, p) => sum + p.cost, 0),
          exportedAt: new Date().toISOString(),
        },
      }, null, 2);
    } else if (format === 'csv') {
      const headers = ['ID', 'Type', 'ZoneType', 'Lng', 'Lat', 'Cost', 'ImpactScore', 'Timestamp'];
      const rows = placements.map((p) => {
        const impacts = Object.values(p.impact || {}).filter(v => typeof v === 'number');
        const impactScore = impacts.reduce((a, b) => a + b, 0);
        return [
          p.id,
          p.type,
          p.zoneType || 'none',
          p.location.lng.toFixed(6),
          p.location.lat.toFixed(6),
          p.cost,
          impactScore.toFixed(2),
          new Date(p.timestamp).toISOString(),
        ].map(v => `"${v}"`).join(',');
      });

      return [headers.join(','), ...rows].join('\n');
    }

    throw new Error(`Unsupported format: ${format}`);
  }

  /**
   * Import placements from GeoJSON or CSV format
   * @param {string} data - Raw data to import
   * @param {string} format - 'geojson' | 'csv'
   * @returns {Promise<ImportResult>}
   */
  async importPlacements(data = '', format = 'geojson') {
    if (!data) throw new Error('No data provided');

    const errors = [];
    let imported = 0;
    let skipped = 0;
    const importedIds = new Set();

    try {
      let placements = [];

      if (format === 'geojson') {
        const geojson = JSON.parse(data);
        if (!geojson.features || !Array.isArray(geojson.features)) {
          throw new Error('Invalid GeoJSON: missing features array');
        }

        placements = geojson.features.map((feature, idx) => {
          try {
            const props = feature.properties || {};
            const coords = feature.geometry?.coordinates;

            if (!coords || !Array.isArray(coords) || coords.length < 2) {
              throw new Error(`Feature ${idx}: invalid coordinates`);
            }

            return {
              id: props.id || `imported-${Date.now()}-${idx}`,
              type: props.type || 'building',
              location: { lng: coords[0], lat: coords[1], elevation: 0 },
              zoneType: props.zoneType || 'residential',
              cost: parseInt(props.cost) || 0,
              impact: props.impact ? JSON.parse(props.impact) : {},
              dimensions: props.dimensions ? JSON.parse(props.dimensions) : { width: 1, height: 1, depth: 0.1 },
              timestamp: props.timestamp || Date.now(),
            };
          } catch (err) {
            errors.push(`Feature ${idx}: ${err.message}`);
            return null;
          }
        }).filter(p => p !== null);
      } else if (format === 'csv') {
        const lines = data.trim().split('\n');
        if (lines.length < 2) throw new Error('CSV must have header + data rows');

        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        placements = lines.slice(1).map((line, idx) => {
          try {
            const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
            const row = {};
            headers.forEach((h, i) => {
              row[h] = values[i];
            });

            return {
              id: row.ID || `imported-${Date.now()}-${idx}`,
              type: row.Type || 'building',
              location: { lng: parseFloat(row.Lng), lat: parseFloat(row.Lat), elevation: 0 },
              zoneType: row.ZoneType || 'residential',
              cost: parseInt(row.Cost) || 0,
              impact: {},
              dimensions: { width: 1, height: 1, depth: 0.1 },
              timestamp: new Date(row.Timestamp).getTime() || Date.now(),
            };
          } catch (err) {
            errors.push(`Row ${idx + 2}: ${err.message}`);
            return null;
          }
        }).filter(p => p !== null);
      } else {
        throw new Error(`Unsupported format: ${format}`);
      }

      // Deduplicate and import
      for (const placement of placements) {
        if (importedIds.has(placement.id)) {
          skipped++;
          continue;
        }

        const gridKey = this._getGridKey(placement.location);
        if (this.state.grid.has(gridKey)) {
          skipped++;
          continue;
        }

        this.state.grid.set(gridKey, placement.id);
        this.state.placements.set(placement.id, {
          ...placement,
          confirmed: true,
        });
        importedIds.add(placement.id);
        imported++;
      }

      log.info(`Imported ${imported} placements, skipped ${skipped}`);
      this.eventBus.emit('build:placements-imported', { imported, skipped });

      return { success: true, imported, skipped, errors };
    } catch (err) {
      log.error('Import failed:', err.message);
      return {
        success: false,
        imported: 0,
        skipped: 0,
        errors: [err.message],
      };
    }
  }

  /**
   * Create a preview of placement before confirming
   * @param {object} params — { type, location, dimensions, zoneType }
   * @returns {Promise<object>}
   */
  async previewPlacement(params = {}) {
    if (this._destroyed) return null;

    const { type, location, dimensions, zoneType = 'residential' } = params;

    // Validate basic params
    if (!type || !location || typeof location.lng !== 'number' || typeof location.lat !== 'number') {
      throw new Error('Invalid placement params');
    }

    // Snap to grid
    const snappedLocation = this._snapToGrid(location);

    // Check if cell is occupied
    const gridKey = this._getGridKey(snappedLocation);
    const isOccupied = this.state.grid.has(gridKey);

    // Compute costs with zone multiplier
    const cost = this._computePlacementCost(type, dimensions, zoneType);
    const canAfford = this.state.budget >= cost;

    // Estimate impact with zone modifiers
    const impact = this._estimateImpact(type, snappedLocation, dimensions, zoneType);

    // Check for collisions with nearby placements (multi-cell detection)
    const collisions = this._detectCollisions(snappedLocation, dimensions);

    const preview = {
      id: `preview-${Date.now()}`,
      type,
      location: snappedLocation,
      dimensions: dimensions || this._getDefaultDimensions(type),
      zoneType,
      cost,
      canAfford,
      isOccupied,
      collisions: collisions.length > 0 ? collisions : undefined,
      hasCollisions: collisions.length > 0,
      isValid: !isOccupied && canAfford && (this.state.validationMode === 'lenient' || collisions.length === 0),
      impact,
      timestamp: Date.now(),
    };

    this.state.previewPlacement = preview;
    this.eventBus.emit('build:preview', preview);

    return preview;
  }

  /**
   * Confirm placement and add to world
   * @param {string} previewId
   * @returns {Promise<BuildPlacement>}
   */
  async confirmPlacement(previewId = null) {
    if (this._destroyed) return null;

    const preview = previewId ? 
      this.state.placements.get(previewId) :
      this.state.previewPlacement;

    if (!preview) {
      throw new Error('No placement to confirm');
    }

    if (!preview.isValid) {
      throw new Error('Placement is invalid');
    }

    this.state.isBuilding = true;

    try {
      // Create final placement
      const placement = {
        ...preview,
        id: `build-${++this._placementIdCounter}`,
        confirmed: true,
      };

      // Mark grid cells as occupied
      this._occupyGridCells(placement);

      // Deduct budget
      this.state.budget -= placement.cost;

      // Store placement
      this.state.placements.set(placement.id, placement);

      // Add to history for undo/redo
      this._pushHistory({
        action: 'place',
        placement,
        timestamp: Date.now(),
      });

      // Emit events
      this.eventBus.emit('build:confirmed', placement);
      this.eventBus.emit('build:budget-changed', this.state.budget);

      log.info(`Placed ${placement.type}${placement.zoneType ? ` (${placement.zoneType})` : ''} at (${placement.location.lng}, ${placement.location.lat})`);

      // Trigger simulation update
      this.eventBus.emit('build:impact-simulation', {
        placement,
        impacts: placement.impact,
      });

      this.state.previewPlacement = null;

      return placement;
    } finally {
      this.state.isBuilding = false;
    }
  }

  /**
   * Cancel preview
   */
  cancelPreview() {
    this.state.previewPlacement = null;
    this.eventBus.emit('build:preview-cancelled');
  }

  /**
   * Undo last placement(s)
   */
  async undo() {
    if (this._destroyed || this.state.historyIndex < 0) return;

    const entry = this.state.history[this.state.historyIndex];
    if (!entry) return;

    if (entry.action === 'place') {
      const { placement } = entry;
      this._freeGridCells(placement);
      this.state.placements.delete(placement.id);
      this.state.budget += placement.cost;
      this.eventBus.emit('build:undone', placement);
      this.eventBus.emit('build:budget-changed', this.state.budget);
      log.info(`Undone placement ${placement.id}`);
    } else if (entry.action === 'placeRoad') {
      const { placements: roadPlacements, totalCost } = entry;
      for (const placement of roadPlacements) {
        this._freeGridCells(placement);
        this.state.placements.delete(placement.id);
      }
      this.state.budget += totalCost;
      this.eventBus.emit('build:undone', roadPlacements);
      this.eventBus.emit('build:budget-changed', this.state.budget);
      log.info(`Undone road placement with ${roadPlacements.length} cells`);
    }

    this.state.historyIndex--;
  }

  /**
   * Redo last undone placement(s)
   */
  async redo() {
    if (this._destroyed || this.state.historyIndex >= this.state.history.length - 1) return;

    this.state.historyIndex++;
    const entry = this.state.history[this.state.historyIndex];
    if (!entry) return;

    if (entry.action === 'place') {
      const { placement } = entry;
      this._occupyGridCells(placement);
      this.state.placements.set(placement.id, placement);
      this.state.budget -= placement.cost;
      this.eventBus.emit('build:redone', placement);
      this.eventBus.emit('build:budget-changed', this.state.budget);
      log.info(`Redone placement ${placement.id}`);
    } else if (entry.action === 'placeRoad') {
      const { placements: roadPlacements, totalCost } = entry;
      for (const placement of roadPlacements) {
        this._occupyGridCells(placement);
        this.state.placements.set(placement.id, placement);
      }
      this.state.budget -= totalCost;
      this.eventBus.emit('build:redone', roadPlacements);
      this.eventBus.emit('build:budget-changed', this.state.budget);
      log.info(`Redone road placement with ${roadPlacements.length} cells`);
    }
  }

  /**
   * Check if undo is available
   */
  canUndo() {
    return this.state.historyIndex >= 0;
  }

  /**
   * Check if redo is available
   */
  canRedo() {
    return this.state.historyIndex < this.state.history.length - 1;
  }

  /**
   * Remove a specific placement
   * @param {string} placementId
   */
  async removePlacement(placementId) {
    if (this._destroyed) return null;

    const placement = this.state.placements.get(placementId);
    if (!placement) {
      throw new Error('Placement not found');
    }

    // Free grid cells
    this._freeGridCells(placement);

    // Remove
    this.state.placements.delete(placementId);

    // Refund
    this.state.budget += placement.cost;

    this.eventBus.emit('build:removed', placement);
    this.eventBus.emit('build:budget-changed', this.state.budget);
  }

  /**
   * Get all current placements
   */
  getPlacements(type = null) {
    if (type) {
      return Array.from(this.state.placements.values()).filter((p) => p.type === type);
    }
    return Array.from(this.state.placements.values());
  }

  /**
   * Validate placement according to rules
   */
  _validatePlacement(placement) {
    const { type, location, dimensions } = placement;

    // Check bounds
    if (!location || typeof location.lng !== 'number' || typeof location.lat !== 'number') {
      return { valid: false, reason: 'Invalid coordinates' };
    }

    // Check grid occupation
    const gridKey = this._getGridKey(location);
    if (this.state.grid.has(gridKey)) {
      return { valid: false, reason: 'Cell already occupied' };
    }

    // Type-specific validation
    const validation = {
      road: () => this._validateRoad(placement),
      building: () => this._validateBuilding(placement),
      greenZone: () => this._validateGreenZone(placement),
      facility: () => this._validateFacility(placement),
    };

    const validator = validation[type];
    if (!validator) {
      return { valid: false, reason: `Unknown type: ${type}` };
    }

    return validator();
  }

  _validateRoad(placement) {
    // Roads need connectivity
    return { valid: true };
  }

  _validateBuilding(placement) {
    // Buildings need access to roads
    // In strict mode, enforce adjacency
    if (this.state.validationMode === 'strict') {
      const nearby = this._getNearbyPlacements(placement.location, 0.003);
      const hasRoad = nearby.some((p) => p.type === 'road');
      if (!hasRoad) {
        return { valid: false, reason: 'Buildings require road access' };
      }
    }
    return { valid: true };
  }

  _validateGreenZone(placement) {
    // Green zones can be placed most places
    return { valid: true };
  }

  _validateFacility(placement) {
    // Facilities need accessibility
    const nearby = this._getNearbyPlacements(placement.location, 0.005);
    if (nearby.length === 0) {
      return { valid: false, reason: 'Facilities need road connectivity' };
    }
    return { valid: true };
  }

  /**
   * Compute placement cost based on type, size, and zone
   */
  _computePlacementCost(type, dimensions = {}, zoneType = 'residential') {
    const { width = 1, height = 1, depth = 1 } = dimensions;
    const volume = width * height * depth;

    const baseCosts = {
      road: 100,       // per grid cell
      building: 50000,
      greenZone: 5000,
      facility: 100000,
    };

    const baseCost = baseCosts[type] || 50000;
    const zoneMultiplier = ZONE_CONFIG[zoneType]?.costMultiplier || 1.0;
    return Math.round(baseCost * volume * zoneMultiplier * (0.8 + Math.random() * 0.4));
  }

  /**
   * Estimate impact without full simulation, with zone modifiers
   */
  _estimateImpact(type, location, dimensions = {}, zoneType = 'residential') {
    const baseImpacts = {
      road: { traffic: -15, accessibility: 20, cost: 1 },
      building: { population: 500, heat: 8, cost: 50 },
      greenZone: { heat: -12, flood: -8, livability: 15 },
      facility: { accessibility: 18, population: 0, health: 10 },
    };

    let impact = baseImpacts[type] || {};
    const zoneConfig = ZONE_CONFIG[zoneType];

    // Apply zone modifiers if applicable
    if (zoneConfig && type === 'building') {
      impact = {
        population: Math.round((impact.population || 0) * zoneConfig.population),
        heat: Math.round((impact.heat || 0) * zoneConfig.heat),
        traffic: Math.round((impact.traffic || 0) * zoneConfig.traffic),
        noise: Math.round(5 * zoneConfig.noise),
        accessibility: Math.round((impact.accessibility || 0) * zoneConfig.accessibility),
      };
    }

    // Add location-based variance
    const variant = (Math.random() - 0.5) * 0.2;
    const finalImpact = {};
    for (const key in impact) {
      finalImpact[key] = Math.round(impact[key] * (1 + variant));
    }

    return finalImpact;
  }

  /**
   * Snap location to grid
   */
  _snapToGrid(location) {
    const { lng, lat, elevation = 0 } = location;
    const size = this.state.gridSize;

    return {
      lng: Math.round(lng / size) * size,
      lat: Math.round(lat / size) * size,
      elevation,
    };
  }

  /**
   * Get grid cell key
   */
  _getGridKey(location) {
    return `${location.lng.toFixed(6)}:${location.lat.toFixed(6)}`;
  }

  /**
   * Get nearby placements
   */
  _getNearbyPlacements(location, radius = 0.003) {
    const nearby = [];
    for (const placement of this.state.placements.values()) {
      const dist = this._haversineDistance(location, placement.location);
      if (dist <= radius) nearby.push(placement);
    }
    return nearby;
  }

  /**
   * Haversine distance in km
   */
  _haversineDistance(loc1, loc2) {
    const R = 6371;
    const dLat = ((loc2.lat - loc1.lat) * Math.PI) / 180;
    const dLng = ((loc2.lng - loc1.lng) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos((loc1.lat * Math.PI) / 180) * Math.cos((loc2.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Mark grid cells as occupied
   */
  _occupyGridCells(placement) {
    const { location, dimensions = {} } = placement;
    const { width = 1, height = 1 } = dimensions;

    for (let dx = 0; dx < width; dx++) {
      for (let dy = 0; dy < height; dy++) {
        const cellLng = location.lng + dx * this.state.gridSize;
        const cellLat = location.lat + dy * this.state.gridSize;
        const key = `${cellLng.toFixed(6)}:${cellLat.toFixed(6)}`;
        this.state.grid.set(key, placement.id);
      }
    }
  }

  /**
   * Free grid cells
   */
  _freeGridCells(placement) {
    const { location, dimensions = {} } = placement;
    const { width = 1, height = 1 } = dimensions;

    for (let dx = 0; dx < width; dx++) {
      for (let dy = 0; dy < height; dy++) {
        const cellLng = location.lng + dx * this.state.gridSize;
        const cellLat = location.lat + dy * this.state.gridSize;
        const key = `${cellLng.toFixed(6)}:${cellLat.toFixed(6)}`;
        this.state.grid.delete(key);
      }
    }
  }

  /**
   * Get default dimensions for type
   */
  _getDefaultDimensions(type) {
    const defaults = {
      road: { width: 2, height: 1, depth: 0.1 },
      building: { width: 1, height: 1, depth: 0.5 },
      greenZone: { width: 3, height: 3, depth: 0.05 },
      facility: { width: 2, height: 2, depth: 0.3 },
    };
    return defaults[type] || { width: 1, height: 1, depth: 0.1 };
  }

  /**
   * Discretize a polyline into grid cells
   * @private
   */
  _discretizePolyline(waypoints, width = 1) {
    const cells = new Set();
    
    for (let i = 0; i < waypoints.length - 1; i++) {
      const start = waypoints[i];
      const end = waypoints[i + 1];
      
      // Bresenham-like line rasterization
      const steps = Math.max(
        Math.abs(end.lng - start.lng) / this.state.gridSize,
        Math.abs(end.lat - start.lat) / this.state.gridSize
      );
      
      for (let s = 0; s <= steps; s++) {
        const t = steps > 0 ? s / steps : 0;
        const lng = start.lng + (end.lng - start.lng) * t;
        const lat = start.lat + (end.lat - start.lat) * t;
        
        const snapped = this._snapToGrid({ lng, lat, elevation: 0 });
        cells.add(this._getGridKey(snapped));
        
        // Add width
        for (let w = 1; w < width; w++) {
          const wLng = snapped.lng + w * this.state.gridSize;
          cells.add(this._getGridKey({ lng: wLng, lat: snapped.lat, elevation: 0 }));
        }
      }
    }
    
    // Convert keys back to location objects
    return Array.from(cells).map(key => {
      const [lng, lat] = key.split(':').map(parseFloat);
      return { lng, lat, elevation: 0 };
    });
  }

  /**
   * Check for collisions in multi-cell placement
   * @private
   */
  _checkMultiCellCollisions(cells) {
    const collisions = [];
    
    for (const cell of cells) {
      const gridKey = this._getGridKey(cell);
      if (this.state.grid.has(gridKey)) {
        collisions.push(cell);
      }
    }
    
    return {
      hasCollisions: collisions.length > 0,
      collisions,
      count: collisions.length,
    };
  }

  /**
   * Detect collisions for a single placement
   * @private
   */
  _detectCollisions(location, dimensions = {}) {
    const { width = 1, height = 1 } = dimensions;
    const collisions = [];
    
    for (let dx = 0; dx < width; dx++) {
      for (let dy = 0; dy < height; dy++) {
        const cellLng = location.lng + dx * this.state.gridSize;
        const cellLat = location.lat + dy * this.state.gridSize;
        const key = `${cellLng.toFixed(6)}:${cellLat.toFixed(6)}`;
        
        if (this.state.grid.has(key)) {
          collisions.push({ lng: cellLng, lat: cellLat });
        }
      }
    }
    
    return collisions;
  }

  /**
   * Add entry to history with undo/redo support
   * @private
   */
  _pushHistory(entry) {
    // Remove any redo history if we're making a new action
    if (this.state.historyIndex < this.state.history.length - 1) {
      this.state.history.splice(this.state.historyIndex + 1);
    }
    
    // Add new entry
    this.state.history.push(entry);
    this.state.historyIndex++;
    
    // Enforce max history depth
    if (this.state.history.length > this._maxHistoryDepth) {
      this.state.history.shift();
      this.state.historyIndex--;
    }
  }

  /**
   * Calculate average impact score for placements
   * @private
   */
  _calculateAveragImpactScore(placements) {
    if (placements.length === 0) return 0;
    
    let totalScore = 0;
    for (const placement of placements) {
      if (placement.impact) {
        const impacts = Object.values(placement.impact).filter(v => typeof v === 'number');
        const score = impacts.reduce((a, b) => a + b, 0);
        totalScore += score;
      }
    }
    
    return totalScore / placements.length;
  }

  /**
   * Subscribe to build events
   */
  on(event, callback) {
    return this.eventBus.on(event, callback);
  }

  /**
   * Get current budget
   */
  getBudget() {
    return this.state.budget;
  }

  /**
   * Set budget
   */
  setBudget(amount) {
    this.state.budget = amount;
    this.eventBus.emit('build:budget-changed', amount);
  }

  /**
   * Cleanup
   */
  destroy() {
    this._destroyed = true;
    this.state.placements.clear();
    this.state.grid.clear();
    this.state.history = [];
    this._impactCache.clear();
    this._validationCache.clear();
    this.eventBus.clear();
  }
}

export default new BuildEngine();
