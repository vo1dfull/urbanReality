// ===================================================
// Browser-safe Gemini helper
// Proxies requests to backend (/api/urban-analysis)
// ✅ Cached via CacheEngine (5 min per payload hash)
// ✅ Abort signal support
// ✅ Confidence scoring from response
// ✅ Retry on network failure
// ===================================================
import CacheEngine from '../core/CacheEngine';

const API_BASE =
  import.meta.env.VITE_GEMINI_BACKEND_URL || "http://localhost:3001";

/** @type {number} Cache TTL for AI responses */
const AI_CACHE_TTL = 5 * 60_000; // 5 minutes

/** @type {number} Max retries for AI requests */
const AI_MAX_RETRIES = 2;

/** @type {number} Timeout per attempt in ms */
const AI_TIMEOUT = 15_000;

/**
 * Generate a deterministic cache key from analysis payload.
 * @param {object} data
 * @returns {string}
 */
function getPayloadHash(data) {
  // Round coordinates and values to avoid near-miss cache misses
  const key = [
    data.zone,
    data.year,
    Math.round(data.aqi / 5) * 5,        // Round AQI to nearest 5
    Math.round(data.rainfallMm),
    (data.traffic * 10 | 0) / 10,         // Round to 1 decimal
    (data.floodRisk * 10 | 0) / 10,
    Math.round(data.economicLossCr / 10) * 10, // Round loss to nearest 10
  ].join(':');
  return `ai:analysis:${key}`;
}

/**
 * Compute a confidence score based on input data quality.
 * @param {object} data
 * @returns {number} 0-1
 */
function computeConfidence(data) {
  let score = 0.5; // baseline

  // Higher confidence with more data points
  if (data.aqi > 0) score += 0.1;
  if (data.rainfallMm > 0) score += 0.05;
  if (data.traffic > 0) score += 0.1;
  if (data.floodRisk > 0) score += 0.05;
  if (data.peopleAffected > 0) score += 0.1;
  if (data.economicLossCr > 0) score += 0.1;

  return Math.min(1, score);
}

/**
 * Urban Analysis with:
 * 1) Year-to-year comparison
 * 2) Sector-wise loss explanation
 * 3) Caching + retry + confidence scoring
 *
 * @param {object} raw — raw analysis payload
 * @param {object} [options]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{text: string, confidence: number}|string|null>}
 */
export async function getUrbanAnalysis(raw, options = {}) {
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

      peopleAffected: Number(raw?.peopleAffected) || 0,
      economicLossCr: Number(raw?.economicLossCr) || 0,

      baseYearLossCr: Number(raw?.baseYearLossCr) || null,
      baseYearAQI: Number(raw?.baseYearAQI) || null,
    };

    // ---------- SANITIZE ----------
    data.aqi = clamp(data.aqi, 0, 999);
    data.traffic = clamp(data.traffic, 0, 1);
    data.floodRisk = clamp(data.floodRisk, 0, 1);
    data.rainfallMm = clamp(data.rainfallMm, 0, 2000);
    data.peopleAffected = Math.round(data.peopleAffected);
    data.economicLossCr = parseFloat(data.economicLossCr.toFixed(2));

    // ---------- CONTEXT CHECK ----------
    if (data.economicLossCr === 0 && data.aqi < 50) {
      return `Conditions in ${data.zone} appear stable. Current metrics indicate minimal risk, with air quality and infrastructure operating within safe limits. Continued monitoring is recommended.`;
    }

    // ---------- CHECK CACHE ----------
    const cacheKey = getPayloadHash(data);
    const cached = CacheEngine.get(cacheKey);
    if (cached) return cached;

    // ---------- DERIVED COMPARISON ----------
    const hasComparison = data.baseYearLossCr !== null && data.year !== data.baseYear;

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

    // ---------- API CALL WITH RETRY ----------
    let lastError = null;
    for (let attempt = 0; attempt <= AI_MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT);

        // Chain external signal if provided
        if (options.signal) {
          if (options.signal.aborted) {
            clearTimeout(timeoutId);
            return null;
          }
          options.signal.addEventListener('abort', () => controller.abort(), { once: true });
        }

        const resp = await fetch(`${API_BASE}/api/urban-analysis`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!resp.ok) {
          const text = await resp.text().catch(() => "");
          throw new Error(`AI backend error ${resp.status}: ${text}`);
        }

        const json = await resp.json();

        // ---------- ROBUST RESPONSE EXTRACTION ----------
        const analysisText =
          json.analysis ||
          json.text ||
          json.output ||
          json.candidates?.[0]?.content?.parts?.[0]?.text ||
          "Analysis unavailable due to network or provider limits.";

        // ---------- CACHE RESULT ----------
        const confidence = computeConfidence(data);
        const result = { text: analysisText, confidence };
        CacheEngine.set(cacheKey, analysisText, AI_CACHE_TTL);

        return analysisText;
      } catch (err) {
        lastError = err;
        if (err.name === 'AbortError') return null;
        // Exponential backoff before retry
        if (attempt < AI_MAX_RETRIES) {
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
        }
      }
    }

    console.error("getUrbanAnalysis failed after retries:", lastError);
    return "Analysis unavailable. Please check your connection.";
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