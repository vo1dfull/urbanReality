const STORAGE_KEY = 'savedPlaces';

const normalizePlace = (raw) => {
  const id = raw.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const name = (raw.name?.trim() || raw.title?.trim() || 'Custom Location');
  const category = raw.category || raw.type || 'custom';

  let coordinates = null;

  if (Array.isArray(raw.coordinates) && raw.coordinates.length >= 2) {
    const lng = Number(raw.coordinates[0]);
    const lat = Number(raw.coordinates[1]);
    if (!Number.isNaN(lng) && !Number.isNaN(lat)) coordinates = [lng, lat];
  }

  if (raw.coords && typeof raw.coords.lng === 'number' && typeof raw.coords.lat === 'number') {
    coordinates = [raw.coords.lng, raw.coords.lat];
  }

  if (!coordinates) {
    throw new Error('Invalid coordinates in saved place');
  }

  return {
    id,
    name,
    category,
    coordinates,
    createdAt: raw.createdAt || new Date().toISOString(),
  };
};

export const readSavedPlaces = () => {
  try {
    const json = localStorage.getItem(STORAGE_KEY) || '[]';
    const list = JSON.parse(json);
    if (!Array.isArray(list)) throw new Error('Invalid saved place data');

    return list
      .map((item) => {
        try { return normalizePlace(item); } catch { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch (err) {
    console.warn('readSavedPlaces error', err);
    return [];
  }
};

export const writeSavedPlaces = (places = []) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(places));
    window.dispatchEvent(new CustomEvent('savedPlacesUpdated', { detail: places }));
    return true;
  } catch (err) {
    console.error('writeSavedPlaces error', err);
    return false;
  }
};

export const addSavedPlace = (place) => {
  const existing = readSavedPlaces();
  const candidate = normalizePlace(place);

  const duplicate = existing.find((item) =>
    Math.abs(item.coordinates[0] - candidate.coordinates[0]) < 0.00001 &&
    Math.abs(item.coordinates[1] - candidate.coordinates[1]) < 0.00001
  );

  if (duplicate) {
    return duplicate;
  }

  const updated = [candidate, ...existing];
  writeSavedPlaces(updated);
  return candidate;
};

export const updateSavedPlace = (id, updates) => {
  const existing = readSavedPlaces();
  const updated = existing.map((item) => {
    if (item.id !== id) return item;
    const merged = { ...item, ...updates };
    return normalizePlace({ ...merged, coordinates: merged.coordinates || item.coordinates });
  });
  writeSavedPlaces(updated);
  return updated;
};

export const removeSavedPlace = (id) => {
  const existing = readSavedPlaces();
  const updated = existing.filter((item) => item.id !== id);
  writeSavedPlaces(updated);
  return updated;
};

export const clearSavedPlaces = () => {
  writeSavedPlaces([]);
  return [];
};
