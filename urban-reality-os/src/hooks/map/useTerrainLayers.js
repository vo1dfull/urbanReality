import { useState, useCallback } from 'react';

export function useTerrainLayers() {
  const [activeLayers, setActiveLayers] = useState(new Set());
  const [layerStates, setLayerStates] = useState(new Map());

  const toggleLayer = useCallback((layerId) => {
    setActiveLayers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(layerId)) {
        newSet.delete(layerId);
      } else {
        newSet.add(layerId);
      }
      return newSet;
    });
  }, []);

  const setLayerState = useCallback((layerId, state) => {
    setLayerStates(prev => new Map(prev).set(layerId, state));
  }, []);

  const getLayerState = useCallback((layerId) => {
    return layerStates.get(layerId) || {};
  }, [layerStates]);

  const isLayerActive = useCallback((layerId) => {
    return activeLayers.has(layerId);
  }, [activeLayers]);

  const clearAllLayers = useCallback(() => {
    setActiveLayers(new Set());
    setLayerStates(new Map());
  }, []);

  return {
    activeLayers,
    toggleLayer,
    setLayerState,
    getLayerState,
    isLayerActive,
    clearAllLayers
  };
}