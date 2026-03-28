// ================================================
// impactWorker.js — Impact Model off the main thread
// Receives calc params via postMessage, returns result.
// ================================================

self.onmessage = (event) => {
  const {
    year,
    baseYear = 2025,
    populationBase,
    populationGrowthRate = 1.6,
    aqi = 0,
    rainfallMm = 0,
    trafficCongestion = 0,
    floodRisk = 0,
    worldBank = {},
  } = event.data;

  // ── Safety checks ──
  const safePopulationBase =
    Number.isFinite(populationBase) && populationBase > 0
      ? populationBase
      : 28_000_000;

  const yearsElapsed = Math.max(0, year - baseYear);

  // ── Population ──
  const population =
    safePopulationBase *
    Math.pow(1 + populationGrowthRate / 100, yearsElapsed);

  // ── Exposure factors ──
  const aqiFactor = Math.min(aqi / 300, 1);
  const rainFactor = Math.min(rainfallMm / 50, 1);
  const trafficFactor = Math.min(trafficCongestion, 1);

  const exposure =
    0.45 * aqiFactor +
    0.30 * rainFactor +
    0.25 * trafficFactor;

  const peopleAffected = Math.round(population * exposure * 0.25);

  // ── Economic loss ──
  const gdpPerCapita = Number(worldBank?.gdpPerCapita?.value) || 2500;
  const productivityLossCr = (peopleAffected * gdpPerCapita * 0.002) / 1e7;
  const infrastructureLossCr = floodRisk * 1200;
  const timeMultiplier = 1 + yearsElapsed * 0.06;

  const economicLossCr = Math.min(
    2500,
    Math.round((productivityLossCr + infrastructureLossCr) * timeMultiplier)
  );

  // ── Risk label ──
  let risk = 'Low 🟡';
  if (aqi >= 250 || economicLossCr > 1500 || exposure > 0.65) {
    risk = 'Severe 🔴';
  } else if (aqi >= 150 || economicLossCr > 600 || exposure > 0.45) {
    risk = 'Moderate 🟠';
  }

  self.postMessage({
    population: Math.round(population),
    peopleAffected,
    economicLossCr,
    exposure: Number(exposure.toFixed(2)),
    risk,
  });
};
