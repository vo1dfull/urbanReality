// ================================================
// Urban Reality OS — Centralized Constants
// ================================================

export const BASE_YEAR = 2026;
export const INITIAL_YEAR = BASE_YEAR;
export const MIN_YEAR = BASE_YEAR;
export const MAX_YEAR = 2040;

export const MAP_CONFIG = {
  center: [77.209, 28.6139],
  zoom: 12,
  pitch: 60,
  bearing: -20,
};

export const FLOOD_ANIMATION_CONFIG = {
  depthIncrement: 0.02,
  resetDepth: 0,
  baseDepthMultiplier: 0.4,
};

export const IMPACT_MODEL = {
  baseAQI: 90,
  maxAQI: 200,
  baseFloodRisk: 0.25,
  maxFloodRisk: 0.85,
  baseTraffic: 0.35,
  maxTraffic: 0.85,
  basePopulation: 28000,
  populationGrowth: 6000,
};

export const STYLE_URLS = {
  default:
    'https://api.maptiler.com/maps/streets-v2/style.json?key=UQBNCVHquLf1PybiywBt',
  satellite:
    'https://api.maptiler.com/maps/hybrid/style.json?key=UQBNCVHquLf1PybiywBt',
  terrain:
    'https://api.maptiler.com/maps/topo-v2/style.json?key=UQBNCVHquLf1PybiywBt',
};

export const TERRAIN_SOURCE_URL =
  'https://api.maptiler.com/tiles/terrain-rgb/tiles.json?key=UQBNCVHquLf1PybiywBt';

export const TOMTOM_KEY = import.meta.env.VITE_TOMTOM_API_KEY;
export const OPENWEATHER_KEY = import.meta.env.VITE_OPENWEATHER_API_KEY || '';

export const MAJOR_INDIAN_CITIES = [
  { name: 'Delhi', lat: 28.6139, lng: 77.209 },
  { name: 'Mumbai', lat: 19.076, lng: 72.8777 },
  { name: 'Kolkata', lat: 22.5726, lng: 88.3639 },
  { name: 'Chennai', lat: 13.0827, lng: 80.2707 },
  { name: 'Bangalore', lat: 12.9716, lng: 77.5946 },
  { name: 'Hyderabad', lat: 17.385, lng: 78.4867 },
  { name: 'Pune', lat: 18.5204, lng: 73.8567 },
  { name: 'Ahmedabad', lat: 23.0225, lng: 72.5714 },
  { name: 'Jaipur', lat: 26.9124, lng: 75.8649 },
  { name: 'Surat', lat: 21.1702, lng: 72.8311 },
  { name: 'Lucknow', lat: 26.8467, lng: 80.9462 },
  { name: 'Kanpur', lat: 26.4499, lng: 80.3319 },
  { name: 'Nagpur', lat: 21.1458, lng: 79.0882 },
  { name: 'Indore', lat: 22.7196, lng: 75.8577 },
  { name: 'Thane', lat: 19.2183, lng: 72.9667 },
  { name: 'Bhopal', lat: 23.2599, lng: 77.4126 },
  { name: 'Visakhapatnam', lat: 17.6868, lng: 83.2185 },
  { name: 'Patna', lat: 25.5941, lng: 85.1376 },
  { name: 'Vadodara', lat: 22.3072, lng: 73.1812 },
  { name: 'Ghaziabad', lat: 28.6692, lng: 77.4378 },
  { name: 'Ludhiana', lat: 30.901, lng: 75.8573 },
  { name: 'Agra', lat: 27.1767, lng: 78.0081 },
  { name: 'Nashik', lat: 19.9975, lng: 73.7898 },
  { name: 'Faridabad', lat: 28.4089, lng: 77.3167 },
  { name: 'Meerut', lat: 28.9845, lng: 77.7064 },
];

export const FLOOD_DEPTH_POLYGON = [
  [77.16, 28.56],
  [77.32, 28.56],
  [77.32, 28.7],
  [77.16, 28.7],
  [77.16, 28.56],
];

export const COVERAGE_BOUNDS = [
  [76.8, 28.8],
  [77.4, 28.8],
  [77.4, 28.4],
  [76.8, 28.4],
];

export const FLY_THROUGH_TOUR = [
  { lng: 77.209, lat: 28.6139, zoom: 13, bearing: -20 },
  { lng: 77.22, lat: 28.63, zoom: 15, bearing: 60 },
  { lng: 77.23, lat: 28.65, zoom: 14, bearing: 140 },
  { lng: 77.2, lat: 28.62, zoom: 16, bearing: 220 },
  { lng: 77.185, lat: 28.6, zoom: 13, bearing: 320 },
];
