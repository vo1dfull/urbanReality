import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import csrf from 'csurf';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import passport from './config/passport.js';
import authRoutes from './routes/authRoutes.js';
import { analyze } from './routes/gemini.js';

// Load environment variables from server/.env or process env
dotenv.config();

console.log("EMAIL:", process.env.EMAIL);
console.log("PASS:", process.env.EMAIL_PASS ? "SET" : "NOT SET");

const app = express();

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5173')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS policy: origin ${origin} not allowed`));
  },
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());
app.use(csrf({ cookie: true }));
app.use(passport.initialize());

app.get('/api/csrf-token', (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

// Connect to MongoDB
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/urbanReality';
mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.error('MongoDB Connection Error:', err));

// Routes
app.use('/api/auth', authRoutes);

const geminiRoutes = express.Router();
geminiRoutes.post('/analysis', analyze);
app.use('/api/gemini', geminiRoutes);

// alias compatibility path for frontend utility
app.post('/api/urban-analysis', analyze);

// CSRF error handler
app.use((err, req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({ message: 'Invalid CSRF token' });
  }
  next(err);
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`Gemini backend running on port ${port}`);
});
