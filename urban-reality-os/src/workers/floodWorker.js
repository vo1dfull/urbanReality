self.onmessage = (event) => {
  const { center, rainIntensity, waterLevel, mapBounds } = event.data;

  const features = [];
  const radius = Math.min(0.02, (waterLevel + rainIntensity / 200) * 0.02);
  const step = radius / 25;

  for (let dx = -radius; dx <= radius; dx += step) {
    for (let dy = -radius; dy <= radius; dy += step) {
      const lng = center[0] + dx;
      const lat = center[1] + dy;

      if (lng < mapBounds.getWest() || lng > mapBounds.getEast() || lat < mapBounds.getSouth() || lat > mapBounds.getNorth()) {
        continue;
      }

      const distance = Math.sqrt(dx * dx + dy * dy);
      const depth = Math.max(0, (rainIntensity * 0.018 + waterLevel * 0.2) * Math.max(0, 1 - distance / radius));

      if (depth > 0.02) {
        const colorRisk = depth > 1.2 ? 'high' : depth > 0.6 ? 'medium' : 'low';
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