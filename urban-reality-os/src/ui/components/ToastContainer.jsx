import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

/**
 * Toast notification store
 * Manages global toast notifications with auto-dismiss
 */
export const useToastStore = create(
  subscribeWithSelector((set) => ({
    toasts: [], // Array of { id, message, type, duration }

    /**
     * Add toast notification
     * @param message - Toast message
     * @param type - 'success' | 'error' | 'info' | 'warning'
     * @param duration - Auto-dismiss duration in ms (0 = no auto-dismiss)
     */
    addToast: (message, type = 'info', duration = 4000) => {
      const id = Date.now() + Math.random();
      
      set((state) => ({
        toasts: [...state.toasts, { id, message, type, duration }],
      }));

      // Auto-dismiss if duration is set
      if (duration > 0) {
        setTimeout(() => {
          set((state) => ({
            toasts: state.toasts.filter((t) => t.id !== id),
          }));
        }, duration);
      }

      return id;
    },

    /**
     * Remove specific toast
     */
    removeToast: (id) => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    },

    /**
     * Clear all toasts
     */
    clearToasts: () => {
      set({ toasts: [] });
    },

    /**
     * Convenience methods
     */
    success: (message, duration) =>
      set((state) => {
        const id = Date.now() + Math.random();
        if (duration !== 0) {
          setTimeout(
            () =>
              set((s) => ({
                toasts: s.toasts.filter((t) => t.id !== id),
              })),
            duration || 4000
          );
        }
        return {
          toasts: [...state.toasts, { id, message, type: 'success', duration }],
        };
      }),

    error: (message, duration) =>
      set((state) => {
        const id = Date.now() + Math.random();
        if (duration !== 0) {
          setTimeout(
            () =>
              set((s) => ({
                toasts: s.toasts.filter((t) => t.id !== id),
              })),
            duration || 5000
          );
        }
        return {
          toasts: [...state.toasts, { id, message, type: 'error', duration }],
        };
      }),

    info: (message, duration) =>
      set((state) => {
        const id = Date.now() + Math.random();
        if (duration !== 0) {
          setTimeout(
            () =>
              set((s) => ({
                toasts: s.toasts.filter((t) => t.id !== id),
              })),
            duration || 4000
          );
        }
        return {
          toasts: [...state.toasts, { id, message, type: 'info', duration }],
        };
      }),

    warning: (message, duration) =>
      set((state) => {
        const id = Date.now() + Math.random();
        if (duration !== 0) {
          setTimeout(
            () =>
              set((s) => ({
                toasts: s.toasts.filter((t) => t.id !== id),
              })),
            duration || 4000
          );
        }
        return {
          toasts: [...state.toasts, { id, message, type: 'warning', duration }],
        };
      }),
  }))
);

/**
 * Toast container component — renders all active toasts
 */
export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 50000,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        pointerEvents: 'auto',
      }}
    >
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          {...toast}
          onDismiss={() => removeToast(toast.id)}
        />
      ))}
    </div>
  );
}

/**
 * Individual toast component with animations
 */
function Toast({ id, message, type, onDismiss }) {
  const bgColor = {
    success: 'rgba(34, 197, 94, 0.95)',
    error: 'rgba(239, 68, 68, 0.95)',
    info: 'rgba(59, 130, 246, 0.95)',
    warning: 'rgba(248, 113, 113, 0.95)',
  }[type] || 'rgba(59, 130, 246, 0.95)';

  const borderColor = {
    success: 'rgba(34, 197, 94, 0.5)',
    error: 'rgba(239, 68, 68, 0.5)',
    info: 'rgba(59, 130, 246, 0.5)',
    warning: 'rgba(248, 113, 113, 0.5)',
  }[type] || 'rgba(59, 130, 246, 0.5)';

  const icon = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
    warning: '⚠',
  }[type] || 'ℹ';

  return (
    <div
      key={id}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        background: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        backdropFilter: 'blur(10px)',
        color: 'white',
        fontSize: 14,
        fontWeight: 500,
        boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
        animation: 'slideInRight 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
        minWidth: 280,
      }}
    >
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span style={{ flex: 1 }}>{message}</span>
      <button
        onClick={onDismiss}
        style={{
          background: 'rgba(255,255,255,0.2)',
          border: 'none',
          color: 'white',
          borderRadius: 4,
          width: 24,
          height: 24,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 14,
        }}
      >
        ×
      </button>
    </div>
  );
}

// Add animation keyframes
if (typeof window !== 'undefined' && !document.querySelector('style#toast-animations')) {
  const style = document.createElement('style');
  style.id = 'toast-animations';
  style.textContent = `
    @keyframes slideInRight {
      from {
        opacity: 0;
        transform: translateX(100px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }
  `;
  document.head.appendChild(style);
}
