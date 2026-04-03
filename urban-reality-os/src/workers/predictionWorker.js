// ================================================
// Prediction Worker — ML-inspired growth modeling
// Heuristic regression + rule-based scoring
// ================================================

self.onmessage = async (event) => {
  const { requestId, type, scenario, baseline, targetYear, baselineYear, cityData } = event.data || {};
  
  try {
    let result = null;

    switch (type) {
      case 'predictPopulation':
        result = predictPopulationGrowth(baseline, targetYear, baselineYear, scenario);
        break;
      case 'predictSprawl':
        result = predictUrbanSprawl(cityData, targetYear, baselineYear);
        break;
      case 'predictInfrastructure':
        result = predictInfrastructureDemand(baseline, targetYear, baselineYear);
        break;
      case 'predictLandValue':
        result = predictLandValue(baseline, targetYear, baselineYear);
        break;
      default:
        throw new Error(`Unknown prediction type: ${type}`);
    }

    self.postMessage({ requestId, type, result });
  } catch (error) {
    self.postMessage({ requestId, type, error: error.message });
  }
};

/**
 * Predict population growth using exponential model with scenario adjustment
 */
function predictPopulationGrowth(baseline = {}, targetYear, baselineYear, scenario = 'moderate') {
  const { population = 420000, density = 0.6, growthRate = 0.019, infrastructureProximity = 0.5 } = baseline;
  
  const yearsElapsed = Math.max(0, targetYear - baselineYear);
  
  // Scenario multipliers
  const scenarioFactors = {
    conservative: 0.6,   // slower growth
    moderate: 1.0,       // baseline
    aggressive: 1.4,     // faster growth
  };
  
  const factor = scenarioFactors[scenario] || 1.0;
  const adjustedGrowthRate = growthRate * factor;
  
  // Heuristic: infrastructure proximity promotes growth
  const infraBoost = infrastructureProximity * 0.005;
  const effectiveGrowthRate = adjustedGrowthRate + infraBoost;
  
  // Exponential growth model
  const futurePopulation = Math.round(population * Math.pow(1 + effectiveGrowthRate, yearsElapsed));
  
  // Density projection (increases with urbanization)
  const densityGrowth = density * (1 + effectiveGrowthRate * 0.5 * yearsElapsed);
  
  // Land required
  const landRequired = Math.round(futurePopulation / densityGrowth);
  
  // Growth rate per year
  const annualGrowth = (futurePopulation - population) / yearsElapsed || 0;

  return {
    scenario,
    year: targetYear,
    population: futurePopulation,
    density: Math.min(1.0, densityGrowth),
    landRequired,
    annualGrowth: Math.round(annualGrowth),
    growthTrend: computeGrowthTrend(population, futurePopulation, yearsElapsed),
    confidence: Math.min(0.95, 0.5 + yearsElapsed * 0.01), // Higher confidence for near predictions
  };
}

/**
 * Predict urban sprawl expansion zones
 */
function predictUrbanSprawl(cityData = {}, targetYear, baselineYear) {
  const { currentExtent = 1000, terrainSuitability = {} } = cityData;
  const yearsElapsed = Math.max(0, targetYear - baselineYear);
  
  // Base sprawl rate (km²/year) influenced by economic momentum
  const baseSprawlRate = 15;
  const sprawlDistance = baseSprawlRate * yearsElapsed;
  const projectedExtent = currentExtent + sprawlDistance;
  
  // Identify expansion zones based on terrain suitability
  const suitabilityThreshold = 0.6;
  const expandableZones = [];
  
  for (const [zoneName, score] of Object.entries(terrainSuitability || {})) {
    if (score >= suitabilityThreshold) {
      const priority = score > 0.8 ? 'high' : score > 0.7 ? 'medium' : 'low';
      expandableZones.push({
        zone: zoneName,
        priority,
        suitabilityScore: score,
        estimatedDevelopmentYear: baselineYear + Math.round(yearsElapsed * (1 - score)),
      });
    }
  }
  
  // Sort by priority and suitability
  expandableZones.sort((a, b) => b.suitabilityScore - a.suitabilityScore);

  return {
    year: targetYear,
    projectedExtent,
    sprawlDistance,
    expandableZones: expandableZones.slice(0, 10), // Top 10 zones
    sprawlVector: {
      areaSquareKm: projectedExtent,
      durationYears: yearsElapsed,
      avgSprawlRatePerYear: sprawlDistance / yearsElapsed || 0,
    },
  };
}

/**
 * Predict infrastructure capacity demand
 */
function predictInfrastructureDemand(baseline = {}, targetYear, baselineYear) {
  const { population = 420000, existingInfrastructure = 100, coverage = 0.7 } = baseline;
  const yearsElapsed = Math.max(0, targetYear - baselineYear);
  
  // Infrastructure demand proportional to population growth + expansion
  // Multipliers: roads, utilities, transit, water/sanitation
  const demandFactors = {
    roads: 1.2 * (population / 420000),           // 1.2x per capita baseline
    utilities: 1.1 * (population / 420000),       // electricity, gas, water
    publicTransit: 1.4 * (population / 420000),   // transit networks
    waterSanitation: 1.3 * (population / 420000), // water/wastewater systems
  };
  
  const totalDemandIndex = Object.values(demandFactors).reduce((a, b) => a + b, 0) / 4;
  
  // Estimate investment needed (in arbitrary units)
  const investmentRequired = Math.round(totalDemandIndex * existingInfrastructure * (yearsElapsed / 10));
  
  // Coverage improvement potential
  const potentialCoverage = Math.min(0.98, coverage + (0.03 * yearsElapsed / 10));
  
  // Stress level: demand / capacity
  const stressLevel = Math.min(1.0, totalDemandIndex / (coverage * 2));

  return {
    year: targetYear,
    demandFactors,
    totalDemandIndex: Math.round(totalDemandIndex * 100),
    investmentRequired,
    potentialCoverage,
    stressLevel: Math.round(stressLevel * 100),
    criticalGaps: identifyInfraGaps(demandFactors),
  };
}

/**
 * Predict land value appreciation
 */
function predictLandValue(baseline = {}, targetYear, baselineYear) {
  const { currentValue = 100, accessibility = 0.6, amenities = 0.5, risk = 0.2 } = baseline;
  const yearsElapsed = Math.max(0, targetYear - baselineYear);
  
  // Appreciation driven by accessibility + amenities - risk
  const baseAppreciation = 0.035; // 3.5% baseline
  const a11yBoost = accessibility * 0.02;  // accessibility multiplier
  const amenityBoost = amenities * 0.015;  // amenity multiplier
  const riskPenalty = risk * 0.015;        // risk discount
  
  const annualAppreciation = baseAppreciation + a11yBoost + amenityBoost - riskPenalty;
  const futureValue = Math.round(currentValue * Math.pow(1 + annualAppreciation, yearsElapsed));
  
  // Total appreciation
  const totalAppreciation = futureValue - currentValue;
  const appreciationPercent = (totalAppreciation / currentValue) * 100;

  return {
    year: targetYear,
    currentValue,
    futureValue,
    totalAppreciation,
    appreciationPercent: Math.round(appreciationPercent),
    annualAppreciationRate: Math.round(annualAppreciation * 100 * 100) / 100,
    drivers: {
      accessibility: Math.round(a11yBoost * 100),
      amenities: Math.round(amenityBoost * 100),
      riskImpact: Math.round(-riskPenalty * 100),
    },
  };
}

/**
 * Helper: compute growth trend (accelerating/stable/declining)
 */
function computeGrowthTrend(basePop, futurePop, yearsElapsed) {
  if (yearsElapsed === 0) return 'stable';
  
  const avgAnnualGrowth = (futurePop - basePop) / yearsElapsed / basePop;
  const rate = avgAnnualGrowth * 100;
  
  if (rate > 0.03) return 'accelerating';
  if (rate > 0.01) return 'stable';
  if (rate > -0.01) return 'modest';
  return 'declining';
}

/**
 * Helper: identify critical infrastructure gaps
 */
function identifyInfraGaps(demandFactors = {}) {
  const gaps = [];
  const threshold = 1.1; // >110% demand = critical
  
  for (const [infra, demand] of Object.entries(demandFactors)) {
    if (demand > threshold) {
      gaps.push({
        infrastructure: infra,
        demandMultiplier: Math.round(demand * 100),
        priority: demand > 1.3 ? 'critical' : 'high',
      });
    }
  }
  
  return gaps.sort((a, b) => b.demandMultiplier - a.demandMultiplier);
}
