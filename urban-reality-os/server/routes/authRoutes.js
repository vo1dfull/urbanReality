import express from 'express';
import rateLimit from 'express-rate-limit';
import passport from 'passport';
import { generateAccessToken, generateRefreshToken } from '../utils/tokens.js';
import { sendOTPEmail } from '../utils/email.js';
import {
  register,
  verifyOTP,
  login,
  refresh,
  logout,
  profile,
  requestPasswordReset,
  resetPassword,
} from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import { authorize } from '../middleware/authorize.js';

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: 'Too many login attempts, try again later' },
});

router.post('/register', register);
router.post('/signup', register);
router.post('/verify-otp', verifyOTP);
router.post('/login', loginLimiter, login);
router.post('/refresh', refresh);
router.post('/logout', protect, logout);
router.get('/profile', protect, profile);
router.post('/request-password-reset', requestPasswordReset);
router.post('/reset-password', resetPassword);

// Admin example
router.get('/admin-only', protect, authorize('admin'), (req, res) => {
  res.json({ message: 'Admin OK' });
});

// Google OAuth endpoints (if configured)
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login' }),
  (req, res) => {
    const user = req.user;
    const access = generateAccessToken(user);
    const refresh = generateRefreshToken(user);
    res.cookie('refreshToken', refresh, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard`);
  }
);

// Test email route
router.get('/test-email', async (req, res) => {
  try {
    await sendOTPEmail(process.env.EMAIL, '123456');
    res.send('Email sent!');
  } catch (err) {
    console.error(err);
    res.status(500).send('Email failed');
  }
});

export default router;
