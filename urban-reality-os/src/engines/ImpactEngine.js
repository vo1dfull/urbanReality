// ================================================
// ImpactEngine — City impact calculator
// Computes how active disasters affect a city location
// Connects to Urban Intelligence via Zustand store
// ================================================

/** Max impact values per metric */
const MAX_IMPACT = {
  traffic:    80,
  aqi:        120,
  risk:       100,
  livability: -60,
};

class ImpactEngine {
  /**
   * Calculate impact of a single disaster on a city location.
   * @param {object} disaster — DisasterEngine disaster state or GeoJSON feature
   * @param {{ lng: number, lat: number }} city
   * @returns {{ traffic: number, aqi: number, risk: number, livability: number }}
   */
  calculate(disaster, city) {
    const coords = disaster.geometry?.coordinates ?? [0, 0];
    const radius = disaster.radius ?? disaster.properties?.radius ?? 50;
    const intensity = disaster.intensity ?? disaster.properties?.intensity ?? 1;

    const distKm = this._distanceKm(coords, city);

    // Impact falls off linearly with distance, scaled by intensity
    const rawImpact = Math.max(0, 1 - distKm / Math.max(radius, 1));
    const impact    = rawImpact * (intensity / 10);

    return {
      traffic:    impact * MAX_IMPACT.traffic,
      aqi:        impact * MAX_IMPACT.aqi,
      risk:       impact * MAX_IMPACT.risk,
      livability: impact * MAX_IMPACT.livability,
    };
  }

  /**
   * Calculate total impact of all active disasters on a city.
   * @param {object[]} disasters
   * @param {{ lng: number, lat: number }} city
   * @returns {{ traffic: number, aqi: number, risk: number, livability: number }}
   */
  calculateTotal(disasters, city) {
    const zero = { traffic: 0, aqi: 0, risk: 0, livability: 0 };
    if (!disasters?.length || !city) return zero;

    return disasters.reduce((acc, d) => {
      const i = this.calculate(d, city);
      return {
        traffic:    acc.traffic    + i.traffic,
        aqi:        acc.aqi        + i.aqi,
        risk:       acc.risk       + i.risk,
        livability: acc.livability + i.livability,
      };
    }, zero);
  }

  /**
   * Haversine distance in km between [lng, lat] and {lng, lat}.
   * @private
   */
  _distanceKm([lng1, lat1], { lng: lng2, lat: lat2 }) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }
}

export default new ImpactEngine();
