// ===================================================
// Browser-safe Gemini helper
// Proxies requests to backend (/api/urban-analysis)
// ===================================================

const API_BASE =
  import.meta.env.VITE_GEMINI_BACKEND_URL || "http://localhost:3001";

/**
 * Urban Analysis with:
 * 1) Year-to-year comparison
 * 2) Sector-wise loss explanation
 */
export async function getUrbanAnalysis(raw) {
  try {
    // ---------- NORMALIZE INPUT ----------
    const data = {
      zone: raw?.zone || "Urban Area",
      year: raw?.year || new Date().getFullYear(),
      baseYear: raw?.baseYear || 2025,

      aqi: Number(raw?.aqi ?? raw?.aqi_realtime ?? 0),
      rainfallMm: Number(raw?.rainfallMm ?? raw?.rainfall ?? 0),
      traffic: Number(raw?.traffic ?? raw?.trafficCongestion ?? 0),
      floodRisk: Number(raw?.floodRisk ?? 0),

      // FIX: Default to 0 instead of failing on missing data
      peopleAffected: Number(raw?.peopleAffected) || 0,
      economicLossCr: Number(raw?.economicLossCr) || 0,

      // Optional baseline (for comparison)
      baseYearLossCr: Number(raw?.baseYearLossCr) || null,
      baseYearAQI: Number(raw?.baseYearAQI) || null
    };

    // ---------- SANITIZE ----------
    data.aqi = clamp(data.aqi, 0, 999);
    data.traffic = clamp(data.traffic, 0, 1);
    data.floodRisk = clamp(data.floodRisk, 0, 1);
    data.rainfallMm = clamp(data.rainfallMm, 0, 2000);
    data.peopleAffected = Math.round(data.peopleAffected);
    data.economicLossCr = parseFloat(data.economicLossCr.toFixed(2));

    // ---------- CONTEXT CHECK ----------
    // If loss is 0, we might be in a "safe" scenario or initial load
    if (data.economicLossCr === 0 && data.aqi < 50) {
      return `Conditions in ${data.zone} appear stable. Current metrics indicate minimal risk, with air quality and infrastructure operating within safe limits. Continued monitoring is recommended.`;
    }

    // ---------- DERIVED COMPARISON ----------
    const hasComparison =
      data.baseYearLossCr !== null &&
      data.year !== data.baseYear;

    let comparisonText = "No historical baseline available.";
    if (hasComparison) {
      const lossDiff = data.economicLossCr - data.baseYearLossCr;
      const aqiDiff = data.aqi - data.baseYearAQI;
      comparisonText = `Compared to ${data.baseYear}: Economic loss is ${lossDiff > 0 ? 'HIGHER' : 'LOWER'} by ₹${Math.abs(lossDiff).toFixed(1)} Cr, and AQI is ${aqiDiff > 0 ? 'worse' : 'better'} by ${Math.abs(aqiDiff)} points.`;
    }

    // ---------- PROMPT ----------
    const prompt = `
Role: Urban Risk & Economics Analyst.
Context: Analyzing impact data for ${data.zone} in the year ${data.year}.

METRICS:
- AQI: ${data.aqi}
- Rainfall: ${data.rainfallMm} mm
- Flood Risk Index: ${data.floodRisk.toFixed(2)} (0-1 scale)
- Traffic Index: ${data.traffic.toFixed(2)} (0-1 scale)
- Total Economic Loss: ₹${data.economicLossCr} Crores
- Pop. Affected: ${data.peopleAffected.toLocaleString()}

COMPARISON:
${comparisonText}

TASK:
Provide a concise 5-point strategic summary (max 160 words):

1. **Root Cause**: Briefly explain specific factors (Rain/AQI/Traffic) driving the ₹${data.economicLossCr} Cr loss.
2. **Sector Impact**: Which sector is hit hardest? (Public Health, Transport, or Infrastructure).
3. **Trend Analysis**: Why is the situation better/worse than the baseline?
4. **Social Implication**: One sentence on the impact on daily life for the ${data.peopleAffected.toLocaleString()} affected people.
5. **Mitigation**: Propose ONE high-impact, realistic solution suitable for Indian infrastructure.

Tone: Professional, urgent, data-backed. No filler words.
`;

    // ---------- API CALL ----------
    const resp = await fetch(`${API_BASE}/api/urban-analysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`AI backend error ${resp.status}: ${text}`);
    }

    const json = await resp.json();

    // ---------- ROBUST RESPONSE EXTRACTION ----------
    return (
      json.analysis ||
      json.text ||
      json.output ||
      json.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Analysis unavailable due to network or provider limits."
    );
  } catch (err) {
    console.error("getUrbanAnalysis failed:", err);
    return "Analysis unavailable. Please check your connection.";
  }
}

// Helper
function clamp(val, min, max) {
  return Math.min(Math.max(Number(val) || 0, min), max);
}

// Future expansion stubs
export const getPredictiveRiskAnalysis = async () => null;
export const getRealtimeDecisionSupport = async () => null;
export const getComparativeAnalysis = async () => null;
export const getDeepImpactAnalysis = async () => null;
export const createUrbanExpertChat = () => null;
export const getStreamingAnalysis = async () => null;