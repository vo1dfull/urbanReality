import { useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { useAuth } from "../context/AuthContext";

export default function AuthModal({ onClose }) {
  const { login, setUser } = useAuth();
  const API = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";
  const [isLogin, setIsLogin] = useState(true);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [isLoading, setIsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({ email: '', password: '' });
  const [errorMessage, setErrorMessage] = useState('');

  const validateForm = () => {
    const errors = { email: '', password: '' };
    if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errors.email = 'Invalid email';
    }
    if (!form.password || form.password.trim() === '') {
      errors.password = 'Password required';
    }
    setFieldErrors(errors);
    return !errors.email && !errors.password;
  };

  const submit = async () => {
    if (!validateForm()) return;

    setIsLoading(true);
    setErrorMessage('');

    try {
      if (isLogin) {
        await login(form.email, form.password);
      } else {
        const res = await fetch(`${API}/api/auth/register`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: form.name, email: form.email, password: form.password }),
        });

        const data = await res.json();
        if (!res.ok) {
          const msg = data.message || 'Signup failed';
          setErrorMessage(msg);
          return;
        }

        await login(form.email, form.password);
      }

      if (onClose) onClose();
      window.location.href = '/dashboard';
    } catch (err) {
      const message = err.message || 'Network error. Please try again.';
      setErrorMessage(message);
      if (message.toLowerCase().includes('invalid')) {
        setFieldErrors({ email: 'Invalid email or password', password: 'Invalid email or password' });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      const res = await fetch(`${API}/api/auth/google`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token: credentialResponse.credential }),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error("Google auth failed:", data);
        alert(data.message || data.msg || "Google login failed");
        return;
      }

      // Save token via login and set user
      if (data.token) {
        login(data.token);
        if (onClose) onClose();
      }
      if (data.user) setUser(data.user);
    } catch (err) {
      console.error("Google auth error:", err);
    }
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              background: "transparent",
              border: "none",
              fontSize: 20,
              cursor: "pointer",
              color: "#666"
            }}
          >
            ×
          </button>
        )}
        <h2 style={{ marginTop: 0 }}>{isLogin ? "Login" : "Create Account"}</h2>

        {!isLogin && (
          <input
            placeholder="Name"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            style={{ padding: "10px", borderRadius: "6px", border: "1px solid #ddd", fontSize: "14px" }}
          />
        )}

        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            placeholder="Email"
            type="email"
            value={form.email}
            onChange={e => setForm({ ...form, email: e.target.value })}
            style={{ padding: "10px", borderRadius: "6px", border: fieldErrors.email ? "1px solid #ef4444" : "1px solid #ddd", fontSize: "14px" }}
          />
          {fieldErrors.email && <span style={{ color: '#ef4444', fontSize: 12 }}>{fieldErrors.email}</span>}

          <input
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })}
            style={{ padding: "10px", borderRadius: "6px", border: fieldErrors.password ? "1px solid #ef4444" : "1px solid #ddd", fontSize: "14px" }}
          />
          {fieldErrors.password && <span style={{ color: '#ef4444', fontSize: 12 }}>{fieldErrors.password}</span>}
        </div>

        {errorMessage && <div style={{ color: '#ef4444', fontSize: 12, textAlign: 'center', marginTop: 8 }}>{errorMessage}</div>}

        <button 
          onClick={submit}
          disabled={isLoading}
          style={{
            padding: "10px",
            borderRadius: "6px",
            border: "none",
            background: isLoading ? "#93c5fd" : "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
            color: "#fff",
            fontSize: "14px",
            fontWeight: 500,
            cursor: isLoading ? "not-allowed" : "pointer",
            transform: isLoading ? 'none' : 'scale(1)',
            transition: 'transform 200ms ease, background 200ms ease',
          }}
          onMouseEnter={e => { if (!isLoading) e.currentTarget.style.transform = 'scale(1.02)'; }}
          onMouseLeave={e => { if (!isLoading) e.currentTarget.style.transform = 'scale(1)'; }}
        >
          {isLogin ? "Login" : "Sign up"}
        </button>

        {import.meta.env.VITE_GOOGLE_CLIENT_ID && (
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={() => console.log("Google Login Failed")}
          />
        )}

        <p
          style={{ cursor: "pointer", marginTop: 10 }}
          onClick={() => setIsLogin(!isLogin)}
        >
          {isLogin ? "Create account" : "Already have an account?"}
        </p>
      </div>
    </div>
  );
}

const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 9999
};

const card = {
  background: "#fff",
  padding: 24,
  borderRadius: 10,
  width: 320,
  display: "flex",
  flexDirection: "column",
  gap: 10
};
