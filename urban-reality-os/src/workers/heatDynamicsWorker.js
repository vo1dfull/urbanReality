self.onmessage = (event) => {
  const { requestId, points, year, greenZones, trafficOn } = event.data || {};
  if (!requestId || !Array.isArray(points)) return;

  try {
    const gz = Array.isArray(greenZones) ? greenZones : [];
    const gzParsed = new Array(gz.length);
    for (let i = 0; i < gz.length; i++) {
      const [a, b] = String(gz[i]).split(',');
      gzParsed[i] = [Number(a) / 1000, Number(b) / 1000];
    }

    const features = new Array(points.length);
    const yearOffset = (Number(year) - 2025) * 0.3;
    const trafficBoost = trafficOn ? 1.2 : 0.6;

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const lng = p[0];
      const lat = p[1];
      const elevation = p[2];
      const slope = p[3];
      const built = p[4]; // 0..1

      // Green influence: nearest zone distance (cheap approximation)
      let greenInfluence = 0;
      let best = Infinity;
      for (let j = 0; j < gzParsed.length; j++) {
        const d = dist2(lng, lat, gzParsed[j][0], gzParsed[j][1]);
        if (d < best) best = d;
      }
      if (best < Infinity) {
        // Within ~1.5km-ish (deg^2 proxy) gets strong cooling
        const k = Math.exp(-best / 0.000004);
        greenInfluence = clamp01(k);
      }

      let temperature = 30;
      temperature += built * 8 * trafficBoost;
      temperature -= elevation * 0.005;
      temperature -= slope * 0.1;
      temperature -= (0.2 + 0.8 * greenInfluence) * 5;
      temperature += yearOffset;

      temperature = clamp(temperature, 15, 52);

      features[i] = {
        type: 'Feature',
        properties: { temperature },
        geometry: { type: 'Point', coordinates: [lng, lat] },
      };
    }

    self.postMessage({ requestId, heat: { type: 'FeatureCollection', features } });
  } catch {
    self.postMessage({ requestId, heat: { type: 'FeatureCollection', features: [] } });
  }
};

function dist2(x1, y1, x2, y2) {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return dx * dx + dy * dy;
}
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
function clamp01(v) {
  return clamp(v, 0, 1);
}

