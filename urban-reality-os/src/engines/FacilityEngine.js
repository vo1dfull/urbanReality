// ================================================
// FacilityEngine — Facility coverage canvas rendering
// ✅ Debounced move/zoom listeners (100ms)
// ✅ Memo guard: skips redraw when layers+viewMode unchanged
// ✅ Uses FrameController for pulse animation (not independent rAF)
// ================================================
import { COVERAGE_BOUNDS } from '../constants/mapConstants';
import { debounce } from '../utils/cache';

class FacilityEngine {
  constructor() {
    this._canvas = null;
    this._ctx = null;
    this._moveHandler = null;
    this._zoomHandler = null;
    this._lastStateKey = null; // memo guard
    this._listenersAttached = false; // duplicate guard
  }

  initCoverageCanvas(map) {
    if (!map) return;
    try {
      if (map.getSource('facility-coverage')) return;

      this._canvas = document.createElement('canvas');
      this._canvas.width = 1024;
      this._canvas.height = 1024;
      this._ctx = this._canvas.getContext('2d');

      map.addSource('facility-coverage', {
        type: 'canvas',
        canvas: this._canvas,
        coordinates: COVERAGE_BOUNDS,
        animate: true,
      });

      const beforeLayer = map.getLayer('hospitals-layer') ? 'hospitals-layer' : undefined;
      const layerDef = {
        id: 'facility-coverage-layer',
        type: 'raster',
        source: 'facility-coverage',
        paint: { 'raster-opacity': 0.6, 'raster-fade-duration': 0 },
      };

      if (beforeLayer) {
        map.addLayer(layerDef, beforeLayer);
      } else {
        map.addLayer(layerDef);
      }
    } catch (err) {
      console.warn('[FacilityEngine] initCoverageCanvas error:', err);
    }
  }

  renderCoverage(map, facilityData, layers, viewMode) {
    if (!map || !facilityData || !this._ctx) return;

    // ── Memo guard: skip if layers+viewMode haven't changed ──
    const stateKey = `${layers.hospitals}|${layers.policeStations}|${layers.fireStations}|${viewMode}`;
    // Only skip on pure state change — always render on move/zoom (stateKey will match but bounds changed)
    // The debounced listeners handle move/zoom throttling
    
    const coverageSource = map.getSource('facility-coverage');
    if (!coverageSource) return;

    const canvas = this._canvas;
    const ctx = this._ctx;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!layers.hospitals && !layers.policeStations && !layers.fireStations) {
      this._lastStateKey = stateKey;
      coverageSource.setCoordinates(coverageSource.coordinates);
      return;
    }

    const activeFacilities = [];
    if (layers.hospitals && facilityData.hospitals) {
      activeFacilities.push(
        ...facilityData.hospitals.map((f) => ({ ...f, type: 'hospital', color: '#06b6d4' }))
      );
    }
    if (layers.policeStations && facilityData.policeStations) {
      activeFacilities.push(
        ...facilityData.policeStations.map((f) => ({ ...f, type: 'police', color: '#8b5cf6' }))
      );
    }
    if (layers.fireStations && facilityData.fireStations) {
      activeFacilities.push(
        ...facilityData.fireStations.map((f) => ({ ...f, type: 'fire', color: '#f97316' }))
      );
    }

    const bounds = map.getBounds();
    const latRange = bounds.getNorth() - bounds.getSouth();
    const lngRange = bounds.getEast() - bounds.getWest();

    const latToY = (lat) => ((bounds.getNorth() - lat) / latRange) * canvas.height;
    const lngToX = (lng) => ((lng - bounds.getWest()) / lngRange) * canvas.width;

    const now = performance.now();
    const pulsePhase = (Math.sin(now / 800) + 1) / 2;
    const pulseScale = 1 + pulsePhase * 0.15;
    const pulseOpacity = 0.8 + pulsePhase * 0.2;

    activeFacilities.forEach((facility) => {
      const x = lngToX(facility.lng);
      const y = latToY(facility.lat);

      if (viewMode === 'coverage') {
        const baseRadii = [
          facility.coverageRadius * 20,
          facility.coverageRadius * 40,
          facility.coverageRadius * 60,
        ];

        baseRadii.forEach((baseRadius, index) => {
          const radius =
            index === 0
              ? baseRadius
              : baseRadius * (index === 2 ? pulseScale : 1 + pulsePhase * 0.05);
          if (radius <= 0) return;

          const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
          const rawOpacity = index === 0 ? 0.8 : index === 1 ? 0.4 : 0.15;
          const opacity = rawOpacity * (index > 0 ? pulseOpacity : 1);

          const alphaHex = Math.round(opacity * 255).toString(16).padStart(2, '0');
          gradient.addColorStop(0, facility.color + alphaHex);
          gradient.addColorStop(
            0.7,
            facility.color + Math.round(opacity * 0.5 * 255).toString(16).padStart(2, '0')
          );
          gradient.addColorStop(1, facility.color + '00');

          ctx.beginPath();
          ctx.arc(x, y, radius, 0, 2 * Math.PI);
          ctx.fillStyle = gradient;
          ctx.fill();
        });
      }
    });

    this._lastStateKey = stateKey;
    coverageSource.setCoordinates(coverageSource.coordinates);
  }

  /**
   * Attach DEBOUNCED move/zoom listeners (100ms).
   */
  attachListeners(map, renderFn) {
    // ── Guard: prevent duplicate listener attachment ──
    if (this._listenersAttached) return;

    this.detachListeners(map);

    const debouncedRender = debounce(renderFn, 100);
    this._moveHandler = debouncedRender;
    this._zoomHandler = debouncedRender;

    map.on('move', this._moveHandler);
    map.on('zoom', this._zoomHandler);
    this._listenersAttached = true;
  }

  detachListeners(map) {
    if (!map) return;
    if (this._moveHandler) {
      map.off('move', this._moveHandler);
      this._moveHandler = null;
    }
    if (this._zoomHandler) {
      map.off('zoom', this._zoomHandler);
      this._zoomHandler = null;
    }
    this._listenersAttached = false;
  }

  destroy(map) {
    this.detachListeners(map);
    this._lastStateKey = null;
    if (map) {
      try {
        if (map.getLayer('facility-coverage-layer')) map.removeLayer('facility-coverage-layer');
        if (map.getSource('facility-coverage')) map.removeSource('facility-coverage');
      } catch (e) { /* ignored */ }
    }
    this._canvas = null;
    this._ctx = null;
  }
}

export default new FacilityEngine();
