# Urban Intelligence OS — Quick Start Guide

## For Developers

### Installation

1. **Ensure all files are in place:**
   ```bash
   bash deploy-checklist.sh
   ```

2. **Start development server:**
   ```bash
   npm run dev
   ```

3. **Open in browser:**
   ```
   http://localhost:5173
   ```

### Verification

**In browser console, run:**

```javascript
// Quick health check
window.__URBAN_INTELLIGENCE_TEST__.quickHealthCheck()

// Full integration tests
window.__URBAN_INTELLIGENCE_TEST__.runIntegrationTests()
```

**Expected output:** All checks should pass with green ✅

### Using the System

Once MapView loads, you should see:

- **Right sidebar:** Urban Intelligence UI with 3 tabs
- **Map:** Interactive city simulation layer
- **UI Tabs:**
  - 🏗️ **Build** — Place buildings, roads, parks, facilities
  - 💡 **Insights** — AI-generated recommendations
  - 🔮 **Predictions** — Growth forecasts by scenario

### Example Actions

#### 1. Place a Building (BuilderUI)

```
1. Click "🏗️ Build" tab
2. Select building type (road, building, green zone, facility)
3. Click location on map
4. Review preview (cost, impact, validity)
5. Click "Confirm"
→ Building appears on map
→ Budget decreases
→ AI re-analyzes
```

#### 2. View AI Insights (InsightsPanel)

```
1. Click "💡 Insights" tab
2. See categories: Risk, Opportunity, Inefficiency
3. Click insight for details
4. Click "Apply" to implement recommendation
→ Details explain why the insight matters
→ Recommended actions are shown
```

#### 3. View Growth Forecasts (PredictionViewer)

```
1. Click "🔮 Predictions" tab
2. Select scenario: Conservative, Moderate, Aggressive
3. Select year: 2030-2070
4. See metrics:
   - Population projection
   - Sprawl extent
   - Infrastructure demand
   - Land value appreciation
5. See recommended zones for expansion
```

### Accessing Engines Directly

In browser console:

```javascript
// Get reference to any engine
const engines = window.__URBAN_INTELLIGENCE__;

// Prediction Engine
engines.predictionEngine.predictPopulationGrowth(
  { population: 500000, density: 45 },
  2050,
  'moderate'
);

// Satellite Engine
engines.satelliteEngine.fetchNDVI({ 
  north: 40.8, south: 40.7, east: -74.0, west: -74.1 
});

// Planning Engine
engines.planningEngine.recommendPlacement(
  { population: 500000, density: 45 },
  'building'
);

// Build Engine
engines.buildEngine.previewPlacement({
  type: 'road',
  lng: -74.0,
  lat: 40.75
});

// AI Assistant
engines.aiAssistant.analyzeCity({
  population: 500000,
  density: 45,
  infrastructure: { stress: 0.65 },
  flood: { risk: 0.4 },
  heat: { index: 72 },
  green: { coverage: 0.3 }
});
```

### Listening to Events

```javascript
const bus = window.__URBAN_INTELLIGENCE__.EventBus;

// When building is placed
bus.on('build:confirmed', (placement) => {
  console.log('Building placed:', placement);
});

// When prediction completes
bus.on('prediction:computed', (data) => {
  console.log('Prediction ready:', data);
});

// When AI analysis completes
bus.on('assistant:analysis-complete', (data) => {
  console.log('AI Insights:', data.insights);
});

// All events
bus.on('*', (event, data) => {
  console.log('Event:', event, data);
});
```

### Adjusting Configuration

**AI Analysis Interval** (defaults to 15 seconds):

In `src/hooks/useUrbanIntelligence.js`:
```javascript
aiAssistant.startAnalysis(initialCityState, 5000); // 5 seconds
```

**Budget** (defaults to 1,000,000 credits):

In `src/components/UrbanIntelligenceUI.jsx`:
```javascript
const [budget, setBudget] = useState(5000000); // 5 million
```

**Layer Visibility**:

In `src/hooks/useUrbanIntelligence.js`:
```javascript
// Control opacity (0-1)
predictionLayer.setOpacity(0.5);
ndviLayer.setOpacity(0.6);
planningLayer.setOpacity(0.4);
buildLayer.setOpacity(0.8);
```

### Debugging

**Enable verbose logging:**

Add to `src/hooks/useUrbanIntelligence.js`:
```javascript
const debugMode = true;

if (debugMode) {
  EventBus.on('*', (event, data) => {
    console.log('[EVENT]', event, data);
  });
}
```

**Inspect layer data:**

```javascript
const registry = window.__URBAN_INTELLIGENCE__.layerRegistry;
const prediction = registry.getPlugin('prediction');
console.log('Prediction data:', prediction);
```

**Profile worker performance:**

In DevTools:
1. Open Performance tab
2. Record while performing action
3. Look for `predictionWorker`, `satelliteWorker`, `planningWorker` tasks
4. Should see <20ms duration per operation

### Common Issues

| Issue | Solution |
|-------|----------|
| "UrbanIntelligenceUI not showing" | Verify MapView loaded, check console for errors |
| "Budget not updating" | Verify BuildEngine emits 'build:budget-changed' event |
| "Predictions not on map" | Check PredictionEngine returns valid data in console |
| "AI not analyzing" | Verify AIAssistant.startAnalysis() was called |
| "Events not firing" | Check event names match exactly (case-sensitive) |
| "Worker timeout" | Increase timeout in worker initialization |

### Performance Targets

- **Main thread:** <16ms per frame (60fps) ✅
- **Worker operations:** 5-20ms ✅
- **Layer updates:** <2ms ✅
- **UI re-renders:** Minimal (only on state change) ✅

### Testing

**Run full integration test:**

```javascript
const results = await window.__URBAN_INTELLIGENCE_TEST__.runIntegrationTests();
console.table(results.tests);
```

**Test individual engine:**

```javascript
// Test PredictionEngine
const pred = window.__URBAN_INTELLIGENCE__.predictionEngine;
pred.predictPopulationGrowth({population: 500000}, 2050, 'moderate')
  .then(result => console.log('Population:', result.population));
```

### Next Steps

1. ✅ Run health check
2. ✅ Place a building and watch budget decrease
3. ✅ Switch to Insights and see AI recommendations
4. ✅ Switch to Predictions and view growth scenarios
5. ✅ Open console and inspect `window.__URBAN_INTELLIGENCE__`
6. ✅ Run integration tests
7. ✅ Deploy with confidence!

### Documentation

- **Full Integration Guide:** [URBAN_INTELLIGENCE_INTEGRATION.md](URBAN_INTELLIGENCE_INTEGRATION.md)
- **Architecture Reference:** [ARCHITECTURE_REFERENCE.md](ARCHITECTURE_REFERENCE.md)
- **Integration Summary:** [INTEGRATION_SUMMARY.md](INTEGRATION_SUMMARY.md)
- **API Docs:** See docstrings in engine files

### Support

If something isn't working:

1. Check browser console for errors
2. Run `window.__URBAN_INTELLIGENCE_TEST__.quickHealthCheck()`
3. Run `window.__URBAN_INTELLIGENCE_TEST__.runIntegrationTests()`
4. Check `INTEGRATION_SUMMARY.md` troubleshooting section
5. Verify all files in place with `bash deploy-checklist.sh`

---

**Version:** 1.0
**Status:** Production Ready ✅
**Last Updated:** April 3, 2026
**Questions?** Check the documentation files or review engine source code
