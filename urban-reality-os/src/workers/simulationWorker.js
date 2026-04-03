self.onmessage = (event) => {
  const { requestId, year, baseYear, baseline } = event.data || {};
  if (!Number.isFinite(year)) return;

  const y0 = Number.isFinite(baseYear) ? baseYear : 2025;
  const yearsElapsed = Math.max(0, year - y0);

  const basePopulation = Number(baseline?.population ?? 420000);
  const annualGrowth = Number(baseline?.populationGrowthRate ?? 0.019);
  const infraBase = Number(baseline?.infrastructureCapacity ?? 1.0);
  const envBase = Number(baseline?.environmentIndex ?? 0.55);
  const riskBase = Number(baseline?.baseRisk ?? 0.28);

  // 1) Exponential population model
  const population = Math.round(basePopulation * Math.pow(1 + annualGrowth, yearsElapsed));

  // 2) Simple trend regression proxy for environmental drift
  // y = a + b*x with b derived from baseline pressure
  const envSlope = 0.013 + (1 - envBase) * 0.01;
  const environmentalChanges = clamp01(envBase - envSlope * yearsElapsed);

  // 3) Rule-based infrastructure stress
  const infraDemand = (population / basePopulation) * (1 + yearsElapsed * 0.012);
  const infraCapacity = Math.max(0.4, infraBase - yearsElapsed * 0.01);
  const infrastructureStress = clamp01(infraDemand / infraCapacity - 0.55);

  // 4) Rule-based risk model
  const floodRisk = clamp01(riskBase + infrastructureStress * 0.38 + (1 - environmentalChanges) * 0.22);
  const heatRisk = clamp01(0.22 + yearsElapsed * 0.018 + (1 - environmentalChanges) * 0.24);
  const healthRisk = clamp01(floodRisk * 0.45 + heatRisk * 0.55);
  const overallRisk = clamp01((floodRisk + heatRisk + healthRisk) / 3);

  self.postMessage({
    requestId,
    year,
    output: {
      populationGrowth: {
        current: population,
        growthRatePct: Number((annualGrowth * 100).toFixed(2)),
      },
      infrastructureStress: Number((infrastructureStress * 100).toFixed(1)),
      environmentalChanges: Number((environmentalChanges * 100).toFixed(1)),
      riskLevels: {
        flood: Number((floodRisk * 100).toFixed(1)),
        heat: Number((heatRisk * 100).toFixed(1)),
        health: Number((healthRisk * 100).toFixed(1)),
        overall: Number((overallRisk * 100).toFixed(1)),
      },
    },
  });
};

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}
