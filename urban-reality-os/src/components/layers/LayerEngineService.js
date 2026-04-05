// ================================================
// LayerEngineUI — React wrapper for LayerEngine
// Provides reactive layer state management
// ================================================
import { useState, useEffect, useCallback } from 'react';
import LayerEngine from '../../engines/LayerEngine';

class LayerEngineUI {
  constructor() {
    this.listeners = new Set();
    this.state = {
      activeLayers: LayerEngine.getActiveLayers(),
      baseLayer: 'base.street', // Default base layer
      terrainSubLayers: {
        elevation: false,
        slope: false,
        flood: false,
        ndvi: false
      },
      facilityViewMode: 'coverage'
    };
  }

  // Subscribe to state changes
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // Notify all listeners
  notify() {
    this.listeners.forEach(listener => listener(this.state));
  }

  // Set layer state
  setLayer(type, enabled) {
    LayerEngine.setLayer(type, enabled);
    this.state.activeLayers = LayerEngine.getActiveLayers();
    this.notify();
  }

  // Toggle layer
  toggleLayer(type) {
    const isActive = this.state.activeLayers.includes(type);
    this.setLayer(type, !isActive);
  }

  // Get active layers
  getActiveLayers() {
    return this.state.activeLayers;
  }

  // Set base layer (only one active at a time)
  setBaseLayer(layerId) {
    // Disable all other base layers
    const baseLayers = ['base.street', 'base.satellite', 'terrain.elevation'];
    baseLayers.forEach(id => {
      if (id !== layerId) {
        this.setLayer(id, false);
      }
    });
    this.setLayer(layerId, true);
    this.state.baseLayer = layerId;
    this.notify();
  }

  // Set terrain sub-layers
  setTerrainSubLayer(subLayer, enabled) {
    this.state.terrainSubLayers[subLayer] = enabled;
    const terrainTypes = {
      elevation: 'terrain.elevation',
      slope: 'terrain.slope',
      flood: 'analytics.risk',
      ndvi: 'analytics.economy'
    };
    this.setLayer(terrainTypes[subLayer], enabled);
    this.notify();
  }

  // Set facility view mode
  setFacilityViewMode(mode) {
    this.state.facilityViewMode = mode;
    this.notify();
  }

  // Get current state
  getState() {
    return { ...this.state };
  }
}

// Singleton
const layerEngineUI = new LayerEngineUI();

// React hook for using LayerEngineUI
export const useLayerEngine = () => {
  const [state, setState] = useState(layerEngineUI.getState());

  useEffect(() => {
    const unsubscribe = layerEngineUI.subscribe(setState);
    return unsubscribe;
  }, []);

  const actions = {
    setLayer: useCallback((type, enabled) => layerEngineUI.setLayer(type, enabled), []),
    toggleLayer: useCallback((type) => layerEngineUI.toggleLayer(type), []),
    getActiveLayers: useCallback(() => layerEngineUI.getActiveLayers(), []),
    setBaseLayer: useCallback((layerId) => layerEngineUI.setBaseLayer(layerId), []),
    setTerrainSubLayer: useCallback((subLayer, enabled) => layerEngineUI.setTerrainSubLayer(subLayer, enabled), []),
    setFacilityViewMode: useCallback((mode) => layerEngineUI.setFacilityViewMode(mode), [])
  };

  return { state, ...actions };
};

export default layerEngineUI;