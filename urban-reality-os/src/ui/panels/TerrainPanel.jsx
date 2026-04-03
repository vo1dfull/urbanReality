import { memo } from 'react';
import TerrainController from '../../components/terrain/TerrainController';

const TerrainPanel = memo(function TerrainPanel({ map, isActive }) {
  return (
    <div>
      <Header title="Terrain Intelligence" subtitle="Elevation, flood, suitability, and planning tools" />
      <TerrainController map={map} isActive={isActive} />
    </div>
  );
});

const Header = ({ title, subtitle }) => (
  <div style={{ marginBottom: 12 }}>
    <div style={{ fontSize: 14, color: '#f1f5f9', fontWeight: 600 }}>{title}</div>
    <div style={{ fontSize: 12, color: '#94a3b8' }}>{subtitle}</div>
  </div>
);

export default TerrainPanel;
