import { useEffect, useState } from "react";

export default function FacilityStatsPanel({ facilityData, layers, facilityViewMode }) {
  const [stats, setStats] = useState({
    hospitalCoverage: 0,
    policeCoverage: 0,
    fireCoverage: 0,
    tripleCoverage: 0
  });

  useEffect(() => {
    if (!facilityData) return;

    // Calculate coverage statistics
    // This is a simplified calculation - in a real app you'd use proper GIS calculations
    const calculateCoverage = () => {
      const activeFacilities = [];
      if (layers.hospitals) activeFacilities.push(...facilityData.hospitals);
      if (layers.policeStations) activeFacilities.push(...facilityData.policeStations);
      if (layers.fireStations) activeFacilities.push(...facilityData.fireStations);

      if (activeFacilities.length === 0) {
        setStats({ hospitalCoverage: 0, policeCoverage: 0, fireCoverage: 0, tripleCoverage: 0 });
        return;
      }

      // Simplified coverage calculation based on facility count and average radius
      const avgRadius = activeFacilities.reduce((sum, f) => sum + f.coverageRadius, 0) / activeFacilities.length;
      const totalArea = activeFacilities.length * Math.PI * Math.pow(avgRadius, 2);

      // Estimate coverage percentages (this is approximate)
      const baseCoverage = Math.min(85, (totalArea / 1000) * 100); // Normalize to realistic percentages

      setStats({
        hospitalCoverage: layers.hospitals ? Math.round(baseCoverage * 0.6) : 0,
        policeCoverage: layers.policeStations ? Math.round(baseCoverage * 0.7) : 0,
        fireCoverage: layers.fireStations ? Math.round(baseCoverage * 0.5) : 0,
        tripleCoverage: layers.hospitals && layers.policeStations && layers.fireStations ? Math.round(baseCoverage * 0.3) : 0
      });
    };

    calculateCoverage();
  }, [facilityData, layers, facilityViewMode]);

  const hasActiveFacilities = layers.hospitals || layers.policeStations || layers.fireStations;

  if (!hasActiveFacilities) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 20,
        right: 20,
        background: "rgba(2, 6, 23, 0.95)",
        padding: 16,
        borderRadius: 12,
        color: "white",
        fontSize: 14,
        zIndex: 10,
        backdropFilter: "blur(12px)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        minWidth: 200,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        border: "1px solid rgba(255,255,255,0.1)",
        animation: "fadeIn 0.3s ease-out"
      }}
    >
      <div style={{
        fontSize: 16,
        fontWeight: 700,
        marginBottom: 12,
        color: "#f1f5f9",
        letterSpacing: "-0.3px"
      }}>
        📊 Coverage Stats
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {layers.hospitals && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "#06b6d4", fontWeight: 500 }}>🏥 Hospitals</span>
            <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{stats.hospitalCoverage}%</span>
          </div>
        )}

        {layers.policeStations && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "#8b5cf6", fontWeight: 500 }}>🚔 Police</span>
            <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{stats.policeCoverage}%</span>
          </div>
        )}

        {layers.fireStations && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "#f97316", fontWeight: 500 }}>🔥 Fire</span>
            <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{stats.fireCoverage}%</span>
          </div>
        )}

        {layers.hospitals && layers.policeStations && layers.fireStations && (
          <>
            <div style={{ height: 1, background: "rgba(255,255,255,0.1)", margin: "4px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "#10b981", fontWeight: 500 }}>🎯 Triple Coverage</span>
              <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{stats.tripleCoverage}%</span>
            </div>
          </>
        )}
      </div>

      <div style={{
        marginTop: 12,
        paddingTop: 8,
        borderTop: "1px solid rgba(255,255,255,0.1)",
        fontSize: 12,
        color: "#94a3b8"
      }}>
        Mode: {facilityViewMode === "coverage" ? "Coverage Rings" :
               facilityViewMode === "gap" ? "Gap Analysis" : "Heatmap"}
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}