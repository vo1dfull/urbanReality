import { useState } from "react";

export default function BottomLayers({ layers, setLayers, mapStyle, setMapStyle, facilityViewMode, setFacilityViewMode }) {
  const [hover, setHover] = useState(false);

  const items = [
    { id: 'map', label: 'Map' },
    { id: 'satellite', label: 'Satellite' },
    { id: 'terrain', label: 'Terrain' },
    { id: 'traffic', label: 'Traffic' },
    { id: 'facility', label: 'Facility Check', hasModes: true }
  ];

  const selected = mapStyle === 'satellite' ? 'satellite' : mapStyle === 'terrain' ? 'terrain' : (layers.traffic ? 'traffic' : (layers.hospitals || layers.policeStations || layers.fireStations ? 'facility' : 'map'));

  const handleSelect = (id) => {
    if (id === 'satellite') setMapStyle(mapStyle === 'satellite' ? 'default' : 'satellite');
    else if (id === 'terrain') setMapStyle(mapStyle === 'terrain' ? 'default' : 'terrain');
    else if (id === 'traffic') setLayers(prev => ({ ...prev, traffic: !prev.traffic }));
    else if (id === 'facility') {
      const hasFacilities = layers.hospitals || layers.policeStations || layers.fireStations;
      if (hasFacilities) {
        // Turn off all facilities
        setLayers(prev => ({ ...prev, hospitals: false, policeStations: false, fireStations: false }));
      } else {
        // Turn on all facilities
        setLayers(prev => ({ ...prev, hospitals: true, policeStations: true, fireStations: true }));
      }
    }
    else {
      // map selected: reset to default
      setMapStyle('default');
      setLayers(prev => ({ ...prev, traffic: false }));
    }
  };

  const facilityModes = [
    { id: 'coverage', label: 'Coverage' },
    { id: 'gap', label: 'Gap Analysis' },
    { id: 'heatmap', label: 'Heatmap' }
  ];

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'absolute',
        bottom: 18,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1001,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <div style={{
        display: 'flex',
        gap: hover ? 10 : 0,
        alignItems: 'center',
        transition: 'all 220ms ease',
        background: 'transparent'
      }}>
        {items.map(item => (
          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => handleSelect(item.id)}
              style={{
                width: hover ? 64 : 120,
                height: 56,
                borderRadius: 12,
                border: item.id === selected ? '2px solid #0ea5e9' : '1px solid rgba(0,0,0,0.08)',
                background: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 220ms ease',
                cursor: 'pointer',
                overflow: 'hidden'
              }}
              title={item.label}
            >
              {hover ? (
                <div style={{ fontSize: 12, fontWeight: 700 }}>{item.label}</div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: item.id === 'traffic' ? '#ef4444' : item.id === 'facility' ? '#06b6d4' : '#0ea5e9' }} />
                  <div style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>{item.id === selected ? item.label : selected === 'map' ? 'Map' : item.label}</div>
                </div>
              )}
            </button>

            {/* Facility Check Mode Switcher */}
            {item.id === 'facility' && (layers.hospitals || layers.policeStations || layers.fireStations) && (
              <div style={{
                display: 'flex',
                gap: 4,
                background: 'rgba(255,255,255,0.95)',
                borderRadius: 8,
                padding: '4px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                backdropFilter: 'blur(8px)'
              }}>
                {facilityModes.map(mode => (
                  <button
                    key={mode.id}
                    onClick={() => setFacilityViewMode(mode.id)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 6,
                      border: 'none',
                      background: facilityViewMode === mode.id ? '#0ea5e9' : 'transparent',
                      color: facilityViewMode === mode.id ? '#fff' : '#374151',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
