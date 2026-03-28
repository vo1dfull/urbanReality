import { motion, AnimatePresence } from 'framer-motion';
import LocationPanel from './LocationPanel';
import TerrainPanel from './TerrainPanel';

const PANEL_WIDTH = 340;

const panelVariants = {
  hidden: { x: PANEL_WIDTH + 20, opacity: 0 },
  visible: { x: 0, opacity: 1, transition: { type: 'spring', stiffness: 260, damping: 28 } },
  exit: { x: PANEL_WIDTH + 20, opacity: 0, transition: { duration: 0.22, ease: 'easeIn' } },
};

export default function ContextEngine({
  uiMode,          // 'location' | 'terrain' | null
  locationData,    // all props for LocationPanel
  onCloseLocation,
  // Terrain props
  activeModules,
  toggleModule,
  simulationParams,
  updateParam,
  onCloseTerrain,
}) {
  const isOpen = uiMode === 'location' || uiMode === 'terrain';

  return (
    <div
      className="fixed right-4 top-1/2 -translate-y-1/2 z-50 pointer-events-none"
      style={{ height: 'calc(100vh - 120px)', display: 'flex', alignItems: 'center' }}
    >
      <AnimatePresence mode="wait">
        {isOpen && (
          <motion.div
            key={uiMode}
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="pointer-events-auto rounded-2xl bg-slate-950/85 backdrop-blur-xl border border-white/10 shadow-2xl p-5 flex flex-col"
            style={{
              width: PANEL_WIDTH,
              maxHeight: 'calc(100vh - 140px)',
              boxShadow: '0 0 0 1px rgba(255,255,255,0.05), 0 24px 80px -8px rgba(0,0,0,0.7)',
            }}
          >
            {uiMode === 'location' && locationData && (
              <LocationPanel data={locationData} onClose={onCloseLocation} />
            )}
            {uiMode === 'terrain' && (
              <TerrainPanel
                activeModules={activeModules}
                toggleModule={toggleModule}
                simulationParams={simulationParams}
                updateParam={updateParam}
                onClose={onCloseTerrain}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
