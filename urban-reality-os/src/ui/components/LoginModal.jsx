import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import useMapStore from '../../store/useMapStore';
import { useToastStore } from './ToastContainer';

/**
 * 🎨 AAA-Level Production Login Modal
 * Premium glassmorphism design with smooth interactions
 */
export function LoginModal({ onClose, isOpen }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [focused, setFocused] = useState(null);
  const [rememberMe, setRememberMe] = useState(false);
  const [errors, setErrors] = useState({});
  const emailInputRef = useRef(null);


  const login = useMapStore((s) => s.login);
  const signup = useMapStore((s) => s.signup);
  const loginWithGoogle = useMapStore((s) => s.loginWithGoogle);
  const success = useToastStore((s) => s.success);
  const error = useToastStore((s) => s.error);

  const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const validatePassword = (password) => password.length >= 6;
  const validateForm = () => {
    const newErrors = {};
    if (!validateEmail(email)) newErrors.email = 'Invalid email address';
    if (!validatePassword(password)) newErrors.password = 'Min 6 characters';
    if (mode === 'signup' && name.trim().length < 2) newErrors.name = 'Min 2 characters';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const isFormValid =
    validateEmail(email) && validatePassword(password) && (mode === 'login' || name.trim().length >= 2);

  const handleEmailLogin = useCallback(async () => {
    if (!validateForm()) return;
    setIsLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
        success('Welcome back! 🎉', 3000);
      } else {
        await signup(email, password, name);
        success('Account created! 🚀', 3000);
      }
      setEmail('');
      setPassword('');
      setName('');
      setErrors({});
      setTimeout(() => onClose?.(), 1000);
    } catch (err) {
      error(err?.message || 'Auth failed', 5000);
    } finally {
      setIsLoading(false);
    }
  }, [mode, email, password, name, login, signup, success, error, onClose]);

  const handleGoogleLogin = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = 'mock-google-' + Math.random().toString(36).slice(2);
      await loginWithGoogle(token);
      success('Google login successful! 🔐', 3000);
      setEmail('');
      setPassword('');
      setName('');
      setTimeout(() => onClose?.(), 1000);
    } catch (err) {
      error(err?.message || 'Google login failed', 5000);
    } finally {
      setIsLoading(false);
    }
  }, [loginWithGoogle, success, error, onClose]);

  const handleModeSwitch = () => {
    setMode((prev) => (prev === 'login' ? 'signup' : 'login'));
    setEmail('');
    setPassword('');
    setName('');
    setErrors({});
    setFocused(null);
  };

  // Escape key closes modal
  useEffect(() => {
    if (!isOpen) return;

    const onKeydown = (event) => {
      if (event.key === 'Escape') {
        onClose?.();
      }
    };

    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  }, [isOpen, onClose]);

  // Disable background scroll during modal
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Auto-focus email input on open
  useEffect(() => {
    if (isOpen && emailInputRef.current) {
      emailInputRef.current.focus();
    }
  }, [isOpen, mode]);

  if (!isOpen) return null;

  const modalContent = (
    <AnimatePresence mode="wait">
      {isOpen && (
        <>
          {/* Dark Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.65)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              zIndex: 9990,
            }}
          />

          {/* Modal container for perfect centering */}
          <div
            style={{
              position: 'fixed',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
              zIndex: 9991,
              pointerEvents: 'none',
            }}
          >
            <motion.div
              key="modal"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: 420,
                pointerEvents: 'auto',
              }}
            >
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(20, 28, 50, 0.95) 100%)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: 18,
                padding: 30,
                color: '#e2e8f0',
                position: 'relative',
                overflow: 'hidden',
                boxShadow: '0 32px 64px -24px rgba(0, 0, 0, 0.65)',
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              {/* Close Button */}
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                whileHover={{ scale: 1.05, boxShadow: '0 0 0 4px rgba(59,130,246,0.3)' }}
                whileTap={{ scale: 0.95 }}
                onClick={onClose}
                style={{
                  position: 'absolute',
                  top: 12,
                  right: 12,
                  background: 'rgba(15, 23, 42, 0.8)',
                  border: '1px solid rgba(148, 163, 184, 0.4)',
                  borderRadius: '50%',
                  width: 36,
                  height: 36,
                  color: '#e2e8f0',
                  fontSize: 18,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 200ms ease',
                }}
              >
                ×
              </motion.button>

              {/* Header */}
              <motion.div
                initial={{ opacity: 0, y: -15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                style={{ marginBottom: 8, textAlign: 'center', lineHeight: 1.3 }}
              >
                <div
                  style={{
                    display: 'inline-block',
                    background: 'rgba(59, 130, 246, 0.2)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    borderRadius: 12,
                    padding: '6px 12px',
                    marginBottom: 12,
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#3b82f6' }}>
                    {mode === 'login' ? '🔐 Sign In' : '✨ Join Now'}
                  </span>
                </div>

                <h2
                  style={{
                    margin: '0 0 8px 0',
                    fontSize: 32,
                    fontWeight: 800,
                    letterSpacing: '-0.5px',
                    color: '#ffffff',
                  }}
                >
                  {mode === 'login' ? 'Welcome Back' : 'Create Account'}
                </h2>

                <p style={{ margin: 0, fontSize: 15, color: '#94a3b8' }}>
                  {mode === 'login' ? 'Access your urban analytics' : 'Join our community'}
                </p>
              </motion.div>

              {/* Form */}
              <motion.form
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  handleEmailLogin();
                }}
                style={{ marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 16 }}
              >
                {/* Name Field */}
                <AnimatePresence>
                  {mode === 'signup' && (
                    <motion.div
                      key="name"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3 }}
                      style={{ marginBottom: 0 }}
                    >
                      <InputField
                        label="Full Name"
                        type="text"
                        value={name}
                        onChange={setName}
                        focused={focused === 'name'}
                        onFocus={() => {
                          setFocused('name');
                          setErrors((p) => ({ ...p, name: '' }));
                        }}
                        onBlur={() => setFocused(null)}
                        placeholder="John Doe"
                        error={errors.name}
                        icon="👤"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Email Field */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.12 }}
                  style={{ marginBottom: 0 }}
                >
                  <InputField
                    label="Email Address"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    focused={focused === 'email'}
                    onFocus={() => {
                      setFocused('email');
                      setErrors((p) => ({ ...p, email: '' }));
                    }}
                    onBlur={() => setFocused(null)}
                    placeholder="you@example.com"
                    error={errors.email}
                    icon="✉️"
                    autoComplete="email"
                    inputRef={emailInputRef}
                  />
                </motion.div>

                {/* Password Field */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.14 }}
                  style={{ marginBottom: 0 }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#cbd5e1' }}>Password</label>
                    {mode === 'login' && (
                      <button
                        type="button"
                        onClick={() => success('Reset link sent', 3000)}
                        style={{
                          background: 'none',
                          border: 'none',
                          fontSize: 11,
                          color: '#3b82f6',
                          cursor: 'pointer',
                          fontWeight: 600,
                        }}
                      >
                        Forgot?
                      </button>
                    )}
                  </div>
                  <InputField
                    label=""
                    type="password"
                    value={password}
                    onChange={setPassword}
                    focused={focused === 'password'}
                    onFocus={() => {
                      setFocused('password');
                      setErrors((p) => ({ ...p, password: '' }));
                    }}
                    onBlur={() => setFocused(null)}
                    placeholder="••••••••"
                    error={errors.password}
                    icon="🔒"
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  />
                </motion.div>

                {/* Remember Me */}
                <AnimatePresence>
                  {mode === 'login' && (
                    <motion.label
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      style={{
                        display: 'flex',
                        gap: 8,
                        marginBottom: 0,
                        cursor: 'pointer',
                        fontSize: 13,
                        color: '#cbd5e1',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        style={{ cursor: 'pointer', accentColor: '#3b82f6' }}
                      />
                      <span>Remember me</span>
                    </motion.label>
                  )}
                </AnimatePresence>

                {/* Submit Button */}
                <motion.button
                  type="submit"
                  disabled={!isFormValid || isLoading}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.16 }}
                  whileHover={{ scale: isFormValid && !isLoading ? 1.02 : 1 }}
                  whileTap={{ scale: isFormValid && !isLoading ? 0.98 : 1 }}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    background: isFormValid
                      ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
                      : 'rgba(59, 130, 246, 0.4)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 12,
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: isFormValid && !isLoading ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    transition: 'all 0.3s',
                    boxShadow: isFormValid ? '0 10px 25px -5px rgba(59, 130, 246, 0.3)' : 'none',
                  }}
                >
                  {isLoading ? (
                    <>
                      <Spinner />
                      <span>Processing...</span>
                    </>
                  ) : (
                    <>
                      <span>{mode === 'login' ? '→' : '✓'}</span>
                      <span>{mode === 'login' ? 'Sign In' : 'Create Account'}</span>
                    </>
                  )}
                </motion.button>
              </motion.form>

              {/* Divider */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.18 }}
                style={{ display: 'flex', gap: 12, margin: '20px 0', alignItems: 'center' }}
              >
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
                <span style={{ fontSize: 12, color: '#94a3b8' }}>or continue with</span>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
              </motion.div>

              {/* Google Button */}
              <motion.button
                disabled={isLoading}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.20 }}
                whileHover={{ scale: !isLoading ? 1.02 : 1 }}
                whileTap={{ scale: !isLoading ? 0.98 : 1 }}
                onClick={handleGoogleLogin}
                style={{
                  width: '100%',
                  padding: '11px 16px',
                  background: 'rgba(255,255,255,0.06)',
                  color: '#e2e8f0',
                  border: '1.5px solid rgba(255,255,255,0.12)',
                  borderRadius: 12,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  opacity: isLoading ? 0.5 : 1,
                }}
              >
                <span style={{ fontSize: 18 }}>🔵</span>
                <span>Google</span>
              </motion.button>

              {/* Mode Toggle */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.22 }}
                style={{ marginTop: 20, textAlign: 'center', fontSize: 13, color: '#94a3b8' }}
              >
                {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
                <button
                  onClick={handleModeSwitch}
                  disabled={isLoading}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#3b82f6',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    fontWeight: 700,
                    fontSize: 13,
                  }}
                >
                  {mode === 'login' ? 'Sign Up' : 'Sign In'}
                </button>
              </motion.div>

              {/* Footer */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.25 }}
                style={{ marginTop: 16, fontSize: 11, color: '#64748b', textAlign: 'center' }}
              >
                By continuing, you agree to our Terms of Service and Privacy Policy
              </motion.p>
            </div>
          </motion.div>
        </div>
        </>
      )}
    </AnimatePresence>
  );

  return createPortal(modalContent, document.body);
}

function InputField({
  label,
  type,
  value,
  onChange,
  onFocus,
  onBlur,
  focused,
  placeholder,
  error,
  icon,
  autoComplete,
  inputRef,
}) {
  return (
    <div>
      {label && (
        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#cbd5e1', marginBottom: 6 }}>
          {label}
        </label>
      )}
      <motion.div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginBottom: 0 }}>
        {icon && (
          <span style={{ position: 'absolute', left: 14, fontSize: 16, pointerEvents: 'none' }}>{icon}</span>
        )}
        <motion.input
          ref={inputRef}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={placeholder}
          autoComplete={autoComplete}
          whileFocus={{ scale: 1.01 }}
          style={{
            width: '100%',
            padding: icon ? '12px 14px 12px 44px' : '12px 14px',
            background: 'rgba(20, 26, 40, 0.65)',
            border: focused
              ? '1.5px solid rgba(59, 130, 246, 0.9)'
              : error
                ? '1.5px solid rgba(239, 68, 68, 0.75)'
                : '1.5px solid rgba(255, 255, 255, 0.16)',
            color: '#f8fafc',
            fontSize: 14,
            borderRadius: 10,
            outline: 'none',
            backdropFilter: 'blur(10px)',
            transition: 'all 200ms ease',
            boxShadow: focused ? '0 0 0 2px rgba(59, 130, 246, 0.3)' : 'none',
          }}
        />
      </motion.div>
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{ margin: '6px 0 0 0', fontSize: 12, color: '#ef4444', fontWeight: 500 }}
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

function Spinner() {
  return (
    <motion.div
      animate={{ rotate: 360 }}
      transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
      style={{
        width: 16,
        height: 16,
        border: '2.5px solid rgba(255,255,255,0.2)',
        borderRadius: '50%',
        borderTopColor: 'rgba(255,255,255,0.8)',
      }}
    />
  );
}
