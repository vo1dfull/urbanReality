// ================================================
// useUrbanIntelligence.js — Master Integration Hook
// ================================================
// Initializes all 6 core engines, registers layer plugins,
// sets up event listeners, and manages lifecycle.
// ================================================

import { useEffect, useRef, useState } from 'react';
import useMapStore from '../store/useMapStore';
import EventBus from '../core/EventBus';
import LayerRegistry from '../layers/LayerRegistry';

// Engines
import PredictionEngine from '../engines/PredictionEngine';
import SatelliteEngine from '../engines/SatelliteEngine';
import PlanningEngine from '../engines/PlanningEngine';
import BuildEngine from '../engines/BuildEngine';
import AIAssistant from '../engines/AIAssistant';
import MapEngine from '../engines/MapEngine';

// Layer Plugins
import PredictionLayerPlugin from '../layers/PredictionLayerPlugin';
import NDVILayerPlugin from '../layers/NDVILayerPlugin';
import PlanningLayerPlugin from '../layers/PlanningLayerPlugin';
import BuildLayerPlugin from '../layers/BuildLayerPlugin';

/**
 * Master initialization hook for Urban Intelligence system.
 * 
 * - Initializes all 6 engines
 * - Registers 4 layer plugins
 * - Sets up cross-engine event listeners
 * - Manages AI assistant continuous analysis
 * - Returns engine instances for component use
 */
export default function useUrbanIntelligence() {
  const enginesRef = useRef(null);
  const layersRef = useRef(null);
  const listenersRef = useRef([]);
  const [isReady, setIsReady] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState(null);
  const mapReady = useMapStore((s) => s.mapReady);

  useEffect(() => {
    if (!mapReady || enginesRef.current) return; // Wait for base map before init

    (async () => {
      try {
        console.log('[Urban Intelligence] Initializing system...');

      // ═══════════════════════════════════════════════════════════
      // STEP 1: Initialize MapEngine (prerequisite for layers)
      // ═══════════════════════════════════════════════════════════
      const mapEngine = MapEngine;
      console.log('[UI] MapEngine ready');

      // ═══════════════════════════════════════════════════════════
      // STEP 2: Initialize core engines (these are already singletons)
      // ═══════════════════════════════════════════════════════════
      const predictionEngine = PredictionEngine;
      const satelliteEngine = SatelliteEngine;
      const planningEngine = PlanningEngine;
      const buildEngine = BuildEngine;
      const aiAssistant = AIAssistant;

      // Initialize engines
      if (predictionEngine.initialize) {
        await predictionEngine.initialize();
      }
      if (satelliteEngine.initialize) {
        await satelliteEngine.initialize();
      }
      if (planningEngine.initialize) {
        await planningEngine.initialize();
      }

      console.log('[Engines] All 5 engines initialized');

      // ═══════════════════════════════════════════════════════════
      // STEP 3: Register layer plugins
      // ═══════════════════════════════════════════════════════════
      const layerRegistry = new LayerRegistry();
      const map = mapEngine.getMap();
      if (!map) {
        throw new Error('Map instance not available for Urban Intelligence layers');
      }

      const predictionLayer = new PredictionLayerPlugin();
      const ndviLayer = new NDVILayerPlugin();
      const planningLayer = new PlanningLayerPlugin();
      const buildLayer = new BuildLayerPlugin();

      layerRegistry.register(predictionLayer);
      layerRegistry.register(ndviLayer);
      layerRegistry.register(planningLayer);
      layerRegistry.register(buildLayer);

      // Initialize all layers with map instance
      predictionLayer.init(map);
      ndviLayer.init(map);
      planningLayer.init(map);
      buildLayer.init(map);

      console.log('[Layers] All 4 layer plugins registered');

      // ═══════════════════════════════════════════════════════════
      // STEP 4: Wire up event handlers
      // ═══════════════════════════════════════════════════════════
      const listeners = [];

      // Prediction → Layer update
      const onPredictionComputed = (data) => {
        try {
          console.log('[Event] prediction:computed');
          predictionLayer?.updatePrediction?.(data.predictions, data.year, data.scenario);
        } catch (e) {
          console.warn('[Prediction Layer] Update failed:', e.message);
        }
      };
      EventBus.on('prediction:computed', onPredictionComputed);
      listeners.push(() => EventBus.off('prediction:computed', onPredictionComputed));

      // Satellite → Layer update
      const onNDVITileLoaded = (data) => {
        try {
          console.log('[Event] satellite:tile-loaded');
          ndviLayer?.updateNDVIData?.(data);
        } catch (e) {
          console.warn('[NDVI Layer] Update failed:', e.message);
        }
      };
      EventBus.on('satellite:tile-loaded', onNDVITileLoaded);
      listeners.push(() => EventBus.off('satellite:tile-loaded', onNDVITileLoaded));

      // Planning → Layer update
      const onPlanningSimulated = (data) => {
        try {
          console.log('[Event] planning:simulation-complete');
          planningLayer?.updateRecommendations?.(data.buildingType, data);
        } catch (e) {
          console.warn('[Planning Layer] Update failed:', e.message);
        }
      };
      EventBus.on('planning:simulation-complete', onPlanningSimulated);
      listeners.push(() => EventBus.off('planning:simulation-complete', onPlanningSimulated));

      // Build → Layer update
      const onBuildConfirmed = (placement) => {
        try {
          console.log('[Event] build:confirmed');
          buildLayer?.addPlacement?.(placement);
        } catch (e) {
          console.warn('[Build Layer] Add placement failed:', e.message);
        }
      };
      EventBus.on('build:confirmed', onBuildConfirmed);
      listeners.push(() => EventBus.off('build:confirmed', onBuildConfirmed));

      const onBuildRemoved = (data) => {
        try {
          console.log('[Event] build:removed');
          buildLayer?.removePlacement?.(data.id, data.type);
        } catch (e) {
          console.warn('[Build Layer] Remove placement failed:', e.message);
        }
      };
      EventBus.on('build:removed', onBuildRemoved);
      listeners.push(() => EventBus.off('build:removed', onBuildRemoved));

      // Build preview
      const onBuildPreview = (placement) => {
        try {
          console.log('[Event] build:preview');
          buildLayer?.showPreview?.(placement);
        } catch (e) {
          console.warn('[Build Layer] Show preview failed:', e.message);
        }
      };
      EventBus.on('build:preview', onBuildPreview);
      listeners.push(() => EventBus.off('build:preview', onBuildPreview));

      // Build preview cleared
      const onBuildPreviewCleared = (type) => {
        try {
          console.log('[Event] build:preview-cleared');
          buildLayer?.clearPreview?.(type);
        } catch (e) {
          console.warn('[Build Layer] Clear preview failed:', e.message);
        }
      };
      EventBus.on('build:preview-cleared', onBuildPreviewCleared);
      listeners.push(() => EventBus.off('build:preview-cleared', onBuildPreviewCleared));

      // Build → AI re-analysis
      const onBuildChanged = () => {
        try {
          console.log('[Event] build:confirmed → trigger AI re-analysis');
          const cityState = {
            population: 500000,
            density: 45,
            infrastructure: { stress: 0.65 },
            flood: { risk: 0.4 },
            heat: { index: 72 },
            green: { coverage: 0.3 },
          };
          aiAssistant?.analyzeCity?.(cityState).then(insights => {
            console.log('[AI] Analysis complete:', insights.length, 'insights');
            EventBus.emit('assistant:analysis-complete', { insights });
          }).catch(e => {
            console.warn('[AI] Analysis failed:', e.message);
          });
        } catch (e) {
          console.warn('[AI Assistant] Analysis error:', e.message);
        }
      };
      EventBus.on('build:confirmed', onBuildChanged);
      listeners.push(() => EventBus.off('build:confirmed', onBuildChanged));

      // ═══════════════════════════════════════════════════════════
      // STEP 5: Start AI assistant continuous monitoring
      // ═══════════════════════════════════════════════════════════
      const initialCityState = {
        population: 500000,
        density: 45,
        infrastructure: { stress: 0.5 },
        flood: { risk: 0.3 },
        heat: { index: 68 },
        green: { coverage: 0.35 },
      };

      try {
        aiAssistant?.startAnalysis?.(initialCityState, 15000); // Re-analyze every 15s
        console.log('[AI] Continuous analysis started (15s interval)');
      } catch (e) {
        console.warn('[AI Assistant] Failed to start analysis:', e.message);
      }

      // ═══════════════════════════════════════════════════════════
      // STEP 6: Expose for debugging
      // ═══════════════════════════════════════════════════════════
      window.__URBAN_INTELLIGENCE__ = {
        predictionEngine,
        satelliteEngine,
        planningEngine,
        buildEngine,
        aiAssistant,
        layerRegistry,
        EventBus,
      };

      console.log('[Urban Intelligence] ✅ System fully initialized');
      console.log('[Debug] Access via window.__URBAN_INTELLIGENCE__');

      enginesRef.current = {
        predictionEngine,
        satelliteEngine,
        planningEngine,
        buildEngine,
        aiAssistant,
      };

      layersRef.current = {
        predictionLayer,
        ndviLayer,
        planningLayer,
        buildLayer,
      };

      listenersRef.current = listeners;
      
      // Trigger success state after complete initialization
      setInitError(null);
      setIsInitialized(true);
      setIsReady(true);
    } catch (error) {
      console.error('[Urban Intelligence] Initialization failed:', error);
      setInitError(error);
      setIsInitialized(true);
      setIsReady(false);
    }
    })();

    // Cleanup on unmount
    return () => {
      if (listenersRef.current) {
        listenersRef.current.forEach(cleanup => cleanup());
        console.log('[Urban Intelligence] Cleaned up event listeners');
      }
    };
  }, [mapReady]);

  return {
    engines: enginesRef.current,
    layers: layersRef.current,
    isReady,
    isInitialized,
    initError,
  };
}
