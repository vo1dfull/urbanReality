import { useState } from "react";

export default function FacilityListPanel({ facilityData, layers, mapRef }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState("all");

  if (!facilityData) return null;

  const hasActiveFacilities = layers.hospitals || layers.policeStations || layers.fireStations;
  if (!hasActiveFacilities) return null;

  const getAllFacilities = () => {
    const facilities = [];
    if (layers.hospitals) facilities.push(...facilityData.hospitals.map(f => ({ ...f, type: "hospital" })));
    if (layers.policeStations) facilities.push(...facilityData.policeStations.map(f => ({ ...f, type: "police" })));
    if (layers.fireStations) facilities.push(...facilityData.fireStations.map(f => ({ ...f, type: "fire" })));
    return facilities;
  };

  const facilities = getAllFacilities();

  const filteredFacilities = facilities.filter(facility => {
    const matchesSearch = facility.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = selectedType === "all" || facility.type === selectedType;
    return matchesSearch && matchesType;
  });

  const groupedFacilities = filteredFacilities.reduce((acc, facility) => {
    if (!acc[facility.type]) acc[facility.type] = [];
    acc[facility.type].push(facility);
    return acc;
  }, {});

  const handleFacilityClick = (facility) => {
    if (!mapRef.current) return;

    mapRef.current.flyTo({
      center: [facility.lng, facility.lat],
      zoom: 15,
      pitch: 60,
      bearing: -20,
      speed: 0.8,
      curve: 1.5,
      essential: true
    });
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case "hospital": return "🏥";
      case "police": return "🚔";
      case "fire": return "🔥";
      default: return "📍";
    }
  };

  const getTypeColor = (type) => {
    switch (type) {
      case "hospital": return "#06b6d4";
      case "police": return "#8b5cf6";
      case "fire": return "#f97316";
      default: return "#94a3b8";
    }
  };

  return (
    <div
      style={{
        position: "absolute",
        top: 20,
        right: 240,
        background: "rgba(2, 6, 23, 0.95)",
        padding: 16,
        borderRadius: 12,
        color: "white",
        fontSize: 14,
        zIndex: 10,
        backdropFilter: "blur(12px)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        minWidth: 280,
        maxWidth: 320,
        maxHeight: "70vh",
        overflow: "hidden",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        border: "1px solid rgba(255,255,255,0.1)",
        animation: "slideInRight 0.3s ease-out"
      }}
    >
      <div style={{
        fontSize: 16,
        fontWeight: 700,
        marginBottom: 12,
        color: "#f1f5f9",
        letterSpacing: "-0.3px"
      }}>
        📋 Facilities
      </div>

      {/* Search and Filter */}
      <div style={{ marginBottom: 12 }}>
        <input
          type="text"
          placeholder="Search facilities..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: "100%",
            padding: "8px 12px",
            borderRadius: 6,
            border: "1px solid rgba(255,255,255,0.2)",
            background: "rgba(15, 23, 42, 0.8)",
            color: "#e2e8f0",
            fontSize: 12,
            marginBottom: 8,
            outline: "none"
          }}
        />

        <div style={{ display: "flex", gap: 4 }}>
          {[
            { key: "all", label: "All" },
            { key: "hospital", label: "🏥 Hospitals" },
            { key: "police", label: "🚔 Police" },
            { key: "fire", label: "🔥 Fire" }
          ].map((type) => (
            <button
              key={type.key}
              onClick={() => setSelectedType(type.key)}
              style={{
                padding: "4px 8px",
                borderRadius: 4,
                border: "none",
                background: selectedType === type.key ? "rgba(59, 130, 246, 0.9)" : "rgba(30, 41, 59, 0.6)",
                color: "#e2e8f0",
                fontSize: 11,
                cursor: "pointer",
                transition: "all 0.2s"
              }}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      {/* Facility List */}
      <div style={{
        maxHeight: "50vh",
        overflowY: "auto",
        scrollbarWidth: "thin",
        scrollbarColor: "rgba(255,255,255,0.3) transparent"
      }}>
        {Object.entries(groupedFacilities).map(([type, facilities]) => (
          <div key={type} style={{ marginBottom: 16 }}>
            <div style={{
              fontSize: 13,
              fontWeight: 600,
              color: getTypeColor(type),
              marginBottom: 8,
              textTransform: "capitalize"
            }}>
              {getTypeIcon(type)} {type === "police" ? "Police Stations" : type === "fire" ? "Fire Stations" : "Hospitals"} ({facilities.length})
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {facilities.map((facility) => (
                <div
                  key={facility.id}
                  onClick={() => handleFacilityClick(facility)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 6,
                    background: "rgba(30, 41, 59, 0.6)",
                    cursor: "pointer",
                    transition: "all 0.2s",
                    border: "1px solid rgba(255,255,255,0.1)"
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.background = "rgba(30, 41, 59, 0.8)";
                    e.target.style.transform = "translateY(-1px)";
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = "rgba(30, 41, 59, 0.6)";
                    e.target.style.transform = "translateY(0)";
                  }}
                >
                  <div style={{ fontWeight: 500, color: "#e2e8f0", fontSize: 13 }}>
                    {facility.name}
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                    Response: {facility.responseTime}min | Radius: {facility.coverageRadius}km | Units: {facility.availableUnits}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {filteredFacilities.length === 0 && (
          <div style={{ textAlign: "center", color: "#94a3b8", fontSize: 13, padding: 20 }}>
            No facilities found
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }

        ::-webkit-scrollbar {
          width: 6px;
        }

        ::-webkit-scrollbar-track {
          background: rgba(255,255,255,0.1);
          border-radius: 3px;
        }

        ::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.3);
          border-radius: 3px;
        }

        ::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.5);
        }
      `}</style>
    </div>
  );
}