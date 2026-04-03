import React, { useMemo } from 'react';
import useMapStore from '../store/useMapStore';
import DataEngine from '../engines/DataEngine';
import { cityBrain } from '../engines/CityBrain';

const insightStatus = (value) => {
  if (value == null) return { label: 'Unknown', color: '#94a3b8' };
  if (value >= 0.65) return { label: 'High', color: '#f87171' };
  if (value >= 0.35) return { label: 'Moderate', color: '#fbbf24' };
  return { label: 'Low', color: '#34d399' };
};

export default function InsightPanel({
  insight,
  loading,
  impactData,
  demographics,
  appMode,
  buildMode,
  facilityData: facilityDataProp,
  embedded = false,
}) {
  const layers = useMapStore((s) => s.layers);
  const mapStyle = useMapStore((s) => s.mapStyle);
  const terrainSubLayers = useMapStore((s) => s.terrainSubLayers);
  const simulationState = useMapStore((s) => s.simulationState);
  const dataReady = useMapStore((s) => s.dataReady);
  const activeLocation = useMapStore((s) => s.activeLocation);

  const facilityData = facilityDataProp ?? (dataReady ? DataEngine.getFacilityData() : null);

  const hospitals = facilityData?.hospitals?.length ?? 0;
  const police = facilityData?.policeStations?.length ?? 0;
  const fire = facilityData?.fireStations?.length ?? 0;
  const schools = facilityData?.schools?.length ?? facilityData?.school?.length ?? 0;

  const brain = useMemo(() => {
    const population = demographics?.population ?? impactData?.people ?? 100000;
    const aqi = activeLocation?.finalAQI ?? activeLocation?.realTimeAQI?.aqi ?? activeLocation?.baseAQI ?? 75;
    const rainfall = activeLocation?.rainfall ?? activeLocation?.baseRainfall ?? 0;
    return cityBrain.analyzeUrbanContext({
      gis: { layers, mapStyle, terrainSubLayers },
      realtime: { aqi, rainfallMm: rainfall },
      simulation: simulationState,
      facilities: { hospitals, policeStations: police, fireStations: fire, schools },
      demographics: { ...demographics, population },
      impact: { risk: impactData?.risk ?? 0.25 },
      population,
    });
  }, [
    layers, mapStyle, terrainSubLayers, simulationState,
    demographics, impactData, activeLocation,
    hospitals, police, fire, schools,
  ]);

  const floodRisk = impactData?.risk ?? null;
  const vegetationScore = demographics?.greenCoverPct ?? demographics?.vegetationScore ?? null;
  const healthcareGap = demographics?.healthcareGapKm ?? demographics?.healthcareGap ?? null;

  const riskLabel = insightStatus(floodRisk);
  const vegetationLabel = insightStatus(vegetationScore != null ? 1 - vegetationScore : null);

  const legacyRecommendations = [];
  if (floodRisk != null && floodRisk > 0.65) {
    legacyRecommendations.push('Prioritize flood mitigation corridors along low-elevation districts.');
  }
  if (vegetationScore != null && vegetationScore < 0.35) {
    legacyRecommendations.push('Add green zones to lower heat stress and improve stormwater absorption.');
  }
  if (healthcareGap != null && healthcareGap > 3) {
    legacyRecommendations.push('Install an urgent care hub to reduce healthcare gap by 18%.');
  }

  const modeMessage = appMode === 'simulation'
    ? 'Simulation mode is active. Use the feature dock to tune scenario variables.'
    : appMode === 'planning'
      ? 'Planning mode is active. Start placing assets and compare baseline projections.'
      : 'Explore mode is active. Tap a feature card to reveal the next best action.';

  const rootStyle = embedded
    ? {
        position: 'relative',
        width: '100%',
        borderRadius: 0,
        padding: 14,
        background: 'transparent',
        border: 'none',
        boxShadow: 'none',
        color: '#f8fafc',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }
    : {
        position: 'fixed', top: 84, right: 24, zIndex: 10001,
        width: 320, maxWidth: 'calc(100vw - 48px)',
        borderRadius: 24, padding: 20,
        background: 'rgba(8, 12, 28, 0.94)',
        border: '1px solid rgba(255,255,255,0.1)',
        backdropFilter: 'blur(22px)',
        boxShadow: '0 36px 120px rgba(0,0,0,0.38)',
        color: '#f8fafc',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      };

  return (
    <div style={rootStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: embedded ? 12 : 18 }}>
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.24em', color: '#94a3b8', marginBottom: 6 }}>AI Insights</div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Urban Intelligence</h3>
        </div>
        <div style={{ display: 'grid', gap: 4, textAlign: 'right' }}>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>{buildMode ? 'Build Mode' : 'Live'}</span>
          <span style={{ fontSize: 12, color: '#cbd5e1' }}>{appMode.charAt(0).toUpperCase() + appMode.slice(1)} Mode</span>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gap: 10, padding: 14, borderRadius: 14, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(129,140,248,0.25)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#a5b4fc' }}>CityBrain scores</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1, padding: 10, borderRadius: 12, background: 'rgba(34,197,94,0.12)' }}>
              <div style={{ fontSize: 10, color: '#94a3b8' }}>Livability</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#86efac' }}>{brain.scores.livability}</div>
            </div>
            <div style={{ flex: 1, padding: 10, borderRadius: 12, background: 'rgba(248,113,113,0.12)' }}>
              <div style={{ fontSize: 10, color: '#94a3b8' }}>Risk</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#fca5a5' }}>{brain.scores.risk}</div>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: '#e2e8f0', lineHeight: 1.5 }}>{brain.summary}</p>
        </div>

        <div style={{ display: 'grid', gap: 8, padding: 12, borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#94a3b8' }}>Signals</div>
          {brain.insights.map((item) => (
            <div key={item.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 14, lineHeight: 1.2, color: item.severity === 'critical' ? '#f87171' : item.severity === 'warn' ? '#fbbf24' : '#94a3b8' }}>●</span>
              <p style={{ margin: 0, fontSize: 12, lineHeight: 1.55, color: '#e2e8f0' }}>{item.text}</p>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gap: 10, padding: 14, borderRadius: 18, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#94a3b8' }}>Risk Summary</div>
          <div style={{ display: 'grid', gap: 10 }}>
            <RiskCard title="Flood Risk" value={floodRisk != null ? `${Math.round(floodRisk * 100)}%` : 'N/A'} accent={riskLabel.color} label={riskLabel.label} />
            <RiskCard title="Vegetation" value={vegetationScore != null ? `${Math.round((vegetationScore || 0) * 100)}%` : 'N/A'} accent={vegetationLabel.color} label={vegetationScore != null ? (vegetationScore > 0.35 ? 'Healthy' : 'Low') : 'Unknown'} />
            <RiskCard title="Healthcare Gap" value={healthcareGap != null ? `${healthcareGap.toFixed(1)} km` : 'N/A'} accent="#60a5fa" label={healthcareGap != null ? (healthcareGap > 3 ? 'Critical' : 'Improving') : 'Unknown'} />
          </div>
        </div>

        <div style={{ display: 'grid', gap: 10, padding: 14, borderRadius: 18, background: 'rgba(255,255,255,0.03)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#94a3b8' }}>Recommendations (CityBrain)</div>
          {brain.recommendations.map((r) => (
            <div key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 16, lineHeight: 1.2 }}>•</span>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: '#e2e8f0' }}>{r.text}</p>
            </div>
          ))}
          {legacyRecommendations.map((text, index) => (
            <div key={`legacy-${index}`} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 16, lineHeight: 1.2 }}>•</span>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: '#cbd5e1' }}>{text}</p>
            </div>
          ))}
          {!brain.recommendations.length && !legacyRecommendations.length && (
            <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>Maintain monitoring cadence and keep infrastructure resilient.</p>
          )}
        </div>

        {loading ? (
          <div style={{ padding: 14, borderRadius: 18, background: 'rgba(255,255,255,0.03)', color: '#94a3b8', fontSize: 12 }}>Generating scenario analysis…</div>
        ) : insight ? (
          <div style={{ padding: 16, borderRadius: 18, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <p style={{ margin: 0, fontSize: 13, color: '#e2e8f0', lineHeight: 1.7 }}>{insight}</p>
          </div>
        ) : (
          <div style={{ padding: 14, borderRadius: 18, background: 'rgba(255,255,255,0.03)', color: '#94a3b8', fontSize: 12 }}>Select a location or panel to reveal the latest intelligence.</div>
        )}

        <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.5 }}>{modeMessage}</div>
      </div>
    </div>
  );
}

function RiskCard({ title, value, label, accent = '#94a3b8' }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 16, background: 'rgba(15,23,42,0.85)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#94a3b8' }}>{title}</div>
        <div style={{ marginTop: 6, fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>{value}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        <span style={{ fontSize: 11, color: accent }}>{label}</span>
        <div style={{ width: 36, height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
          <div style={{ width: '100%', height: '100%', background: accent }} />
        </div>
      </div>
    </div>
  );
}
