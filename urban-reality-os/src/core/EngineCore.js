import CacheEngine from './CacheEngine';
import eventBus from './EventBus';
import FrameController from './FrameController';
import logger, { createLogger } from './Logger';
import PerformanceManager from './PerformanceManager';

const coreLogger = createLogger('EngineCore');

export const EngineCore = {
  performance: PerformanceManager,
  cache: CacheEngine,
  events: eventBus,
  frame: FrameController,
  logger,
  lifecycle: {
    init() {
      try { CacheEngine.init?.(); } catch (_) {}
      try { eventBus.init?.(); } catch (_) {}
      try { FrameController.init?.(); } catch (_) {}
      try { PerformanceManager.init?.(); } catch (_) {}
      coreLogger.info('EngineCore initialized');
    },
    start() {
      try { CacheEngine.start?.(); } catch (_) {}
      try { eventBus.start?.(); } catch (_) {}
      try { FrameController.start?.(); } catch (_) {}
      try { PerformanceManager.start?.(); } catch (_) {}
    },
    stop() {
      try { CacheEngine.stop?.(); } catch (_) {}
      try { eventBus.stop?.(); } catch (_) {}
      try { FrameController.stop?.(); } catch (_) {}
      try { PerformanceManager.stop?.(); } catch (_) {}
    },
    destroy() {
      try { CacheEngine.destroy?.(); } catch (_) {}
      try { eventBus.destroy?.(); } catch (_) {}
      try { FrameController.destroy?.(); } catch (_) {}
      try { PerformanceManager.destroy?.(); } catch (_) {}
      coreLogger.warn('EngineCore destroyed');
    },
  },
};

if (typeof window !== 'undefined') {
  window.__URBAN_ENGINE__ = EngineCore;
}

export default EngineCore;
