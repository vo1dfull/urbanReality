import { GoogleGenerativeAI } from '@google/generative-ai';

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.warn('GEMINI_API_KEY is not set. Gemini backend will return fallback responses.');
}

const genAI = API_KEY ? new GoogleGenerativeAI(API_KEY) : null;

export async function analyze(req, res) {
  try {
    const { prompt, data, year, metrics } = req.body;

    if (!genAI) {
      return res.json({
        analysis: `Urban analysis (Offline). Metrics: AQI ${metrics?.aqi || 'N/A'}, Traffic ${Math.round((metrics?.traffic || 0) * 100)}%, Flood Depth ${metrics?.floodDepth || 0}m. Population: ${data?.people || 'Unknown'}. Economic impact estimated based on local models.`
      });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

    let finalPrompt = prompt;

    if (!finalPrompt && data) {
      finalPrompt = `
        Act as an advanced Urban Economist and City Planner AI. 
        Analyze the Real-Time Economic Impact for a zone in Delhi for the year ${year}.

        Real-Time Data:
        - Persons Affected: ${data.people || 0}
        - Estimated Baseline Loss: ₹${data.loss || 0} Cr (Local Model)
        - Risk Level: ${data.risk || 'Unknown'}
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
    }

    if (!finalPrompt) {
      return res.status(400).json({ error: 'Insufficient data or prompt provided for analysis.' });
    }

    const result = await model.generateContent(finalPrompt);
    const text = result.response.text();

    res.json({ analysis: text });
  } catch (err) {
    console.error('Gemini backend error:', err);
    res.status(500).json({ error: 'Gemini analysis failed' });
  }
}
