const SAMPLE_DELTA = 0.0005;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const computeMetrics = ({ center, east, west, north, south, year = 2026, builtDensity = 0.5 }) => {
  const dx = (east - west) / (2 * SAMPLE_DELTA);
  const dy = (north - south) / (2 * SAMPLE_DELTA);
  const slope = Math.sqrt(dx * dx + dy * dy);
  const aspectRad = Math.atan2(dy, -dx);
  const aspect = (aspectRad * 180 / Math.PI + 360) % 360;
  const mean = (center + east + west + north + south) / 5;
  const variance = ((center - mean) ** 2 + (east - mean) ** 2 + (west - mean) ** 2 + (north - mean) ** 2 + (south - mean) ** 2) / 5;
  const drainage = clamp(1 - slope * 3.5, 0, 1);
  const climateFactor = (year - 2026) * 0.08;
  const heat = clamp(1 + builtDensity * 0.8 - center * 0.002 - slope * 0.18 + climateFactor, 0, 3);
  const baseTerrainCost = Math.round(80 + slope * 35 + Math.max(0, 800 - center) * 0.08);
  const terrainQuality = clamp(1 - slope * 0.015 + drainage * 0.3, 0, 1);

  return {
    elevation: center,
    slope,
    aspect,
    variance,
    drainage,
    heat,
    baseTerrainCost,
    terrainQuality,
    tileScore: Math.round((terrainQuality + drainage) * 50)
  };
};

self.onmessage = (event) => {
  const { id, points } = event.data;

  try {
    const results = points.map(point => computeMetrics(point));
    self.postMessage({ id, results });
  } catch (error) {
    self.postMessage({ id, results: [] });
  }
};
