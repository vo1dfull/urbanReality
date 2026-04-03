// ================================================
// BuilderUI.jsx — Interactive SimCity-style builder
// ================================================

import React, { useState, useCallback } from 'react';
import styles from './BuilderUI.module.css';

/**
 * BuildMode UI Component
 * Allows placement of roads, buildings, green zones
 */
export function BuilderUI({ buildEngine, onBudgetChanged, onPlacementConfirmed }) {
  const [selectedType, setSelectedType] = useState('road');
  const [previewActive, setPreviewActive] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [budget, setBudget] = useState(buildEngine?.getBudget() || 1000000);
  const [placements, setPlacements] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  const buildingTypes = [
    { id: 'road', label: '🛣️ Road', icon: '🛣️', cost: 'Dynamic' },
    { id: 'building', label: '🏢 Building', icon: '🏢', cost: '~50k' },
    { id: 'greenZone', label: '🌳 Park', icon: '🌳', cost: '~5k' },
    { id: 'facility', label: '🏥 Facility', icon: '🏥', cost: '~100k' },
  ];

  const handleSelectType = (typeId) => {
    setSelectedType(typeId);
    setPreviewActive(true);
  };

  const handlePlacePreview = useCallback(
    async (location) => {
      if (!buildEngine) return;

      try {
        const preview = await buildEngine.previewPlacement({
          type: selectedType,
          location,
          dimensions: {
            width: selectedType === 'road' ? 2 : 1,
            height: selectedType === 'road' ? 1 : 1,
          },
        });

        setPreviewData(preview);
      } catch (error) {
        console.error('Preview error:', error);
      }
    },
    [buildEngine, selectedType]
  );

  const handleConfirmPlacement = useCallback(async () => {
    if (!buildEngine || !previewData) return;

    try {
      const placement = await buildEngine.confirmPlacement(previewData.id);
      setPlacements([...placements, placement]);
      setBudget(buildEngine.getBudget());
      setPreviewData(null);
      setPreviewActive(false);

      if (onPlacementConfirmed) {
        onPlacementConfirmed(placement);
      }
    } catch (error) {
      console.error('Placement error:', error);
    }
  }, [buildEngine, previewData, placements, onPlacementConfirmed]);

  const handleCancelPreview = () => {
    buildEngine?.cancelPreview();
    setPreviewData(null);
    setPreviewActive(false);
  };

  const handleUndo = async () => {
    if (!buildEngine) return;

    try {
      await buildEngine.undo();
      setPlacements(placements.slice(0, -1));
      setBudget(buildEngine.getBudget());
    } catch (error) {
      console.error('Undo error:', error);
    }
  };

  const canAfford = previewData && previewData.canAfford;
  const isValid = previewData && previewData.isValid;

  return (
    <div className={styles.builderUI}>
      <div className={styles.header}>
        <h2>🏗️ Build Mode</h2>
        <div className={styles.budget}>
          <span className={styles.label}>Budget:</span>
          <span className={styles.amount}>${(budget / 1000).toFixed(0)}k</span>
        </div>
      </div>

      {/* Building Type Selection */}
      <div className={styles.typeSelector}>
        <h3>Select Building Type</h3>
        <div className={styles.typeGrid}>
          {buildingTypes.map((type) => (
            <button
              key={type.id}
              className={`${styles.typeButton} ${selectedType === type.id ? styles.selected : ''}`}
              onClick={() => handleSelectType(type.id)}
              title={`${type.label} - Cost: ${type.cost}`}
            >
              <div className={styles.icon}>{type.icon}</div>
              <div className={styles.name}>{type.label.split(' ')[0]}</div>
              <div className={styles.cost}>{type.cost}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Preview Panel */}
      {previewActive && previewData && (
        <div className={`${styles.previewPanel} ${isValid ? styles.valid : styles.invalid}`}>
          <h3>📍 Preview</h3>

          <div className={styles.previewInfo}>
            <div className={styles.row}>
              <span>Type:</span>
              <strong>{previewData.type}</strong>
            </div>
            <div className={styles.row}>
              <span>Location:</span>
              <code>{previewData.location.lng.toFixed(4)}, {previewData.location.lat.toFixed(4)}</code>
            </div>
            <div className={styles.row}>
              <span>Cost:</span>
              <strong>${(previewData.cost / 1000).toFixed(1)}k</strong>
            </div>
            <div className={styles.row}>
              <span>Can Afford:</span>
              <span className={canAfford ? styles.yes : styles.no}>{canAfford ? '✅ Yes' : '❌ No'}</span>
            </div>
            <div className={styles.row}>
              <span>Valid:</span>
              <span className={isValid ? styles.yes : styles.no}>{isValid ? '✅ Yes' : '❌ No'}</span>
            </div>
          </div>

          {/* Impact Preview */}
          {previewData.impact && (
            <div className={styles.impacts}>
              <h4>Estimated Impact</h4>
              <div className={styles.impactGrid}>
                {Object.entries(previewData.impact).map(([key, value]) => (
                  <div key={key} className={styles.impactItem}>
                    <span className={styles.impactLabel}>{key}</span>
                    <span className={`${styles.impactValue} ${value > 0 ? styles.positive : styles.negative}`}>
                      {value > 0 ? '+' : ''}{value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={styles.actions}>
            <button
              className={`${styles.confirmBtn} ${!isValid ? styles.disabled : ''}`}
              onClick={handleConfirmPlacement}
              disabled={!isValid}
            >
              ✅ Confirm ({budget >= previewData.cost ? 'Affordable' : 'Too Expensive'})
            </button>
            <button className={styles.cancelBtn} onClick={handleCancelPreview}>
              ❌ Cancel
            </button>
          </div>
        </div>
      )}

      {/* Instructions */}
      {!previewActive && (
        <div className={styles.instructions}>
          <p>1️⃣ Select a building type above</p>
          <p>2️⃣ Click on the map to place preview</p>
          <p>3️⃣ Confirm placement in the preview panel</p>
        </div>
      )}

      {/* Placement History */}
      <div className={styles.historySection}>
        <button
          className={styles.toggleBtn}
          onClick={() => setShowHistory(!showHistory)}
        >
          📋 {showHistory ? 'Hide' : 'Show'} Placements ({placements.length})
        </button>

        {showHistory && (
          <div className={styles.history}>
            {placements.length === 0 ? (
              <p className={styles.empty}>No placements yet</p>
            ) : (
              <div className={styles.placementList}>
                {placements.slice(-10).map((p, i) => (
                  <div key={p.id} className={styles.placementItem}>
                    <span>{i + 1}.</span>
                    <span>{p.type}</span>
                    <span className={styles.cost}>${(p.cost / 1000).toFixed(0)}k</span>
                  </div>
                ))}
              </div>
            )}

            {placements.length > 0 && (
              <button className={styles.undoBtn} onClick={handleUndo}>
                ↶ Undo Last
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default BuilderUI;
