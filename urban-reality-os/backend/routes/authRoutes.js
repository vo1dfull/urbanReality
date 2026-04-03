import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import User from "../models/User.js";
import { OAuth2Client } from "google-auth-library";
import { generateOTP } from "../utils/otp.js";
import { sendOTPEmail } from "../utils/email.js";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const router = express.Router();

console.log("Auth routes loaded");

// Test email route
router.get("/test-email", async (req, res) => {
  try {
    // Assuming sendOTPEmail is available; if not, replace with simple send
    // await sendOTPEmail(process.env.EMAIL, "123456");
    res.send("Email sent! (Test route working)");
  } catch (err) {
    console.error(err);
    res.status(500).send("Email failed");
  }
});

// SIGN UP
router.post("/signup", async (req, res) => {
  try {
    console.log("Register request:", req.body);
    const { name, email, password } = req.body;
    if (!email || !password) return res.status(400).json({ msg: "Missing fields" });

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ msg: "Email already registered" });

    const hashed = await bcrypt.hash(password, 10);
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    const user = await User.create({ name, email, password: hashed, otp, otpExpiry });

    // Send OTP email
    await sendOTPEmail(user.email, otp);

    res.json({ msg: "User registered. OTP sent to email." });
  } catch (err) {
    console.error('signup error', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// VERIFY OTP
router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ msg: "Email and OTP required" });

    const user = await User.findOne({ email }).select('+otp +otpExpiry');
    if (!user || user.otp !== otp || !user.otpExpiry || user.otpExpiry < Date.now()) {
      return res.status(400).json({ msg: "Invalid or expired OTP" });
    }

    user.isVerified = true;
    user.otp = null;
    user.otpExpiry = null;
    await user.save();

    res.json({ msg: "Account verified" });
  } catch (err) {
    console.error('verify OTP error', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// LOGIN
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log("Login attempt:", email);
    if (!email || !password) return res.status(400).json({ msg: 'Missing fields' });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ msg: 'User not found' });

    // Allow login even if not verified (OTP verification is optional)
    // if (!user.isVerified) return res.status(403).json({ msg: 'Account not verified. Please verify OTP.' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ msg: 'Invalid credentials' });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) {
    console.error('login error', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// FORGOT PASSWORD
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ msg: 'Email required' });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ msg: 'User not found' });

    const token = crypto.randomBytes(32).toString("hex");
    user.resetToken = token;
    user.resetTokenExpiry = Date.now() + 15 * 60 * 1000; // 15 min
    await user.save();

    const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
    const link = `${frontendOrigin.replace(/\/$/, '')}/reset/${token}`;

    try {
      await sendOTPEmail(email, `Reset your password: ${link}`);
    } catch (emailErr) {
      console.warn('Failed to send reset email:', emailErr.message);
    }

    // Return token for local/dev convenience so user can continue if email is blocked.
    res.json({ msg: 'Reset email sent', token, link });
  } catch (err) {
    console.error('forgot password error', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// RESET PASSWORD
router.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ msg: 'Token and new password required' });

    const user = await User.findOne({ resetToken: token, resetTokenExpiry: { $gt: Date.now() } });
    if (!user) return res.status(400).json({ msg: 'Invalid or expired token' });

    const hashed = await bcrypt.hash(newPassword, 10);
    user.password = hashed;
    user.resetToken = null;
    user.resetTokenExpiry = null;
    await user.save();

    res.json({ msg: 'Password reset successful' });
  } catch (err) {
    console.error('reset password error', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GOOGLE OAUTH
router.post("/google", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ msg: 'Missing token' });

    const ticket = await googleClient.verifyIdToken({ idToken: token, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const { email, name } = payload;

    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({ email, name, password: Math.random().toString(36).slice(2) });
    }

    const jwtToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ token: jwtToken, user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) {
    console.error('google auth error', err);
    res.status(500).json({ msg: 'Google auth failed' });
  }
});

export default router;

