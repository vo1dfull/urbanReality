import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import AuthModal from "./AuthModal";

const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

export default function MapMenu({ layers, setLayers, mapStyle, setMapStyle, mapRef }) {
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const { user, logout } = useAuth();

  return (
    <div>
      {/* Hamburger Menu Button */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          position: "absolute",
          top: 20,
          left: 20,
          zIndex: 1002,
          width: 48,
          height: 48,
          borderRadius: 12,
          border: "none",
          background: open ? "rgba(2, 6, 23, 0.95)" : "rgba(255, 255, 255, 0.95)",
          boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.2s",
          backdropFilter: "blur(8px)"
        }}
        onMouseEnter={(e) => {
          if (!open) e.target.style.background = "rgba(255, 255, 255, 1)";
        }}
        onMouseLeave={(e) => {
          if (!open) e.target.style.background = "rgba(255, 255, 255, 0.95)";
        }}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke={open ? "#fff" : "#1f2937"}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {open ? (
            <>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </>
          ) : (
            <>
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </>
          )}
        </svg>
      </button>

      {/* Side panel */}
      {/* Side panel */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: 20,
            left: 80,
            zIndex: 1002,
            width: 320,
            background: "rgba(15, 23, 42, 0.95)", // Dark slate background
            borderRadius: 16,
            boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "#f8fafc", // Light text
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
          }}
        >
          <div style={{ padding: 20 }}>
            {/* Layers Section */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: "#f8fafc" }}>Map Layers</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  { id: 'aqi', label: 'Air Quality (AQI)' },
                  { id: 'flood', label: 'Flood Zones' },
                  { id: 'floodDepth', label: 'Flood Depth' }
                ].map((layer) => (
                  <label
                    key={layer.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      cursor: "pointer",
                      padding: "8px 12px",
                      background: "rgba(255,255,255,0.05)",
                      borderRadius: 8,
                      transition: "background 0.2s"
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                  >
                    <input
                      type="checkbox"
                      checked={layers[layer.id]}
                      onChange={() => setLayers(prev => ({ ...prev, [layer.id]: !prev[layer.id] }))}
                      style={{ marginRight: 12, width: 16, height: 16, cursor: "pointer", accentColor: "#3b82f6" }}
                    />
                    <span style={{ fontSize: 14, fontWeight: 500, color: "#e2e8f0" }}>{layer.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div style={{ width: "100%", height: 1, background: "rgba(255,255,255,0.1)", marginBottom: 20 }} />

            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: "#f8fafc" }}>Account</div>

            {user ? (
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{user.name}</div>
                <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 12 }}>{user.email}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { logout(); setAccountOpen(false); }} style={{ flex: 1, padding: '8px', borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "transparent", color: "#fff", cursor: "pointer" }}>Sign out</button>
                  <button onClick={() => setAccountOpen(true)} style={{ padding: '8px 16px', borderRadius: 8, background: '#3b82f6', color: '#fff', border: "none", cursor: "pointer" }}>Profile</button>
                </div>
                <div style={{ marginTop: 12 }}>
                  <button onClick={() => {
                    if (!navigator.geolocation) return alert('Geolocation not available');
                    navigator.geolocation.getCurrentPosition(async (pos) => {
                      try {
                        const token = localStorage.getItem('token');
                        const resp = await fetch(BACKEND + '/api/user/location', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                          body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude })
                        });
                        if (!resp.ok) throw new Error('Save failed');
                        alert('Location saved');
                        if (mapRef && mapRef.current) {
                          mapRef.current.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 14, pitch: 65, bearing: mapRef.current.getBearing() });
                        }
                      } catch (err) {
                        console.error(err);
                        alert('Could not save location');
                      }
                    }, () => alert('Location permission denied'));
                  }} style={{ width: "100%", padding: '8px', borderRadius: 8, background: "rgba(255,255,255,0.05)", color: "#94a3b8", border: "1px dashed rgba(255,255,255,0.2)", cursor: "pointer" }}>📍 Save Current Location</button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ marginTop: 8, color: '#94a3b8', fontSize: 14 }}>Sign in to save locations and preferences</div>
                <div style={{ marginTop: 12 }}>
                  <button onClick={() => setAccountOpen(true)} style={{ width: "100%", padding: '10px', borderRadius: 8, background: "#3b82f6", color: "#fff", border: "none", cursor: "pointer", fontWeight: 500 }}>Sign in / Sign up</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Account popup */}
      {accountOpen && (
        <AuthModal onClose={() => setAccountOpen(false)} />
      )}
    </div>
  );
}

