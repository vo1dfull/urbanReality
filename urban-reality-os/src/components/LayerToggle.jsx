import { useState } from "react";

const LAYER_LABELS = {
  aqi: "AQI",
  flood: "Flood Zones",
  floodDepth: "Flood Depth"
};

const FACILITY_TYPES = {
  hospitals: { label: "🏥 Hospitals", color: "#06b6d4" },
  policeStations: { label: "🚔 Police Stations", color: "#8b5cf6" },
  fireStations: { label: "🔥 Fire Stations", color: "#f97316" }
};

export default function LayerToggle({ layers, setLayers }) {
  const [facilityCheckExpanded, setFacilityCheckExpanded] = useState(false);

  const facilityLayers = {
    hospitals: layers.hospitals || false,
    policeStations: layers.policeStations || false,
    fireStations: layers.fireStations || false
  };

  const hasFacilityCheck = Object.values(facilityLayers).some(Boolean);

  return (
    <div
      style={{
        position: "absolute",
        top: 20,
        left: 80,
        background: "rgba(2, 6, 23, 0.95)",
        padding: 16,
        borderRadius: 12,
        color: "white",
        fontSize: 14,
        zIndex: 10,
        backdropFilter: "blur(12px)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        minWidth: 220,
        maxWidth: 250,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        border: "1px solid rgba(255,255,255,0.1)"
      }}
    >
      <div style={{
        fontSize: 16,
        fontWeight: 700,
        marginBottom: 12,
        color: "#f1f5f9",
        letterSpacing: "-0.3px"
      }}>
        Layers
      </div>

      {/* Regular Layers */}
      {Object.keys(layers).filter((k) => k !== 'traffic' && !['hospitals', 'policeStations', 'fireStations'].includes(k)).map((key) => (
        <div key={key} style={{ marginTop: 10 }}>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              cursor: "pointer",
              userSelect: "none",
              padding: "6px 0",
              transition: "opacity 0.2s"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = "0.8";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = "1";
            }}
          >
            <input
              type="checkbox"
              checked={layers[key]}
              onChange={() =>
                setLayers((prev) => ({
                  ...prev,
                  [key]: !prev[key]
                }))
              }
              style={{
                marginRight: 12,
                cursor: "pointer",
                width: "18px",
                height: "18px",
                accentColor: "#60a5fa"
              }}
            />
            <span style={{
              fontSize: 14,
              fontWeight: 500,
              color: layers[key] ? "#e2e8f0" : "#94a3b8"
            }}>
              {LAYER_LABELS[key] || key.toUpperCase()}
            </span>
            {layers[key] && (
              <span style={{ marginLeft: "auto", color: "#60a5fa", fontSize: 12 }}>✓</span>
            )}
          </label>
        </div>
      ))}

      {/* Facility Check Layer */}
      <div style={{ marginTop: 16, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 12 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            cursor: "pointer",
            userSelect: "none",
            padding: "6px 0",
            transition: "opacity 0.2s"
          }}
          onClick={() => setFacilityCheckExpanded(!facilityCheckExpanded)}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = "0.8";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = "1";
          }}
        >
          <input
            type="checkbox"
            checked={hasFacilityCheck}
            onChange={(e) => {
              e.stopPropagation();
              const newValue = !hasFacilityCheck;
              setLayers((prev) => ({
                ...prev,
                hospitals: newValue,
                policeStations: newValue,
                fireStations: newValue
              }));
            }}
            style={{
              marginRight: 12,
              cursor: "pointer",
              width: "18px",
              height: "18px",
              accentColor: "#60a5fa"
            }}
          />
          <span style={{
            fontSize: 14,
            fontWeight: 600,
            color: hasFacilityCheck ? "#e2e8f0" : "#94a3b8"
          }}>
            🏥 Facility Check
          </span>
          <span style={{
            marginLeft: "auto",
            color: "#94a3b8",
            fontSize: 12,
            transform: facilityCheckExpanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.2s"
          }}>
            ▶
          </span>
        </div>

        {/* Sub-layers */}
        {facilityCheckExpanded && (
          <div style={{ marginLeft: 30, marginTop: 8 }}>
            {Object.entries(FACILITY_TYPES).map(([key, config]) => (
              <div key={key} style={{ marginTop: 6 }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    cursor: "pointer",
                    userSelect: "none",
                    padding: "4px 0",
                    transition: "opacity 0.2s"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = "0.8";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = "1";
                  }}
                >
                  <input
                    type="checkbox"
                    checked={facilityLayers[key]}
                    onChange={() =>
                      setLayers((prev) => ({
                        ...prev,
                        [key]: !prev[key]
                      }))
                    }
                    style={{
                      marginRight: 10,
                      cursor: "pointer",
                      width: "16px",
                      height: "16px",
                      accentColor: config.color
                    }}
                  />
                  <span style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: facilityLayers[key] ? "#e2e8f0" : "#94a3b8"
                  }}>
                    {config.label}
                  </span>
                  {facilityLayers[key] && (
                    <span style={{
                      marginLeft: "auto",
                      color: config.color,
                      fontSize: 10,
                      fontWeight: 600
                    }}>
                      ✓
                    </span>
                  )}
                </label>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
