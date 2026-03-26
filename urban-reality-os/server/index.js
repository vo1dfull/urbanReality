import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import authRoutes from './routes/auth.js';

// Load environment variables from server/.env or process env
dotenv.config();

// IMPORTANT: install @google/generative-ai in server environment
// npm install @google/generative-ai
import { GoogleGenerativeAI } from '@google/generative-ai';

const app = express();
app.use(cors());
app.use(express.json());

// Connect to MongoDB
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/urbanReality';
mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.error('MongoDB Connection Error:', err));

// Routes
app.use('/api/auth', authRoutes);

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.warn('GEMINI_API_KEY is not set. Gemini backend will return fallback responses.');
}

const genAI = API_KEY ? new GoogleGenerativeAI(API_KEY) : null;

app.post('/api/urban-analysis', async (req, res) => {
  try {
    const { data, year, metrics } = req.body;
    // metrics = { aqi: number, traffic: number, floodDepth: number, weather: string }

    if (!genAI) {
      return res.json({ analysis: `Urban analysis (Offline). Metrics: AQI ${metrics?.aqi || 'N/A'}, Traffic ${Math.round((metrics?.traffic || 0) * 100)}%, Flood Depth ${metrics?.floodDepth || 0}m. Population: 2500000 people. Economic impact estimated based on local models.` });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

    const prompt = `
      Act as an advanced Urban Economist and City Planner AI. 
      Analyze the Real-Time Economic Impact for a zone in Delhi for the year ${year}.
      
      Real-Time Data:
      - Persons Affected: ${data.people}
      - Estimated Baseline Loss: ₹${data.loss} Cr (Local Model)
      - Risk Level: ${data.risk}
      - Current AQI: ${metrics?.aqi || 90} (Air Quality Index)
      - Traffic Congestion: ${Math.round((metrics?.traffic || 0) * 100)}%
      - Flood Depth: ${metrics?.floodDepth || 0} meters
      
      Task:
      1. Re-calculate or refine the "Economic Loss" considering the *real-time* AQI and Traffic multipliers (e.g., high AQI reduces productivity, high traffic delays logistics). State the "Real-Time Economic Loss".
      2. Provide a brief, 2-sentence executive summary of *why* the loss is at this level.
      3. Suggest one immediate intervention.

      **Mandatory Output Format:**
      "Real-Time Loss: ₹[Amount] Cr. Population: ${data.people} people. [Summary]. [Intervention]."
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    res.json({ analysis: text });
  } catch (err) {
    console.error('Gemini backend error:', err);
    res.status(500).json({ error: 'Gemini analysis failed' });
  }
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`Gemini backend running on port ${port}`);
});
