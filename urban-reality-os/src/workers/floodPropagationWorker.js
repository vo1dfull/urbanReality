self.onmessage = (event) => {
  const msg = event.data || {};
  const { type } = msg;
  if (type === 'init') return init(msg);
  if (type === 'set-params') return setParams(msg);
  if (type === 'step') return step(msg);
  if (type === 'reset') return reset(msg);
};

let state = null;

function init(msg) {
  const {
    requestId,
    width,
    height,
    bounds,
    elevations,
    rainIntensityMmHr = 50,
    waterLevel = 1.0,
  } = msg || {};

  if (!width || !height || !bounds || !elevations) return;

  const elev = elevations instanceof Float32Array ? elevations : new Float32Array(elevations);
  state = {
    requestId: requestId || 1,
    width,
    height,
    bounds,
    elev,
    water: new Float32Array(width * height),
    rain: clamp(rainIntensityMmHr, 0, 300),
    waterLevel: clamp(waterLevel, 0, 5),
    t: 0,
  };

  // Seed a little initial water near the center (helps visible start)
  const cx = (width / 2) | 0;
  const cy = (height / 2) | 0;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      state.water[y * width + x] = 0.08 * state.waterLevel;
    }
  }

  self.postMessage({ type: 'ready', requestId: state.requestId });
}

function step(msg) {
  if (!state) return;
  const { requestId, dtSec = 0.5, maxOut = 1800, outStride = 2 } = msg || {};
  if (requestId && requestId !== state.requestId) return;

  const w = state.width;
  const h = state.height;
  const elev = state.elev;
  const water = state.water;

  const dt = clamp(dtSec, 0.05, 2.5);
  state.t += dt;

  // Rain: add uniform rainfall (mm/hr -> meters/sec approx)
  // 1 mm/hr = 2.777e-7 m/s
  const rainMps = state.rain * 2.777e-7;
  const rainAdd = rainMps * dt * (0.8 + 0.4 * state.waterLevel); // amplify via waterLevel

  for (let i = 0; i < water.length; i++) {
    water[i] += rainAdd;
  }

  // Flow: single-pass downhill relaxation to nearest-low neighbor (grid-based, stable)
  // Use a scratch buffer to accumulate deltas
  const delta = new Float32Array(water.length);
  const flowRate = 0.35; // tuned for stability

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const wh = elev[idx] + water[idx];

      // Find lowest neighbor in 8-neighborhood
      let bestIdx = -1;
      let bestH = wh;

      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (ox === 0 && oy === 0) continue;
          const nx = x + ox;
          const ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const nIdx = ny * w + nx;
          const nh = elev[nIdx] + water[nIdx];
          if (nh < bestH) {
            bestH = nh;
            bestIdx = nIdx;
          }
        }
      }

      if (bestIdx === -1) continue;
      const drop = wh - bestH;
      if (drop <= 0) continue;

      const available = water[idx];
      if (available <= 0) continue;

      // Move more water when drop is higher, but cap for stability
      const amount = Math.min(available, drop * flowRate * dt);
      if (amount <= 0) continue;

      delta[idx] -= amount;
      delta[bestIdx] += amount;
    }
  }

  for (let i = 0; i < water.length; i++) {
    const v = water[i] + delta[i];
    water[i] = v < 0 ? 0 : v;
  }

  // Output: compact points grid for MapLibre heatmap/circles
  const out = [];
  const stride = clampInt(outStride, 1, 6);
  const threshold = 0.02; // meters

  const west = state.bounds.west;
  const east = state.bounds.east;
  const south = state.bounds.south;
  const north = state.bounds.north;
  const invW = 1 / (w - 1);
  const invH = 1 / (h - 1);

  for (let y = 0; y < h; y += stride) {
    for (let x = 0; x < w; x += stride) {
      const idx = y * w + x;
      const depth = water[idx];
      if (depth < threshold) continue;

      const lng = west + (east - west) * (x * invW);
      const lat = south + (north - south) * (y * invH);
      const risk = depth > 1.2 ? 'high' : depth > 0.6 ? 'medium' : 'low';
      out.push([lng, lat, depth, risk]);
      if (out.length >= maxOut) break;
    }
    if (out.length >= maxOut) break;
  }

  self.postMessage({
    type: 'frame',
    requestId: state.requestId,
    t: state.t,
    points: out,
  });
}

function setParams(msg) {
  if (!state) return;
  const { requestId, rainIntensityMmHr, waterLevel } = msg || {};
  if (requestId && requestId !== state.requestId) return;
  if (Number.isFinite(rainIntensityMmHr)) state.rain = clamp(rainIntensityMmHr, 0, 300);
  if (Number.isFinite(waterLevel)) state.waterLevel = clamp(waterLevel, 0, 5);
}

function reset(msg) {
  if (!state) return;
  const { requestId } = msg || {};
  if (requestId && requestId !== state.requestId) return;
  state.water.fill(0);
  state.t = 0;
  self.postMessage({ type: 'reset-done', requestId: state.requestId });
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
function clampInt(v, lo, hi) {
  v = v | 0;
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

