// ================================================
// AIAssistant — Intelligent urban planning advisor
// Analyzes city state, suggests improvements, explains reasoning
// ================================================

import EventBus from '../core/EventBus';
import { createLogger } from '../core/Logger';

const log = createLogger('AIAssistant');

/**
 * @typedef {Object} Insight
 * @property {string} id
 * @property {string} category — 'risk' | 'opportunity' | 'inefficiency'
 * @property {number} priority — 0-100
 * @property {string} title
 * @property {string} description
 * @property {string} recommendation
 * @property {object} data — supporting metrics
 * @property {number} impact — estimated improvement %
 */

export class AIAssistant {
  constructor() {
    this.state = {
      insights: [],
      recommendations: [],
      isAnalyzing: false,
      lastAnalysisTime: 0,
      analysisInterval: 10000, // Update insights every 10s
      contextWindow: null, // Recent analysis context
    };

    this.eventBus = EventBus;
    this._destroyed = false;
    this._analysisSchedule = null;
    this._knowledgeBase = this._initializeKnowledgeBase();
  }

  /**
   * Initialize knowledge base with decision rules
   */
  _initializeKnowledgeBase() {
    return {
      risks: [
        {
          condition: (state) => state.floodRisk > 60,
          title: 'High Flood Risk',
          category: 'risk',
          priority: 95,
          recommendations: [
            'Add green zones to increase water absorption',
            'Elevate critical infrastructure',
            'Install flood management systems',
          ],
        },
        {
          condition: (state) => state.heat > 65,
          title: 'Excessive Urban Heat',
          category: 'risk',
          priority: 80,
          recommendations: [
            'Increase vegetation coverage by 20%',
            'Add parks near high-density areas',
            'Improve building reflectivity standards',
          ],
        },
        {
          condition: (state) => state.infrastructure.stress > 70,
          title: 'Infrastructure Overload',
          category: 'risk',
          priority: 85,
          recommendations: [
            'Expand road network capacity',
            'Add public transit lines',
            'Install new utility infrastructure',
          ],
        },
      ],

      opportunities: [
        {
          condition: (state) => state.population.growth > 3 && state.infrastructure.coverage < 0.7,
          title: 'High-Growth Area Underserved',
          category: 'opportunity',
          priority: 70,
          recommendations: [
            'Build new facilities in growth zones',
            'Expand road network',
            'Add housing development',
          ],
        },
        {
          condition: (state) => state.ndvi && state.ndvi.mean > 0.6 && state.accessibility < 0.5,
          title: 'Green Area Low Accessibility',
          category: 'opportunity',
          priority: 55,
          recommendations: [
            'Connect green zones with trail system',
            'Add transit access',
            'Develop recreational facilities',
          ],
        },
      ],

      inefficiencies: [
        {
          condition: (state) => state.traffic && state.traffic.congestion > 0.6,
          title: 'Traffic Congestion Hot Spots',
          category: 'inefficiency',
          priority: 65,
          recommendations: [
            'Add parallel roads',
            'Improve traffic signal timing',
            'Encourage transit adoption',
          ],
        },
        {
          condition: (state) => state.facilities && state.facilities.schools < state.population * 0.0002,
          title: 'Insufficient Schools',
          category: 'inefficiency',
          priority: 60,
          recommendations: [
            'Build new schools',
            'Expand educational capacity',
            'Add secondary education facilities',
          ],
        },
      ],
    };
  }

  /**
   * Analyze current city state and generate insights
   * @param {object} cityState
   * @returns {Promise<array>}
   */
  async analyzeCity(cityState = {}) {
    if (this._destroyed) return [];

    this.state.isAnalyzing = true;
    this.eventBus.emit('assistant:analyzing');

    try {
      const insights = [];

      // Evaluate all rules
      for (const riskRule of this._knowledgeBase.risks) {
        if (riskRule.condition(cityState)) {
          insights.push(this._createInsight(riskRule, cityState, 'risk'));
        }
      }

      for (const oppRule of this._knowledgeBase.opportunities) {
        if (oppRule.condition(cityState)) {
          insights.push(this._createInsight(oppRule, cityState, 'opportunity'));
        }
      }

      for (const effRule of this._knowledgeBase.inefficiencies) {
        if (effRule.condition(cityState)) {
          insights.push(this._createInsight(effRule, cityState, 'inefficiency'));
        }
      }

      // Sort by priority
      insights.sort((a, b) => b.priority - a.priority);

      this.state.insights = insights;
      this.state.lastAnalysisTime = Date.now();
      this.state.contextWindow = cityState;

      this.eventBus.emit('assistant:analysis-complete', { insights });

      log.info(`Generated ${insights.length} insights`);

      return insights;
    } finally {
      this.state.isAnalyzing = false;
    }
  }

  /**
   * Create insight object
   */
  _createInsight(rule, cityState, category) {
    return {
      id: `insight-${Date.now()}-${Math.random()}`,
      category,
      priority: rule.priority,
      title: rule.title,
      description: this._generateDescription(rule, cityState),
      recommendations: rule.recommendations,
      recommendation: rule.recommendations[0], // Primary recommendation
      data: this._extractSupportingData(rule, cityState),
      impact: this._estimateImpact(rule, cityState),
      timestamp: Date.now(),
    };
  }

  /**
   * Start continuous analysis
   * @param {object} cityState
   * @param {number} interval — ms between analyses
   */
  startAnalysis(cityState = {}, interval = this.state.analysisInterval) {
    if (this._analysisSchedule) {
      clearInterval(this._analysisSchedule);
    }

    this.state.analysisInterval = interval;

    // Initial analysis
    this.analyzeCity(cityState);

    // Schedule ongoing analysis
    this._analysisSchedule = setInterval(() => {
      if (this.state.contextWindow) {
        this.analyzeCity(this.state.contextWindow);
      }
    }, interval);

    log.info(`Started continuous analysis (${interval}ms interval)`);
  }

  /**
   * Stop continuous analysis
   */
  stopAnalysis() {
    if (this._analysisSchedule) {
      clearInterval(this._analysisSchedule);
      this._analysisSchedule = null;
    }
    log.info('Stopped continuous analysis');
  }

  /**
   * Get specific recommendations for an area
   * @param {object} bounds — { north, south, east, west }
   * @param {object} cityState
   * @returns {array}
   */
  getAreaRecommendations(bounds = {}, cityState = {}) {
    const recommendations = [];

    // Analyze area-specific metrics
    const areaPopulation = cityState.population?.inArea || 0;
    const areaInfrastructure = cityState.infrastructure?.areaHubCount || 0;
    const areaDensity = areaPopulation / (bounds.area || 1);

    if (areaDensity > 5000) {
      recommendations.push({
        location: bounds,
        type: 'high-density',
        suggestion: 'Add rapid transit network',
        priority: 85,
      });
    }

    if (areaInfrastructure === 0 && areaPopulation > 10000) {
      recommendations.push({
        location: bounds,
        type: 'underserved',
        suggestion: 'Build essential infrastructure',
        priority: 90,
      });
    }

    return recommendations;
  }

  /**
   * Explain a recommendation in detail
   * @param {string} insightId
   * @returns {string}
   */
  explainRecommendation(insightId) {
    const insight = this.state.insights.find((i) => i.id === insightId);
    if (!insight) return 'Insight not found';

    const explanation = `
## ${insight.title}

**Category:** ${insight.category.toUpperCase()}
**Priority:** ${insight.priority}/100
**Potential Impact:** +${insight.impact}%

### Current Situation
${insight.description}

### Why This Matters
Based on analysis of your city metrics, this area requires attention to maintain livability and efficiency.

### Recommended Actions
${insight.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}

### Expected Outcomes
- Improved livability
- Reduced risk factors
- Enhanced sustainability
    `;

    return explanation.trim();
  }

  /**
   * Get assistant suggestions formatted for UI
   */
  getSuggestions(limit = 5) {
    return this.state.insights.slice(0, limit).map((insight) => ({
      id: insight.id,
      emoji: this._getCategoryEmoji(insight.category),
      title: insight.title,
      priority: insight.priority,
      action: insight.recommendation,
      impact: `+${insight.impact}%`,
    }));
  }

  /**
   * Generate natural language description
   */
  _generateDescription(rule, cityState) {
    const descriptions = {
      'High Flood Risk': `Your city has a ${((cityState.floodRisk || 60) * 1.2).toFixed(0)}% flood risk. Consider increasing green space coverage.`,
      'Excessive Urban Heat': `Urban heat index is ${(cityState.heat || 65).toFixed(0)}°C. Vegetation can help mitigate this.`,
      'Infrastructure Overload': `Infrastructure stress is at ${((cityState.infrastructure?.stress || 70) * 1.1).toFixed(0)}%. Expansion needed.`,
      'High-Growth Area Underserved': `This area is growing rapidly but lacks adequate infrastructure support.`,
      'Green Area Low Accessibility': `You have good vegetation but it's not well connected to the community.`,
      'Traffic Congestion Hot Spots': `${(cityState.traffic?.congestion * 100 || 60).toFixed(0)}% congestion detected in key areas.`,
      'Insufficient Schools': `Current school capacity serves only ${(cityState.facilities?.schoolCoverage * 100 || 40).toFixed(0)}% of school-age children.`,
    };

    return descriptions[rule.title] || rule.title;
  }

  /**
   * Extract supporting data for insight
   */
  _extractSupportingData(rule, cityState) {
    return {
      metric1: cityState.heat || 0,
      metric2: cityState.floodRisk || 0,
      metric3: cityState.infrastructure?.stress || 0,
      timestamp: Date.now(),
    };
  }

  /**
   * Estimate improvement % from recommendation
   */
  _estimateImpact(rule, cityState) {
    const impact = {
      risk: 15,
      opportunity: 22,
      inefficiency: 18,
    };
    return impact[rule.category] || 10;
  }

  /**
   * Get emoji for category
   */
  _getCategoryEmoji(category) {
    const emojis = {
      risk: '⚠️',
      opportunity: '🎯',
      inefficiency: '⚙️',
    };
    return emojis[category] || '💡';
  }

  /**
   * Subscribe to assistant events
   */
  on(event, callback) {
    return this.eventBus.on(event, callback);
  }

  /**
   * Cleanup
   */
  destroy() {
    this._destroyed = true;
    this.stopAnalysis();
    this.state.insights = [];
    this.eventBus.clear();
  }
}

export default new AIAssistant();
