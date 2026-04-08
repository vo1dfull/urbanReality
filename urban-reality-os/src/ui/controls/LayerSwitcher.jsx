import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

const CLICK_DEBOUNCE_MS = 120;

let _layerControlStyleInjected = false;
function ensureLayerControlStyles() {
  if (_layerControlStyleInjected || typeof document === 'undefined') return;
  _layerControlStyleInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .layer-hover-control {
      position: fixed;
      left: 20px;
      bottom: 20px;
      z-index: 20;
      pointer-events: auto;
    }

    .layer-hover-shell {
      position: relative;
      width: 52px;
      height: 52px;
      display: flex;
      align-items: center;
    }

    .layer-trigger {
      width: 52px;
      height: 52px;
      border-radius: 14px;
      border: 1px solid rgba(140, 180, 255, 0.18);
      background: rgba(20, 25, 40, 0.7);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #dbeafe;
      cursor: pointer;
      transition: all 0.25s ease;
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
      transform: translateZ(0);
      position: relative;
    }

    .layer-trigger:hover {
      border-color: rgba(96, 165, 250, 0.45);
      box-shadow: 0 0 0 1px rgba(96, 165, 250, 0.28), 0 12px 34px rgba(6, 40, 72, 0.45);
    }

    .layer-trigger.is-open {
      transform: scale(1.02);
      animation: layer-pulse 2.4s ease-in-out infinite;
    }

    .layer-trigger svg {
      transition: transform 0.25s ease, filter 0.25s ease;
      filter: drop-shadow(0 0 5px rgba(125, 211, 252, 0.35));
    }

    .layer-trigger.is-open svg {
      transform: rotate(8deg);
      filter: drop-shadow(0 0 10px rgba(56, 189, 248, 0.55));
    }

    .layer-tooltip {
      position: absolute;
      left: 50%;
      bottom: calc(100% + 10px);
      transform: translateX(-50%) translateY(4px);
      opacity: 0;
      pointer-events: none;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: #dbeafe;
      background: rgba(8, 14, 28, 0.92);
      border: 1px solid rgba(148, 163, 184, 0.25);
      border-radius: 8px;
      padding: 5px 8px;
      transition: all 0.2s ease;
      white-space: nowrap;
      box-shadow: 0 8px 20px rgba(0,0,0,0.3);
    }

    .layer-trigger:hover .layer-tooltip {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }

    .layer-expand-panel {
      position: absolute;
      left: 60px;
      top: 50%;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 16px;
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      background: rgba(20, 25, 40, 0.85);
      border: 1px solid rgba(255,255,255,0.08);
      box-shadow: 0 12px 40px rgba(0,0,0,0.4);
      max-width: min(430px, calc(100vw - 420px));
      overflow-x: auto;
      scrollbar-width: none;
      transition: all 0.25s ease;
      transform: translateY(-50%) translateX(-10px) scale(0.95);
      opacity: 0;
      pointer-events: none;
      will-change: transform, opacity;
    }

    .layer-expand-panel::-webkit-scrollbar { display: none; }

    .layer-expand-panel.is-open {
      transform: translateY(-50%) translateX(0) scale(1);
      opacity: 1;
      pointer-events: auto;
    }

    .layer-card {
      pointer-events: auto;
      width: 62px;
      min-width: 62px;
      height: 62px;
      border-radius: 12px;
      overflow: hidden;
      cursor: pointer;
      user-select: none;
      transition: transform 0.2s ease,
                  border-color 0.2s ease,
                  box-shadow 0.2s ease,
                  background 0.2s ease;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.10);
      box-shadow: 0 8px 18px rgba(0,0,0,0.22);
      display: flex;
      flex-direction: column;
      transform: translateZ(0);
      position: relative;
    }

    .layer-card:hover {
      transform: scale(1.05) translateZ(0);
      border-color: rgba(125, 211, 252, 0.35);
      box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.28), 0 10px 24px rgba(3, 21, 43, 0.4);
    }
    .layer-card:active { transform: scale(1.02) translateZ(0); }

    .layer-card.active {
      border: 2px solid #38bdf8;
      box-shadow: 0 0 0 2px rgba(56,189,248,0.24), 0 0 14px rgba(20,184,166,0.32), 0 10px 26px rgba(2,6,23,0.30);
      transform: scale(1.05) translateZ(0);
      background: rgba(56,189,248,0.12);
    }

    .layer-card[aria-disabled="true"] {
      opacity: 0.55;
      cursor: not-allowed;
    }

    .layer-card[aria-disabled="true"]:hover {
      transform: scale(1.0) translateZ(0);
    }

    .layer-card__preview {
      height: 100%;
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
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 9.5px;
      font-weight: 800;
      letter-spacing: 0.02em;
      color: rgba(226,232,240,0.95);
      background: linear-gradient(180deg, rgba(8,12,28,0.12) 0%, rgba(8,12,28,0.78) 100%);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border-top: 1px solid rgba(255,255,255,0.12);
      text-shadow: 0 1px 10px rgba(0,0,0,0.35);
      padding: 0 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .layer-card__coming-soon {
      position: absolute;
      top: 6px;
      right: 6px;
      padding: 2px 4px;
      font-size: 8px;
      border-radius: 6px;
      background: rgba(15, 23, 42, 0.85);
      border: 1px solid rgba(148, 163, 184, 0.25);
      color: #cbd5e1;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    @keyframes layer-pulse {
      0% { box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35); }
      50% { box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.14), 0 10px 32px rgba(3, 21, 43, 0.45); }
      100% { box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35); }
    }

    @media (hover: none), (pointer: coarse) {
      .layer-hover-control {
        left: 12px;
        bottom: 84px;
      }

      .layer-trigger:hover .layer-tooltip {
        opacity: 0;
      }

      .layer-expand-panel {
        max-width: calc(100vw - 88px);
      }
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
      {disabled && <span className="layer-card__coming-soon">Soon</span>}
    </button>
  );
});

const LayerSwitcher = memo(function LayerSwitcher({ mapStyle, layers, setLayers, setMapStyle }) {
  const lastClickRef = useRef(0);
  const collapseTimerRef = useRef(null);
  const [isPinnedOpen, setIsPinnedOpen] = useState(false);
  const [isContainerHovered, setIsContainerHovered] = useState(false);
  const [iconHoverIntent, setIconHoverIntent] = useState(false);
  const [isTouch, setIsTouch] = useState(false);

  ensureLayerControlStyles();

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

  const isOpen = isTouch ? isPinnedOpen : (isPinnedOpen || (iconHoverIntent && isContainerHovered));

  const clearCollapseTimer = useCallback(() => {
    if (collapseTimerRef.current) {
      window.clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
  }, []);

  const handleContainerEnter = useCallback(() => {
    if (isTouch) return;
    clearCollapseTimer();
    setIsContainerHovered(true);
  }, [clearCollapseTimer, isTouch]);

  const handleContainerLeave = useCallback(() => {
    if (isTouch || isPinnedOpen) return;
    clearCollapseTimer();
    collapseTimerRef.current = window.setTimeout(() => {
      setIsContainerHovered(false);
      setIconHoverIntent(false);
    }, 240);
  }, [clearCollapseTimer, isPinnedOpen, isTouch]);

  const handleIconHover = useCallback(() => {
    if (isTouch) return;
    clearCollapseTimer();
    setIconHoverIntent(true);
    setIsContainerHovered(true);
  }, [clearCollapseTimer, isTouch]);

  const handleTriggerClick = useCallback(() => {
    clearCollapseTimer();
    setIsPinnedOpen((prev) => !prev);
    if (!isTouch) {
      setIconHoverIntent(true);
      setIsContainerHovered(true);
    }
  }, [clearCollapseTimer, isTouch]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(hover: none), (pointer: coarse)');
    const syncTouchMode = () => {
      const touchMode = media.matches;
      setIsTouch(touchMode);
      if (touchMode) {
        setIsContainerHovered(false);
        setIconHoverIntent(false);
      }
    };

    syncTouchMode();
    if (media.addEventListener) media.addEventListener('change', syncTouchMode);
    else media.addListener(syncTouchMode);

    return () => {
      if (media.removeEventListener) media.removeEventListener('change', syncTouchMode);
      else media.removeListener(syncTouchMode);
    };
  }, []);

  useEffect(() => {
    if (!isTouch || !isPinnedOpen) return;
    const handleOutsidePointer = (event) => {
      const root = document.querySelector('.layer-hover-control');
      if (!root) return;
      if (!root.contains(event.target)) {
        setIsPinnedOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleOutsidePointer);
    return () => document.removeEventListener('pointerdown', handleOutsidePointer);
  }, [isPinnedOpen, isTouch]);

  useEffect(() => () => clearCollapseTimer(), [clearCollapseTimer]);

  const items = useMemo(() => ([
    { id: 'satellite', label: 'Satellite', previewSrc: PREVIEWS.satellite },
    { id: 'terrain', label: 'Terrain', previewSrc: PREVIEWS.terrain },
    { id: 'traffic', label: 'Traffic', previewSrc: PREVIEWS.traffic },
    { id: 'transit', label: 'Transit', previewSrc: PREVIEWS.transit, disabled: true },
    { id: 'facilities', label: 'Facilities', previewSrc: PREVIEWS.facilities },
    { id: 'nasa', label: 'NASA Events', previewSrc: PREVIEWS.nasa },
  ]), []);

  return (
    <div
      className="layer-hover-control"
      aria-label="Map layers"
      onMouseEnter={handleContainerEnter}
      onMouseLeave={handleContainerLeave}
    >
      <div className="layer-hover-shell">
        <button
          type="button"
          className={`layer-trigger${isOpen ? ' is-open' : ''}`}
          aria-expanded={isOpen}
          aria-label="Layers"
          title="Layers"
          onClick={handleTriggerClick}
          onMouseEnter={handleIconHover}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 3L3 7.5L12 12L21 7.5L12 3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
            <path d="M3 12L12 16.5L21 12" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
            <path d="M3 16.5L12 21L21 16.5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
          </svg>
          <span className="layer-tooltip">Layers</span>
        </button>

        <div
          className={`layer-expand-panel${isOpen ? ' is-open' : ''}`}
          onMouseEnter={handleContainerEnter}
          onMouseLeave={handleContainerLeave}
        >
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
    </div>
  );
});

export default LayerSwitcher;
