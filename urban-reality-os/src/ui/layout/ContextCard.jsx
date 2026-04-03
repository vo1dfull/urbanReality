import { memo, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cityBrain } from '../../engines/CityBrain';

const ContextCard = memo(function ContextCard({
  activeLocation,
  impactData,
  demographics,
  facilityData,
  year,
  layers,
  mapStyle,
  terrainSubLayers,
  simulationState,
  onClose,
}) {
  const model = useMemo(() => {
    if (!activeLocation) return null;
    const rainfall = Number(activeLocation.rainfall ?? activeLocation.baseRainfall ?? 0);
    const aqi = Number(activeLocation.finalAQI ?? activeLocation.realTimeAQI?.aqi ?? activeLocation.baseAQI ?? 75);
    const greenCover = Math.max(8, 42 - Math.round((year - 2026) * 0.5) + Math.round((rainfall / 300) * 8));

    const population = Math.round(demographics?.population ?? impactData?.population ?? 420000 * (1 + (year - 2026) * 0.013));
    const growthRate = Number(demographics?.growthRate ?? 1.3 + (year - 2026) * 0.02).toFixed(2);
    const tfr = Number(demographics?.tfr ?? 1.92 - (year - 2026) * 0.003).toFixed(2);

    const hospitals = facilityData?.hospitals?.length || 0;
    const police = facilityData?.policeStations?.length || 0;
    const fire = facilityData?.fireStations?.length || 0;
    const schools = facilityData?.schools?.length || facilityData?.school?.length || Math.round((hospitals + police + fire) * 0.9);

    const floodRisk = Math.min(99, Math.max(1, Math.round((impactData?.risk ?? activeLocation?.impact?.risk ?? 0.32) * 100)));
    const heatRisk = Math.min(99, Math.max(1, Math.round((aqi / 3.2) + (year - 2026) * 1.1)));
    const healthRisk = Math.min(99, Math.round((floodRisk * 0.45) + (heatRisk * 0.55)));

    const economicLoss = Number(impactData?.economicLossCr ?? activeLocation?.impact?.economicLossCr ?? (population / 100000) * (floodRisk / 6.5));
    const affectedPopulation = Number(impactData?.peopleAffected ?? activeLocation?.impact?.peopleAffected ?? Math.round(population * (healthRisk / 220)));
    const livability = Math.max(1, Math.min(100, Math.round(100 - (healthRisk * 0.55) - (100 - greenCover) * 0.2)));

    return {
      rainfall, aqi, greenCover,
      population, growthRate, tfr,
      hospitals, police, fire, schools,
      economicLoss, affectedPopulation,
      floodRisk, heatRisk, healthRisk,
      livability,
      riskLevel: healthRisk > 66 ? 'High' : healthRisk > 38 ? 'Moderate' : 'Low',
    };
  }, [activeLocation, impactData, demographics, facilityData, year]);

  const intelligence = useMemo(() => {
    if (!activeLocation || !model) return null;
    return cityBrain.analyzeUrbanContext({
      gis: {
        layers: layers || {},
        mapStyle: mapStyle || 'default',
        terrainSubLayers: terrainSubLayers || {},
      },
      realtime: {
        aqi: model.aqi,
        rainfallMm: model.rainfall,
      },
      simulation: simulationState || {},
      facilities: {
        hospitals: model.hospitals,
        policeStations: model.police,
        fireStations: model.fire,
        schools: model.schools,
      },
      demographics: { ...demographics, population: model.population, growthRate: Number(model.growthRate) },
      impact: { risk: (impactData?.risk ?? activeLocation?.impact?.risk ?? 0.32) },
      population: model.population,
    });
  }, [activeLocation, model, layers, mapStyle, terrainSubLayers, simulationState, demographics, impactData]);

  return (
    <AnimatePresence>
      {activeLocation && model && (
        <motion.section
          initial={{ y: 20, opacity: 0, scale: 0.98 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 16, opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          style={{
            position: 'fixed', left: 86, bottom: 86, width: 380, maxHeight: '56vh',
            zIndex: 21, pointerEvents: 'auto', overflow: 'auto',
            borderRadius: 16, border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(15,23,42,0.84)', backdropFilter: 'blur(14px)',
            boxShadow: '0 16px 34px rgba(2,6,23,0.3)', padding: 12, color: '#e2e8f0',
          }}
        >
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 8 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{activeLocation.placeName || 'Selected Location'}</div>
              <div style={{ color: '#94a3b8', fontSize: 11 }}>Year {year} intelligence snapshot</div>
            </div>
            <button type="button" onClick={onClose} style={closeBtn}>x</button>
          </header>

          {intelligence && (
            <section style={{ marginBottom: 10, padding: 10, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: 10, color: '#93c5fd', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>CityBrain</div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                <ScorePill label="Livability" value={intelligence.scores.livability} tone="good" />
                <ScorePill label="Risk" value={intelligence.scores.risk} tone="risk" />
              </div>
              <p style={{ margin: 0, fontSize: 11, color: '#cbd5e1', lineHeight: 1.45 }}>{intelligence.summary}</p>
              <ul style={{ margin: '8px 0 0', paddingLeft: 16, fontSize: 11, color: '#e2e8f0' }}>
                {intelligence.insights.slice(0, 3).map((i) => (
                  <li key={i.id} style={{ marginBottom: 4 }}>{i.text}</li>
                ))}
              </ul>
              <div style={{ marginTop: 8, fontSize: 10, color: '#94a3b8' }}>Recommendations</div>
              <ul style={{ margin: '4px 0 0', paddingLeft: 16, fontSize: 11, color: '#a5b4fc' }}>
                {intelligence.recommendations.slice(0, 3).map((r) => (
                  <li key={r.id} style={{ marginBottom: 4 }}>{r.text}</li>
                ))}
              </ul>
            </section>
          )}

          <Group title="Environment" rows={[['Rainfall', `${model.rainfall} mm`], ['AQI', model.aqi], ['Green cover', `${model.greenCover}%`]]} />
          <Group title="Infrastructure" rows={[['Hospitals', model.hospitals], ['Police', model.police], ['Fire', model.fire], ['Schools', model.schools]]} />
          <Group title="Demographics" rows={[['Population', model.population.toLocaleString()], ['Growth', `${model.growthRate}%`], ['TFR', model.tfr]]} />
          <Group title="Economy" rows={[['Economic loss', `Rs ${model.economicLoss.toFixed(1)} Cr`], ['Affected people', Math.round(model.affectedPopulation).toLocaleString()]]} />
          <Group title="Risk" rows={[['Flood risk', `${model.floodRisk}%`], ['Heat risk', `${model.heatRisk}%`], ['Health risk', `${model.healthRisk}%`]]} />
          <Group title="Overall" rows={[['Livability score', `${model.livability}/100`], ['Risk level', model.riskLevel]]} />
        </motion.section>
      )}
    </AnimatePresence>
  );
});

function ScorePill({ label, value, tone }) {
  const bg = tone === 'good' ? 'rgba(34,197,94,0.15)' : 'rgba(248,113,113,0.15)';
  const fg = tone === 'good' ? '#86efac' : '#fca5a5';
  return (
    <div style={{ flex: 1, padding: '6px 8px', borderRadius: 10, background: bg, border: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: fg }}>{value}</div>
    </div>
  );
}

function Group({ title, rows }) {
  return (
    <section style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 8, marginTop: 8 }}>
      <div style={{ fontSize: 11, color: '#93c5fd', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.6 }}>{title}</div>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '2px 0' }}>
          <span style={{ color: '#94a3b8' }}>{k}</span>
          <span>{v}</span>
        </div>
      ))}
    </section>
  );
}

const closeBtn = {
  width: 24, height: 24, borderRadius: 8, border: '1px solid rgba(255,255,255,0.14)',
  color: '#cbd5e1', background: 'rgba(255,255,255,0.04)', cursor: 'pointer',
};

export default ContextCard;
