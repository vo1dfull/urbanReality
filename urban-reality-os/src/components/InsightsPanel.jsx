// ================================================
// InsightsPanel.jsx — AI Assistant insights display
// ================================================

import React, { useState, useEffect } from 'react';
import styles from './InsightsPanel.module.css';

/**
 * Insights Panel Component
 * Displays AI-generated insights and recommendations
 */
export function InsightsPanel({ aiAssistant, onRecommendationClick }) {
  const [insights, setInsights] = useState([]);
  const [selectedInsight, setSelectedInsight] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState('risk');

  useEffect(() => {
    if (!aiAssistant) return;

    // Subscribe to analysis updates
    const unsubscribe = aiAssistant.on('assistant:analysis-complete', (data) => {
      setInsights(data.insights || []);
    });

    return unsubscribe;
  }, [aiAssistant]);

  const getCategoryIcon = (category) => {
    const icons = {
      risk: '⚠️',
      opportunity: '🎯',
      inefficiency: '⚙️',
    };
    return icons[category] || '💡';
  };

  const getCategoryColor = (category) => {
    const colors = {
      risk: '#f44336',
      opportunity: '#4caf50',
      inefficiency: '#ff9800',
    };
    return colors[category];
  };

  const groupedInsights = {
    risk: insights.filter((i) => i.category === 'risk'),
    opportunity: insights.filter((i) => i.category === 'opportunity'),
    inefficiency: insights.filter((i) => i.category === 'inefficiency'),
  };

  const handleSelectInsight = (insight) => {
    setSelectedInsight(insight);
  };

  const handleApply = (insight) => {
    if (onRecommendationClick) {
      onRecommendationClick(insight);
    }
  };

  return (
    <div className={styles.insightsPanel}>
      <div className={styles.header}>
        <div className={styles.titleSection}>
          <h2>🤖 AI Insights</h2>
          <span className={styles.count}>{insights.length} issues detected</span>
        </div>
        <button
          className={styles.refreshBtn}
          onClick={() => {
            if (aiAssistant) {
              setIsLoading(true);
              aiAssistant.analyzeCity({}).finally(() => setIsLoading(false));
            }
          }}
          disabled={isLoading}
        >
          {isLoading ? '⟳ Analyzing...' : '🔄 Refresh'}
        </button>
      </div>

      {insights.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>🎉</div>
          <p>Great! Your city is running smoothly.</p>
          <p className={styles.subtext}>Check back as your city evolves.</p>
        </div>
      ) : (
        <>
          {/* Category Tabs */}
          <div className={styles.tabs}>
            {['risk', 'opportunity', 'inefficiency'].map((category) => (
              <button
                key={category}
                className={`${styles.tab} ${expandedCategory === category ? styles.active : ''}`}
                onClick={() => setExpandedCategory(category)}
              >
                <span className={styles.categoryIcon}>{getCategoryIcon(category)}</span>
                <span>{category.charAt(0).toUpperCase() + category.slice(1)}</span>
                <span className={styles.badge}>{groupedInsights[category].length}</span>
              </button>
            ))}
          </div>

          {/* Insights List */}
          <div className={styles.insightsList}>
            {groupedInsights[expandedCategory].map((insight) => (
              <div
                key={insight.id}
                className={`${styles.insightItem} ${selectedInsight?.id === insight.id ? styles.selected : ''}`}
                onClick={() => handleSelectInsight(insight)}
              >
                <div className={styles.itemHeader}>
                  <div className={styles.titleRow}>
                    <span
                      className={styles.categoryBadge}
                      style={{ backgroundColor: getCategoryColor(insight.category) + '40' }}
                    >
                      {getCategoryIcon(insight.category)}
                    </span>
                    <h4>{insight.title}</h4>
                  </div>
                  <div className={styles.priority}>
                    <span className={styles.priorityLabel}>Priority</span>
                    <div
                      className={styles.priorityBar}
                      style={{ '--priority': `${insight.priority}%` }}
                    >
                      {insight.priority}
                    </div>
                  </div>
                </div>

                <p className={styles.description}>{insight.description}</p>

                <div className={styles.impactBadge}>
                  <span className={styles.impactLabel}>Potential Impact</span>
                  <span className={styles.impactValue}>+{insight.impact}%</span>
                </div>

                <div className={styles.recommendation}>
                  <strong>💡 Recommended:</strong> {insight.recommendation}
                </div>
              </div>
            ))}

            {groupedInsights[expandedCategory].length === 0 && (
              <div className={styles.categoryEmpty}>
                <p>No {expandedCategory} issues detected</p>
              </div>
            )}
          </div>

          {/* Detail View */}
          {selectedInsight && (
            <div className={styles.detailView}>
              <div className={styles.detailHeader}>
                <h3>{selectedInsight.title}</h3>
                <button
                  className={styles.closeDetail}
                  onClick={() => setSelectedInsight(null)}
                >
                  ✕
                </button>
              </div>

              <div className={styles.detailContent}>
                <div className={styles.section}>
                  <h4>Why This Matters</h4>
                  <p>{selectedInsight.description}</p>
                </div>

                <div className={styles.section}>
                  <h4>All Recommendations</h4>
                  <ol className={styles.recommendations}>
                    {selectedInsight.recommendations.map((rec, i) => (
                      <li key={i}>{rec}</li>
                    ))}
                  </ol>
                </div>

                {selectedInsight.data && (
                  <div className={styles.section}>
                    <h4>Supporting Metrics</h4>
                    <div className={styles.metrics}>
                      {selectedInsight.data && Object.entries(selectedInsight.data).map(([key, value]) => (
                        <div key={key} className={styles.metric}>
                          <span className={styles.metricLabel}>{key}</span>
                          <span className={styles.metricValue}>
                            {typeof value === 'number' ? value.toFixed(1) : value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  className={styles.applyBtn}
                  onClick={() => handleApply(selectedInsight)}
                >
                  👉 Apply This Recommendation
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default InsightsPanel;
