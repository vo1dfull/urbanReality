// ================================================
// PredictionEngine — AI trajectory prediction
// Projects disaster movement 5 steps into the future
// based on current direction, speed, and category trends
// ================================================

/** How many prediction steps to generate */
const PREDICTION_STEPS = 5;

/** Time offset per step in hours */
const HOURS_PER_STEP = 2;

/** Speed scaling per category (degrees per prediction step) */
const PREDICTION_SPEED = {
  wildfires:    0.15,
  floods:       0.08,
  severeStorms: 0.30,
  volcanoes:    0.03,
  drought:      0.02,
};

class PredictionEngine {
  /**
   * Generate future position predictions for a disaster.
   * @param {object} disaster — DisasterEngine disaster state
   * @returns {GeoJSONFeature[]} predicted positions
   */
  predict(disaster) {
    const predictions = [];
    const speed = PREDICTION_SPEED[disaster.category] ?? 0.1;
    const [lng, lat] = disaster.geometry.coordinates;
    const dir = disaster.direction ?? 0;

    for (let i = 1; i <= PREDICTION_STEPS; i++) {
      // Project position along current direction with slight curve
      const curveDrift = (i - 1) * 0.04 * (Math.random() - 0.5);
      const projDir = dir + curveDrift;
      const projLng = lng + Math.cos(projDir) * speed * i;
      const projLat = lat + Math.sin(projDir) * speed * i;

      // Intensity and radius grow over time
      const projIntensity = Math.min(10, (disaster.intensity ?? 1) + i * 0.3);
      const projRadius    = (disaster.radius ?? 20) + i * (disaster.growthRate ?? 0.05) * 10;

      predictions.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [projLng, projLat] },
        properties: {
          ...disaster.properties,
          id:          `${disaster.id}-pred-${i}`,
          predicted:   true,
          timeOffset:  i * HOURS_PER_STEP,
          stepIndex:   i,
          intensity:   projIntensity,
          radius:      projRadius,
          opacity:     1 - (i / (PREDICTION_STEPS + 1)), // fade out further predictions
        },
      });
    }

    return predictions;
  }

  /**
   * Generate predictions for all active disasters.
   * @param {object[]} disasters — array from DisasterEngine.getAll()
   * @returns {{ points: GeoJSONFeatureCollection, paths: GeoJSONFeatureCollection }}
   */
  predictAll(disasters) {
    const pointFeatures = [];
    const pathFeatures  = [];

    for (const disaster of disasters) {
      const preds = this.predict(disaster);
      pointFeatures.push(...preds);

      // Build a LineString connecting current position → all predictions
      const lineCoords = [
        [...disaster.geometry.coordinates],
        ...preds.map(p => [...p.geometry.coordinates]),
      ];

      pathFeatures.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: lineCoords },
        properties: {
          id:       `${disaster.id}-path`,
          category: disaster.category ?? disaster.properties?.category,
        },
      });
    }

    return {
      points: { type: 'FeatureCollection', features: pointFeatures },
      paths:  { type: 'FeatureCollection', features: pathFeatures },
    };
  }
}

export default new PredictionEngine();
