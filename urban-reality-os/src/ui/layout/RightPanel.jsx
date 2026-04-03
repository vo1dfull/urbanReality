import { memo } from 'react';
import InsightPanel from '../../components/InsightPanel';
import EconomicPanel from '../../components/EconomicPanel';
import FacilityStatsPanel from '../../components/FacilityStatsPanel';

const RightPanel = memo(function RightPanel({
  urbanAnalysis,
  analysisLoading,
  impactData,
  demographics,
  appMode,
  buildMode,
  facilityData,
  layers,
  facilityViewMode,
}) {
  return (
    <div style={{
      position: 'fixed',
      top: 76,
      right: 16,
      width: 340,
      zIndex: 20,
      pointerEvents: 'none',
    }}>
      <div style={{
        display: 'grid',
        gap: 10,
        gridTemplateRows: 'auto auto auto',
        alignContent: 'start',
        maxHeight: 'calc(100vh - 168px)',
        overflow: 'auto',
      }}>
        <div style={cardStyle}>
          <InsightPanel
            embedded
            insight={urbanAnalysis}
            loading={analysisLoading}
            impactData={impactData}
            demographics={demographics}
            appMode={appMode}
            buildMode={buildMode}
            facilityData={facilityData}
          />
        </div>
        <div style={cardStyle}>
          <EconomicPanel
            data={impactData}
            demographics={demographics}
            analysis={urbanAnalysis}
            analysisLoading={analysisLoading}
          />
        </div>
        <div style={cardStyle}>
          <FacilityStatsPanel facilityData={facilityData} layers={layers} facilityViewMode={facilityViewMode} />
        </div>
      </div>
    </div>
  );
});

const cardStyle = {
  pointerEvents: 'auto',
  background: 'rgba(8,12,28,0.58)',
  border: '1px solid rgba(255,255,255,0.11)',
  borderRadius: 16,
  backdropFilter: 'blur(10px)',
  overflow: 'hidden',
};

export default RightPanel;
