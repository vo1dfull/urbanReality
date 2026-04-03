// ================================================
// CityBrain — Rule-based urban intelligence (ML-ready)
// Combines GIS layer state, realtime signals, simulation outputs
// ================================================

/** @typedef {Object} GisSignals
 * @property {Record<string, boolean>} [layers] — flood, traffic, aqi, hospitals, etc.
 * @property {string} [mapStyle] — default | terrain | satellite
 * @property {Record<string, boolean>} [terrainSubLayers]
 */

/** @typedef {Object} RealtimeSignals
 * @property {number} [aqi]
 * @property {number} [rainfallMm]
 * @property {number} [pm25]
 */

/** @typedef {Object} SimulationSignals
 * @property {number} [year]
 * @property {object} [outputs] — from SimulationEngine worker
 */

/** @typedef {Object} FacilitySignals
 * @property {number} [hospitals]
 * @property {number} [policeStations]
 * @property {number} [fireStations]
 * @property {number} [schools]
 */

/** @typedef {Object} UrbanContextInput
 * @property {GisSignals} [gis]
 * @property {RealtimeSignals} [realtime]
 * @property {SimulationSignals} [simulation]
 * @property {FacilitySignals} [facilities]
 * @property {object} [demographics] — population, growthRate
 * @property {object} [impact] — risk 0–1, peopleAffected, economicLossCr
 * @property {number} [population]
 * @property {number} [areaKm2] — optional service-area size for density
 */

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const clamp100 = (v) => Math.max(0, Math.min(100, Math.round(v)));

/** @typedef {Object} UrbanReport
 * @property {string} executiveSummary
 * @property {{livability: number, risk: number, resilience: number, infrastructure: number}} scores
 * @property {{id: string, type: 'flood'|'heat'|'health'|'infra', severity: number, description: string}[]} topRisks
 * @property {{id: string, type: string, priority: number, description: string}[]} topOpportunities
 * @property {{year: number, population: number, riskTrend: number}[]} fiveYearProjection
 */

/** @typedef {Object} ResilienceScore
 * @property {number} floodResilience
 * @property {number} heatResilience
 * @property {number} infraRedundancy
 * @property {number} socialResilience
 * @property {number} composite
 */

/** @typedef {Object} Anomaly
 * @property {number} index
 * @property {string[]} anomalousFields
 * @property {Record<string, {value: number, zscore: number}>} details
 */

export class CityBrain {
  constructor() {
    // Rule weight constants — adjustable through training
    this._weights = {
      floodExposure: 32,
      heatExposure: 22,
      infraStrain: 18,
      facilityGap: 16,
      growthPressure: 12,
    };

    // Historical data for anomaly detection
    this._featureHistory = [];
    this._maxHistorySize = 100;

    // Training history for weight adjustment
    this._trainingHistory = [];
  }
  /**
   * Legacy zone suitability (terrain metrics).
   */
  evaluateZone(metrics = {}) {
    const slopeFactor = metrics.slope ?? 0;
    const drainageFactor = metrics.drainage ?? 0;
    const heatFactor = metrics.heat ?? 0;
    const elevationFactor = metrics.elevation ?? 0;

    const livability = Math.max(
      0,
      Math.min(
        1,
        0.5 + drainageFactor * 0.35 - slopeFactor * 0.12 - heatFactor * 0.08 + (elevationFactor / 2000) * 0.05
      )
    );

    const infraStress = Math.max(0, slopeFactor * 0.2 + (1 - drainageFactor) * 0.4 + heatFactor * 0.25);
    const economicPotential = Math.max(0, 1 - slopeFactor * 0.1 + drainageFactor * 0.2 - heatFactor * 0.05);

    return {
      livabilityScore: Math.round(livability * 100),
      infraStress: Math.round(infraStress * 100),
      economicPotential: Math.round(economicPotential * 100),
    };
  }

  forecastPopulation(basePopulation = 100000, years = 10, growthRate = 0.02) {
    return Math.round(basePopulation * Math.pow(1 + growthRate, years));
  }

  computeEconomicImpact({ population = 0, risk = 0, infrastructure = 0 }) {
    return Math.round(population * 0.0001 * (1 + risk) * (1 + (1 - infrastructure)));
  }

  /**
   * Main intelligence pipeline: GIS + realtime + simulation → insights & scores.
   * @param {UrbanContextInput} input
   * @param {UrbanContextInput} [previousContext] — for delta calculation
   * @returns {{
   *   insights: { id: string, severity: 'info'|'warn'|'critical', text: string }[],
   *   recommendations: { id: string, priority: number, text: string }[],
   *   scores: { livability: number, risk: number },
   *   summary: string,
   *   features: Record<string, number>,
   *   delta?: Record<string, number>
   * }}
   */
  analyzeUrbanContext(input = {}, previousContext = null) {
    const gis = input.gis || {};
    const layers = gis.layers || {};
    const realtime = input.realtime || {};
    const sim = input.simulation || {};
    const simOut = sim.outputs || {};
    const facilities = input.facilities || {};
    const demo = input.demographics || {};
    const impact = input.impact || {};

    const population = Number(input.population ?? demo.population ?? simOut.populationGrowth?.current ?? 100000);
    const floodRisk = Number(impact.risk ?? 0.25);
    const aqi = Number(realtime.aqi ?? 75);
    const rainfallMm = Number(realtime.rainfallMm ?? 0);

    const infraStressPct = Number(simOut.infrastructureStress ?? 0) / 100;
    const envPct = Number(simOut.environmentalChanges ?? 55) / 100;
    const simFlood = Number(simOut.riskLevels?.flood ?? 0) / 100;
    const simHeat = Number(simOut.riskLevels?.heat ?? 0) / 100;
    const simHealth = Number(simOut.riskLevels?.health ?? 0) / 100;

    const hospitals = facilities.hospitals ?? 0;
    const police = facilities.policeStations ?? 0;
    const fire = facilities.fireStations ?? 0;
    const schools = facilities.schools ?? 0;

    const hospitalsPer100k = population > 0 ? (hospitals / population) * 100000 : 0;
    const growthRate = Number(demo.growthRate ?? 1.5);

    // Feature vector (0–1) — plug ML model here later
    const features = {
      floodExposure: clamp01(0.5 * floodRisk + 0.3 * simFlood + (rainfallMm / 80) * 0.15 + (layers.flood ? 0.05 : 0)),
      heatExposure: clamp01((aqi / 200) * 0.6 + simHeat * 0.35 + (layers.aqi ? 0.05 : 0)),
      infraStrain: clamp01(infraStressPct + (1 - envPct) * 0.2 + (layers.traffic ? 0.08 : 0)),
      facilityGap: clamp01(Math.max(0, 2.5 - hospitalsPer100k) / 2.5),
      growthPressure: clamp01((growthRate - 0.5) / 4 + (simOut.populationGrowth?.growthRatePct > 2 ? 0.15 : 0)),
    };

    const riskScore = clamp100(
      features.floodExposure * this._weights.floodExposure +
        features.heatExposure * this._weights.heatExposure +
        features.infraStrain * this._weights.infraStrain +
        features.facilityGap * this._weights.facilityGap +
        features.growthPressure * this._weights.growthPressure
    );

    const livabilityScore = clamp100(
      100 -
        riskScore * 0.45 -
        features.heatExposure * 15 -
        features.facilityGap * 12 +
        (envPct > 0.5 ? 8 : 0) +
        (hospitalsPer100k > 1.2 ? 6 : 0)
    );

    // Store features for anomaly detection
    this._featureHistory.push(features);
    if (this._featureHistory.length > this._maxHistorySize) {
      this._featureHistory.shift();
    }

    // Calculate delta if previousContext provided
    let delta = null;
    if (previousContext) {
      const prevResult = this.analyzeUrbanContext(previousContext, null);
      delta = {
        livability: livabilityScore - prevResult.scores.livability,
        risk: riskScore - prevResult.scores.risk,
        floodExposure: features.floodExposure - prevResult.features.floodExposure,
        heatExposure: features.heatExposure - prevResult.features.heatExposure,
        infraStrain: features.infraStrain - prevResult.features.infraStrain,
        facilityGap: features.facilityGap - prevResult.features.facilityGap,
        growthPressure: features.growthPressure - prevResult.features.growthPressure,
      };
    }

    const insights = [];

    if (features.floodExposure > 0.45 || floodRisk > 0.5) {
      insights.push({
        id: 'flood-risk',
        severity: features.floodExposure > 0.65 ? 'critical' : 'warn',
        text: 'High flood risk in this area — water and terrain signals align with elevated exposure.',
      });
    }

    if (hospitalsPer100k < 1.0 && population > 50000) {
      insights.push({
        id: 'hospital-shortage',
        severity: 'warn',
        text: 'Hospital shortage relative to population — coverage is below typical urban benchmarks.',
      });
    }

    if (growthRate > 2.2 || features.growthPressure > 0.55) {
      insights.push({
        id: 'high-growth',
        severity: 'info',
        text: 'High growth zone — demographic and simulation trends indicate rising service demand.',
      });
    }

    if (aqi > 150) {
      insights.push({
        id: 'air-quality',
        severity: 'warn',
        text: 'Poor air quality may compound health risk during heat and flood stress events.',
      });
    }

    if (!insights.length) {
      insights.push({
        id: 'stable',
        severity: 'info',
        text: 'No critical urban stress patterns detected for current signals — continue monitoring.',
      });
    }

    const recommendations = [];

    if (features.floodExposure > 0.35) {
      recommendations.push({
        id: 'mitigate-flood',
        priority: 1,
        text: 'Reduce risk: prioritize drainage upgrades, retention basins, and flood-aware zoning.',
      });
    }

    if (features.facilityGap > 0.4) {
      recommendations.push({
        id: 'build-health',
        priority: 2,
        text: 'Build infrastructure: add hospital or clinic capacity in underserved catchments.',
      });
    }

    if (features.infraStrain > 0.45) {
      recommendations.push({
        id: 'relieve-infra',
        priority: 2,
        text: 'Relieve infrastructure stress: stagger peak loads and expand transit / road redundancy.',
      });
    }

    if (features.growthPressure > 0.5) {
      recommendations.push({
        id: 'plan-growth',
        priority: 3,
        text: 'Plan for growth: align utilities and schools with projected population trajectory.',
      });
    }

    if (!recommendations.length) {
      recommendations.push({
        id: 'maintain',
        priority: 5,
        text: 'Maintain monitoring and periodic resilience drills.',
      });
    }

    recommendations.sort((a, b) => a.priority - b.priority);

    const summary = this._buildSummary(insights, livabilityScore, riskScore);

    const result = {
      insights,
      recommendations,
      scores: {
        livability: livabilityScore,
        risk: riskScore,
      },
      summary,
      features,
    };

    if (delta) {
      result.delta = delta;
    }

    return result;
  }

  _buildSummary(insights, livability, risk) {
    const top = insights[0]?.text || 'Urban context analyzed.';
    return `${top} Livability ${livability}/100 · Risk ${risk}/100.`;
  }

  /**
   * Adjust rule weights based on historical outcomes.
   * This is a simple gradient-free update: if prediction matched reality (+1), increase weight;
   * if not (-1), decrease weight. This is NOT true ML — just a heuristic adjustment.
   * @param {Array<{input: UrbanContextInput, actualRiskScore: number}>} records
   */
  trainOnHistoricalData(records = []) {
    if (!Array.isArray(records) || records.length === 0) {
      return;
    }

    const learningRate = 0.01;
    const totalRecords = records.length;
    let weightUpdates = {
      floodExposure: 0,
      heatExposure: 0,
      infraStrain: 0,
      facilityGap: 0,
      growthPressure: 0,
    };

    // Compute prediction errors and accumulate weight adjustments
    for (const record of records) {
      const prediction = this.analyzeUrbanContext(record.input, null);
      const predictedRisk = prediction.scores.risk;
      const actualRisk = Math.min(100, Math.max(0, record.actualRiskScore ?? 50));

      // Error signal: 1 if prediction was close, -1 if far
      const error = Math.abs(predictedRisk - actualRisk);
      const signal = error < 10 ? 1 : (error > 40 ? -1 : 0);

      const features = prediction.features;

      // Adjust weights proportionally to feature contribution and signal
      weightUpdates.floodExposure += features.floodExposure * signal * learningRate;
      weightUpdates.heatExposure += features.heatExposure * signal * learningRate;
      weightUpdates.infraStrain += features.infraStrain * signal * learningRate;
      weightUpdates.facilityGap += features.facilityGap * signal * learningRate;
      weightUpdates.growthPressure += features.growthPressure * signal * learningRate;

      this._trainingHistory.push({
        error,
        signal,
        predictedRisk,
        actualRisk,
      });
    }

    // Apply averaged weight updates
    const avgUpdates = Object.entries(weightUpdates).reduce((acc, [k, v]) => {
      acc[k] = v / totalRecords;
      return acc;
    }, {});

    // Update weights (clamp to reasonable range)
    for (const [key, delta] of Object.entries(avgUpdates)) {
      this._weights[key] = Math.max(5, Math.min(50, this._weights[key] + delta));
    }
  }

  /**
   * Detect anomalous inputs based on feature deviations (> 2 std dev from rolling mean).
   * @param {UrbanContextInput[]} history
   * @returns {Anomaly[]}
   */
  detectAnomalies(history = []) {
    if (!Array.isArray(history) || history.length < 3) {
      return [];
    }

    const anomalies = [];

    // Compute features for each input
    const featuresList = history.map((input) => {
      const result = this.analyzeUrbanContext(input, null);
      return result.features;
    });

    const featureNames = Object.keys(featuresList[0]);

    for (let i = 0; i < featuresList.length; i += 1) {
      const features = featuresList[i];
      const anomalousFields = [];
      const details = {};

      for (const fieldName of featureNames) {
        // Compute rolling mean and std dev for this field
        const windowSize = Math.min(i + 1, 20);
        const startIdx = Math.max(0, i - windowSize + 1);
        const window = featuresList.slice(startIdx, i);
        const values = window.map((f) => f[fieldName]);

        if (values.length < 2) continue;

        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
        const stdDev = Math.sqrt(variance);

        if (stdDev > 0) {
          const zscore = Math.abs((features[fieldName] - mean) / stdDev);
          details[fieldName] = {
            value: features[fieldName],
            zscore: Math.round(zscore * 100) / 100,
          };

          if (zscore > 2) {
            anomalousFields.push(`${fieldName} (z=${Math.round(zscore * 10) / 10})`);
          }
        }
      }

      if (anomalousFields.length > 0) {
        anomalies.push({
          index: i,
          anomalousFields,
          details,
        });
      }
    }

    return anomalies;
  }

  /**
   * Compute a composite resilience score across four dimensions.
   * @param {UrbanContextInput} input
   * @returns {ResilienceScore}
   */
  computeResilienceScore(input = {}) {
    const facilities = input.facilities || {};
    const demo = input.demographics || {};
    const realtime = input.realtime || {};
    const sim = input.simulation?.outputs || {};
    const population = input.population ?? demo.population ?? 100000;
    const areaKm2 = input.areaKm2 ?? 10;

    // 1. Flood Resilience: drainage + retention + early warning
    const floodResilience = clamp100(
      (1 - (realtime.rainfallMm ?? 0) / 100) * 100 * 0.4 +
        (sim.floodMitigation ?? 0.5) * 100 * 0.6
    );

    // 2. Heat Resilience: green cover + temperature regulation + heat warning systems
    const heatResilience = clamp100(
      (sim.greenCoverPct ?? 20) * 2 + // Green areas contribute proportionally
        (100 - (realtime.aqi ?? 75)) * 0.5 // Air quality indicator
    );

    // 3. Infrastructure Redundancy: backup systems, network connectivity
    const infraRedundancy = clamp100(
      (1 - (sim.infrastructureStress ?? 50) / 100) * 100 * 0.7 +
        (facilities.fireStations ?? 0) / ((population / 100000) + 1) * 10 * 0.3
    );

    // 4. Social Resilience: hospital density + school coverage + community capacity
    const hospitalDensity = population > 0 ? (facilities.hospitals / population) * 100000 : 0;
    const schoolDensity = population > 0 ? (facilities.schools / population) * 100000 : 0;
    const socialResilience = clamp100(
      Math.min(hospitalDensity / 2, 30) * 2 +
        Math.min(schoolDensity / 4, 20) * 2 +
        (demo.growthRate ?? 1.5) < 3 ? 40 : 20 // Stable growth indicates resilience
    );

    // Composite: weighted average
    const composite = clamp100(
      floodResilience * 0.25 +
        heatResilience * 0.25 +
        infraRedundancy * 0.25 +
        socialResilience * 0.25
    );

    return {
      floodResilience,
      heatResilience,
      infraRedundancy,
      socialResilience,
      composite,
    };
  }

  /**
   * Generate a comprehensive urban report with Executive Summary, scores, risks, opportunities, and projections.
   * @param {UrbanContextInput} input
   * @returns {UrbanReport}
   */
  generateUrbanReport(input = {}) {
    const analysis = this.analyzeUrbanContext(input, null);
    const resilience = this.computeResilienceScore(input);
    const sim = input.simulation?.outputs || {};
    const demo = input.demographics || {};
    const population = input.population ?? demo.population ?? 100000;

    // Executive Summary
    const topInsight = analysis.insights[0] || { text: 'Urban context analyzed.' };
    const executiveSummary = `${topInsight.text} This area demonstrates a livability score of ${analysis.scores.livability}/100 and risk score of ${analysis.scores.risk}/100. Overall resilience capacity is ${resilience.composite}/100.`;

    // Top 3 Risks
    const topRisks = [];
    if (analysis.features.floodExposure > 0.35) {
      topRisks.push({
        id: 'flood-risk',
        type: 'flood',
        severity: Math.round(analysis.features.floodExposure * 100),
        description: `Flood risk at ${Math.round(analysis.features.floodExposure * 100)}% exposure level — prioritize drainage and retention.`,
      });
    }
    if (analysis.features.heatExposure > 0.3) {
      topRisks.push({
        id: 'heat-risk',
        type: 'heat',
        severity: Math.round(analysis.features.heatExposure * 100),
        description: `Heat stress exposure at ${Math.round(analysis.features.heatExposure * 100)}% — increase green cover and cooling infrastructure.`,
      });
    }
    if (analysis.features.facilityGap > 0.35) {
      topRisks.push({
        id: 'health-gap',
        type: 'health',
        severity: Math.round(analysis.features.facilityGap * 100),
        description: `Healthcare facility gap at ${Math.round(analysis.features.facilityGap * 100)}% — expand hospital/clinic coverage.`,
      });
    }
    if (analysis.features.infraStrain > 0.4) {
      topRisks.push({
        id: 'infra-strain',
        type: 'infra',
        severity: Math.round(analysis.features.infraStrain * 100),
        description: `Infrastructure strain at ${Math.round(analysis.features.infraStrain * 100)}% — expand redundancy and capacity.`,
      });
    }
    topRisks.sort((a, b) => b.severity - a.severity).splice(3);

    // Top 3 Opportunities
    const topOpportunities = [];
    if (analysis.features.heatExposure < 0.4 && (sim.greenCoverPct ?? 0) < 30) {
      topOpportunities.push({
        id: 'green-expansion',
        type: 'environment',
        priority: 1,
        description: 'Expand urban green cover to boost heat resilience and livability.',
      });
    }
    if (analysis.features.facilityGap > 0.3) {
      topOpportunities.push({
        id: 'health-investment',
        type: 'health',
        priority: 2,
        description: 'Healthcare investment opportunity — high ROI in underserved areas.',
      });
    }
    if (analysis.features.growthPressure > 0.4) {
      topOpportunities.push({
        id: 'planned-growth',
        type: 'development',
        priority: 3,
        description: 'Plan infrastructure alongside population growth to prevent stress.',
      });
    }
    topOpportunities.splice(3);

    // 5-Year Projection
    const growthRate = (demo.growthRate ?? 1.5) / 100;
    const fiveYearProjection = [];
    for (let year = 1; year <= 5; year += 1) {
      const projectedPop = Math.round(population * Math.pow(1 + growthRate, year));
      const riskTrend = Math.min(
        100,
        analysis.scores.risk + (analysis.features.growthPressure * year * 2)
      );
      fiveYearProjection.push({
        year: new Date().getFullYear() + year,
        population: projectedPop,
        riskTrend: Math.round(riskTrend),
      });
    }

    return {
      executiveSummary,
      scores: {
        livability: analysis.scores.livability,
        risk: analysis.scores.risk,
        resilience: resilience.composite,
        infrastructure: Math.round(
          (1 - analysis.features.infraStrain) * 100
        ),
      },
      topRisks,
      topOpportunities,
      fiveYearProjection,
    };
  }

  /**
   * Export analysis results as GeoJSON FeatureCollection for map visualization.
   * @param {UrbanContextInput} input
   * @param {object} result — from analyzeUrbanContext
   * @returns {object} GeoJSON.FeatureCollection
   */
  exportAsGeoJSON(input = {}, result = {}) {
    const center = input.center || [77.2090, 28.6139]; // Default to Delhi
    const areaKm2 = input.areaKm2 ?? 10;

    // Main feature: point at center with all scores
    const mainFeature = {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: center,
      },
      properties: {
        name: input.name || 'Urban Area Analysis',
        timestamp: new Date().toISOString(),
        livability: result.scores?.livability ?? 50,
        risk: result.scores?.risk ?? 50,
        floodExposure: Math.round((result.features?.floodExposure ?? 0) * 100),
        heatExposure: Math.round((result.features?.heatExposure ?? 0) * 100),
        infraStrain: Math.round((result.features?.infraStrain ?? 0) * 100),
        facilityGap: Math.round((result.features?.facilityGap ?? 0) * 100),
        growthPressure: Math.round((result.features?.growthPressure ?? 0) * 100),
        summary: result.summary || 'Urban context analyzed.',
      },
    };

    // Additional features for insights
    const insightFeatures = (result.insights || []).slice(0, 3).map((insight, idx) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [
          center[0] + (idx - 1) * (areaKm2 / 111), // Offset by ~1 deg per km
          center[1],
        ],
      },
      properties: {
        type: 'insight',
        id: insight.id,
        severity: insight.severity,
        text: insight.text,
      },
    }));

    // Recommendation feature
    const recommendations = (result.recommendations || []).slice(0, 3).map((rec, idx) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [
          center[0],
          center[1] + (idx - 1) * (areaKm2 / 111),
        ],
      },
      properties: {
        type: 'recommendation',
        id: rec.id,
        priority: rec.priority,
        text: rec.text,
      },
    }));

    return {
      type: 'FeatureCollection',
      features: [mainFeature, ...insightFeatures, ...recommendations],
      metadata: {
        generatedAt: new Date().toISOString(),
        inputSnapshotSize: Object.keys(input).length,
        analysisVersion: '1.0',
      },
    };
  }
}

export const cityBrain = new CityBrain();
