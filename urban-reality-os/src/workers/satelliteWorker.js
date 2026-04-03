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
        result = await fetchBandTile(bounds, 'NDVI', provider);
        break;
      case 'fetchNDWI':
        result = await fetchBandTile(bounds, 'NDWI', provider);
        break;
      case 'fetchNDBI':
        result = await fetchBandTile(bounds, 'NDBI', provider);
        break;
      case 'fetchEVI':
        result = await fetchBandTile(bounds, 'EVI', provider);
        break;
      case 'computeChangeDetection':
        result = await computeChangeDetectionTile(bounds, event.data.dateA, event.data.dateB);
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
 * Fetch and generate band tile data
 * In production, this would call Sentinel-2/Landsat APIs
 * For now, we'll generate heuristic data based on coordinates and band type
 */
async function fetchBandTile(bounds = {}, band = 'NDVI', provider = 'sentinel') {
  const { north, south, east, west } = bounds;

  // Tile resolution (pixels per degree)
  const resolution = 256;
  const latRange = north - south;
  const lngRange = east - west;

  // Create band grid
  const width = resolution;
  const height = Math.round((latRange / lngRange) * resolution);
  const values = new Float32Array(width * height);

  const centerLat = (north + south) / 2;
  const centerLng = (east + west) / 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const lat = south + (y / height) * latRange;
      const lng = west + (x / width) * lngRange;

      let value = 0;

      switch (band) {
        case 'NDVI':
          value = generateNDVI(lat, lng);
          break;
        case 'NDWI':
          value = generateNDWI(lat, lng);
          break;
        case 'NDBI':
          value = generateNDBI(lat, lng);
          break;
        case 'EVI':
          value = generateEVI(lat, lng);
          break;
        default:
          value = 0;
      }

      values[y * width + x] = value;
    }
  }

  return {
    bounds,
    width,
    height,
    values,
    band,
    provider,
    timestamp: Date.now(),
    min: Math.min(...values),
    max: Math.max(...values),
    mean: computeMean(values),
    metadata: {
      source: provider === 'sentinel' ? 'Sentinel-2' : 'Landsat 8',
      resolution: `${resolution}m`,
      band,
    },
  };
}

/**
 * Generate heuristic NDVI value
 */
function generateNDVI(lat, lng) {
  // Base NDVI from latitude (more vegetation in temperate zones)
  const latFactor = Math.cos(lat * Math.PI / 180);
  let ndvi = 0.3 + latFactor * 0.4;

  // Add procedural noise
  ndvi += 0.3 * simplexNoise(lng * 0.1, lat * 0.1);

  // Reduce NDVI in urban areas
  const urbanPenalty = estimateUrbanFootprint(lng, lat);
  ndvi = ndvi * (1 - urbanPenalty * 0.5);

  // Add seasonal variation
  const month = new Date().getMonth();
  const seasonalVariation = Math.sin((month / 12) * Math.PI * 2) * 0.15;
  ndvi += seasonalVariation;

  return Math.max(-1, Math.min(1, ndvi));
}

/**
 * Generate heuristic NDWI value (water index)
 */
function generateNDWI(lat, lng) {
  // Water bodies are more likely near rivers, lakes, coasts
  const waterProbability = estimateWaterProbability(lat, lng);
  let ndwi = waterProbability * 0.8 - 0.2; // Range from -0.2 to 0.6

  // Add noise
  ndwi += 0.1 * simplexNoise(lng * 0.05, lat * 0.05);

  return Math.max(-1, Math.min(1, ndwi));
}

/**
 * Generate heuristic NDBI value (built-up index)
 */
function generateNDBI(lat, lng) {
  // Urban areas have higher NDBI
  const urbanFootprint = estimateUrbanFootprint(lng, lat);
  let ndbi = urbanFootprint * 0.6 - 0.3; // Range from -0.3 to 0.3

  // Add noise
  ndbi += 0.1 * simplexNoise(lng * 0.08, lat * 0.08);

  return Math.max(-1, Math.min(1, ndbi));
}

/**
 * Generate heuristic EVI value (enhanced vegetation index)
 */
function generateEVI(lat, lng) {
  // EVI is similar to NDVI but more sensitive to dense vegetation
  const ndvi = generateNDVI(lat, lng);
  let evi = ndvi * 1.2; // Enhanced sensitivity

  // EVI formula approximation: EVI = 2.5 * (NIR - RED) / (NIR + 6*RED - 7.5*BLUE + 1)
  // Simplified: boost NDVI for dense vegetation
  if (ndvi > 0.4) {
    evi += 0.2;
  }

  return Math.max(-1, Math.min(1, evi));
}

/**
 * Compute change detection between two dates
 */
async function computeChangeDetectionTile(bounds, dateA, dateB) {
  // For now, generate synthetic change data
  // In production, this would compare actual satellite imagery

  const width = 256;
  const height = 256;
  const diffMap = new Uint8Array(width * height);

  // Simulate some vegetation changes
  for (let i = 0; i < diffMap.length; i++) {
    const change = Math.random();
    if (change < 0.02) {
      diffMap[i] = 0; // Lost vegetation
    } else if (change < 0.04) {
      diffMap[i] = 255; // Gained vegetation
    } else {
      diffMap[i] = 127; // Unchanged
    }
  }

  return {
    bounds,
    dateA,
    dateB,
    diffMap,
    width,
    height,
    metadata: {
      changeType: 'vegetation',
      timeSpan: `${dateA} to ${dateB}`,
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

function estimateWaterProbability(lat, lng) {
  // Heuristic: water bodies near coasts, rivers, lakes
  // Simplified: higher probability near certain latitude/longitude patterns
  const coastalLat = Math.abs(lat) < 20; // Tropical coasts
  const riverLng = (lng % 10) < 0.5; // Simulated rivers every 10 degrees
  const lakeLat = Math.abs(lat - 40) < 5; // Lakes at certain latitudes
  
  let probability = 0;
  if (coastalLat) probability += 0.3;
  if (riverLng) probability += 0.4;
  if (lakeLat) probability += 0.2;
  
  // Add some noise
  probability += 0.1 * simplexNoise(lng * 0.02, lat * 0.02);
  
  return Math.max(0, Math.min(1, probability));
}

function computeMean(values) {
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
  }
  return sum / values.length;
}
