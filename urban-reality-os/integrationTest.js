// ================================================
// integrationTest.js — Urban Intelligence Verification
// ================================================
// Run this to verify all components are properly initialized
// and communicating. Logs to console for debugging.
// ================================================

import EventBus from './src/core/EventBus';
import PredictionEngine from './src/engines/PredictionEngine';
import SatelliteEngine from './src/engines/SatelliteEngine';
import PlanningEngine from './src/engines/PlanningEngine';
import BuildEngine from './src/engines/BuildEngine';
import AIAssistant from './src/engines/AIAssistant';

/**
 * Run integration tests to verify Urban Intelligence OS is working
 * Call this function from browser console or include in development build
 */
export async function runIntegrationTests() {
  console.log('🧪 [TEST] Starting Urban Intelligence Integration Tests...\n');

  const results = {
    passed: 0,
    failed: 0,
    tests: [],
  };

  // ═══════════════════════════════════════════════════════════
  // TEST 1: PredictionEngine Initialization
  // ═══════════════════════════════════════════════════════════
  try {
    console.log('📋 TEST 1: PredictionEngine initialization...');
    const predictionEngine = PredictionEngine.initialize();
    const prediction = await predictionEngine.predictPopulationGrowth(
      { population: 500000, density: 45 },
      2050,
      'moderate'
    );
    
    if (prediction && prediction.population > 500000) {
      console.log('✅ PASS: PredictionEngine working. Population projection:', prediction.population);
      results.passed++;
      results.tests.push({ name: 'PredictionEngine', status: 'PASS' });
    } else {
      throw new Error('Invalid prediction result');
    }
  } catch (err) {
    console.error('❌ FAIL: PredictionEngine -', err.message);
    results.failed++;
    results.tests.push({ name: 'PredictionEngine', status: 'FAIL', error: err.message });
  }

  // ═══════════════════════════════════════════════════════════
  // TEST 2: SatelliteEngine Initialization
  // ═══════════════════════════════════════════════════════════
  try {
    console.log('\n📋 TEST 2: SatelliteEngine initialization...');
    const satelliteEngine = new SatelliteEngine();
    satelliteEngine.initialize();
    const ndviData = await satelliteEngine.fetchNDVI(
      { north: 40.8, south: 40.7, east: -74.0, west: -74.1 }
    );
    
    if (ndviData && ndviData.ndviValues) {
      console.log('✅ PASS: SatelliteEngine working. NDVI tiles fetched:', ndviData.ndviValues.length);
      results.passed++;
      results.tests.push({ name: 'SatelliteEngine', status: 'PASS' });
    } else {
      throw new Error('Invalid NDVI data');
    }
  } catch (err) {
    console.error('❌ FAIL: SatelliteEngine -', err.message);
    results.failed++;
    results.tests.push({ name: 'SatelliteEngine', status: 'FAIL', error: err.message });
  }

  // ═══════════════════════════════════════════════════════════
  // TEST 3: PlanningEngine Initialization
  // ═══════════════════════════════════════════════════════════
  try {
    console.log('\n📋 TEST 3: PlanningEngine initialization...');
    const planningEngine = new PlanningEngine();
    planningEngine.initialize();
    const recommendations = await planningEngine.recommendPlacement(
      {
        population: 500000,
        density: 45,
        infrastructure: { stress: 0.5 },
      },
      'building'
    );
    
    if (recommendations && recommendations.length > 0) {
      console.log('✅ PASS: PlanningEngine working. Recommendations:', recommendations.length);
      results.passed++;
      results.tests.push({ name: 'PlanningEngine', status: 'PASS' });
    } else {
      throw new Error('No recommendations generated');
    }
  } catch (err) {
    console.error('❌ FAIL: PlanningEngine -', err.message);
    results.failed++;
    results.tests.push({ name: 'PlanningEngine', status: 'FAIL', error: err.message });
  }

  // ═══════════════════════════════════════════════════════════
  // TEST 4: BuildEngine Initialization
  // ═══════════════════════════════════════════════════════════
  try {
    console.log('\n📋 TEST 4: BuildEngine initialization...');
    const buildEngine = new BuildEngine();
    const preview = buildEngine.previewPlacement({
      type: 'road',
      lng: -74.0,
      lat: 40.75,
      size: 1,
    });
    
    if (preview && preview.cost > 0 && preview.isValid !== undefined) {
      console.log('✅ PASS: BuildEngine working. Preview cost:', preview.cost);
      results.passed++;
      results.tests.push({ name: 'BuildEngine', status: 'PASS' });
    } else {
      throw new Error('Invalid preview');
    }
  } catch (err) {
    console.error('❌ FAIL: BuildEngine -', err.message);
    results.failed++;
    results.tests.push({ name: 'BuildEngine', status: 'FAIL', error: err.message });
  }

  // ═══════════════════════════════════════════════════════════
  // TEST 5: AIAssistant Initialization
  // ═══════════════════════════════════════════════════════════
  try {
    console.log('\n📋 TEST 5: AIAssistant initialization...');
    const cityState = {
      population: 500000,
      density: 45,
      infrastructure: { stress: 0.65 },
      flood: { risk: 0.4 },
      heat: { index: 72 },
      green: { coverage: 0.3 },
    };
    const insights = await AIAssistant.analyzeCity(cityState);
    
    if (insights && insights.length > 0) {
      console.log('✅ PASS: AIAssistant working. Insights:', insights.length);
      results.passed++;
      results.tests.push({ name: 'AIAssistant', status: 'PASS' });
    } else {
      throw new Error('No insights generated');
    }
  } catch (err) {
    console.error('❌ FAIL: AIAssistant -', err.message);
    results.failed++;
    results.tests.push({ name: 'AIAssistant', status: 'FAIL', error: err.message });
  }

  // ═══════════════════════════════════════════════════════════
  // TEST 6: EventBus Communication
  // ═══════════════════════════════════════════════════════════
  try {
    console.log('\n📋 TEST 6: EventBus communication...');
    let eventReceived = false;
    const testListener = (data) => {
      eventReceived = true;
    };
    
    EventBus.on('test:event', testListener);
    EventBus.emit('test:event', { test: true });
    
    if (eventReceived) {
      console.log('✅ PASS: EventBus working. Events propagating correctly.');
      results.passed++;
      results.tests.push({ name: 'EventBus', status: 'PASS' });
    } else {
      throw new Error('Event not received');
    }
    
    EventBus.off('test:event', testListener);
  } catch (err) {
    console.error('❌ FAIL: EventBus -', err.message);
    results.failed++;
    results.tests.push({ name: 'EventBus', status: 'FAIL', error: err.message });
  }

  // ═══════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('═'.repeat(60));
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`📈 Success Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`);
  console.log('\nDetailed Results:');
  results.tests.forEach(test => {
    const icon = test.status === 'PASS' ? '✅' : '❌';
    console.log(`${icon} ${test.name}: ${test.status}${test.error ? ` - ${test.error}` : ''}`);
  });

  if (results.failed === 0) {
    console.log('\n🎉 All tests passed! Urban Intelligence OS is fully operational.');
  } else {
    console.log('\n⚠️ Some tests failed. Check logs above for details.');
  }

  return results;
}

/**
 * Quick health check — minimal verification
 */
export function quickHealthCheck() {
  console.log('🏥 [HEALTH CHECK] Urban Intelligence OS');
  
  try {
    const checks = {};
    
    // Check window globals
    checks.engines = !!window.__URBAN_INTELLIGENCE__?.predictionEngine;
    checks.eventBus = !!window.__URBAN_INTELLIGENCE__?.EventBus;
    checks.layerRegistry = !!window.__URBAN_INTELLIGENCE__?.layerRegistry;
    
    const passed = Object.values(checks).filter(Boolean).length;
    const total = Object.keys(checks).length;
    
    console.log(`✅ ${passed}/${total} components initialized`);
    console.table(checks);
    
    return passed === total;
  } catch (err) {
    console.error('❌ Health check failed:', err.message);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════
// EXPORT FOR BROWSER CONSOLE
// ═══════════════════════════════════════════════════════════
if (typeof window !== 'undefined') {
  window.__URBAN_INTELLIGENCE_TEST__ = {
    runIntegrationTests,
    quickHealthCheck,
  };
  
  console.log('%c🌆 Urban Intelligence OS - Integration Test Tools Ready', 'color: #4caf50; font-weight: bold; font-size: 14px');
  console.log('Available commands:');
  console.log('  window.__URBAN_INTELLIGENCE_TEST__.runIntegrationTests()');
  console.log('  window.__URBAN_INTELLIGENCE_TEST__.quickHealthCheck()');
}

export default { runIntegrationTests, quickHealthCheck };
