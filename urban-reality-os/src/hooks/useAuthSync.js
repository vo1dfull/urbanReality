import { useEffect } from 'react';
import useMapStore from '../store/useMapStore';

/**
 * Hook to track browser online/offline status
 * Updates the auth store with current sync state
 */
export function useOnlineStatus() {
  const setOnlineStatus = useMapStore((s) => s.setOnlineStatus);

  useEffect(() => {
    // Handle online event
    const handleOnline = () => {
      setOnlineStatus(true);
    };

    // Handle offline event
    const handleOffline = () => {
      setOnlineStatus(false);
    };

    // Set initial status
    setOnlineStatus(navigator.onLine);

    // Add event listeners
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Cleanup
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setOnlineStatus]);
}

/**
 * Hook to restore auth session on app load
 * Loads user data from localStorage
 */
export function useAuthSessionRestore() {
  const restoreSession = useMapStore((s) => s.restoreSession);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);
}
