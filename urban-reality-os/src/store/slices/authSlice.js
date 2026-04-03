/**
 * Mock API service with async delays
 * In production, replace with real API calls
 */
const mockAuthAPI = {
  login: async (email, password) => {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1200));
    
    if (!email || !password) {
      throw new Error('Email and password required');
    }
    
    if (!email.includes('@')) {
      throw new Error('Invalid email format');
    }
    
    // Mock successful login
    return {
      user: {
        id: Math.random().toString(36).substr(2, 9),
        email,
        name: email.split('@')[0],
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`,
        createdAt: new Date().toISOString(),
      },
      token: 'mock-jwt-token-' + Math.random().toString(36).substr(2),
    };
  },

  signup: async (email, password, name) => {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    if (!email || !password || !name) {
      throw new Error('All fields required');
    }
    
    if (!email.includes('@')) {
      throw new Error('Invalid email format');
    }
    
    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }
    
    // Mock successful signup
    return {
      user: {
        id: Math.random().toString(36).substr(2, 9),
        email,
        name,
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`,
        createdAt: new Date().toISOString(),
      },
      token: 'mock-jwt-token-' + Math.random().toString(36).substr(2),
    };
  },

  googleLogin: async (googleToken) => {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    if (!googleToken) {
      throw new Error('Google token required');
    }
    
    // Mock successful Google login
    const email = `user-${Math.random().toString(36).substr(2, 5)}@gmail.com`;
    return {
      user: {
        id: Math.random().toString(36).substr(2, 9),
        email,
        name: 'Google User',
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`,
        createdAt: new Date().toISOString(),
      },
      token: 'mock-jwt-token-' + Math.random().toString(36).substr(2),
    };
  },

  refreshToken: async (token) => {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 300));
    
    if (!token) {
      throw new Error('Token required');
    }
    
    // Mock successful token refresh
    return {
      token: 'mock-jwt-token-' + Math.random().toString(36).substr(2),
    };
  },
};

/**
 * Auth slice for Zustand store
 * Persists to localStorage
 */
export const createAuthSlice = (set, get) => ({
  // ── State ──
  isAuthenticated: false,
  user: null,
  token: null,
  isLoading: false,
  error: null,
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  lastSyncTime: null,

  // ── Actions ── Login with email/password
  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();
      if (!response.ok) {
        const message = data.msg || data.error || 'Invalid email or password';
        throw new Error(message);
      }

      const accessToken = data.accessToken || data.token;
      const user = data.user || { email };

      localStorage.setItem('auth-token', accessToken);
      localStorage.setItem('auth-user', JSON.stringify(user));

      set({
        isAuthenticated: true,
        user,
        token: accessToken,
        isLoading: false,
        lastSyncTime: new Date().toISOString(),
      });

      return data.user;
    } catch (error) {
      const message = error.message || 'Login failed';
      set({
        isLoading: false,
        error: message,
        isAuthenticated: false,
      });
      throw error;
    }
  },

  // Sign up with email/password
  signup: async (email, password, name) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await response.json();
      if (!response.ok) {
        const message = data.msg || data.error || 'Signup failed';
        throw new Error(message);
      }

      localStorage.setItem('auth-token', data.token);
      localStorage.setItem('auth-user', JSON.stringify(data.user));

      set({
        isAuthenticated: true,
        user: data.user,
        token: data.token,
        isLoading: false,
        lastSyncTime: new Date().toISOString(),
      });

      return data.user;
    } catch (error) {
      const message = error.message || 'Signup failed';
      set({
        isLoading: false,
        error: message,
        isAuthenticated: false,
      });
      throw error;
    }
  },

  // Google OAuth login
  loginWithGoogle: async (googleToken) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: googleToken }),
      });

      const data = await response.json();
      if (!response.ok) {
        const message = data.msg || data.error || 'Google login failed';
        throw new Error(message);
      }

      localStorage.setItem('auth-token', data.token);
      localStorage.setItem('auth-user', JSON.stringify(data.user));

      set({
        isAuthenticated: true,
        user: data.user,
        token: data.token,
        isLoading: false,
        lastSyncTime: new Date().toISOString(),
      });

      return data.user;
    } catch (error) {
      const message = error.message || 'Google login failed';
      set({
        isLoading: false,
        error: message,
        isAuthenticated: false,
      });
      throw error;
    }
  },

  // Logout
  logout: () => {
    localStorage.removeItem('auth-token');
    localStorage.removeItem('auth-user');
    set({
      isAuthenticated: false,
      user: null,
      token: null,
      error: null,
      lastSyncTime: null,
    });
  },

  // Restore session from localStorage
  restoreSession: () => {
    try {
      const token = localStorage.getItem('auth-token');
      const userJson = localStorage.getItem('auth-user');
      
      if (token && userJson) {
        const user = JSON.parse(userJson);
        set({
          token,
          user,
          isAuthenticated: true,
          lastSyncTime: new Date().toISOString(),
        });
      }
    } catch (error) {
      // Clear corrupted session
      localStorage.removeItem('auth-token');
      localStorage.removeItem('auth-user');
    }
  },

  // Update user avatar
  updateAvatar: (avatarUrl) => {
    const state = get();
    if (state.user) {
      const updatedUser = { ...state.user, avatar: avatarUrl };
      localStorage.setItem('auth-user', JSON.stringify(updatedUser));
      set({ user: updatedUser });
    }
  },

  // Update user profile
  updateProfile: async (updates) => {
    set({ isLoading: true, error: null });
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 800));
      
      const state = get();
      if (state.user) {
        const updatedUser = { ...state.user, ...updates };
        localStorage.setItem('auth-user', JSON.stringify(updatedUser));
        set({
          user: updatedUser,
          isLoading: false,
          lastSyncTime: new Date().toISOString(),
        });
        return updatedUser;
      }
    } catch (error) {
      set({
        isLoading: false,
        error: error.message || 'Profile update failed',
      });
      throw error;
    }
  },

  // Set online/offline status
  setOnlineStatus: (isOnline) => {
    set({ isOnline });
  },

  // Clear error
  clearError: () => {
    set({ error: null });
  },
});
