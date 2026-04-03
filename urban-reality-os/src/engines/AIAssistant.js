// ================================================
// AIAssistant — Production-Grade Urban Planning Advisor
// Features: RuleEngine, confidence scoring, LLM explanations,
// building placement suggestions, scenario comparison, state watching
// ================================================

import EventBus from '../core/EventBus';
import { createLogger } from '../core/Logger';

const log = createLogger('AIAssistant');

/**
 * @typedef {Object} Rule
 * @property {string} id
 * @property {string} category - 'risk' | 'opportunity' | 'inefficiency'
 * @property {number} weight - 0-100 (priority)
 * @property {string} title
 * @property {string[]} conditions - Human-readable condition descriptions
 * @property {Function[]} conditionFns - Functions that return boolean
 * @property {string[]} recommendations
 */

/**
 * @typedef {Object} Insight
 * @property {string} id
 * @property {string} category - 'risk' | 'opportunity' | 'inefficiency'
 * @property {number} priority - 0-100
 * @property {number} confidence - 0-1 (% of conditions met)
 * @property {string} title
 * @property {string} description
 * @property {string} recommendation
 * @property {object} data - supporting metrics
 * @property {number} impact - estimated improvement %
 * @property {number} timestamp
 */

/**
 * @typedef {Object} PlacementSuggestion
 * @property {number} lat
 * @property {number} lng
 * @property {string} reasoning
 * @property {number} score - 0-1
 */

/**
 * @typedef {Object} ScenarioDiff
 * @property {string[]} improved - metrics that got better
 * @property {string[]} degraded - metrics that got worse
 * @property {string[]} stable - metrics that stayed same
 * @property {object} delta - specific numeric changes
 */

/**
 * Intelligent rule engine for condition evaluation
 */
class RuleEngine {
  constructor() {
    this.rules = [];
    this._nextRuleId = 0;
  }

  /**
   * Add a new rule
   * @param {string} category
   * @param {string} title
   * @param {Function[]} conditionFns - Array of functions returning boolean
   * @param {string[]} recommendations
   * @param {number} [weight=50]
   * @returns {string} rule id
   */
  addRule(category, title, conditionFns, recommendations, weight = 50) {
    const id = `rule-${this._nextRuleId++}`;
    this.rules.push({
      id,
      category,
      title,
      weight: Math.min(100, Math.max(0, weight)),
      conditionFns: Array.isArray(conditionFns) ? conditionFns : [conditionFns],
      recommendations: Array.isArray(recommendations) ? recommendations : [recommendations],
      conditions: conditionFns.map((f) => f.name || 'anonymous'),
    });
    return id;
  }

  /**
   * Remove a rule by id
   * @param {string} ruleId
   * @returns {boolean} success
   */
  removeRule(ruleId) {
    const idx = this.rules.findIndex((r) => r.id === ruleId);
    if (idx !== -1) {
      this.rules.splice(idx, 1);
      return true;
    }
    return false;
  }

  /**
   * Evaluate all rules against state, sorted by weight
   * @param {object} state - City state
   * @returns {{rule: Rule, confidence: number, matched: number, total: number}[]}
   */
  evaluateAll(state) {
    const results = [];

    for (const rule of this.rules) {
      let matched = 0;
      const total = rule.conditionFns.length;

      for (const condFn of rule.conditionFns) {
        try {
          if (condFn(state)) matched++;
        } catch (err) {
          log.warn(`[RuleEngine] Condition eval error for ${rule.id}:`, err.message);
        }
      }

      // Include all rules, even partial matches (used for confidence scoring)
      const confidence = total > 0 ? matched / total : 0;
      results.push({ rule, confidence, matched, total });
    }

    // Sort by weight descending, then by confidence descending
    results.sort((a, b) => {
      const weightDiff = b.rule.weight - a.rule.weight;
      if (weightDiff !== 0) return weightDiff;
      return b.confidence - a.confidence;
    });

    return results;
  }

  /**
   * Clear all rules
   */
  clear() {
    this.rules.length = 0;
  }

  /**
   * Get rule count
   */
  count() {
    return this.rules.length;
  }
}

/**
 * Fast 32-bit hash for change detection
 * @param {string} str
 * @returns {number}
 */
function hash32(str) {
  let h1 = 0xdeadbeef ^ str.length;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = ((h1 << 5) - h1) ^ ch;
    h1 = h1 & h1; // Convert to 32-bit signed
  }
  return Math.abs(h1);
}

export class AIAssistant {
  constructor() {
    this.state = {
      insights: [],
      recommendations: [],
      isAnalyzing: false,
      lastAnalysisTime: 0,
      analysisInterval: 10000,
      contextWindow: null,
      lastStateHash: 0,
    };

    this.eventBus = EventBus;
    this._destroyed = false;
    this._analysisSchedule = null;
    this._watchSchedule = null;
    this._ruleEngine = new RuleEngine();
    this._initializeRules();
    this._rehydrateFromStorage();
  }

  /**
   * Initialize default rules in RuleEngine
   */
  _initializeRules() {
    // Risk rules
    this._ruleEngine.addRule(
      'risk',
      'High Flood Risk',
      [
        (s) => (s.flood?.risk || 0) > 0.6,
        (s) => (s.rainfall?.probability || 0) > 0.5,
      ],
      ['Add green zones to increase water absorption', 'Elevate critical infrastructure', 'Install flood management systems'],
      95
    );

    this._ruleEngine.addRule(
      'risk',
      'Excessive Urban Heat',
      [
        (s) => (s.heat?.index || 0) > 65,
        (s) => (s.green?.coverage || 0) < 0.3,
      ],
      ['Increase vegetation coverage by 20%', 'Add parks near high-density areas', 'Improve building reflectivity standards'],
      80
    );

    this._ruleEngine.addRule(
      'risk',
      'Infrastructure Overload',
      [
        (s) => (s.infrastructure?.stress || 0) > 0.7,
        (s) => (s.population?.density || 0) > 5000,
      ],
      ['Expand road network capacity', 'Add public transit lines', 'Install new utility infrastructure'],
      85
    );

    // Opportunity rules
    this._ruleEngine.addRule(
      'opportunity',
      'High-Growth Area Underserved',
      [
        (s) => (s.population?.growth || 0) > 0.03,
        (s) => (s.infrastructure?.coverage || 0) < 0.7,
      ],
      ['Build new facilities in growth zones', 'Expand road network', 'Add housing development'],
      70
    );

    this._ruleEngine.addRule(
      'opportunity',
      'Green Area Low Accessibility',
      [
        (s) => (s.ndvi?.mean || 0) > 0.6,
        (s) => (s.accessibility || 0) < 0.5,
      ],
      ['Connect green zones with trail system', 'Add transit access', 'Develop recreational facilities'],
      55
    );

    // Inefficiency rules
    this._ruleEngine.addRule(
      'inefficiency',
      'Traffic Congestion Hot Spots',
      [
        (s) => (s.traffic?.congestion || 0) > 0.6,
        (s) => (s.infrastructure?.roadCoverage || 0) < 0.5,
      ],
      ['Add parallel roads', 'Improve traffic signal timing', 'Encourage transit adoption'],
      65
    );

    this._ruleEngine.addRule(
      'inefficiency',
      'Insufficient Educational Facilities',
      [
        (s) => (s.population?.total || 0) > 100000,
        (s) => (s.facilities?.schools || 0) < (s.population?.total || 0) * 0.0002,
      ],
      ['Build new schools', 'Expand educational capacity', 'Add secondary education facilities'],
      60
    );
  }

  /**
   * Rehydrate insights from sessionStorage
   */
  _rehydrateFromStorage() {
    try {
      const stored = sessionStorage.getItem('__URBAN_INSIGHTS__');
      if (stored) {
        const { insights, timestamp } = JSON.parse(stored);
        // Only use insights less than 5 minutes old
        if (Date.now() - timestamp < 300000) {
          this.state.insights = insights || [];
          log.info(`Rehydrated ${insights.length} insights from storage`);
        } else {
          sessionStorage.removeItem('__URBAN_INSIGHTS__');
        }
      }
    } catch (err) {
      log.warn('Failed to rehydrate insights:', err.message);
    }
  }

  /**
   * Persist insights to sessionStorage
   */
  _persistToStorage() {
    try {
      sessionStorage.setItem(
        '__URBAN_INSIGHTS__',
        JSON.stringify({
          insights: this.state.insights,
          timestamp: Date.now(),
        })
      );
    } catch (err) {
      log.warn('Failed to persist insights:', err.message);
    }
  }

  /**
   * Analyze city state and generate insights with confidence scores
   * @param {object} cityState
   * @returns {Promise<Insight[]>}
   */
  async analyzeCity(cityState = {}) {
    if (this._destroyed) return [];

    this.state.isAnalyzing = true;
    this.eventBus.emit('assistant:analyzing');

    try {
      const insights = [];
      const evaluations = this._ruleEngine.evaluateAll(cityState);

      for (const { rule, confidence, matched } of evaluations) {
        // Only create insight if at least one condition is met
        if (matched > 0) {
          insights.push(this._createInsight(rule, cityState, confidence, matched));
        }
      }

      // Sort by priority then confidence
      insights.sort((a, b) => {
        if (a.priority !== b.priority) return b.priority - a.priority;
        return b.confidence - a.confidence;
      });

      this.state.insights = insights;
      this.state.lastAnalysisTime = Date.now();
      this.state.contextWindow = cityState;
      this._persistToStorage();

      this.eventBus.emit('assistant:analysis-complete', { insights });
      log.info(`Generated ${insights.length} insights (avg confidence: ${(insights.reduce((s, i) => s + i.confidence, 0) / Math.max(1, insights.length)).toFixed(2)})`);

      return insights;
    } finally {
      this.state.isAnalyzing = false;
    }
  }

  /**
   * Create insight with confidence scoring
   * @private
   */
  _createInsight(rule, cityState, confidence, conditionsMet) {
    const confidenceScore = Math.round(confidence * 100) / 100;
    return {
      id: `insight-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      category: rule.category,
      priority: rule.weight,
      confidence: confidenceScore,
      title: rule.title,
      description: this._generateDescription(rule, cityState, confidenceScore),
      recommendations: rule.recommendations,
      recommendation: rule.recommendations[0],
      data: this._extractSupportingData(rule, cityState),
      impact: this._estimateImpact(rule, confidenceScore),
      timestamp: Date.now(),
      _conditionsMet: conditionsMet,
      _totalConditions: rule.conditionFns.length,
    };
  }

  /**
   * Explain an insight using Anthropic Claude API
   * @param {string} insightId
   * @returns {Promise<string>}
   */
  async explainWithLLM(insightId) {
    const insight = this.state.insights.find((i) => i.id === insightId);
    if (!insight) throw new Error(`Insight ${insightId} not found`);

    const apiKey = process.env.REACT_APP_ANTHROPIC_API_KEY || import.meta.env.VITE_ANTHROPIC_API_KEY;
    if (!apiKey) {
      log.warn('Anthropic API key not configured, returning template explanation');
      return this._templateExplanation(insight);
    }

    try {
      const prompt = `You are an urban planning expert analyzing a city insight. Provide a detailed, actionable explanation in 2-3 paragraphs.

Insight: "${insight.title}"
Category: ${insight.category}
Confidence: ${(insight.confidence * 100).toFixed(0)}%
Priority: ${insight.priority}/100

Supporting Data:
${JSON.stringify(insight.data, null, 2)}

Recommendations:
${insight.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}

Provide a comprehensive explanation of why this insight matters and what the expected outcomes would be if the recommendations are implemented.`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 500,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`API error ${response.status}: ${error}`);
      }

      const data = await response.json();
      const text = data.content?.[0]?.text || 'Unable to generate explanation';
      
      log.info(`Generated LLM explanation for ${insightId}`);
      return text;
    } catch (err) {
      log.warn(`LLM explanation failed (${insightId}):`, err.message);
      return this._templateExplanation(insight);
    }
  }

  /**
   * Suggest top 3 building placements for a city
   * @param {object} cityState
   * @returns {Promise<PlacementSuggestion[]>}
   */
  async suggestBuildingPlacement(cityState = {}) {
    const suggestions = [];

    // Strategy 1: High-growth areas with low infrastructure
    if ((cityState.population?.growth || 0) > 0.02 && (cityState.infrastructure?.coverage || 0) < 0.7) {
      suggestions.push({
        lat: (cityState.bounds?.north || 28.6) + Math.random() * 0.3,
        lng: (cityState.bounds?.west || 77) + Math.random() * 0.3,
        reasoning: 'High population growth with infrastructure gap - ideal for mixed-use development',
        score: 0.92,
      });
    }

    // Strategy 2: Green areas with low accessibility
    if ((cityState.ndvi?.mean || 0) > 0.5 && (cityState.accessibility || 0) < 0.5) {
      suggestions.push({
        lat: (cityState.bounds?.north || 28.6) - Math.random() * 0.2,
        lng: (cityState.bounds?.east || 77.2) - Math.random() * 0.2,
        reasoning: 'Accessible green area suitable for recreational infrastructure and public facilities',
        score: 0.85,
      });
    }

    // Strategy 3: Traffic hotspots needing transit
    if ((cityState.traffic?.congestion || 0) > 0.5) {
      suggestions.push({
        lat: (cityState.bounds?.south || 28.5) + Math.random() * 0.4,
        lng: (cityState.bounds?.center?.lng || 77) + Math.random() * 0.2,
        reasoning: 'Major traffic intersection - suitable for transit hub or mobility hub development',
        score: 0.78,
      });
    }

    // Return top 3 sorted by score
    return suggestions.sort((a, b) => b.score - a.score).slice(0, 3);
  }

  /**
   * Compare two city states and return differences
   * @param {object} stateA - Original state
   * @param {object} stateB - Comparison state
   * @returns {ScenarioDiff}
   */
  compareScenarios(stateA = {}, stateB = {}) {
    const improved = [];
    const degraded = [];
    const stable = [];
    const delta = {};

    const metrics = {
      'Population': 'population.total',
      'Infrastructure Coverage': 'infrastructure.coverage',
      'Green Coverage': 'green.coverage',
      'Heat Index': 'heat.index',
      'Flood Risk': 'flood.risk',
      'Traffic Congestion': 'traffic.congestion',
      'Accessibility': 'accessibility',
    };

    for (const [label, path] of Object.entries(metrics)) {
      const valA = this._getNestedValue(stateA, path) || 0;
      const valB = this._getNestedValue(stateB, path) || 0;
      const diff = valB - valA;

      delta[label] = { from: valA, to: valB, change: diff };

      // Determine if metric improved or degraded (context-sensitive)
      const isPositive = ['Infrastructure Coverage', 'Green Coverage', 'Accessibility', 'Population'].includes(label);
      if (diff > 0.01) {
        (isPositive ? improved : degraded).push(`${label}: ${valA.toFixed(2)} → ${valB.toFixed(2)}`);
      } else if (diff < -0.01) {
        (isPositive ? degraded : improved).push(`${label}: ${valA.toFixed(2)} → ${valB.toFixed(2)}`);
      } else {
        stable.push(label);
      }
    }

    return { improved, degraded, stable, delta };
  }

  /**
   * Watch city state changes and re-analyze only on state hash change
   * @param {Function} getCityState - Function that returns current city state
   * @param {number} intervalMs - Poll interval
   * @returns {Function} Unsubscribe function
   */
  watchCityState(getCityState, intervalMs = 5000) {
    if (this._watchSchedule) clearInterval(this._watchSchedule);

    let lastHash = 0;

    this._watchSchedule = setInterval(() => {
      try {
        const currentState = getCityState();
        const stateStr = JSON.stringify(currentState);
        const currentHash = hash32(stateStr);

        if (currentHash !== lastHash) {
          lastHash = currentHash;
          this.state.lastStateHash = currentHash;
          log.debug(`State changed (hash: ${lastHash}), re-analyzing...`);
          this.analyzeCity(currentState).catch((err) => {
            log.warn('Watch analysis error:', err.message);
          });
        }
      } catch (err) {
        log.warn('Watch cycle error:', err.message);
      }
    }, intervalMs);

    // Return unsubscribe function
    return () => {
      if (this._watchSchedule) {
        clearInterval(this._watchSchedule);
        this._watchSchedule = null;
      }
    };
  }

  /**
   * Start continuous analysis with state watching
   * @param {object} cityState
   * @param {number} interval - ms between analyses
   */
  startAnalysis(cityState = {}, interval = this.state.analysisInterval) {
    if (this._analysisSchedule) {
      clearInterval(this._analysisSchedule);
    }

    this.state.analysisInterval = interval;
    this.analyzeCity(cityState);

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
   * @param {object} bounds - { north, south, east, west, area }
   * @param {object} cityState
   * @returns {array}
   */
  getAreaRecommendations(bounds = {}, cityState = {}) {
    const recommendations = [];
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
   * Template explanation for fallback when LLM is unavailable
   * @private
   */
  _templateExplanation(insight) {
    return `
## ${insight.title}

**Category:** ${insight.category.toUpperCase()}
**Priority:** ${insight.priority}/100
**Confidence:** ${(insight.confidence * 100).toFixed(0)}%
**Potential Impact:** +${insight.impact}%

### Current Status
${insight.description}

### Why This Matters
Based on your city's metrics, this area requires attention to maintain livability and efficiency. The system detected this with ${insight._conditionsMet} of ${insight._totalConditions} key indicators present.

### Recommended Actions
${insight.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}

### Expected Outcomes
- Improved livability and accessibility
- Reduced risk factors and environmental stress
- Enhanced sustainability and quality of life
- Better resource utilization`;
  }

  /**
   * Get suggestions formatted for UI
   * @param {number} limit
   * @returns {array}
   */
  getSuggestions(limit = 5) {
    return this.state.insights.slice(0, limit).map((insight) => ({
      id: insight.id,
      emoji: this._getCategoryEmoji(insight.category),
      title: insight.title,
      priority: insight.priority,
      confidence: insight.confidence,
      action: insight.recommendation,
      impact: `+${insight.impact}%`,
    }));
  }

  /**
   * Get a specific insight by ID
   * @param {string} insightId
   * @returns {Insight | null}
   */
  getInsight(insightId) {
    return this.state.insights.find((i) => i.id === insightId) || null;
  }

  /**
   * Get all rule engine rules
   * @returns {Rule[]}
   */
  getRules() {
    return this._ruleEngine.rules;
  }

  /**
   * Get helper to access nested object properties
   * @private
   */
  _getNestedValue(obj, path) {
    return path.split('.').reduce((curr, prop) => curr?.[prop], obj);
  }

  /**
   * Generate natural language description
   * @private
   */
  _generateDescription(rule, cityState, confidence) {
    const confStr = confidence > 0.8 ? 'strongly' : confidence > 0.5 ? 'moderately' : 'potentially';
    return `This rule ${confStr} applies to your city (${Math.round(confidence * 100)}% confidence). ${rule.title} detected based on current metrics.`;
  }

  /**
   * Extract supporting data for insight
   * @private
   */
  _extractSupportingData(rule, cityState) {
    return {
      population: {
        total: cityState.population?.total || 0,
        density: cityState.population?.density || 0,
        growth: cityState.population?.growth || 0,
      },
      infrastructure: {
        coverage: cityState.infrastructure?.coverage || 0,
        stress: cityState.infrastructure?.stress || 0,
      },
      environment: {
        greenCoverage: cityState.green?.coverage || 0,
        heatIndex: cityState.heat?.index || 0,
        floodRisk: cityState.flood?.risk || 0,
        ndvi: cityState.ndvi?.mean || 0,
      },
      accessibility: cityState.accessibility || 0,
      timestamp: Date.now(),
    };
  }

  /**
   * Estimate improvement percentage
   * @private
   */
  _estimateImpact(rule, confidence) {
    const baseImpact = {
      risk: 15,
      opportunity: 22,
      inefficiency: 18,
    };
    const base = baseImpact[rule.category] || 10;
    return Math.round(base * (0.8 + confidence * 0.4)); // Confidence adjusts impact 80%-120%
  }

  /**
   * Get emoji for category
   * @private
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
   * Get current insights
   */
  getInsights() {
    return this.state.insights;
  }

  /**
   * Clear all stored insights
   */
  clearInsights() {
    this.state.insights = [];
    this._persistToStorage();
  }

  /**
   * Cleanup
   */
  destroy() {
    this._destroyed = true;
    this.stopAnalysis();
    if (this._watchSchedule) {
      clearInterval(this._watchSchedule);
      this._watchSchedule = null;
    }
    this.state.insights = [];
    this._ruleEngine.clear();
    this.eventBus.clear();
  }
}

export default new AIAssistant();
