// ===============================
// SIMPLE IMPACT (FAST MODEL)
// ===============================
export function calculateImpact({
    aqi,
    rainfall,
    rainProb,
    traffic,
    year
}) {
    const BASE_YEAR = 2025;
    const MAX_YEAR = 2040;

    const timeFactor = Math.max(
        0,
        Math.min(1, (year - BASE_YEAR) / (MAX_YEAR - BASE_YEAR))
    );

    // ---- FLOOD RISK ----
    const rainSevereFactor = Math.min(rainfall / 20, 1);
    const rainProbFactor = rainProb / 100;

    const floodRisk = Math.min(
        1,
        0.25 +
        (0.4 * timeFactor) +
        (rainSevereFactor * 0.45) +
        (rainProbFactor * 0.15)
    );

    // ---- PEOPLE AFFECTED ----
    const basePop = 28_000;
    const growth = 6000 * timeFactor;

    const peopleAffected = Math.round(
        (800 + 110 * (aqi || 0)) * 0.4 +
        12000 * floodRisk +
        9000 * (traffic || 0) +
        0.05 * (basePop + growth)
    );

    return {
        floodRisk: Number(floodRisk.toFixed(2)),
        peopleAffected: Math.max(100, peopleAffected),
        riskLevel:
            floodRisk > 0.65 ? "Severe 🔴" :
            floodRisk > 0.4 ? "Moderate 🟠" :
            "Low 🟡"
    };
}

// ===============================
// FULL IMPACT MODEL (ECON + POP)
// ===============================
export function calculateImpactModel({
    year,
    baseYear = 2025,
    populationBase,
    populationGrowthRate = 1.6,
    aqi = 0,
    rainfallMm = 0,
    trafficCongestion = 0,
    floodRisk = 0,
    worldBank = {}
}) {
    // ---- SAFETY ----
    const safePopulationBase =
        Number.isFinite(populationBase) && populationBase > 0
            ? populationBase
            : 28_000_000; // Delhi fallback

    const yearsElapsed = Math.max(0, year - baseYear);

    // ---- POPULATION ----
    const population =
        safePopulationBase *
        Math.pow(1 + populationGrowthRate / 100, yearsElapsed);

    // ---- EXPOSURE ----
    const aqiFactor = Math.min(aqi / 300, 1);
    const rainFactor = Math.min(rainfallMm / 50, 1);
    const trafficFactor = Math.min(trafficCongestion, 1);

    const exposure =
        0.45 * aqiFactor +
        0.30 * rainFactor +
        0.25 * trafficFactor;

    const peopleAffected = Math.round(population * exposure * 0.25);

    // ---- ECONOMIC LOSS ----
    const gdpPerCapita =
        Number(worldBank?.gdpPerCapita?.value) || 2500;

    const productivityLossCr =
        (peopleAffected * gdpPerCapita * 0.002) / 1e7;

    const infrastructureLossCr =
        floodRisk * 1200;

    // ---- TIME MULTIPLIER ----
    const timeMultiplier = 1 + yearsElapsed * 0.06;

    const economicLossCr = Math.min(
        2500,
        Math.round(
            (productivityLossCr + infrastructureLossCr) * timeMultiplier
        )
    );

    // ---- RISK ----
    let risk = "Low 🟡";
    if (aqi >= 250 || economicLossCr > 1500 || exposure > 0.65) {
        risk = "Severe 🔴";
    } else if (aqi >= 150 || economicLossCr > 600 || exposure > 0.45) {
        risk = "Moderate 🟠";
    }

    return {
        population: Math.round(population),
        peopleAffected,
        economicLossCr,
        exposure: Number(exposure.toFixed(2)),
        risk
    };
}
