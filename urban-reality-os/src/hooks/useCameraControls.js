// ================================================
// useCameraControls — Right-click drag, fly-through, reset
// ================================================
import { useEffect, useCallback, useRef } from 'react';
import useMapStore from '../store/useMapStore';
import MapEngine from '../engines/MapEngine';
import {
  MAP_CONFIG,
  FLY_THROUGH_TOUR,
} from '../constants/mapConstants';

export default function useCameraControls() {
  const loading = useMapStore((s) => s.loading);
  const setCameraState = useMapStore((s) => s.setCameraState);
  const cameraStateRef = useRef({ bearing: MAP_CONFIG.bearing, pitch: MAP_CONFIG.pitch });
  const cameraRafIdRef = useRef(null);
  const flyThroughTimeoutsRef = useRef([]);

  // ── Right-Click Drag Rotation ──
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

    const handleRightMouseDown = (e) => {
      if (e.button === 2) {
        e.preventDefault();
        e.stopPropagation();
        isRightClickDragging = true;
        startPos = {
          x: e.clientX,
          y: e.clientY,
          bearing: map.getBearing(),
          pitch: map.getPitch(),
        };
        container.style.cursor = 'grabbing';
        if (map.dragRotate?.disable) map.dragRotate.disable();
      }
    };

    let lastMoveTime = 0;

    const handleMouseMove = (e) => {
      if (isRightClickDragging && map) {
        // ── Throttle to ~60fps: skip events within 16ms ──
        const now = performance.now();
        if (now - lastMoveTime < 16) return;
        lastMoveTime = now;

        e.preventDefault();
        const deltaX = e.clientX - startPos.x;
        const deltaY = e.clientY - startPos.y;
        const newBearing = startPos.bearing + deltaX * 0.5;
        const newPitch = Math.max(0, Math.min(85, startPos.pitch - deltaY * 0.3));

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
      }
    };

    container.addEventListener('mousedown', handleRightMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('contextmenu', handleContextMenu);

    return () => {
      container.removeEventListener('mousedown', handleRightMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      container.removeEventListener('contextmenu', handleContextMenu);
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
  }, [setCameraState]);

  // ── City Fly-Through ──
  const startCityFlyThrough = useCallback(() => {
    const map = MapEngine.getMap();
    if (!map) return;

    flyThroughTimeoutsRef.current.forEach(clearTimeout);
    flyThroughTimeoutsRef.current = [];

    let i = 0;
    const flyNext = () => {
      if (i >= FLY_THROUGH_TOUR.length || !MapEngine.getMap()) {
        flyThroughTimeoutsRef.current = [];
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

  // Cleanup fly-through on unmount
  useEffect(() => {
    return () => {
      flyThroughTimeoutsRef.current.forEach(clearTimeout);
      flyThroughTimeoutsRef.current = [];
    };
  }, []);

  return { flyToPoint, resetCamera, startCityFlyThrough };
}
