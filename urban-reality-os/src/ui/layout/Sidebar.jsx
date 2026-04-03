import { memo, useState } from 'react';
import Drawer from '../../components/Drawer';
import useMapStore from '../../store/useMapStore';
import PerformanceManager from '../../core/PerformanceManager';

const Sidebar = memo(function Sidebar({ onAction }) {
  const [open, setOpen] = useState(false);
  const safeMode = useMapStore((s) => s.safeMode);
  const setSafeMode = useMapStore((s) => s.setSafeMode);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', top: 16, left: 16, zIndex: 24, pointerEvents: 'auto',
          width: 42, height: 42, borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)',
          background: 'rgba(8,12,28,0.72)', color: '#e2e8f0', cursor: 'pointer',
          backdropFilter: 'blur(12px)',
        }}
      >
        ☰
      </button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        onAction={onAction}
        safeMode={safeMode}
        setSafeMode={(v) => {
          setSafeMode(v);
          PerformanceManager.setSafeMode(v);
        }}
      />
    </>
  );
});

export default Sidebar;
