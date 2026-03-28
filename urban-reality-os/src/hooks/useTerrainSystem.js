import { useState, useCallback } from 'react';

export function useTerrainSystem() {
  const [openPanel, setOpenPanel] = useState(true);
  const [activeSubLayers, setActiveSubLayers] = useState(new Set(['elevation']));
  const [layerState, setLayerStateRaw] = useState(new Map());

  const setActiveSubLayer = useCallback((layerId, enabled) => {
    setActiveSubLayers((prev) => {
      const next = new Set(prev);
      if (enabled) next.add(layerId);
      else next.delete(layerId);
      return next;
    });
  }, []);

  const setLayerState = useCallback((layerId, state) => {
    setLayerStateRaw((prev) => new Map(prev).set(layerId, state));
  }, []);

  return {
    openPanel,
    setOpenPanel,
    activeSubLayers,
    setActiveSubLayer,
    layerState,
    setLayerState
  };
}
