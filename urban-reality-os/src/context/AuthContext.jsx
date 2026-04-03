import { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [user, setUser] = useState(null);
  const API = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

  const refreshAccessToken = async () => {
    try {
      const res = await fetch(`${API}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        logout();
        return null;
      }
      const data = await res.json();
      if (data.accessToken) {
        localStorage.setItem('token', data.accessToken);
        setToken(data.accessToken);
        return data.accessToken;
      }
      return null;
    } catch (err) {
      logout();
      return null;
    }
  };

  useEffect(() => {
    const initialize = async () => {
      if (!token) {
        await refreshAccessToken();
      }
    };
    initialize();
  }, []);

  useEffect(() => {
    if (!token) {
      setUser(null);
      return;
    }

    const fetchProfile = async () => {
      try {
        const res = await fetch(`${API}/api/auth/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          await refreshAccessToken();
          return;
        }
        const data = await res.json();
        setUser(data);
      } catch (err) {
        console.error('Profile fetch error', err);
        setUser(null);
      }
    };

    fetchProfile();
  }, [token]);

  const login = async (email, password) => {
    try {
      const res = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Invalid email or password');
      }

      localStorage.setItem('token', data.accessToken);
      setToken(data.accessToken);

      // Fetch and set profile
      try {
        const profileRes = await fetch(`${API}/api/auth/profile`, {
          headers: { Authorization: `Bearer ${data.accessToken}` },
        });
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          setUser(profileData);
        }
      } catch (profileErr) {
        console.error('Failed to fetch profile after login', profileErr);
      }

      return data;
    } catch (error) {
      throw error;
    }
  };

  const logout = async () => {
    try {
      await fetch(`${API}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (err) {
      console.error('Logout error', err);
    }

    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ token, user, setUser, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};
