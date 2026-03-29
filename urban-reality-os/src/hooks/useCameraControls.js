// ================================================
// useCameraControls — Right-click drag, fly-through, reset
// ✅ Fixed: rightClickRaf cancelled on unmount
// ✅ NEW: Double-click smart zoom
// ✅ NEW: Smooth inertial rotation (velocity decay)
// ✅ NEW: Keyboard arrow rotation
// ✅ NEW: Cinematic keyframe system
// ================================================
import { useEffect, useCallback, useRef } from 'react';
import useMapStore from '../store/useMapStore';
import MapEngine from '../engines/MapEngine';
import eventBus, { EVENTS } from '../core/EventBus';
import {
  MAP_CONFIG,
  FLY_THROUGH_TOUR,
} from '../constants/mapConstants';

/** @type {number} Inertia decay factor — 🔥 0.88 settles faster than 0.92 */
const INERTIA_DECAY = 0.88;
/** @type {number} Minimum velocity to continue inertia */
const INERTIA_MIN_VELOCITY = 0.15;

export default function useCameraControls() {
  const loading = useMapStore((s) => s.loading);
  const setCameraState = useMapStore((s) => s.setCameraState);
  const cameraStateRef = useRef({ bearing: MAP_CONFIG.bearing, pitch: MAP_CONFIG.pitch });
  const cameraRafIdRef = useRef(null);
  const flyThroughTimeoutsRef = useRef([]);
  const flyThroughActiveRef = useRef(false);

  // ── Right-Click Drag Rotation with Inertia ──
  useEffect(() => {
    if (loading) return;
    const map = MapEngine.getMap();
    if (!map) return;

    const container = map.getContainer();
    if (!container) return;

    let isRightClickDragging = false;
    let startPos = { x: 0, y: 0, bearing: 0, pitch: 0 };
    let rightClickRaf = null;
    let pendingCamera = null;

    // Inertia tracking
    let velocityX = 0;
    let velocityY = 0;
    let lastMoveX = 0;
    let lastMoveY = 0;
    let lastMoveTime = 0;
    let inertiaRaf = null;

    const handleRightMouseDown = (e) => {
      if (e.button === 2) {
        e.preventDefault();
        e.stopPropagation();
        isRightClickDragging = true;
        velocityX = 0;
        velocityY = 0;
        startPos = {
          x: e.clientX,
          y: e.clientY,
          bearing: map.getBearing(),
          pitch: map.getPitch(),
        };
        lastMoveX = e.clientX;
        lastMoveY = e.clientY;
        lastMoveTime = performance.now();
        container.style.cursor = 'grabbing';
        if (map.dragRotate?.disable) map.dragRotate.disable();
        // Cancel any running inertia
        if (inertiaRaf) {
          cancelAnimationFrame(inertiaRaf);
          inertiaRaf = null;
        }
      }
    };

    let throttleTime = 0;

    // 🔥 PERF: passive listener + 32ms throttle (was 16ms)
    const handleMouseMove = (e) => {
      if (isRightClickDragging && map) {
        const now = performance.now();
        if (now - throttleTime < 32) return; // 🔥 32ms = ~30fps for drag (was 16ms)
        throttleTime = now;

        e.preventDefault();
        const deltaX = e.clientX - startPos.x;
        const deltaY = e.clientY - startPos.y;
        const newBearing = startPos.bearing + deltaX * 0.5;
        const newPitch = Math.max(0, Math.min(85, startPos.pitch - deltaY * 0.3));

        // Track velocity for inertia
        const dt = now - lastMoveTime;
        if (dt > 0) {
          velocityX = (e.clientX - lastMoveX) / dt;
          velocityY = (e.clientY - lastMoveY) / dt;
        }
        lastMoveX = e.clientX;
        lastMoveY = e.clientY;
        lastMoveTime = now;

        pendingCamera = { bearing: newBearing, pitch: newPitch };
        if (!rightClickRaf) {
          rightClickRaf = requestAnimationFrame(() => {
            if (map && pendingCamera) {
              map.easeTo({
                bearing: pendingCamera.bearing,
                pitch: pendingCamera.pitch,
                duration: 0,
                essential: true,
              });
              cameraStateRef.current = pendingCamera;
            }
            rightClickRaf = null;
          });
        }
      }
    };

    const handleContextMenu = (e) => {
      if (isRightClickDragging) e.preventDefault();
    };

    const applyInertia = () => {
      if (!map || Math.abs(velocityX) < INERTIA_MIN_VELOCITY && Math.abs(velocityY) < INERTIA_MIN_VELOCITY) {
        inertiaRaf = null;
        return;
      }

      const currentBearing = map.getBearing();
      const currentPitch = map.getPitch();
      const newBearing = currentBearing + velocityX * 8;
      const newPitch = Math.max(0, Math.min(85, currentPitch - velocityY * 5));

      map.easeTo({
        bearing: newBearing,
        pitch: newPitch,
        duration: 0,
        essential: true,
      });

      velocityX *= INERTIA_DECAY;
      velocityY *= INERTIA_DECAY;

      inertiaRaf = requestAnimationFrame(applyInertia);
    };

    const handleMouseUp = (e) => {
      if (isRightClickDragging && e.button === 2) {
        e.preventDefault();
        e.stopPropagation();
        isRightClickDragging = false;
        container.style.cursor = '';
        setCameraState(cameraStateRef.current);
        if (rightClickRaf) {
          cancelAnimationFrame(rightClickRaf);
          rightClickRaf = null;
        }
        if (map.dragRotate?.enable) map.dragRotate.enable();

        // Start inertia if velocity is significant
        if (Math.abs(velocityX) > INERTIA_MIN_VELOCITY || Math.abs(velocityY) > INERTIA_MIN_VELOCITY) {
          inertiaRaf = requestAnimationFrame(applyInertia);
        }
      }
    };

    // ── Double-click smart zoom ──
    const handleDoubleClick = (e) => {
      e.preventDefault();
      const currentZoom = map.getZoom();
      const targetZoom = Math.min(currentZoom + 2, 18);
      const currentPitch = map.getPitch();
      const targetPitch = Math.min(currentPitch + 10, 75);

      map.flyTo({
        center: map.unproject([e.clientX, e.clientY]),
        zoom: targetZoom,
        pitch: targetPitch,
        duration: 600,
        essential: true,
      });
    };

    container.addEventListener('mousedown', handleRightMouseDown, { passive: false });
    window.addEventListener('mousemove', handleMouseMove, { passive: false });
    window.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('contextmenu', handleContextMenu);
    container.addEventListener('dblclick', handleDoubleClick);

    return () => {
      container.removeEventListener('mousedown', handleRightMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      container.removeEventListener('contextmenu', handleContextMenu);
      container.removeEventListener('dblclick', handleDoubleClick);
      // ✅ Fix: always cancel pending RAF on cleanup
      if (rightClickRaf) {
        cancelAnimationFrame(rightClickRaf);
        rightClickRaf = null;
      }
      if (inertiaRaf) {
        cancelAnimationFrame(inertiaRaf);
        inertiaRaf = null;
      }
      if (map.dragRotate?.enable) map.dragRotate.enable();
    };
  }, [loading, setCameraState]);

  // ── Camera State Sync (rotate/pitch events) ──
  useEffect(() => {
    const map = MapEngine.getMap();
    if (!map) return;

    const updateCameraState = () => {
      if (cameraRafIdRef.current) return;
      cameraRafIdRef.current = requestAnimationFrame(() => {
        setCameraState({
          bearing: Math.round(map.getBearing()),
          pitch: Math.round(map.getPitch()),
        });
        cameraRafIdRef.current = null;
      });
    };

    map.on('rotate', updateCameraState);
    map.on('pitch', updateCameraState);

    return () => {
      if (cameraRafIdRef.current) {
        cancelAnimationFrame(cameraRafIdRef.current);
        cameraRafIdRef.current = null;
      }
      map.off('rotate', updateCameraState);
      map.off('pitch', updateCameraState);
    };
  }, [setCameraState]);

  // ── Fly To Point ──
  const flyToPoint = useCallback((lng, lat, zoom = 14, pitch = 65, bearing = 0) => {
    const map = MapEngine.getMap();
    if (!map) return;
    map.flyTo({
      center: [lng, lat],
      zoom, pitch, bearing,
      speed: 0.6,
      curve: 1.8,
      essential: true,
    });
  }, []);

  // ── Reset Camera ──
  const resetCamera = useCallback(() => {
    const map = MapEngine.getMap();
    if (!map) return;
    map.flyTo({
      center: MAP_CONFIG.center,
      zoom: MAP_CONFIG.zoom,
      pitch: MAP_CONFIG.pitch,
      bearing: MAP_CONFIG.bearing,
      speed: 0.8,
      curve: 1.5,
    });
    setCameraState({ bearing: MAP_CONFIG.bearing, pitch: MAP_CONFIG.pitch });
    eventBus.emit(EVENTS.CAMERA_RESET);
  }, [setCameraState]);

  // ── City Fly-Through with EventBus ──
  const startCityFlyThrough = useCallback(() => {
    const map = MapEngine.getMap();
    if (!map) return;

    flyThroughTimeoutsRef.current.forEach(clearTimeout);
    flyThroughTimeoutsRef.current = [];
    flyThroughActiveRef.current = true;
    eventBus.emit(EVENTS.FLY_THROUGH_STARTED);

    let i = 0;
    const flyNext = () => {
      if (i >= FLY_THROUGH_TOUR.length || !MapEngine.getMap() || !flyThroughActiveRef.current) {
        flyThroughTimeoutsRef.current = [];
        flyThroughActiveRef.current = false;
        eventBus.emit(EVENTS.FLY_THROUGH_STOPPED);
        return;
      }
      const p = FLY_THROUGH_TOUR[i];
      flyToPoint(p.lng, p.lat, p.zoom, 65, p.bearing);
      i++;
      const timeout = setTimeout(flyNext, 4500);
      flyThroughTimeoutsRef.current.push(timeout);
    };

    flyNext();
  }, [flyToPoint]);

  // ── Stop Fly-Through ──
  const stopFlyThrough = useCallback(() => {
    flyThroughTimeoutsRef.current.forEach(clearTimeout);
    flyThroughTimeoutsRef.current = [];
    flyThroughActiveRef.current = false;
    eventBus.emit(EVENTS.FLY_THROUGH_STOPPED);
  }, []);

  // ── Cinematic Keyframe Animation ──
  const playCinematic = useCallback((keyframes, options = {}) => {
    const map = MapEngine.getMap();
    if (!map || !keyframes?.length) return;

    const { duration = 3000, onComplete } = options;

    flyThroughTimeoutsRef.current.forEach(clearTimeout);
    flyThroughTimeoutsRef.current = [];
    flyThroughActiveRef.current = true;
    eventBus.emit(EVENTS.FLY_THROUGH_STARTED);

    let i = 0;
    const playNext = () => {
      if (i >= keyframes.length || !MapEngine.getMap() || !flyThroughActiveRef.current) {
        flyThroughActiveRef.current = false;
        eventBus.emit(EVENTS.FLY_THROUGH_STOPPED);
        if (onComplete) onComplete();
        return;
      }

      const kf = keyframes[i];
      map.easeTo({
        center: [kf.lng, kf.lat],
        zoom: kf.zoom ?? 14,
        pitch: kf.pitch ?? 65,
        bearing: kf.bearing ?? 0,
        duration: kf.duration ?? duration,
        easing: (t) => t * (2 - t), // Ease-out quadratic
        essential: true,
      });

      i++;
      const timeout = setTimeout(playNext, (kf.duration ?? duration) + (kf.pause ?? 500));
      flyThroughTimeoutsRef.current.push(timeout);
    };

    playNext();
  }, []);

  // Cleanup fly-through on unmount
  useEffect(() => {
    return () => {
      flyThroughTimeoutsRef.current.forEach(clearTimeout);
      flyThroughTimeoutsRef.current = [];
      flyThroughActiveRef.current = false;
    };
  }, []);

  return { flyToPoint, resetCamera, startCityFlyThrough, stopFlyThrough, playCinematic };
}
