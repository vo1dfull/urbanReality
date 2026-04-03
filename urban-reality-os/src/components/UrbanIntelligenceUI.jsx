// ================================================
// UrbanIntelligenceUI.jsx — Integrated UI Container
// ================================================
// Mounts all 3 UI components with proper binding
// to core engines. Manages UI state and interactions.
// ================================================

import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import BuilderUI from './BuilderUI';
import InsightsPanel from './InsightsPanel';
import PredictionViewer from './PredictionViewer';
import styles from './UrbanIntelligenceUI.module.css';
import EventBus from '../core/EventBus';

/**
 * Integrated UI container managing:
 * - BuilderUI (SimCity-style construction)
 * - InsightsPanel (AI recommendations)
 * - PredictionViewer (growth forecasting)
 */
export default function UrbanIntelligenceUI({
  engines,
  initError,
  onPanelChange,
}) {
  const { buildEngine, aiAssistant, predictionEngine } = engines || {};

  // ═══════════════════════════════════════════════════════════
  // Safety Check
  // ═══════════════════════════════════════════════════════════
  if (!engines || Object.keys(engines).length === 0) {
    return (
      <div className={styles.container} style={{ zIndex: 10020 }}>
        <div style={{ padding: '14px', color: '#fff' }}>
          <strong>Urban Intelligence</strong>
          <p>Loading engines... If this persists, check console for initialization errors.</p>
          {initError && (
            <p style={{ marginTop: 8, color: '#ff9999', fontSize: 12 }}>
              Error: {initError.message || String(initError)}
            </p>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // State Management
  // ═══════════════════════════════════════════════════════════
  const [activePanel, setActivePanel] = useState('builder'); // 'builder' | 'insights' | 'predictions'
  const [isExpanded, setIsExpanded] = useState(true);
  const [budget, setBudget] = useState(1000000);
  const [insights, setInsights] = useState([]);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  // ═══════════════════════════════════════════════════════════
  // Event Listeners
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    // Listen for budget changes
    const onBudgetChanged = (data) => {
      setBudget(data.budget);
    };
    EventBus.on('build:budget-changed', onBudgetChanged);

    // Listen for AI analysis completion
    const onAnalysisComplete = (data) => {
      setInsights(data.insights || []);
      setAnalysisLoading(false);
    };
    EventBus.on('assistant:analysis-complete', onAnalysisComplete);

    // Listen for analysis start
    const onAnalysisStart = () => {
      setAnalysisLoading(true);
    };
    EventBus.on('assistant:analysis-start', onAnalysisStart);

    return () => {
      EventBus.off('build:budget-changed', onBudgetChanged);
      EventBus.off('assistant:analysis-complete', onAnalysisComplete);
      EventBus.off('assistant:analysis-start', onAnalysisStart);
    };
  }, []);

  // ═══════════════════════════════════════════════════════════
  // Callbacks
  // ═══════════════════════════════════════════════════════════
  const handlePanelChange = useCallback((panel) => {
    setActivePanel(panel);
    onPanelChange?.(panel);
  }, [onPanelChange]);

  const handleToggleExpand = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  // ═══════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════
  if (!engines) {
    return null; // Not ready yet
  }

  return (
    <div className={styles.container}>
      {/* ── Tab Navigation ── */}
      <div className={styles.tabNav}>
        <button
          className={`${styles.tab} ${activePanel === 'builder' ? styles.active : ''}`}
          onClick={() => handlePanelChange('builder')}
          title="SimCity-style building interface"
        >
          🏗️ Build
        </button>
        <button
          className={`${styles.tab} ${activePanel === 'insights' ? styles.active : ''}`}
          onClick={() => handlePanelChange('insights')}
          title="AI-generated insights and recommendations"
        >
          💡 Insights
        </button>
        <button
          className={`${styles.tab} ${activePanel === 'predictions' ? styles.active : ''}`}
          onClick={() => handlePanelChange('predictions')}
          title="Growth forecasts and scenarios"
        >
          🔮 Predictions
        </button>
        <button
          className={styles.toggleBtn}
          onClick={handleToggleExpand}
          title={isExpanded ? 'Collapse' : 'Expand'}
        >
          {isExpanded ? '←' : '→'}
        </button>
      </div>

      {/* ── Panel Content ── */}
      <AnimatePresence mode="wait">
        {isExpanded && (
          <motion.div
            key={activePanel}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className={styles.panelContent}
          >
            {/* Builder Panel */}
            {activePanel === 'builder' && buildEngine && (
              <div className={styles.builderWrapper}>
                <h2 className={styles.title}>🏗️ City Builder</h2>
                <div className={styles.budgetDisplay}>
                  Budget: <strong>${budget.toLocaleString()}</strong> credits
                </div>
                <ErrorBoundary>
                  <BuilderUI
                    buildEngine={buildEngine}
                    budget={budget}
                    onBudgetChanged={setBudget}
                  />
                </ErrorBoundary>
              </div>
            )}

            {/* Insights Panel */}
            {activePanel === 'insights' && aiAssistant && (
              <div className={styles.insightsWrapper}>
                <h2 className={styles.title}>💡 AI Insights & Recommendations</h2>
                {analysisLoading && (
                  <div className={styles.loading}>
                    <span>🔄 Analyzing city state...</span>
                  </div>
                )}
                <ErrorBoundary>
                  <InsightsPanel
                    aiAssistant={aiAssistant}
                    insights={insights}
                    loading={analysisLoading}
                    onRefresh={() => {
                      EventBus.emit('assistant:analysis-start');
                      try {
                        aiAssistant?.analyzeCity?.({
                          population: 500000,
                          density: 45,
                          infrastructure: { stress: 0.65 },
                          flood: { risk: 0.4 },
                          heat: { index: 72 },
                          green: { coverage: 0.3 },
                        }).then(insights => {
                          EventBus.emit('assistant:analysis-complete', { insights });
                        }).catch(e => {
                          console.error('[UI] Analysis error:', e);
                          setAnalysisLoading(false);
                        });
                      } catch (e) {
                        console.error('[UI] Analysis error:', e);
                        setAnalysisLoading(false);
                      }
                    }}
                  />
                </ErrorBoundary>
              </div>
            )}

            {/* Prediction Panel */}
            {activePanel === 'predictions' && predictionEngine && (
              <div className={styles.predictionsWrapper}>
                <h2 className={styles.title}>🔮 Growth Projections</h2>
                <ErrorBoundary>
                  <PredictionViewer
                    predictionEngine={predictionEngine}
                    onScenarioChange={(data) => {
                      console.log('[UI] Scenario changed:', data);
                      EventBus.emit('prediction:user-selected', data);
                    }}
                  />
                </ErrorBoundary>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Minimized View ── */}
      {!isExpanded && (
        <motion.div
          className={styles.minimized}
          onClick={handleToggleExpand}
          title="Click to expand"
        >
          {activePanel === 'builder' && '🏗️'}
          {activePanel === 'insights' && '💡'}
          {activePanel === 'predictions' && '🔮'}
        </motion.div>
      )}
    </div>
  );
}

/**
 * Simple error boundary for component errors
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '12px',
          background: 'rgba(255, 0, 0, 0.1)',
          border: '1px solid rgba(255, 0, 0, 0.3)',
          borderRadius: '6px',
          color: '#ff6b6b',
          fontSize: '12px',
        }}>
          <strong>⚠️ Component Error</strong><br/>
          {this.state.error?.message}
        </div>
      );
    }

    return this.props.children;
  }
}
