self.onmessage = (event) => {
  const { type, payload } = event.data || {};
  if (type !== 'normalize-realtime') return;

  try {
    const { lat, lng, openAq, weather, overpass } = payload || {};

    const aqiValue = normalizeOpenAqAqi(openAq);
    const aqiGeo = {
      type: 'FeatureCollection',
      features: Number.isFinite(aqiValue)
        ? [{
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [lng, lat] },
            properties: { aqi: Math.round(aqiValue), city: 'Live Location', source: 'OpenAQ', timestamp: Date.now() },
          }]
        : [],
    };

    const weatherOut = {
      tempC: weather?.main?.temp ?? null,
      humidity: weather?.main?.humidity ?? null,
      rainfallMm: weather?.rain?.['1h'] ?? weather?.rain?.['3h'] ?? 0,
      windMps: weather?.wind?.speed ?? null,
      condition: weather?.weather?.[0]?.main ?? null,
    };

    const facilities = normalizeOverpassFacilities(overpass);

    self.postMessage({
      ok: true,
      data: {
        aqiGeo,
        weather: weatherOut,
        facilityData: facilities,
      },
    });
  } catch (error) {
    self.postMessage({ ok: false, error: error?.message || 'normalize failed' });
  }
};

function normalizeOpenAqAqi(openAq) {
  const results = openAq?.results || openAq?.data || [];
  if (!Array.isArray(results) || results.length === 0) return null;
  const first = results[0];
  const measurements = first.measurements || first.sensors || [];
  const pm25 = pickMetric(measurements, ['pm25', 'pm2.5']);
  const pm10 = pickMetric(measurements, ['pm10']);
  if (!Number.isFinite(pm25) && !Number.isFinite(pm10)) return null;
  const aqiApprox = (Number.isFinite(pm25) ? pm25 * 2.2 : 0) + (Number.isFinite(pm10) ? pm10 * 0.5 : 0);
  return Math.max(0, Math.min(500, aqiApprox));
}

function pickMetric(list, names) {
  for (const m of list || []) {
    const p = (m.parameter || m.name || '').toLowerCase();
    if (names.includes(p) && Number.isFinite(m.value)) return Number(m.value);
  }
  return null;
}

function normalizeOverpassFacilities(overpass) {
  const hospitals = [];
  const policeStations = [];
  const fireStations = [];
  const schools = [];

  const elements = overpass?.elements || [];
  for (const e of elements) {
    const lat = e.lat ?? e.center?.lat;
    const lng = e.lon ?? e.center?.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const tags = e.tags || {};
    const amenity = (tags.amenity || '').toLowerCase();
    const item = { lat, lng, name: tags.name || amenity || 'Unnamed' };
    if (amenity === 'hospital') hospitals.push({ ...item, coverageRadius: 4 });
    else if (amenity === 'police') policeStations.push({ ...item, coverageRadius: 2.5 });
    else if (amenity === 'fire_station') fireStations.push({ ...item, coverageRadius: 3 });
    else if (amenity === 'school') schools.push({ ...item, coverageRadius: 1.5 });
  }

  return { hospitals, policeStations, fireStations, schools };
}
