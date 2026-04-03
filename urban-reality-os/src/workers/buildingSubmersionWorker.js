self.onmessage = (event) => {
  const { requestId, buildings, waterLevel, facilities, exaggeration = 1 } = event.data;
  if (!Array.isArray(buildings) || typeof waterLevel !== 'number') {
    self.postMessage({ requestId, updates: [], personsAffected: 0, impactedCount: 0, criticalCount: 0, totalAreaAffected: 0 });
    return;
  }

  const facilityPoints = Array.isArray(facilities)
    ? facilities.map((facility) => ({
        lat: Number(facility.lat),
        lng: Number(facility.lng),
        type: facility.type,
      }))
    : [];

  const cellSizeDeg = 0.01;
  const facilityGrid = new Map();
  const gridKey = (lng, lat) => `${Math.floor(lng / cellSizeDeg)}:${Math.floor(lat / cellSizeDeg)}`;
  for (let i = 0; i < facilityPoints.length; i++) {
    const fp = facilityPoints[i];
    const key = gridKey(fp.lng, fp.lat);
    if (!facilityGrid.has(key)) facilityGrid.set(key, []);
    facilityGrid.get(key).push(fp);
  }

  const pointInBBox = (point, bbox) => {
    if (!point || !bbox) return false;
    return point.lng >= bbox.minX && point.lng <= bbox.maxX && point.lat >= bbox.minY && point.lat <= bbox.maxY;
  };

  const metersFromDegrees = (latDiff, lngDiff, latitude) => {
    const latMeters = latDiff * 111320;
    const lngMeters = lngDiff * 111320 * Math.cos((latitude * Math.PI) / 180);
    return Math.sqrt(latMeters * latMeters + lngMeters * lngMeters);
  };

  const facilityDistanceMeters = (a, b) => {
    if (!a || !b) return Infinity;
    return metersFromDegrees(a.lat - b.lat, a.lng - b.lng, (a.lat + b.lat) / 2);
  };

  const CRITICAL_TYPES = ['hospital', 'school', 'police'];
  const FACILITY_PRIORITY = { hospital: 3, school: 2, police: 1 };

  const computeFootprintArea = (bbox) => {
    if (!bbox) return 20;
    const lat = (bbox.minY + bbox.maxY) / 2;
    const width = Math.abs(bbox.maxX - bbox.minX);
    const height = Math.abs(bbox.maxY - bbox.minY);
    const xMeters = width * 111320 * Math.cos((lat * Math.PI) / 180);
    const yMeters = height * 111320;
    return Math.max(20, xMeters * yMeters);
  };

  const estimateCapacity = (building, height) => {
    const explicit = Number(building.capacity ?? building.density ?? 0);
    if (explicit > 0) return explicit;
    const area = computeFootprintArea(building.bbox);
    const floors = Math.max(1, Math.round(height / 3));
    return Math.max(10, Math.round(area * 0.1 * Math.max(1, floors / 2)));
  };

  const defaultFacilityThreshold = 80; // meters
  let personsAffected = 0;
  let impactedCount = 0;
  let criticalCount = 0;
  let totalAreaAffected = 0;
  const updates = [];

  for (let i = 0; i < buildings.length; i += 1) {
    const building = buildings[i];
    if (!building || !building.id) continue;

    const base = Number(building.baseHeight ?? 0);
    const height = Math.max(0.1, Number(building.height ?? 0));
    const adjustedBase = base * exaggeration;
    const adjustedHeight = Math.max(0.1, height * exaggeration);
    const submerged = waterLevel >= adjustedBase + 0.05;
    const submergedDepth = Math.max(0, waterLevel - adjustedBase);
    const submersionRatio = submerged ? Math.min(1, submergedDepth / adjustedHeight) : 0;
    const footprintArea = building.footprintArea || computeFootprintArea(building.bbox);
    const capacity = estimateCapacity(building, height);
    const impactPersons = submerged ? Math.round(capacity * Math.min(1, 0.75 + submersionRatio * 0.45)) : 0;
    const impactSeverity = submerged ? (submersionRatio > 0.75 ? 3 : submersionRatio > 0.4 ? 2 : 1) : 0;
    let isCritical = false;
    let criticalType = null;
    let impactCategory = 'normal';

    if (submerged && facilityPoints.length > 0) {
      const centroid = building.centroid || { lng: (building.bbox.minX + building.bbox.maxX) / 2, lat: (building.bbox.minY + building.bbox.maxY) / 2 };
      let bestMatch = null;
      let bestScore = -Infinity;

      const cellX = Math.floor(centroid.lng / cellSizeDeg);
      const cellY = Math.floor(centroid.lat / cellSizeDeg);
      const nearby = [];
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const key = `${cellX + dx}:${cellY + dy}`;
          const bucket = facilityGrid.get(key);
          if (bucket) nearby.push(...bucket);
        }
      }

      for (let j = 0; j < nearby.length; j += 1) {
        const facility = nearby[j];
        if (!facility || !facility.type) continue;
        if (!CRITICAL_TYPES.includes(facility.type)) continue;

        const point = { lng: facility.lng, lat: facility.lat };
        const insideFootprint = pointInBBox(point, building.bbox);
        const distance = facilityDistanceMeters(point, centroid);
        const threshold = Math.max(defaultFacilityThreshold, footprintArea * 0.03);

        let score = FACILITY_PRIORITY[facility.type] || 0;
        if (insideFootprint) score += 10;
        score -= Math.min(distance / 20, 5);

        if (insideFootprint || distance <= threshold) {
          if (score > bestScore) {
            bestScore = score;
            bestMatch = { type: facility.type, distance };
          }
        }
      }

      if (bestMatch) {
        isCritical = true;
        criticalType = bestMatch.type;
        impactCategory = 'critical';
        impactSeverity = Math.min(3, impactSeverity + (bestMatch.distance <= 10 ? 1 : 0));
      }
    }

    if (submerged) {
      impactedCount += 1;
      personsAffected += impactPersons;
      totalAreaAffected += footprintArea;
      if (isCritical) criticalCount += 1;
    }

    updates.push({
      id: building.id,
      isSubmerged: submerged,
      submersionRatio,
      submergedDepth,
      impactSeverity,
      impactPersons,
      adjustedHeight: adjustedHeight,
      adjustedBase: adjustedBase,
      isCritical,
      criticalType,
      impactCategory,
      footprintArea,
    });
  }

  self.postMessage({
    requestId,
    updates,
    personsAffected,
    impactedCount,
    criticalCount,
    totalAreaAffected,
  });
};
