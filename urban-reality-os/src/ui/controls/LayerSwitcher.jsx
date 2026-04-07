import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

const CLICK_DEBOUNCE_MS = 120;

let _layerStripStyleInjected = false;
function ensureLayerStripStyles() {
  if (_layerStripStyleInjected || typeof document === 'undefined') return;
  _layerStripStyleInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .layer-strip-wrap {
      position: fixed;
      left: 20px;
      bottom: 20px;
      z-index: 60;
      pointer-events: none;
    }

    .layer-strip {
      pointer-events: none;
      display: flex;
      gap: 11px;
      overflow-x: auto;
      padding: 10px;
      border-radius: 16px;
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      background: rgba(20, 25, 40, 0.6);
      border: 1px solid rgba(255,255,255,0.08);
      box-shadow: 0 10px 40px rgba(0,0,0,0.4);
      max-width: min(540px, calc(100vw - 40px));
      scrollbar-width: none;
      -ms-overflow-style: none;
      overscroll-behavior-x: contain;
      scroll-snap-type: x proximity;
      will-change: transform;
      transition: all 0.25s ease;
    }

    .layer-strip::-webkit-scrollbar { display: none; }

    .layer-card {
      pointer-events: auto;
      width: 80px;
      min-width: 80px;
      height: 65px;
      border-radius: 12px;
      overflow: hidden;
      cursor: pointer;
      user-select: none;
      transition: transform 180ms cubic-bezier(0.4, 0, 0.2, 1),
                  border-color 180ms cubic-bezier(0.4, 0, 0.2, 1),
                  box-shadow 180ms cubic-bezier(0.4, 0, 0.2, 1),
                  background 180ms cubic-bezier(0.4, 0, 0.2, 1);
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.10);
      box-shadow: 0 8px 18px rgba(0,0,0,0.22);
      display: flex;
      flex-direction: column;
      scroll-snap-align: start;
      transform: translateZ(0);
    }

    .layer-card:hover { transform: scale(1.08) translateZ(0); }
    .layer-card:active { transform: scale(1.02) translateZ(0); }

    .layer-card.active {
      border: 2px solid #4da3ff;
      box-shadow: 0 0 0 2px rgba(77,163,255,0.18), 0 10px 26px rgba(2,6,23,0.30);
      transform: scale(1.06) translateZ(0);
      background: rgba(77,163,255,0.10);
    }

    .layer-card[aria-disabled="true"] {
      opacity: 0.55;
      cursor: not-allowed;
    }

    .layer-card[aria-disabled="true"]:hover {
      transform: scale(1.0) translateZ(0);
    }

    .layer-card__preview {
      height: 41px;
      width: 100%;
      position: relative;
      background: rgba(255,255,255,0.06);
    }

    .layer-card__preview img {
      height: 100%;
      width: 100%;
      object-fit: cover;
      display: block;
    }

    .layer-card__label {
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.02em;
      color: rgba(226,232,240,0.95);
      background: rgba(8,12,28,0.35);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border-top: 1px solid rgba(255,255,255,0.08);
      text-shadow: 0 1px 10px rgba(0,0,0,0.35);
    }
  `;
  document.head.appendChild(style);
}

function svgDataUrl(svg) {
  // Encode safely for use in <img src="data:...">
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const PREVIEWS = {
  satellite: svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="160" height="90" viewBox="0 0 160 90">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#9a7b52"/>
          <stop offset="0.35" stop-color="#6b5a44"/>
          <stop offset="0.7" stop-color="#3f362b"/>
          <stop offset="1" stop-color="#b59a7e"/>
        </linearGradient>
      </defs>
      <rect width="160" height="90" fill="url(#g)"/>
      <g opacity="0.32">
        <circle cx="38" cy="36" r="20" fill="#2e7d32"/>
        <circle cx="112" cy="54" r="24" fill="#2e7d32"/>
        <circle cx="82" cy="26" r="16" fill="#2e7d32"/>
      </g>
      <g opacity="0.55">
        <path d="M-10 58 L170 42" stroke="#e7c08a" stroke-width="3"/>
        <path d="M-10 30 L170 54" stroke="#e7c08a" stroke-width="2"/>
      </g>
      <g opacity="0.18">
        <path d="M0 0H160V90H0Z" fill="none" stroke="#000" stroke-width="1"/>
        <path d="M0 18H160M0 36H160M0 54H160M0 72H160" stroke="#000"/>
        <path d="M32 0V90M64 0V90M96 0V90M128 0V90" stroke="#000"/>
      </g>
    </svg>
  `),
  terrain: svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="160" height="90" viewBox="0 0 160 90">
      <defs>
        <linearGradient id="t" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#d5f0d5"/>
          <stop offset="0.35" stop-color="#9acb9a"/>
          <stop offset="0.7" stop-color="#5a8f5a"/>
          <stop offset="1" stop-color="#2f5a2f"/>
        </linearGradient>
      </defs>
      <rect width="160" height="90" fill="url(#t)"/>
      <g fill="none" stroke="#2f5a2f" stroke-width="2" opacity="0.55">
        <path d="M8 70 Q 30 50 56 60 T 104 62 T 152 50" />
        <path d="M6 80 Q 32 64 60 72 T 110 74 T 154 64" opacity="0.7"/>
        <path d="M12 58 Q 40 40 70 48 T 126 52 T 154 38" opacity="0.5"/>
      </g>
    </svg>
  `),
  traffic: svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="160" height="90" viewBox="0 0 160 90">
      <rect width="160" height="90" fill="#0b1226"/>
      <g stroke="#24324a" stroke-width="10" opacity="0.85">
        <line x1="80" y1="-8" x2="80" y2="98"/>
        <line x1="-8" y1="45" x2="168" y2="45"/>
      </g>
      <g stroke-linecap="round" stroke-width="12" opacity="0.95">
        <line x1="80" y1="-2" x2="80" y2="35" stroke="#22c55e"/>
        <line x1="80" y1="55" x2="80" y2="92" stroke="#eab308"/>
        <line x1="5" y1="45" x2="55" y2="45" stroke="#dc2626"/>
        <line x1="105" y1="45" x2="155" y2="45" stroke="#22c55e"/>
      </g>
      <g opacity="0.25">
        <circle cx="120" cy="22" r="14" fill="#60a5fa"/>
      </g>
    </svg>
  `),
  facilities: svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="160" height="90" viewBox="0 0 160 90">
      <defs>
        <linearGradient id="f" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#0b1226"/>
          <stop offset="1" stop-color="#081022"/>
        </linearGradient>
      </defs>
      <rect width="160" height="90" fill="url(#f)"/>
      <g opacity="0.18" fill="#ffffff">
        <circle cx="34" cy="30" r="10"/>
        <circle cx="120" cy="26" r="8"/>
        <circle cx="98" cy="62" r="11"/>
      </g>
      <g transform="translate(66 22)">
        <rect x="0" y="0" width="28" height="28" rx="8" fill="#06b6d4" opacity="0.95"/>
        <path d="M12.5 6.5h3v6h6v3h-6v6h-3v-6h-6v-3h6z" fill="#ffffff"/>
      </g>
      <g opacity="0.55" stroke="#1f2a44" stroke-width="2">
        <path d="M34 30 L80 36" />
        <path d="M120 26 L94 36" />
        <path d="M98 62 L82 40" />
      </g>
    </svg>
  `),
  transit: svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="160" height="90" viewBox="0 0 160 90">
      <rect width="160" height="90" fill="#0b1226"/>
      <g opacity="0.15" fill="#ffffff">
        <circle cx="30" cy="28" r="10"/><circle cx="130" cy="62" r="12"/>
      </g>
      <g fill="none" stroke-width="6" stroke-linecap="round" opacity="0.95">
        <path d="M20 70 C 45 40, 70 40, 90 55 C 110 70, 130 65, 145 40" stroke="#60a5fa"/>
        <path d="M18 26 C 42 18, 70 20, 92 30 C 112 40, 130 42, 148 34" stroke="#a78bfa" opacity="0.85"/>
      </g>
      <g fill="#ffffff" opacity="0.9">
        <circle cx="20" cy="70" r="4"/><circle cx="90" cy="55" r="4"/><circle cx="145" cy="40" r="4"/>
      </g>
    </svg>
  `),
  nasa: svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="160" height="90" viewBox="0 0 160 90">
      <rect width="160" height="90" fill="#020617"/>
      <g opacity="0.6">
        <circle cx="30" cy="20" r="1.5" fill="#ffffff"/>
        <circle cx="70" cy="10" r="1" fill="#ffffff"/>
        <circle cx="120" cy="15" r="1.5" fill="#ffffff"/>
        <circle cx="150" cy="30" r="1" fill="#ffffff"/>
        <circle cx="10" cy="60" r="1" fill="#ffffff"/>
        <circle cx="90" cy="8" r="1" fill="#ffffff"/>
        <circle cx="140" cy="70" r="1.5" fill="#ffffff"/>
      </g>
      <circle cx="80" cy="45" r="28" fill="none" stroke="#1e3a5f" stroke-width="1.5" opacity="0.8"/>
      <circle cx="80" cy="45" r="20" fill="none" stroke="#1e3a5f" stroke-width="1" opacity="0.5"/>
      <circle cx="56" cy="32" r="7" fill="#ef4444" opacity="0.9"/>
      <circle cx="110" cy="55" r="6" fill="#3b82f6" opacity="0.9"/>
      <circle cx="75" cy="62" r="5" fill="#eab308" opacity="0.9"/>
      <circle cx="95" cy="28" r="4" fill="#f97316" opacity="0.9"/>
    </svg>
  `),
};

const LayerCard = memo(function LayerCard({ id, label, active, previewSrc, onSelect, disabled = false }) {
  return (
    <button
      type="button"
      className={`layer-card${active ? ' active' : ''}`}
      onClick={() => {
        if (disabled) return;
        onSelect(id);
      }}
      aria-pressed={active}
      aria-disabled={disabled}
      title={disabled ? `${label} (coming soon)` : label}
    >
      <div className="layer-card__preview">
        <img src={previewSrc} alt="" loading="lazy" decoding="async" />
      </div>
      <div className="layer-card__label">{label}</div>
    </button>
  );
});

const LayerSwitcher = memo(function LayerSwitcher({ mapStyle, layers, setLayers, setMapStyle }) {
  const lastClickRef = useRef(0);
  ensureLayerStripStyles();

  const derivedActive = useMemo(() => {
    if (mapStyle === 'terrain') return 'terrain';
    if (mapStyle === 'satellite') return 'satellite';
    if (layers.traffic) return 'traffic';
    if (layers.hospitals || layers.policeStations || layers.fireStations || layers.schools) return 'facilities';
    if (layers.nasaEvents) return 'nasa';
    return null;
  }, [mapStyle, layers]);

  // Requested state management shape — locally track selection for snappy UI,
  // but keep it in sync with the canonical store props.
  const [activeLayer, setActiveLayer] = useState(derivedActive || 'terrain');
  useEffect(() => {
    if (!derivedActive) return;
    setActiveLayer(derivedActive);
  }, [derivedActive]);

  const applyLayer = useCallback((id) => {
    const now = performance.now();
    if (now - lastClickRef.current < CLICK_DEBOUNCE_MS) return;
    lastClickRef.current = now;

    if (id === 'terrain') {
      setMapStyle((mapStyle === 'terrain') ? 'default' : 'terrain');
      return;
    }
    if (id === 'satellite') {
      setMapStyle((mapStyle === 'satellite') ? 'default' : 'satellite');
      return;
    }
    if (id === 'traffic') {
      setLayers((prev) => ({ ...prev, traffic: !prev.traffic }));
      return;
    }
    if (id === 'facilities') {
      const enabled = layers.hospitals || layers.policeStations || layers.fireStations || layers.schools;
      setLayers((prev) => ({
        ...prev,
        hospitals: !enabled,
        policeStations: !enabled,
        fireStations: !enabled,
        schools: !enabled,
      }));
      return;
    }
    if (id === 'nasa') {
      setLayers((prev) => ({ ...prev, nasaEvents: !prev.nasaEvents }));
      return;
    }
    // Transit is optional and not yet wired in this build.
  }, [layers.fireStations, layers.hospitals, layers.policeStations, layers.schools, mapStyle, setLayers, setMapStyle]);

  const handleSelect = useCallback((id) => {
    setActiveLayer(id);
    applyLayer(id);
  }, [applyLayer]);

  const items = useMemo(() => ([
    { id: 'satellite', label: 'Satellite', previewSrc: PREVIEWS.satellite },
    { id: 'terrain', label: 'Terrain', previewSrc: PREVIEWS.terrain },
    { id: 'traffic', label: 'Traffic', previewSrc: PREVIEWS.traffic },
    { id: 'transit', label: 'Transit', previewSrc: PREVIEWS.transit, disabled: true },
    { id: 'facilities', label: 'Facilities', previewSrc: PREVIEWS.facilities },
    { id: 'nasa', label: 'NASA Events', previewSrc: PREVIEWS.nasa },
  ]), []);

  return (
    <div className="layer-strip-wrap" aria-label="Map layers">
      <div className="layer-strip">
        {items.map((item) => (
          <LayerCard
            key={item.id}
            id={item.id}
            label={item.label}
            previewSrc={item.previewSrc}
            active={activeLayer === item.id}
            disabled={!!item.disabled}
            onSelect={handleSelect}
          />
        ))}
      </div>
    </div>
  );
});

export default LayerSwitcher;
