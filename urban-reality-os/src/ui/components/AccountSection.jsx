import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useShallow } from 'zustand/react/shallow';
import useMapStore from '../../store/useMapStore';
import { useToastStore } from './ToastContainer';

/**
 * Production Account Component
 * Features:
 * - User avatar and profile display
 * - Online/offline sync status
 * - Last sync time
 * - Logout functionality
 * - Login modal integration
 */
export function AccountSection({ onRequestLogin }) {
  const [showOptions, setShowOptions] = useState(false);

  // Store selectors - data with shallow comparison
  const { isAuthenticated, user, isLoading, isOnline, lastSyncTime } = useMapStore(
    useShallow((s) => ({
      isAuthenticated: s.isAuthenticated,
      user: s.user,
      isLoading: s.isLoading,
      isOnline: s.isOnline,
      lastSyncTime: s.lastSyncTime,
    }))
  );

  // Store methods - these are stable references
  const logout = useMapStore((s) => s.logout);
  const success = useToastStore((s) => s.success);
  const error = useToastStore((s) => s.error);

  // Calculate user initials
  const initials = useMemo(() => {
    if (!user?.name) return '?';
    return user.name
      .split(' ')
      .map((p) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }, [user]);

  // Format last sync time
  const syncTimeText = useMemo(() => {
    if (!lastSyncTime) return 'Never';
    const date = new Date(lastSyncTime);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }, [lastSyncTime]);

  // Handle logout
  const handleLogout = () => {
    logout();
    setShowOptions(false);
    success('Logged out successfully', 3000);
  };

  return (
    <>
      <section
        style={{
          marginBottom: 14,
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          paddingBottom: 12,
        }}
      >
        <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>
          ACCOUNT
        </div>

        {isAuthenticated && user ? (
          // Authenticated State
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginTop: 12,
              position: 'relative',
            }}
          >
            {/* Avatar */}
            <div
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <img
                src={user.avatar}
                alt={user.name}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: 'rgba(148,163,184,0.22)',
                  border: '2px solid rgba(37, 99, 235, 0.3)',
                  cursor: 'pointer',
                }}
                onClick={() => setShowOptions(!showOptions)}
              />
              {/* Online Status Indicator */}
              <div
                style={{
                  position: 'absolute',
                  bottom: -1,
                  right: -1,
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: isOnline ? '#22c55e' : '#ef4444',
                  border: '2px solid rgba(15, 23, 42, 0.95)',
                  boxShadow: isOnline
                    ? '0 0 8px rgba(34, 197, 94, 0.4)'
                    : '0 0 8px rgba(239, 68, 68, 0.4)',
                }}
              />
            </div>

            {/* User Info */}
            <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setShowOptions(!showOptions)}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#e2e8f0',
                  marginBottom: 2,
                }}
              >
                {user.name}
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>
                {user.email}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: isOnline ? '#22c55e' : '#ef4444',
                  marginTop: 4,
                }}
              >
                {isOnline ? '🟢 Online' : '🔴 Offline'} • Synced {syncTimeText}
              </div>
            </div>

            {/* Options Menu */}
            <AnimatePresence>
              {showOptions && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.94 }}
                  transition={{ duration: 0.15 }}
                  style={{
                    position: 'absolute',
                    top: 48,
                    right: 0,
                    background: 'rgba(15, 23, 42, 0.95)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 8,
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                    minWidth: 160,
                    zIndex: 100,
                  }}
                >
                  <button
                    onClick={handleLogout}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: 'transparent',
                      border: 'none',
                      color: '#ef4444',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      textAlign: 'left',
                      borderRadius: 6,
                      margin: 4,
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.background = 'rgba(239, 68, 68, 0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = 'transparent';
                    }}
                  >
                    Sign Out
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ) : (
          // Unauthenticated State
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ marginTop: 12 }}
          >
            <div style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 10 }}>
              Sign in to sync your data across devices
            </div>
            <button
              onClick={() => onRequestLogin?.()}
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '10px 12px',
                background: isLoading
                  ? 'rgba(37, 99, 235, 0.3)'
                  : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                border: 'none',
                borderRadius: 8,
                color: 'white',
                fontWeight: 600,
                fontSize: 13,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                opacity: isLoading ? 0.7 : 1,
              }}
            >
              {isLoading && <span style={{ fontSize: 12 }}>⟳</span>}
              {isLoading ? 'Signing In...' : 'Sign In'}
            </button>
          </motion.div>
        )}
      </section>

    </>
  );
}

/**
 * Wrapper hook to restore session on app load
 */
export function useAuthSessionRestore() {
  const restoreSession = useMapStore((s) => s.restoreSession);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);
}
