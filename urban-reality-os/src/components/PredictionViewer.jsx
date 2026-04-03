// ================================================
// PredictionViewer.jsx — Future growth prediction visualization
// ================================================

import React, { useState, useEffect } from 'react';
import styles from './PredictionViewer.module.css';

/**
 * Prediction Viewer Component
 * Display future city predictions for different scenarios
 */
export function PredictionViewer({ predictionEngine, onScenarioChange }) {
  const [selectedScenario, setSelectedScenario] = useState('moderate');
  const [selectedYear, setSelectedYear] = useState(2050);
  const [predictions, setPredictions] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const scenarios = [
    { id: 'conservative', label: '📉 Conservative', color: '#2196f3', description: 'Minimal growth' },
    { id: 'moderate', label: '↗️ Moderate', color: '#4caf50', description: 'Expected growth' },
    { id: 'aggressive', label: '📈 Aggressive', color: '#ff9800', description: 'Rapid expansion' },
  ];

  const years = [2030, 2035, 2040, 2045, 2050, 2060, 2070];

  useEffect(() => {
    if (predictionEngine) {
      fetchPrediction();
    }
  }, [selectedScenario, selectedYear, predictionEngine]);

  const fetchPrediction = async () => {
    if (!predictionEngine) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await predictionEngine.predictFutureState(
        {
          population: 420000,
          density: 0.6,
          growthRate: 0.019,
          infrastructureProximity: 0.5,
        },
        selectedYear,
        selectedScenario
      );

      setPredictions(result);

      if (onScenarioChange) {
        onScenarioChange({ scenario: selectedScenario, year: selectedYear, result });
      }
    } catch (err) {
      setError(err.message);
      console.error('Prediction error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const scenarioConfig = scenarios.find((s) => s.id === selectedScenario);

  return (
    <div className={styles.predictionViewer}>
      <div className={styles.header}>
        <h2>🔮 Future Forecast</h2>
        <p className={styles.subtitle}>Project your city's growth and requirements</p>
      </div>

      {/* Controls */}
      <div className={styles.controls}>
        {/* Scenario Selection */}
        <div className={styles.controlGroup}>
          <label className={styles.label}>Scenario</label>
          <div className={styles.scenarioButtons}>
            {scenarios.map((scenario) => (
              <button
                key={scenario.id}
                className={`${styles.scenarioBtn} ${selectedScenario === scenario.id ? styles.active : ''}`}
                onClick={() => setSelectedScenario(scenario.id)}
                style={selectedScenario === scenario.id ? { borderColor: scenario.color } : {}}
              >
                <div className={styles.scenarioLabel}>{scenario.label}</div>
                <div className={styles.scenarioDesc}>{scenario.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Year Slider */}
        <div className={styles.controlGroup}>
          <label className={styles.label}>Target Year: {selectedYear}</label>
          <div className={styles.yearGrid}>
            {years.map((year) => (
              <button
                key={year}
                className={`${styles.yearBtn} ${selectedYear === year ? styles.active : ''}`}
                onClick={() => setSelectedYear(year)}
              >
                {year}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className={styles.loading}>
          <div className={styles.spinner}>⟳</div>
          <p>Simulating future scenarios...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className={styles.error}>
          <p>❌ {error}</p>
        </div>
      )}

      {/* Results */}
      {predictions && !isLoading && (
        <div className={styles.results}>
          {/* Population */}
          <div className={styles.metric}>
            <div className={styles.metricHeader}>
              <h3>👥 Population</h3>
              <span className={styles.metricUnit}>people</span>
            </div>
            <div className={styles.metricContent}>
              <div className={styles.largeNumber}>
                {(predictions.population.population / 1000000).toFixed(1)}M
              </div>
              <div className={styles.metricDetails}>
                <div className={styles.detail}>
                  <span className={styles.label}>Growth Rate:</span>
                  <span className={styles.value}>{predictions.population.growthTrend}</span>
                </div>
                <div className={styles.detail}>
                  <span className={styles.label}>Density:</span>
                  <span className={styles.value}>{(predictions.population.density * 100).toFixed(0)}%</span>
                </div>
                <div className={styles.detail}>
                  <span className={styles.label}>Land Required:</span>
                  <span className={styles.value}>{predictions.population.landRequired.toLocaleString()} km²</span>
                </div>
              </div>
            </div>
          </div>

          {/* Sprawl */}
          {predictions.sprawl && (
            <div className={styles.metric}>
              <div className={styles.metricHeader}>
                <h3>🏘️ Urban Sprawl</h3>
                <span className={styles.metricUnit}>km²</span>
              </div>
              <div className={styles.metricContent}>
                <div className={styles.largeNumber}>
                  {predictions.sprawl.projectedExtent.toLocaleString()}
                </div>
                <div className={styles.metricDetails}>
                  <div className={styles.detail}>
                    <span className={styles.label}>Expansion Distance:</span>
                    <span className={styles.value}>{predictions.sprawl.sprawlDistance.toFixed(0)} km</span>
                  </div>
                  <div className={styles.detail}>
                    <span className={styles.label}>Annual Rate:</span>
                    <span className={styles.value}>
                      {predictions.sprawl.sprawlVector.avgSprawlRatePerYear.toFixed(2)} km²/year
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Infrastructure */}
          {predictions.infrastructure && (
            <div className={styles.metric}>
              <div className={styles.metricHeader}>
                <h3>🏗️ Infrastructure Demand</h3>
              </div>
              <div className={styles.metricContent}>
                <div className={styles.largeNumber}>
                  {predictions.infrastructure.totalDemandIndex}%
                </div>
                <div className={styles.metricDetails}>
                  <div className={styles.factorGrid}>
                    {Object.entries(predictions.infrastructure.demandFactors || {}).map(([factor, value]) => (
                      <div key={factor} className={styles.factor}>
                        <span className={styles.factorLabel}>{factor}</span>
                        <span className={styles.factorValue}>{(value * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Land Value */}
          {predictions.landValue && (
            <div className={styles.metric}>
              <div className={styles.metricHeader}>
                <h3>💰 Land Value Change</h3>
                <span className={styles.metricUnit}>%</span>
              </div>
              <div className={styles.metricContent}>
                <div className={`${styles.largeNumber} ${predictions.landValue.appreciationPercent > 0 ? styles.positive : styles.negative}`}>
                  {predictions.landValue.appreciationPercent > 0 ? '+' : ''}{predictions.landValue.appreciationPercent}%
                </div>
                <div className={styles.metricDetails}>
                  <div className={styles.detail}>
                    <span className={styles.label}>Current Value:</span>
                    <span className={styles.value}>${predictions.landValue.currentValue}</span>
                  </div>
                  <div className={styles.detail}>
                    <span className={styles.label}>Future Value:</span>
                    <span className={styles.value}>${predictions.landValue.futureValue}</span>
                  </div>
                  <div className={styles.detail}>
                    <span className={styles.label}>Annual Rate:</span>
                    <span className={styles.value}>{predictions.landValue.annualAppreciationRate}%</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Key Expansion Zones */}
      {predictions?.sprawl?.expandableZones && predictions.sprawl.expandableZones.length > 0 && (
        <div className={styles.recommendedZones}>
          <h3>🎯 Recommended Expansion Zones</h3>
          <div className={styles.zonesList}>
            {predictions.sprawl.expandableZones.slice(0, 5).map((zone, i) => (
              <div key={i} className={styles.zoneItem}>
                <div className={styles.zoneRank}>{i + 1}</div>
                <div className={styles.zoneInfo}>
                  <div className={styles.zoneName}>{zone.zone}</div>
                  <div className={styles.zoneDetails}>
                    <span className={`${styles.zonePriority} ${styles[zone.priority]}`}>
                      {zone.priority.toUpperCase()}
                    </span>
                    <span className={styles.zoneSuitability}>
                      Suitability: {(zone.suitabilityScore * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default PredictionViewer;
