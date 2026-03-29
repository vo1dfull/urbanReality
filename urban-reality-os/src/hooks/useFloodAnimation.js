// ================================================
// useFloodAnimation — Flood depth animation loop
// 🔥 PERF: 400ms interval (was 200ms) — 50% fewer map updates
// 🔥 PERF: Deferred EventBus emit (non-blocking)
// 🔥 PERF: Skips frames when FrameController reports low FPS
// 🔥 PERF: Pre-allocated feature state object (no GC)
// ================================================
import { useEffect, useRef } from 'react';
import useMapStore from '../store/useMapStore';
import MapEngine from '../engines/MapEngine';
import LayerEngine from '../engines/LayerEngine';
import FrameController from '../core/FrameController';
import eventBus, { EVENTS } from '../core/EventBus';
import {
  BASE_YEAR,
  MAX_YEAR,
  FLOOD_ANIMATION_CONFIG,
} from '../constants/mapConstants';

// Pre-allocated objects (avoid GC in animation loop)
const _featureStateTarget = { source: 'flood-depth', id: 'flood-polygon-1' };
const _featureStateValue = { depth: 0 };

export default function useFloodAnimation() {
  const floodMode = useMapStore((s) => s.floodMode);
  const year = useMapStore((s) => s.year);
  const floodDepthEnabled = useMapStore((s) => s.layers.floodDepth);

  const taskIdRef = useRef(null);
  const floodDepthRef = useRef(0);
  const rainfallRef = useRef(0);
  const geometryInitRef = useRef(false);
  const wasActiveRef = useRef(false);

  useEffect(() => {
    const map = MapEngine.getMap();
    if (!map) return;

    const floodPlugin = LayerEngine.getPlugin('flood');
    if (!floodPlugin) return;

    if (taskIdRef.current !== null) {
      FrameController.remove(taskIdRef.current);
      taskIdRef.current = null;
    }

    if (!floodMode || !floodDepthEnabled) {
      floodDepthRef.current = FLOOD_ANIMATION_CONFIG.resetDepth;
      try { map.removeFeatureState({ source: 'flood-depth' }); } catch (_) {}
      if (wasActiveRef.current) {
        eventBus.emit(EVENTS.FLOOD_STOPPED, { year, depth: 0 });
        wasActiveRef.current = false;
      }
      return;
    }

    if (!geometryInitRef.current) {
      floodPlugin.initDepthGeometry(map);
      geometryInitRef.current = true;
    }

    const yearsElapsed = year - BASE_YEAR;
    const timeFactor = yearsElapsed / (MAX_YEAR - BASE_YEAR);
    const rainAmplifier = Math.min(rainfallRef.current / 15, 1);
    const maxDepth =
      3 * (timeFactor + FLOOD_ANIMATION_CONFIG.baseDepthMultiplier + rainAmplifier * 0.6);

    if (floodDepthRef.current >= maxDepth) {
      floodDepthRef.current = FLOOD_ANIMATION_CONFIG.resetDepth;
    }

    if (!wasActiveRef.current) {
      eventBus.emit(EVENTS.FLOOD_STARTED, { year, maxDepth });
      wasActiveRef.current = true;
    }

    // 🔥 PERF: 400ms interval = ~2.5fps (was 200ms = ~5fps)
    // setFeatureState is expensive — halving frequency saves significant CPU
    const taskFn = () => {
      const currentMap = MapEngine.getMap();
      if (!currentMap) return;

      // 🔥 Skip if FPS is critically low
      if (FrameController.getFPS() < 20) return;

      if (floodDepthRef.current >= maxDepth) {
        if (taskIdRef.current !== null) {
          FrameController.remove(taskIdRef.current);
          taskIdRef.current = null;
        }
        return;
      }

      const prevDepth = floodDepthRef.current;
      // 🔥 Larger increment (was depthIncrement) to compensate for lower frequency
      const nextDepth = Math.min(
        prevDepth + FLOOD_ANIMATION_CONFIG.depthIncrement * 2,
        maxDepth
      );

      if (nextDepth - prevDepth > 0.08) {
        floodDepthRef.current = nextDepth;
        // Reuse pre-allocated objects
        _featureStateValue.depth = nextDepth;
        try {
          currentMap.setFeatureState(_featureStateTarget, _featureStateValue);
        } catch (_) {}
        // 🔥 Deferred emit — doesn't block this frame
        eventBus.emitDeferred(EVENTS.FLOOD_TICK, nextDepth);
      }
    };

    // Register as normal priority (not critical — visual-only)
    taskIdRef.current = FrameController.add(taskFn, 400, 'flood-animation', 'normal');

    return () => {
      if (taskIdRef.current !== null) {
        FrameController.remove(taskIdRef.current);
        taskIdRef.current = null;
      }
    };
  }, [floodMode, year, floodDepthEnabled]);

  return { setRainfall: (val) => { rainfallRef.current = val; } };
}
