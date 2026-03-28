self.onmessage = (event) => {
  const { center, rainIntensity, waterLevel, mapBounds, terrainMetrics } = event.data;

  const elevationFactor = terrainMetrics?.elevation ?? 0;
  const slopeFactor = terrainMetrics?.slope ?? 0;
  const drainageBonus = terrainMetrics?.drainage ?? 0;

  const features = [];
  const radius = Math.min(0.02, (waterLevel + rainIntensity / 200) * 0.02);
  const step = Math.max(0.0004, radius / 18);

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