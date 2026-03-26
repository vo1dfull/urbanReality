// ============================================
// Real-time AQI Fetcher (OpenWeather Air API)
// Converts PM2.5 → US AQI (EPA standard)
// ============================================

export async function fetchRealtimeAQI(lat, lng, API_KEY) {
  if (!API_KEY || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lng}&appid=${API_KEY}`,
      { signal: controller.signal }
    );

    if (!res.ok) throw new Error("AQI API failed");

    const data = await res.json();
    if (!data?.list?.length) throw new Error("No AQI data");

    const d = data.list[0];
    const pm25 = Number(d.components?.pm2_5 ?? 0);

    // ---------- PM2.5 → US AQI (EPA) ----------
    let aqi;
    if (pm25 <= 12) aqi = (pm25 / 12) * 50;
    else if (pm25 <= 35.4) aqi = 50 + ((pm25 - 12) / 23.4) * 50;
    else if (pm25 <= 55.4) aqi = 100 + ((pm25 - 35.4) / 20) * 50;
    else if (pm25 <= 150.4) aqi = 150 + ((pm25 - 55.4) / 95) * 100;
    else if (pm25 <= 250.4) aqi = 250 + ((pm25 - 150.4) / 100) * 100;
    else aqi = 350 + ((pm25 - 250.4) / 149.6) * 150;

    aqi = Math.round(Math.min(500, Math.max(0, aqi)));

    // ---------- AQI CATEGORY ----------
    const category =
      aqi <= 50 ? "Good" :
        aqi <= 100 ? "Moderate" :
          aqi <= 150 ? "Unhealthy (Sensitive)" :
            aqi <= 200 ? "Unhealthy" :
              aqi <= 300 ? "Very Unhealthy" :
                "Hazardous";

    return {
      aqi,
      category,
      pm25: Number(pm25.toFixed(1)),
      pm10: Number((d.components?.pm10 ?? 0).toFixed(1)),
      no2: Number((d.components?.no2 ?? 0).toFixed(1)),
      o3: Number((d.components?.o3 ?? 0).toFixed(1)),
      co: Number((d.components?.co ?? 0).toFixed(1)),
      timestamp: new Date(d.dt * 1000).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      })
    };
  } catch (err) {
    console.warn("AQI Fetch Error:", err.message || err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
