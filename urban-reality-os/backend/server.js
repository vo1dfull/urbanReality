import express from "express";
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import cors from "cors";

dotenv.config();

const start = async () => {
  try {
    await connectDB();
  } catch (e) {
    console.error("⚠️ DB not connected - aborting startup", e && e.message ? e.message : e);
    process.exit(1); // Must not start without DB to avoid downstream failures
  }

  const app = express();
  const FRONTEND = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
  app.use(cors({ origin: FRONTEND, credentials: true }));
  app.use(express.json());

  // Health check / root route
  app.get("/", (req, res) => {
    res.json({ status: "Backend is running 🚀" });
  });

  // OpenAQ proxy (CORS-safe)
  app.get('/api/openaq/locations', async (req, res) => {
    try {
      const { lat, lng, radius = 10000, limit = 20 } = req.query;
      if (!lat || !lng) return res.status(400).json({ error: 'lat and lng are required' });

      const openAqKey = process.env.OPENAQ_API_KEY;
      const url = `https://api.openaq.org/v3/locations?coordinates=${lat},${lng}&radius=${radius}&limit=${limit}`;
      const headers = { 'Accept': 'application/json' };
      if (openAqKey) headers['X-API-Key'] = openAqKey;

      const response = await fetch(url, { headers });
      const data = await response.json();

      return res.status(response.status).json(data);
    } catch (err) {
      console.error('OpenAQ proxy error:', err);
      return res.status(500).json({ error: 'OpenAQ proxy failed' });
    }
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/user", userRoutes);

  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log("=================================");
    console.log("🚀 Backend server is LIVE");
    console.log("📡 Listening on http://localhost:" + PORT);
    console.log("=================================");
  });
};

start();
