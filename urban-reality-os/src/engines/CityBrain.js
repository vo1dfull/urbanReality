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

export class CityBrain {
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
   * @returns {{
   *   insights: { id: string, severity: 'info'|'warn'|'critical', text: string }[],
   *   recommendations: { id: string, priority: number, text: string }[],
   *   scores: { livability: number, risk: number },
   *   summary: string,
   *   features: Record<string, number>
   * }}
   */
  analyzeUrbanContext(input = {}) {
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
      features.floodExposure * 32 +
        features.heatExposure * 22 +
        features.infraStrain * 18 +
        features.facilityGap * 16 +
        features.growthPressure * 12
    );

    const livabilityScore = clamp100(
      100 -
        riskScore * 0.45 -
        features.heatExposure * 15 -
        features.facilityGap * 12 +
        (envPct > 0.5 ? 8 : 0) +
        (hospitalsPer100k > 1.2 ? 6 : 0)
    );

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

    return {
      insights,
      recommendations,
      scores: {
        livability: livabilityScore,
        risk: riskScore,
      },
      summary,
      features,
    };
  }

  _buildSummary(insights, livability, risk) {
    const top = insights[0]?.text || 'Urban context analyzed.';
    return `${top} Livability ${livability}/100 · Risk ${risk}/100.`;
  }
}

export const cityBrain = new CityBrain();
