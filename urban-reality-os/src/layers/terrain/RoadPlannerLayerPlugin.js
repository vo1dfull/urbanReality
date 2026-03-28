// ================================================
// Road Planner Layer Plugin
// Handles AI-assisted road pathfinding and analysis
// ================================================
import BaseLayerPlugin from '../BaseLayerPlugin';
import { terrainEngine } from '../../engines/TerrainEngine';

const ROAD_COLORS = {
  optimal: '#22c55e',
  good: '#f59e0b',
  poor: '#ef4444'
};

export default class RoadPlannerLayerPlugin extends BaseLayerPlugin {
  constructor() {
    super('terrainRoad');
    this.pathData = { type: 'FeatureCollection', features: [] };
  }

  init(map, data) {
    if (!map) return;
    try {
      this._addSource(map, 'road-path', {
        type: 'geojson',
        data: this.pathData
      });

      this._addLayer(map, {
        id: 'road-path-line',
        type: 'line',
        source: 'road-path',
        paint: {
          'line-color': [
            'match',
            ['get', 'quality'],
            'optimal', ROAD_COLORS.optimal,
            'good', ROAD_COLORS.good,
            'poor', ROAD_COLORS.poor,
            ROAD_COLORS.optimal
          ],
          'line-width': 4,
          'line-opacity': 0.8
        },
        layout: { visibility: data?.visible ? 'visible' : 'none' }
      });

      this.initialized = true;
    } catch (err) {
      console.error('[RoadPlannerLayerPlugin] init error:', err);
    }
  }

  analyzePath(map, path) {
    if (path.length < 2) return null;

    let totalLength = 0;
    let slopeSum = 0;
    let maxSlope = 0;
    let pointCount = 0;

    for (let i = 1; i < path.length; i++) {
      const prev = path[i - 1];
      const curr = path[i];
      const distance = Math.sqrt(Math.pow(curr[0] - prev[0], 2) + Math.pow(curr[1] - prev[1], 2));
      totalLength += distance;

      const metrics = terrainEngine.getTerrainMetrics(map, { lng: curr[0], lat: curr[1] });
      slopeSum += metrics.slope;
      maxSlope = Math.max(maxSlope, metrics.slope);
      pointCount++;
    }

    const avgSlope = slopeSum / pointCount;
    let quality = 'optimal';
    let issues = [];

    if (maxSlope > 30) {
      quality = 'poor';
      issues.push('Steep sections detected');
    } else if (maxSlope > 15) {
      quality = 'good';
      issues.push('Moderate slopes');
    }

    if (avgSlope > 20) {
      quality = quality === 'optimal' ? 'good' : 'poor';
      issues.push('High average slope');
    }

    return {
      totalLength: totalLength * 111000,
      avgSlope: Math.round(avgSlope * 10) / 10,
      maxSlope: Math.round(maxSlope * 10) / 10,
      quality,
      issues,
      costEstimate: Math.round(totalLength * 111000 * (1 + avgSlope / 100) * 50)
    };
  }

  suggestAlternativeRoute(map, start, end) {
    const gridSize = 0.001;
    const maxIterations = 100;
    let iterations = 0;

    const path = [start];
    let current = [...start];
    const visited = new Set();

    while (iterations < maxIterations) {
      const key = `${current[0].toFixed(4)},${current[1].toFixed(4)}`;
      if (visited.has(key)) break;
      visited.add(key);

      const distanceToEnd = Math.sqrt(Math.pow(current[0] - end[0], 2) + Math.pow(current[1] - end[1], 2));
      if (distanceToEnd < gridSize) {
        path.push(end);
        break;
      }

      const directions = [
        [gridSize, 0], [0, gridSize], [-gridSize, 0], [0, -gridSize],
        [gridSize, gridSize], [gridSize, -gridSize], [-gridSize, gridSize], [-gridSize, -gridSize]
      ];

      let bestNext = null;
      let bestScore = Infinity;

      for (const [dx, dy] of directions) {
        const next = [current[0] + dx, current[1] + dy];
        const metrics = terrainEngine.getTerrainMetrics(map, { lng: next[0], lat: next[1] });
        const distanceCost = Math.sqrt(dx * dx + dy * dy);
        const slopeCost = metrics.slope * 10;
        const totalCost = distanceCost + slopeCost;

        if (totalCost < bestScore) {
          bestScore = totalCost;
          bestNext = next;
        }
      }

      if (!bestNext) break;
      path.push(bestNext);
      current = bestNext;
      iterations++;
    }

    return path.length > 1 ? path : null;
  }

  updatePath(map, pathCoordinates, quality = 'optimal') {
    if (!map) return;
    this.pathData = {
      type: 'FeatureCollection',
      features: pathCoordinates.length > 1 ? [{
        type: 'Feature',
        properties: { quality },
        geometry: { type: 'LineString', coordinates: pathCoordinates }
      }] : []
    };

    if (map.getSource('road-path')) {
      map.getSource('road-path').setData(this.pathData);
    }
  }

  clearPath(map) {
    this.updatePath(map, [], 'optimal');
  }
}
