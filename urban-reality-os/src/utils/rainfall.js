export async function fetchRainfall(lat, lng, signal) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        if (signal) {
            signal.addEventListener('abort', () => controller.abort(), { once: true });
        }

        const res = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=rain,precipitation_probability&forecast_days=1`,
            { signal: controller.signal }
        );
        clearTimeout(timeout);

        if (!res.ok) throw new Error("Rain API failed");

        const data = await res.json();
        return {
            rain: data.hourly?.rain?.[0] ?? 0,
            probability: data.hourly?.precipitation_probability?.[0] ?? 0
        };
    } catch (err) {
        console.warn("Rainfall Fetch Error:", err);
        return { rain: 0, probability: 0 };
    }
}
