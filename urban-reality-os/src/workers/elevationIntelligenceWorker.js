self.onmessage = (event) => {
  const { requestId, points, mode } = event.data || {};
  if (!requestId || !Array.isArray(points)) return;

  try {
    const heat = [];
    const risk = [];

    // slope thresholds (degrees-ish proxy; our slope units are relative)
    const riskThreshold = mode === 'slope' ? 20 : 28;
    const heatWeight = mode === 'slope' ? 1 : 0.7;

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const slope = Number(p.slope || 0);
      const variance = Number(p.variance || 0);
      const score = Math.max(0, Math.min(1, (slope / 45) * 0.75 + Math.min(1, variance / 900) * 0.25));

      heat.push({
        type: 'Feature',
        properties: {
          slope,
          aspect: Number(p.aspect || 0),
          variance,
          intensity: Math.max(0, Math.min(1, score * heatWeight)),
        },
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      });

      if (slope >= riskThreshold) {
        const s = Number(p.step || 0.002);
        const lng = p.lng;
        const lat = p.lat;
        risk.push({
          type: 'Feature',
          properties: { slope, variance, risk: slope >= 35 ? 'high' : 'medium' },
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [lng, lat],
              [lng + s, lat],
              [lng + s, lat + s],
              [lng, lat + s],
              [lng, lat],
            ]],
          },
        });
      }
    }

    self.postMessage({
      requestId,
      out: {
        heat: { type: 'FeatureCollection', features: heat },
        risk: { type: 'FeatureCollection', features: risk },
      },
    });
  } catch (err) {
    self.postMessage({ requestId, out: { heat: { type: 'FeatureCollection', features: [] }, risk: { type: 'FeatureCollection', features: [] } } });
  }
};

