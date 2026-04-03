// ================================================
// BuildEngine — SimCity-style interactive construction
// Place roads, buildings, green zones with real-time validation
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
 * @property {number} timestamp
 */

export class BuildEngine {
  constructor() {
    this.state = {
      placements: new Map(),           // id -> BuildPlacement
      grid: new Map(),                 // grid cell -> occupied
      gridSize: 0.001,                 // 1 grid cell ≈ 111 meters at equator
      budget: 1000000,                 // in-game currency
      validationMode: 'strict',        // 'strict' | 'lenient'
      history: [],                     // placement history for undo
      isBuilding: false,
      previewPlacement: null,          // current preview before confirmation
    };

    this.eventBus = EventBus;
    this._placementIdCounter = 0;
    this._destroyed = false;
    this._impactCache = new Map();    // placement -> impact
    this._validationCache = new Map();
  }

  /**
   * Create a preview of placement before confirming
   * @param {object} params — { type, location, dimensions }
   * @returns {Promise<object>}
   */
  async previewPlacement(params = {}) {
    if (this._destroyed) return null;

    const { type, location, dimensions } = params;

    // Validate basic params
    if (!type || !location || !location.lng || !location.lat) {
      throw new Error('Invalid placement params');
    }

    // Snap to grid
    const snappedLocation = this._snapToGrid(location);

    // Check if cell is occupied
    const gridKey = this._getGridKey(snappedLocation);
    const isOccupied = this.state.grid.has(gridKey);

    // Compute costs
    const cost = this._computePlacementCost(type, dimensions);
    const canAfford = this.state.budget >= cost;

    // Estimate impact (without full simulation)
    const impact = this._estimateImpact(type, snappedLocation, dimensions);

    const preview = {
      id: `preview-${Date.now()}`,
      type,
      location: snappedLocation,
      dimensions: dimensions || this._getDefaultDimensions(type),
      cost,
      canAfford,
      isOccupied,
      isValid: !isOccupied && canAfford,
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

      // Add to history for undo
      this.state.history.push({
        action: 'place',
        placement,
        timestamp: Date.now(),
      });

      // Emit events
      this.eventBus.emit('build:confirmed', placement);
      this.eventBus.emit('build:budget-changed', this.state.budget);

      log.info(`Placed ${placement.type} at (${placement.location.lng}, ${placement.location.lat})`);

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
   * Undo last placement
   */
  async undo() {
    if (this._destroyed || this.state.history.length === 0) return;

    const lastEntry = this.state.history.pop();
    if (lastEntry.action === 'place') {
      const { placement } = lastEntry;

      // Free grid cells
      this._freeGridCells(placement);

      // Remove placement
      this.state.placements.delete(placement.id);

      // Refund budget
      this.state.budget += placement.cost;

      this.eventBus.emit('build:undone', placement);
      this.eventBus.emit('build:budget-changed', this.state.budget);

      log.info(`Undone placement ${placement.id}`);
    }
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
   * Compute placement cost based on type and size
   */
  _computePlacementCost(type, dimensions = {}) {
    const { width = 1, height = 1, depth = 1 } = dimensions;
    const volume = width * height * depth;

    const baseCosts = {
      road: 100,       // per grid cell
      building: 50000,
      greenZone: 5000,
      facility: 100000,
    };

    const baseCost = baseCosts[type] || 50000;
    return Math.round(baseCost * volume * (0.8 + Math.random() * 0.4)); // Price variation
  }

  /**
   * Estimate impact without full simulation
   */
  _estimateImpact(type, location, dimensions = {}) {
    const baseImpacts = {
      road: { traffic: -15, accessibility: 20, cost: 1 },
      building: { population: 500, heat: 8, cost: 50 },
      greenZone: { heat: -12, flood: -8, livability: 15 },
      facility: { accessibility: 18, population: 0, health: 10 },
    };

    const impact = baseImpacts[type] || {};

    // Add location-based variance
    const variant = (Math.random() - 0.5) * 0.2;
    for (const key in impact) {
      impact[key] = Math.round(impact[key] * (1 + variant));
    }

    return impact;
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
