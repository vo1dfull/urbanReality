export class CityBrain {
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
      economicPotential: Math.round(economicPotential * 100)
    };
  }

  forecastPopulation(basePopulation = 100000, years = 10, growthRate = 0.02) {
    return Math.round(basePopulation * Math.pow(1 + growthRate, years));
  }

  computeEconomicImpact({ population = 0, risk = 0, infrastructure = 0 }) {
    return Math.round(population * 0.0001 * (1 + risk) * (1 + (1 - infrastructure)));
  }
}

export const cityBrain = new CityBrain();
