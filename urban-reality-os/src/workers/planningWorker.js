// ================================================
// Planning Worker — RL-style strategy simulation
// Evaluates actions, computes rewards, recommends placements
// ================================================

self.onmessage = async (event) => {
  const { requestId, type, action, cityState, rewardWeights, buildingType, numStrategies } = event.data || {};

  try {
    let result = null;

    switch (type) {
      case 'simulateAction':
        result = simulateAction(action, cityState, rewardWeights);
        break;
      case 'planStrategy':
        result = planOptimalStrategy(cityState, numStrategies, rewardWeights);
        break;
      case 'recommendPlacement':
        result = recommendPlacement(cityState, buildingType, rewardWeights);
        break;
      case 'getHeatmap':
        result = generateOptimizationHeatmap(cityState, buildingType);
        break;
      default:
        throw new Error(`Unknown planning type: ${type}`);
    }

    self.postMessage({ requestId, type, result });
  } catch (error) {
    self.postMessage({ requestId, type, error: error.message });
  }
};

/**
 * Simulate single action and compute reward
 */
function simulateAction(action = {}, cityState = {}, rewardWeights = {}) {
  const { type, location } = action;
  const { terrain = {}, heat = 0.5, floodRisk = 0.3 } = cityState;

  // Compute metrics after placement
  const metrics = {
    accessibility: 0,
    heatReduction: 0,
    floodMitigation: 0,
    livability: 0,
  };

  // Simulate impact based on action type
  switch (type) {
    case 'road':
      // Roads improve accessibility
      metrics.accessibility = 0.3 + (0.3 * (location?.proximity || 0.5));
      metrics.livability = 0.15;
      break;

    case 'greenZone':
      // Parks reduce heat, improve livability
      metrics.heatReduction = 0.35 + (0.2 * (1 - heat));
      metrics.livability = 0.4;
      metrics.floodMitigation = 0.15; // vegetation absorbs water
      break;

    case 'facility':
      // Facilities improve accessibility and livability
      metrics.accessibility = 0.25;
      metrics.livability = 0.35;
      break;

    case 'building':
      // Buildings may reduce livability if too dense
      metrics.accessibility = 0.1;
      metrics.livability = Math.max(0, 0.2 - (cityState.density || 0) * 0.3);
      break;
  }

  // Compute weighted reward
  const weights = rewardWeights || { accessibility: 0.3, heatReduction: 0.25, floodMitigation: 0.2, livability: 0.25 };
  const reward = weights.accessibility * metrics.accessibility +
                 weights.heatReduction * metrics.heatReduction +
                 weights.floodMitigation * metrics.floodMitigation +
                 weights.livability * metrics.livability;

  return {
    action,
    reward: Math.round(reward * 100),
    metrics: Object.fromEntries(
      Object.entries(metrics).map(([k, v]) => [k, Math.round(v * 100)])
    ),
    impacts: [
      { type: 'accessibility', delta: metrics.accessibility },
      { type: 'heat', delta: -metrics.heatReduction },
      { type: 'floodRisk', delta: -metrics.floodMitigation },
      { type: 'livability', delta: metrics.livability },
    ],
  };
}

/**
 * Plan optimal strategy by evaluating multiple action sequences
 */
function planOptimalStrategy(cityState = {}, numStrategies = 5, rewardWeights = {}) {
  const strategies = [];
  const actionTypes = ['road', 'greenZone', 'facility'];

  for (let i = 0; i < numStrategies; i++) {
    const strategy = {
      id: i,
      actions: [],
      totalReward: 0,
      description: '',
    };

    // Generate random strategy (3-5 actions)
    const numActions = 3 + Math.floor(Math.random() * 3);
    let cumulativeReward = 0;

    for (let j = 0; j < numActions; j++) {
      const actionType = actionTypes[Math.floor(Math.random() * actionTypes.length)];
      const action = {
        type: actionType,
        location: {
          lng: -74.006 + Math.random() * 0.1,
          lat: 40.7128 + Math.random() * 0.1,
          proximity: Math.random(),
        },
      };

      const result = simulateAction(action, cityState, rewardWeights);
      strategy.actions.push(action);
      cumulativeReward += result.reward;
    }

    strategy.totalReward = Math.round(cumulativeReward / numActions);
    strategy.description = generateStrategyDescription(strategy.actions);
    strategies.push(strategy);
  }

  // Sort by reward (best first)
  strategies.sort((a, b) => b.totalReward - a.totalReward);

  return {
    strategies: strategies.slice(0, 10), // Top 10 strategies
    bestStrategy: strategies[0],
    recommendation: `Strategy ${strategies[0].id}: ${strategies[0].description} (Score: ${strategies[0].totalReward})`,
  };
}

/**
 * Recommend placement locations for a building type
 */
function recommendPlacement(cityState = {}, buildingType = 'park', rewardWeights = {}) {
  const recommendations = [];
  const NUM_CANDIDATES = 15;

  for (let i = 0; i < NUM_CANDIDATES; i++) {
    const candidate = {
      id: i,
      location: {
        lng: -74.006 + Math.random() * 0.2,
        lat: 40.7128 + Math.random() * 0.2,
        proximity: Math.random(),
        elevation: 0 + Math.random() * 100,
      },
      suitability: 0,
      impacts: {},
    };

    // Score this candidate
    const suitabilityFactors = {
      park: [
        ('accessibility', 0.3),
        ('flatTerrain', 0.2),
        ('lowDensity', 0.25),
        ('heatReduction', 0.25),
      ],
      road: [
        ('accessibility', 0.4),
        ('connectivity', 0.3),
        ('flatTerrain', 0.15),
        ('economicPotential', 0.15),
      ],
      facility: [
        ('accessibility', 0.35),
        ('proximity', 0.25),
        ('population', 0.2),
        ('infrastructure', 0.2),
      ],
    };

    let score = 0;
    for (const [factor, weight] of (suitabilityFactors[buildingType] || [])) {
      const factorScore = Math.random(); // In real system, would compute from cityState
      score += factorScore * weight;
    }

    candidate.suitability = Math.round(score * 100);

    // Simulate impacts
    const action = { type: buildingType, location: candidate.location };
    const result = simulateAction(action, cityState, rewardWeights);
    candidate.impacts = result.metrics;

    recommendations.push(candidate);
  }

  // Sort by suitability
  recommendations.sort((a, b) => b.suitability - a.suitability);

  return {
    buildingType,
    recommendations: recommendations.slice(0, 10),
    topLocation: recommendations[0],
    explanation: `Best location for ${buildingType} at (${recommendations[0].location.lng.toFixed(4)}, ${recommendations[0].location.lat.toFixed(4)}) with suitability score ${recommendations[0].suitability}`,
  };
}

/**
 * Generate optimization heatmap
 */
function generateOptimizationHeatmap(cityState = {}, buildingType = 'park') {
  const WIDTH = 64;
  const HEIGHT = 64;
  const heatmap = new Uint8Array(WIDTH * HEIGHT);

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      // Compute suitability score for cell [x, y]
      let score = 0.5;

      // Add various factors
      const centerDist = Math.sqrt(Math.pow(x - WIDTH / 2, 2) + Math.pow(y - HEIGHT / 2, 2));
      score -= (centerDist / (WIDTH / 2)) * 0.3; // Prefer central areas for most

      // Add noise variation
      score += (Math.sin(x * 0.1) + Math.sin(y * 0.1)) * 0.15;

      // Building-type specific scoring
      if (buildingType === 'park') {
        // Parks prefer less dense areas (edges)
        score = 1 - score;
      }

      heatmap[y * WIDTH + x] = Math.round(Math.max(0, Math.min(1, score)) * 255);
    }
  }

  return {
    buildingType,
    width: WIDTH,
    height: HEIGHT,
    data: heatmap,
    bounds: {
      north: 40.8228,
      south: 40.7028,
      east: -73.906,
      west: -74.106,
    },
  };
}

/**
 * Helper: generate strategy description
 */
function generateStrategyDescription(actions) {
  const counts = {};
  for (const action of actions) {
    counts[action.type] = (counts[action.type] || 0) + 1;
  }

  const parts = [];
  if (counts.road) parts.push(`${counts.road} roads`);
  if (counts.greenZone) parts.push(`${counts.greenZone} parks`);
  if (counts.facility) parts.push(`${counts.facility} facilities`);

  return parts.join(', ');
}
