const LAYER_LABELS = {
  aqi: "AQI",
  flood: "Flood Zones",
  floodDepth: "Flood Depth"
};

export default function LayerToggle({ layers, setLayers }) {
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
        minWidth: 180,
        maxWidth: 200,
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

      {Object.keys(layers).filter((k) => k !== 'traffic').map((key) => (
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
    </div>
  );
}
