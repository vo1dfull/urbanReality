import { useEffect, useState } from "react";

export default function CoordinateDisplay({ mapRef }) {
  const [coordinates, setCoordinates] = useState({ lat: 28.6139, lng: 77.2090 });
  const [region, setRegion] = useState("Delhi NCR");

  useEffect(() => {
    if (!mapRef.current) return;

    const map = mapRef.current;

    const updateCoordinates = async (e) => {
      const { lng, lat } = e.lngLat;
      setCoordinates({ lat: lat.toFixed(4), lng: lng.toFixed(4) });

      // Update region (simplified - in real app you'd use reverse geocoding)
      if (lat >= 28.4 && lat <= 28.8 && lng >= 76.8 && lng <= 77.4) {
        setRegion("Delhi NCR");
      } else {
        setRegion("Delhi Region");
      }
    };

    map.on("mousemove", updateCoordinates);

    // Set initial coordinates
    const center = map.getCenter();
    setCoordinates({ lat: center.lat.toFixed(4), lng: center.lng.toFixed(4) });

    return () => {
      map.off("mousemove", updateCoordinates);
    };
  }, [mapRef]);

  return (
    <div
      className="latlng-box"
      style={{
        position: "absolute",
        bottom: 100,
        left: 20,
        background: "rgba(2, 6, 23, 0.9)",
        padding: "8px 12px",
        borderRadius: 8,
        color: "white",
        fontSize: 12,
        zIndex: 10,
        backdropFilter: "blur(8px)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        border: "1px solid rgba(255,255,255,0.1)",
        animation: "slideIn 0.3s ease-out",
        pointerEvents: "none"
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ fontWeight: 500, color: "#e2e8f0" }}>
          📍 Lat: {coordinates.lat} | Lng: {coordinates.lng}
        </div>
        <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 400 }}>
          Region: {region}
        </div>
      </div>

      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(-20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}