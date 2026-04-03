self.onmessage = (event) => {
  const { center, rainIntensity, waterLevel, mapBounds, terrainMetrics, quality = 'medium', perfMode = 'balanced' } = event.data;

  const elevationFactor = terrainMetrics?.elevation ?? 0;
  const slopeFactor = terrainMetrics?.slope ?? 0;
  const drainageBonus = terrainMetrics?.drainage ?? 0;

  const features = [];

  // Adaptive sampling based on quality hint from main thread
  // 'low'  → coarser grid, fewer points
  // 'high'/'ultra' → finer grid, more detail
  const isLow = quality === 'low';
  const isHigh = quality === 'high' || quality === 'ultra';

  const radius = Math.min(0.02, (waterLevel + rainIntensity / 200) * 0.02);
  let step = Math.max(0.0004, radius / (isHigh ? 22 : isLow ? 12 : 18));
  let maxPoints = isLow ? 900 : isHigh ? 2600 : 2000;
  if (perfMode === 'low') maxPoints = Math.min(maxPoints, 700);
  if (perfMode === 'high') maxPoints = Math.max(maxPoints, 2600);
  const span = radius * 2;
  const estimatedSteps = Math.max(1, Math.ceil(span / step));
  if (estimatedSteps * estimatedSteps > maxPoints) {
    const cappedSteps = Math.max(2, Math.floor(Math.sqrt(maxPoints)));
    step = Math.max(step, span / cappedSteps);
  }

  for (let dx = -radius; dx <= radius; dx += step) {
    for (let dy = -radius; dy <= radius; dy += step) {
      const lng = center[0] + dx;
      const lat = center[1] + dy;

      if (lng < mapBounds.getWest() || lng > mapBounds.getEast() || lat < mapBounds.getSouth() || lat > mapBounds.getNorth()) {
        continue;
      }

      const distance = Math.sqrt(dx * dx + dy * dy);
      const baseDepth = rainIntensity * 0.018 + waterLevel * 0.2;
      const terrainModifier = Math.max(0.4, 1 - slopeFactor * 0.25 - drainageBonus * 0.2 + Math.max(0, 1 - elevationFactor / 1500) * 0.15);
      const depth = Math.max(0, baseDepth * terrainModifier * Math.max(0, 1 - distance / radius));

      if (depth > 0.02) {
        const riskScore = depth * (1 + Math.max(0, 0.5 - drainageBonus));
        const colorRisk = riskScore > 1.2 ? 'high' : riskScore > 0.6 ? 'medium' : 'low';
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lng, lat] },
          properties: { depth, risk: colorRisk }
        });
      }
    }
  }

  self.postMessage({ features });
};