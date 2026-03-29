import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import User from '../models/User.js';

const router = express.Router();
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const JWT_SECRET = process.env.JWT_SECRET || 'secret_key_123';

function validateAuthInput(email, password) {
    if (!email || typeof email !== 'string' || email.length < 6 || !email.includes('@')) {
        return 'Please provide a valid email address.';
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
        return 'Password must be at least 8 characters long.';
    }
    return null;
}

// Signup
router.post('/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const validationError = validateAuthInput(email, password);
        if (validationError) return res.status(400).json({ msg: validationError });

        let user = await User.findOne({ email });
        if (user) return res.status(400).json({ msg: 'User already exists' });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        user = new User({ name, email, password: hashedPassword });
        await user.save();

        const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: user._id, name, email } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const validationError = validateAuthInput(email, password);
        if (validationError) return res.status(400).json({ msg: validationError });

        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ msg: 'Invalid credentials' });

        if (!user.password) {
            return res.status(400).json({ msg: 'This account uses Google login. Please log in with Google or set a password.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ msg: 'Invalid credentials' });

        const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Google Auth
router.post('/google', async (req, res) => {
    try {
        const { token } = req.body;
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID
        });
        const { name, email, picture, sub: googleId } = ticket.getPayload();

        let user = await User.findOne({ email });
        if (user) {
            if (!user.googleId) {
                user.googleId = googleId;
                user.picture = picture;
                await user.save();
            }
        } else {
            user = new User({ name, email, googleId, picture });
            await user.save();
        }

        const jwtToken = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token: jwtToken, user: { id: user._id, name: user.name, email: user.email, picture: user.picture } });
    } catch (err) {
        console.error('Google Auth Error:', err);
        res.status(500).json({ msg: 'Google authentication failed. Please try again.' });
    }
});

export default router;
