// ================================================
// Satellite Worker — NDVI fetching and processing
// Heuristic NDVI generation (in production, use real APIs)
// ================================================

self.onmessage = async (event) => {
  const { requestId, type, bounds, provider, tileKey } = event.data || {};

  try {
    let result = null;

    switch (type) {
      case 'fetchNDVI':
        result = await fetchNDVITile(bounds, provider);
        break;
      default:
        throw new Error(`Unknown satellite type: ${type}`);
    }

    self.postMessage({ requestId, type, tileKey, result });
  } catch (error) {
    self.postMessage({ requestId, type, tileKey, error: error.message });
  }
};

/**
 * Fetch and generate NDVI tile
 * In production, this would call Sentinel-2/Landsat APIs
 * For now, we'll generate heuristic NDVI based on coordinates
 */
async function fetchNDVITile(bounds = {}, provider = 'sentinel') {
  const { north, south, east, west } = bounds;
  
  // Tile resolution (pixels per degree)
  const resolution = 256;
  const latRange = north - south;
  const lngRange = east - west;
  
  // Create NDVI grid
  const width = resolution;
  const height = Math.round((latRange / lngRange) * resolution);
  const ndviValues = new Float32Array(width * height);
  
  const centerLat = (north + south) / 2;
  const centerLng = (east + west) / 2;
  
  // Generate heuristic NDVI based on:
  // 1. Latitude (more vegetation in temperate zones)
  // 2. Procedural noise (realistic spatial variation)
  // 3. Urban footprint estimation (lower in urban areas)
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const lat = south + (y / height) * latRange;
      const lng = west + (x / width) * lngRange;
      
      // Base NDVI from latitude (simplified)
      const latFactor = Math.cos(lat * Math.PI / 180);
      let ndvi = 0.3 + latFactor * 0.4;
      
      // Add procedural noise (Perlin-like)
      ndvi += 0.3 * simplexNoise(lng * 0.1, lat * 0.1);
      
      // Reduce NDVI in "urban" areas (heuristic: near urban centers)
      const urbanPenalty = estimateUrbanFootprint(lng, lat);
      ndvi = ndvi * (1 - urbanPenalty * 0.5);
      
      // Add seasonal variation
      const month = new Date().getMonth();
      const seasonalVariation = Math.sin((month / 12) * Math.PI * 2) * 0.15;
      ndvi += seasonalVariation;
      
      // Clamp to [-1, 1]
      ndviValues[y * width + x] = Math.max(-1, Math.min(1, ndvi));
    }
  }
  
  return {
    bounds,
    width,
    height,
    ndviValues,
    provider,
    timestamp: Date.now(),
    metadata: {
      minNDVI: -1,
      maxNDVI: 1,
      meanNDVI: computeMean(ndviValues),
      source: provider === 'sentinel' ? 'Sentinel-2' : 'Landsat 8',
      resolution: `${resolution}m`,
    },
  };
}

/**
 * Simple simplex noise approximation
 */
function simplexNoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  
  // Fade
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  
  // Gradient
  const g00 = gradientNoise(xi, yi);
  const g10 = gradientNoise(xi + 1, yi);
  const g01 = gradientNoise(xi, yi + 1);
  const g11 = gradientNoise(xi + 1, yi + 1);
  
  const n00 = dotProduct(xf, yf, g00);
  const n10 = dotProduct(xf - 1, yf, g10);
  const n01 = dotProduct(xf, yf - 1, g01);
  const n11 = dotProduct(xf - 1, yf - 1, g11);
  
  const nx0 = lerp(n00, n10, u);
  const nx1 = lerp(n01, n11, u);
  
  return lerp(nx0, nx1, v);
}

function gradientNoise(x, y) {
  const h = hash(x, y) & 3;
  if (h === 0) return [1, 1];
  if (h === 1) return [-1, 1];
  if (h === 2) return [1, -1];
  return [-1, -1];
}

function dotProduct(x, y, grad) {
  return grad[0] * x + grad[1] * y;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hash(x, y) {
  let h = x ^ y;
  h ^= (h >>> 16);
  h *= 0x85ebca6b;
  h ^= (h >>> 13);
  h *= 0xc2b2ae35;
  h ^= (h >>> 16);
  return h;
}

function estimateUrbanFootprint(lng, lat) {
  // Heuristic: urban centers have lower NDVI
  // This is a simplified model; real data would come from built-up indices
  const x = (lng % 1) * 2 - 1;
  const y = (lat % 1) * 2 - 1;
  const dist = Math.sqrt(x * x + y * y);
  
  // Urban penalty: highest at center, decreases outward
  return Math.max(0, 0.4 - dist * 0.3);
}

function computeMean(ndviValues) {
  let sum = 0;
  for (let i = 0; i < ndviValues.length; i++) {
    sum += ndviValues[i];
  }
  return (sum / ndviValues.length).toFixed(3);
}
