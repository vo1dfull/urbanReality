export async function fetchAQI({ lng, lat }) {
  const res = await fetch(`/api/aqi?lat=${lat}&lng=${lng}`);
  if (!res.ok) throw new Error("AQI failed");
  return res.json();
}

export async function fetchTerrain({ lng, lat }) {
  const res = await fetch(`/api/terrain`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lng, lat })
  });
  if (!res.ok) throw new Error("Terrain failed");
  return res.json();
}

export async function fetchPopulation({ lng, lat }) {
  const res = await fetch(`/api/population?lat=${lat}&lng=${lng}`);
  if (!res.ok) throw new Error("Population failed");
  return res.json();
}

export default { fetchAQI, fetchTerrain, fetchPopulation };
