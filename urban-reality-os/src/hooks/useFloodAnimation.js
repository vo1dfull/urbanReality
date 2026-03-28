// ================================================
// useFloodAnimation — Flood depth animation loop
// ✅ Uses FrameController (ONE global rAF loop)
// ✅ Auto-pauses via FrameController visibility handling
// ✅ Threshold guard: skips setData if depth change < 0.05
// ================================================
import { useEffect, useRef } from 'react';
import useMapStore from '../store/useMapStore';
import MapEngine from '../engines/MapEngine';
import LayerEngine from '../engines/LayerEngine';
import FrameController from '../core/FrameController';
import {
  BASE_YEAR,
  MAX_YEAR,
  FLOOD_ANIMATION_CONFIG,
} from '../constants/mapConstants';

export default function useFloodAnimation() {
  const floodMode = useMapStore((s) => s.floodMode);
  const year = useMapStore((s) => s.year);
  const floodDepthEnabled = useMapStore((s) => s.layers.floodDepth);

  const taskIdRef = useRef(null);
  const floodDepthRef = useRef(0);
  const rainfallRef = useRef(0);
  const geometryInitRef = useRef(false);

  useEffect(() => {
    const map = MapEngine.getMap();
    if (!map) return;

    const floodPlugin = LayerEngine.getPlugin('flood');
    if (!floodPlugin) return;

    // Remove previous task from global loop
    if (taskIdRef.current !== null) {
      FrameController.remove(taskIdRef.current);
      taskIdRef.current = null;
    }

    // Reset + clear when disabled
    if (!floodMode || !floodDepthEnabled) {
      floodDepthRef.current = FLOOD_ANIMATION_CONFIG.resetDepth;
      // Clear feature state instead of replacing geometry
      try { map.removeFeatureState({ source: 'flood-depth' }); } catch (_) {}
      return;
    }

    // Upload geometry ONCE (idempotent)
    if (!geometryInitRef.current) {
      floodPlugin.initDepthGeometry(map);
      geometryInitRef.current = true;
    }

    // Compute target max depth
    const yearsElapsed = year - BASE_YEAR;
    const timeFactor = yearsElapsed / (MAX_YEAR - BASE_YEAR);
    const rainAmplifier = Math.min(rainfallRef.current / 15, 1);
    const maxDepth =
      3 * (timeFactor + FLOOD_ANIMATION_CONFIG.baseDepthMultiplier + rainAmplifier * 0.6);

    if (floodDepthRef.current >= maxDepth) {
      floodDepthRef.current = FLOOD_ANIMATION_CONFIG.resetDepth;
    }

    // Register with FrameController — runs at ~5fps (200ms interval)
    const taskFn = () => {
      if (!MapEngine.getMap()) return;

      // Stop when max reached
      if (floodDepthRef.current >= maxDepth) {
        if (taskIdRef.current !== null) {
          FrameController.remove(taskIdRef.current);
          taskIdRef.current = null;
        }
        return;
      }

      const prevDepth = floodDepthRef.current;
      const nextDepth = Math.min(
        prevDepth + FLOOD_ANIMATION_CONFIG.depthIncrement,
        maxDepth
      );

      // Threshold guard
      if (nextDepth - prevDepth > 0.05) {
        floodDepthRef.current = nextDepth;
        // Lightweight GPU-side update — no geometry re-upload
        map.setFeatureState(
          { source: 'flood-depth', id: 'flood-polygon-1' },
          { depth: floodDepthRef.current }
        );
      }
    };

    taskIdRef.current = FrameController.add(taskFn, 200);

    return () => {
      if (taskIdRef.current !== null) {
        FrameController.remove(taskIdRef.current);
        taskIdRef.current = null;
      }
    };
  }, [floodMode, year, floodDepthEnabled]);

  return { setRainfall: (val) => { rainfallRef.current = val; } };
}
