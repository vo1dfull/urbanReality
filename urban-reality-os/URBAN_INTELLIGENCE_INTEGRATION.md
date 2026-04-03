// ================================================
// URBAN INTELLIGENCE OS — COMPLETE INTEGRATION GUIDE
// ================================================

/**
 * ============================================================
 * 🎯 SYSTEM OVERVIEW
 * ============================================================
 * 
 * This document provides complete integration instructions for the
 * next-generation Urban Intelligence OS with AI/ML engines.
 * 
 * New Systems:
 * ─────────────
 * 1. PredictionEngine — Future city growth modeling
 * 2. SatelliteEngine — NDVI + remote sensing integration
 * 3. PlanningEngine — RL-style decision making
 * 4. BuildEngine — SimCity-style interactive construction
 * 5. AIAssistant — Intelligent recommendations
 * 
 * Supporting Layer Plugins:
 * ──────────────────────────
 * • PredictionLayerPlugin — Forecast visualization
 * • NDVILayerPlugin — Vegetation coverage maps
 * • PlanningLayerPlugin — Optimization overlays
 * • BuildLayerPlugin — Interactive building mode
 * 
 * UI Components:
 * ─────────────
 * • BuilderUI — SimCity-style construction panel
 * • InsightsPanel — AI recommendations display
 * • PredictionViewer — Growth forecast viewer
 */

// ============================================================
// STEP 1: INITIALIZE ENGINES IN YOUR APP
// ============================================================

import React, { useEffect, useState } from 'react';
import { PredictionEngine } from './engines/PredictionEngine';
import { SatelliteEngine } from './engines/SatelliteEngine';
import { PlanningEngine } from './engines/PlanningEngine';
import { BuildEngine } from './engines/BuildEngine';
import AIAssistant from './engines/AIAssistant';

// In your main App.jsx or GameController:

function MyUrbanApp() {
  const [engines, setEngines] = useState({
    prediction: null,
    satellite: null,
    planning: null,
    build: null,
    aiAssistant: null,
  });

  useEffect(() => {
    // Initialize all engines
    const initEngines = async () => {
      const pred = new PredictionEngine();
      await pred.initialize();

      const sat = new SatelliteEngine();
      await sat.initialize();

      const planning = new PlanningEngine();
      await planning.initialize();

      const build = new BuildEngine();

      setEngines({
        prediction: pred,
        satellite: sat,
        planning: planning,
        build: build,
        aiAssistant: AIAssistant,
      });
    };

    initEngines();

    return () => {
      // Cleanup on unmount
      Object.values(engines).forEach((engine) => {
        if (engine?.destroy) engine.destroy();
      });
    };
  }, []);

  return <YourMapComponent engines={engines} />;
}

// ============================================================
// STEP 2: REGISTER LAYER PLUGINS
// ============================================================

import LayerEngine from './engines/LayerEngine';
import PredictionLayerPlugin from './layers/PredictionLayerPlugin';
import NDVILayerPlugin from './layers/NDVILayerPlugin';
import PlanningLayerPlugin from './layers/PlanningLayerPlugin';
import BuildLayerPlugin from './layers/BuildLayerPlugin';

function initializeLayerSystem(layerEngine) {
  // Register all new layer plugins
  layerEngine.register(new PredictionLayerPlugin());
  layerEngine.register(new NDVILayerPlugin());
  layerEngine.register(new PlanningLayerPlugin());
  layerEngine.register(new BuildLayerPlugin());

  // Initialize when map is ready
  const unsubscribe = layerEngine.on('ready', (map) => {
    layerEngine.initAll(map, {
      prediction: false, // Start hidden
      ndvi: false,
      planning: false,
      build: false,
    });
  });

  return unsubscribe;
}

// ============================================================
// STEP 3: USE PREDICTION ENGINE
// ============================================================

async function usePredictions(predictionEngine) {
  // Get future state for a target year with scenario
  const prediction = await predictionEngine.predictFutureState(
    {
      population: 420000,
      density: 0.6,
      growthRate: 0.019,
      infrastructureProximity: 0.5,
    },
    2050,  // target year
    'moderate'  // scenario: 'conservative', 'moderate', 'aggressive'
  );

  console.log('Population forecast:', prediction.population);
  console.log('Sprawl zones:', prediction.sprawl.expandableZones);
  console.log('Infrastructure demand:', prediction.infrastructure);
  console.log('Land values:', prediction.landValue);

  // Individual predictions:
  const popGrowth = await predictionEngine.predictPopulationGrowth({
    population: 420000,
    density: 0.6,
    growthRate: 0.019,
    infrastructureProximity: 0.5,
  }, 2050, 'moderate');

  const sprawl = await predictionEngine.predictUrbanSprawl({
    currentExtent: 1000,
    terrainSuitability: {
      'North Zone': 0.8,
      'East Zone': 0.6,
      'South Zone': 0.7,
    },
  }, 2050);

  const infraDemand = await predictionEngine.predictInfrastructureDemand({
    population: 420000,
    existingInfrastructure: 100,
    coverage: 0.7,
  }, 2050);

  const landValue = await predictionEngine.predictLandValue({
    currentValue: 100,
    accessibility: 0.6,
    amenities: 0.5,
    risk: 0.2,
  }, 2050);

  return { popGrowth, sprawl, infraDemand, landValue };
}

// ============================================================
// STEP 4: USE SATELLITE ENGINE
// ============================================================

async function useSatelliteData(satelliteEngine) {
  // Fetch NDVI data for a region
  const ndviData = await satelliteEngine.fetchNDVI(
    {
      north: 40.8228,
      south: 40.7028,
      east: -73.906,
      west: -74.106,
    },
    'sentinel' // or 'landsat'
  );

  console.log('NDVI tiles loaded:', ndviData);

  // Compute vegetation density
  const density = satelliteEngine.computeVegetationDensity(ndviData.ndviValues);

  // Compute environmental quality
  const quality = satelliteEngine.computeEnvironmentalQualityIndex(density);
  console.log('Environmental quality:', quality); // 0-100

  // Adjust models with NDVI
  const adjustedModels = satelliteEngine.adjustModelsWithNDVI(0.5, {
    heat: 0.6,
    flood: 0.4,
  });
  console.log('Adjusted models:', adjustedModels);

  // Lazy-load tiles for viewport
  satelliteEngine.loadViewportTiles({
    north: 40.8228,
    south: 40.7028,
    east: -73.906,
    west: -74.106,
    zoom: 11,
  });

  return ndviData;
}

// ============================================================
// STEP 5: USE PLANNING ENGINE (RL Simulator)
// ============================================================

async function usePlanningEngine(planningEngine) {
  const cityState = {
    terrain: { slope: 0.2, drainage: 0.7 },
    infrastructure: { stress: 0.6, coverage: 0.7 },
    population: { count: 420000, growth: 1.9 },
    heat: 65,
    floodRisk: 45,
  };

  planningEngine.setCityState(cityState);

  // Simulate a single action
  const actionResult = await planningEngine.simulateAction(
    {
      type: 'road',
      location: { lng: -74.006, lat: 40.7128, proximity: 0.8 },
    },
    cityState
  );
  console.log('Action reward:', actionResult.reward);
  console.log('Metrics:', actionResult.metrics);

  // Plan optimal strategy (evaluate multiple action sequences)
  const strategy = await planningEngine.planOptimalStrategy(cityState, 10);
  console.log('Best strategy:', strategy.bestStrategy);
  console.log('Recommendations:', strategy.recommendation);

  // Get specific placement recommendations
  const parkPlacements = await planningEngine.recommendPlacement(cityState, 'park');
  console.log('Top park locations:', parkPlacements.recommendations);

  // Get optimization heatmap for visualization
  const heatmap = await planningEngine.getOptimizationHeatmap(cityState, 'park');
  console.log('Heatmap for building type:', heatmap);

  // Subscribe to planning events
  planningEngine.on('planning:simulation-complete', (result) => {
    console.log('Simulation complete:', result);
  });

  return { actionResult, strategy, parkPlacements, heatmap };
}

// ============================================================
// STEP 6: USE BUILD ENGINE (Interactive Construction)
// ============================================================

async function useBuildEngine(buildEngine, mapInstance) {
  // Show preview before placing
  const preview = await buildEngine.previewPlacement({
    type: 'road',
    location: { lng: -74.006, lat: 40.7128 },
    dimensions: { width: 2, height: 1 },
  });

  console.log('Preview:', preview);
  console.log('Can afford:', preview.canAfford);
  console.log('Is valid:', preview.isValid);
  console.log('Estimated impact:', preview.impact);

  // Confirm placement if valid
  if (preview.isValid) {
    const placement = await buildEngine.confirmPlacement(preview.id);
    console.log('Placed:', placement);
  } else {
    buildEngine.cancelPreview();
  }

  // Get all placements of a type
  const roads = buildEngine.getPlacements('road');
  console.log('Current roads:', roads);

  // Undo last placement
  await buildEngine.undo();

  // Remove specific placement
  await buildEngine.removePlacement(placement.id);

  // Get current budget
  const budget = buildEngine.getBudget();
  console.log('Budget:', budget);

  // Set budget
  buildEngine.setBudget(1500000);

  // Subscribe to build events
  buildEngine.on('build:confirmed', (placement) => {
    console.log('Placement confirmed:', placement);
    // Update BuildLayerPlugin
    buildLayerPlugin.addPlacement(placement);
  });

  buildEngine.on('build:budget-changed', (newBudget) => {
    console.log('Budget changed:', newBudget);
  });

  return { preview, placement };
}

// ============================================================
// STEP 7: USE AI ASSISTANT
// ============================================================

async function useAIAssistant(aiAssistant) {
  const cityState = {
    floodRisk: 65,
    heat: 73,
    infrastructure: { stress: 75 },
    population: { growth: 2.1 },
    traffic: { congestion: 0.65 },
    facilities: { schools: 45 },
    facilities: { schoolCoverage: 0.4 },
  };

  // Analyze city state
  const insights = await aiAssistant.analyzeCity(cityState);
  console.log('Generated insights:', insights);

  // Start continuous analysis
  aiAssistant.startAnalysis(cityState, 10000); // Every 10s

  // Get formatted suggestions for UI
  const suggestions = aiAssistant.getSuggestions(5); // Top 5
  console.log('Suggestions:', suggestions);

  // Explain a specific recommendation
  const explanation = aiAssistant.explainRecommendation(insights[0].id);
  console.log('Explanation:\n', explanation);

  // Get area-specific recommendations
  const areaRecs = aiAssistant.getAreaRecommendations(
    { north: 40.8, south: 40.7, east: -73.9, west: -74.1, area: 100 },
    cityState
  );
  console.log('Area recommendations:', areaRecs);

  // Subscribe to analysis updates
  aiAssistant.on('assistant:analysis-complete', (data) => {
    console.log('New insights available:', data.insights);
  });

  return { insights, suggestions };
}

// ============================================================
// STEP 8: INTEGRATE UI COMPONENTS
// ============================================================

import BuilderUI from './components/BuilderUI';
import InsightsPanel from './components/InsightsPanel';
import PredictionViewer from './components/PredictionViewer';

function MyGameUI({ engines }) {
  const [viewMode, setViewMode] = useState('overview'); // overview, builder, predictions, insights

  return (
    <div className="game-ui">
      {/* Tab Navigation */}
      <div className="tabs">
        <button onClick={() => setViewMode('builder')}>🏗️ Build Mode</button>
        <button onClick={() => setViewMode('predictions')}>🔮 Predictions</button>
        <button onClick={() => setViewMode('insights')}>🤖 AI Insights</button>
      </div>

      {/* Dynamic Content */}
      {viewMode === 'builder' && (
        <BuilderUI
          buildEngine={engines.build}
          onBudgetChanged={(budget) => console.log('New budget:', budget)}
          onPlacementConfirmed={(placement) => console.log('Confirmed:', placement)}
        />
      )}

      {viewMode === 'predictions' && (
        <PredictionViewer
          predictionEngine={engines.prediction}
          onScenarioChange={(data) => {
            console.log('Scenario changed:', data);
            // Update prediction layer
            predictionLayerPlugin.updatePrediction(data.result, data.year, data.scenario);
          }}
        />
      )}

      {viewMode === 'insights' && (
        <InsightsPanel
          aiAssistant={engines.aiAssistant}
          onRecommendationClick={(insight) => {
            console.log('Applying:', insight.recommendation);
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// STEP 9: CONNECT LAYERS TO ENGINES
// ============================================================

function connectLayersToEngines(layers, engines) {
  // Update prediction layer when predictions change
  engines.prediction.on('prediction:computed', (result) => {
    const predictionLayer = layers.get('prediction');
    predictionLayer?.updatePrediction(result, result.year, result.scenario);
  });

  // Update NDVI layer when satellite data loads
  engines.satellite.on('satellite:tile-loaded', (event) => {
    const ndviLayer = layers.get('ndvi');
    ndviLayer?.updateNDVIData(event.result);
  });

  // Update planning layer with recommendations
  engines.planning.on('planning:simulation-complete', (result) => {
    const planningLayer = layers.get('planning');
    planningLayer?.updateRecommendations('park', result);
  });

  // Update build layer with placements
  engines.build.on('build:confirmed', (placement) => {
    const buildLayer = layers.get('build');
    buildLayer?.addPlacement(placement);
  });

  engines.build.on('build:removed', (placement) => {
    const buildLayer = layers.get('build');
    buildLayer?.removePlacement(placement.id, placement.type);
  });
}

// ============================================================
// STEP 10: PERFORMANCE OPTIMIZATION
// ============================================================

/**
 * CRITICAL PERFORMANCE RULES:
 * 
 * 1. Always run heavy computations in Web Workers
 *    • Prediction analysis
 *    • Satellite data processing
 *    • Planning simulations
 *    • Build validation
 * 
 * 2. Cache results aggressively
 *    • Prediction results by (scenario, year)
 *    • NDVI tiles by bounds
 *    • Planning evaluations
 * 
 * 3. Use FrameController for all animations
 *    • Layer updates
 *    • UI transitions
 *    • Real-time simulations
 * 
 * 4. Throttle/debounce map events
 *    • Pan/zoom events → throttle to 100ms
 *    • Click events → debounce place operations
 *    • Viewport changes → limit tile loading
 * 
 * 5. Manage memory lifecycle
 *    • Cleanup destroyed engines properly
 *    • Remove event listeners on unmount
 *    • Clear unused layer sources
 */

// ============================================================
// COMPLETE EXAMPLE: MAP INTEGRATION
// ============================================================

import MapEngine from './engines/MapEngine';
import LayerEngine from './engines/LayerEngine';

function CompleteUrbanOS() {
  const [engines, setEngines] = useState({});
  const mapRef = useRef(null);

  useEffect(() => {
    const setUp = async () => {
      // 1. Initialize MapEngine
      const mapEngine = new MapEngine();
      const map = mapEngine.init(mapRef.current, { center: [-74.006, 40.7128], zoom: 11 });

      // 2. Initialize LayerEngine
      const layerEngine = new LayerEngine();
      mapEngine.setLayerEngine(layerEngine);

      // 3. Register all layer plugins
      initializeLayerSystem(layerEngine);

      // 4. Initialize all AI engines
      const pred = new PredictionEngine();
      await pred.initialize();

      const sat = new SatelliteEngine();
      await sat.initialize();

      const planning = new PlanningEngine();
      await planning.initialize();

      const build = new BuildEngine();

      const allEngines = {
        map: mapEngine,
        layer: layerEngine,
        prediction: pred,
        satellite: sat,
        planning: planning,
        build: build,
        aiAssistant: AIAssistant,
      };

      // 5. Connect everything
      connectLayersToEngines(layerEngine.getRegistry(), allEngines);

      setEngines(allEngines);
    };

    setUp();

    return () => {
      Object.values(engines).forEach((e) => e?.destroy?.());
    };
  }, []);

  return (
    <div className="urban-os">
      <div ref={mapRef} className="map-container" />
      <MyGameUI engines={engines} />
    </div>
  );
}

export default CompleteUrbanOS;

// ============================================================
// TROUBLESHOOTING
// ============================================================

/**
 * Common Issues:
 * 
 * 1. Workers not loading
 *    → Check import paths in engines
 *    → Ensure vite.config.js has worker support
 * 
 * 2. Layer updates not visible
 *    → Call setData() on sources after engine updates
 *    → Verify layer visibility is set to 'visible'
 *    → Check z-index/order in map.addLayer()
 * 
 * 3. Budget not updating
 *    → Ensure build:budget-changed event is listened
 *    → Check placement cost calculation
 *    → Verify callback is called in confirmPlacement()
 * 
 * 4. Predictions taking too long
 *    → Increase worker timeout
 *    → Check worker console for errors
 *    → Verify math operations in worker
 * 
 * 5. Memory leaks
 *    → Call destroy() on all engines
 *    → Unsubscribe from all event listeners
 *    → Remove all map layers/sources
 */

export {
  PredictionEngine,
  SatelliteEngine,
  PlanningEngine,
  BuildEngine,
  AIAssistant,
  PredictionLayerPlugin,
  NDVILayerPlugin,
  PlanningLayerPlugin,
  BuildLayerPlugin,
  BuilderUI,
  InsightsPanel,
  PredictionViewer,
  CompleteUrbanOS,
};
