import { memo } from 'react';

const InfoCard = memo(function InfoCard({ activeLocation, impactData, urbanAnalysis }) {
  if (!activeLocation && !impactData) return null;
  return (
    <div style={{
      position: 'fixed', left: 84, bottom: 92, width: 320, zIndex: 20,
      pointerEvents: 'auto', borderRadius: 16, border: '1px solid rgba(255,255,255,0.1)',
      background: 'rgba(15,23,42,0.74)', backdropFilter: 'blur(14px)', padding: 12,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>{activeLocation?.placeName || impactData?.zone || 'Context'}</div>
      {impactData && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#cbd5e1', display: 'grid', gap: 4 }}>
          <div>Risk: {impactData.risk}</div>
          <div>People: {impactData.people}</div>
          <div>Loss: {impactData.loss}</div>
        </div>
      )}
      {urbanAnalysis && (
        <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8', maxHeight: 90, overflow: 'auto' }}>
          {String(urbanAnalysis).slice(0, 280)}
        </div>
      )}
    </div>
  );
});

export default InfoCard;
