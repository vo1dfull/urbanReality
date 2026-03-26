export function calculateEconomicLoss({
  aqi,
  rainfallMm,
  floodRisk,
  trafficCongestion,
  worldBank
}) {
  // --- Base economy ---
  const gdpPerCapita = worldBank?.gdpPerCapita?.value || 2500; // USD
  const population = worldBank?.population?.value || 3e7;

  // Daily GDP loss base
  const dailyGDP = (gdpPerCapita * population) / 365; // USD/day

  // --- Impact multipliers ---
  const aqiLoss = Math.max(0, (aqi - 50) / 300);        // Health & productivity
  const rainLoss = Math.min(rainfallMm / 50, 1);        // Flooding / slowdown
  const floodLoss = floodRisk;                          // Infrastructure damage
  const trafficLoss = Math.min(trafficCongestion, 1);  // Logistics loss

  // --- Weighted loss ---
  const impactFactor =
    0.25 * aqiLoss +
    0.20 * rainLoss +
    0.35 * floodLoss +
    0.20 * trafficLoss;

  // --- Final economic loss ---
  const lossUSD = dailyGDP * impactFactor;

  // Convert to INR Crores (1 USD ≈ 83 INR)
  const lossINR = lossUSD * 83;
  const lossCr = lossINR / 1e7;

  return Math.max(0.1, Math.round(lossCr * 10) / 10); // ₹ Cr
}
