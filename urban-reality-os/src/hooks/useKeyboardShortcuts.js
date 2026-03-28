// ================================================
// useKeyboardShortcuts — Keyboard shortcut handler
// ================================================
import { useEffect } from 'react';
import useMapStore from '../store/useMapStore';

export default function useKeyboardShortcuts() {
  const setFacilityCheckOpen = useMapStore((s) => s.setFacilityCheckOpen);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      switch (e.key) {
        case 'f':
        case 'F':
          setFacilityCheckOpen((prev) => !prev);
          break;
        // Add more shortcuts here as needed
        default:
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [setFacilityCheckOpen]);
}
