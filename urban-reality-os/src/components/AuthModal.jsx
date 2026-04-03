import { useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { useAuth } from "../context/AuthContext";

export default function AuthModal({ onClose }) {
  const { login, verifyOTP, signup } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [isOtpStage, setIsOtpStage] = useState(false);
  const [otpCode, setOtpCode] = useState('');
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
        if (onClose) onClose();
        window.location.href = '/dashboard';
      } else if (isOtpStage) {
        await verifyOTP(form.email, otpCode);
        await login(form.email, form.password);
        if (onClose) onClose();
        window.location.href = '/dashboard';
      } else {
        await signup(form.name, form.email, form.password);
        setIsOtpStage(true);
      }
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

  const sendPasswordReset = async () => {
    if (!form.email) {
      setFieldErrors({ ...fieldErrors, email: 'Email is required' });
      return;
    }
    setIsLoading(true);
    try {
      const data = await requestPasswordReset(form.email);
      setErrorMessage(data.message || 'Reset instructions sent');
      setOtpCode('');
    } catch (err) {
      setErrorMessage(err.message || 'Reset request failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'}/api/auth/google`, {
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

      // Set token and user directly
      localStorage.setItem('token', data.token);
      if (onClose) onClose();
      window.location.href = '/dashboard';
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
        <h2 style={{ marginTop: 0 }}>
          {isOtpStage ? "Verify Email" : isLogin ? "Login" : "Create Account"}
        </h2>

        <>
          {!isLogin && !isOtpStage && (
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

            {!isOtpStage && (
              <>
                <input
                  type="password"
                  placeholder="Password"
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  style={{ padding: "10px", borderRadius: "6px", border: fieldErrors.password ? "1px solid #ef4444" : "1px solid #ddd", fontSize: "14px" }}
                />
                {fieldErrors.password && <span style={{ color: '#ef4444', fontSize: 12 }}>{fieldErrors.password}</span>}
              </>
            )}

            {isOtpStage && (
              <input
                placeholder="Verification OTP"
                value={otpCode}
                onChange={e => setOtpCode(e.target.value)}
                style={{ padding: "10px", borderRadius: "6px", border: "1px solid #ddd", fontSize: "14px" }}
              />
            )}
          </div>
        </>

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
          {isOtpStage ? 'Verify OTP' : isLogin ? 'Login' : 'Sign up'}
        </button>

        {import.meta.env.VITE_GOOGLE_CLIENT_ID && ( 
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={() => console.log("Google Login Failed")}
          />
        )}

        <p
          style={{ cursor: "pointer", marginTop: 10 }}
          onClick={() => {
            setIsOtpStage(false);
            setIsLogin(!isLogin);
            setErrorMessage('');
          }}
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
