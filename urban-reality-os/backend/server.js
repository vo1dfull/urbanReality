import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import connectDB from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import cors from "cors";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });
console.log("JWT_SECRET loaded:", process.env.JWT_SECRET ? "✅ YES" : "❌ NO");

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
      
      const headers = { 
        'Accept': 'application/json',
        'User-Agent': 'UrbanRealityOS/2.0'
      };
      if (openAqKey) headers['X-API-Key'] = openAqKey;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const response = await fetch(url, { headers, signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.text().catch(() => null);
        console.warn(`OpenAQ API error ${response.status}:`, errorData);
        return res.status(response.status).json({ 
          error: `OpenAQ API error: ${response.status}`,
          details: errorData 
        });
      }

      const data = await response.json();
      return res.status(200).json(data);
    } catch (err) {
      const isTimeout = err.name === 'AbortError';
      const errorMsg = isTimeout ? 'OpenAQ request timeout' : err.message;
      console.error('OpenAQ proxy error:', errorMsg);
      return res.status(isTimeout ? 408 : 500).json({ error: errorMsg });
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
