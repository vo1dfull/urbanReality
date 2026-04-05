// ================================================
// LayerEngineUI — Minimal layer controls for map state
// ================================================
import { useState } from 'react';
import LayerBar from './LayerBar';
import LayerPanel from './LayerPanel';

const LayerEngineUI = () => {
  const [panelOpen, setPanelOpen] = useState(false);

  return (
    <>
      <LayerBar onOpenPanel={() => setPanelOpen(true)} />
      <LayerPanel isOpen={panelOpen} onClose={() => setPanelOpen(false)} />
    </>
  );
};

export default LayerEngineUI;