import express from 'express';
import { register, login, refresh, logout, profile } from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.post('/register', register);
router.post('/signup', register); // alias for legacy endpoint
router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/profile', protect, profile);

export default router;
