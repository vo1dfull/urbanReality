import { useEffect, useRef, useState, useCallback, startTransition } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// New UI System
import CommandBar from "./CommandBar";
import ControlDock from "./ControlDock";
import ContextEngine from "./ContextEngine";
import TimelineBar from "./TimelineBar";
import TerrainController from "./terrain/TerrainController";
import CoordinateDisplay from "./CoordinateDisplay";
import MapMenu from "./MapMenu";
import SearchBar from "./SearchBar";
import TimeSlider from "./TimeSlider";
import EconomicPanel from "./EconomicPanel";
import CitySuggestions from "./CitySuggestions";
import FacilityStatsPanel from "./FacilityStatsPanel";
import FacilityListPanel from "./FacilityListPanel";
import LocationPopup from "./LocationPopup";
import { createRoot } from "react-dom/client";
import { getUrbanAnalysis } from "../utils/gemini";
import { fetchIndiaMacroData } from "../utils/worldBank";
import { calculateImpactModel } from "../utils/impactModel";
import { fetchRealtimeAQI } from "../utils/aqi";

// Constants
const BASE_YEAR = 2026;
const INITIAL_YEAR = BASE_YEAR;
const MIN_YEAR = BASE_YEAR;
const MAX_YEAR = 2040;
const MAP_CONFIG = {
    center: [77.209, 28.6139],
    zoom: 12,
    pitch: 60,
    bearing: -20
};
const FLOOD_ANIMATION_CONFIG = {
    depthIncrement: 0.02,
    resetDepth: 0,
    baseDepthMultiplier: 0.4
};
const IMPACT_MODEL = {
    baseAQI: 90,
    maxAQI: 200,
    baseFloodRisk: 0.25,
    maxFloodRisk: 0.85,
    baseTraffic: 0.35,
    maxTraffic: 0.85,
    basePopulation: 28000,
    populationGrowth: 6000
};
// Use environment variable - set VITE_TOMTOM_API_KEY in your .env file
const TOMTOM_KEY = import.meta.env.VITE_TOMTOM_API_KEY;
// OpenWeather Air Pollution API key (set VITE_OPENWEATHER_API_KEY in .env)
// Get free API key from: https://openweathermap.org/api/air-pollution
const OPENWEATHER_KEY = import.meta.env.VITE_OPENWEATHER_API_KEY || "";

// Major Indian cities with coordinates
const MAJOR_INDIAN_CITIES = [
    { name: "Delhi", lat: 28.6139, lng: 77.2090 },
    { name: "Mumbai", lat: 19.0760, lng: 72.8777 },
    { name: "Kolkata", lat: 22.5726, lng: 88.3639 },
    { name: "Chennai", lat: 13.0827, lng: 80.2707 },
    { name: "Bangalore", lat: 12.9716, lng: 77.5946 },
    { name: "Hyderabad", lat: 17.3850, lng: 78.4867 },
    { name: "Pune", lat: 18.5204, lng: 73.8567 },
    { name: "Ahmedabad", lat: 23.0225, lng: 72.5714 },
    { name: "Jaipur", lat: 26.9124, lng: 75.8649 },
    { name: "Surat", lat: 21.1702, lng: 72.8311 },
    { name: "Lucknow", lat: 26.8467, lng: 80.9462 },
    { name: "Kanpur", lat: 26.4499, lng: 80.3319 },
    { name: "Nagpur", lat: 21.1458, lng: 79.0882 },
    { name: "Indore", lat: 22.7196, lng: 75.8577 },
    { name: "Thane", lat: 19.2183, lng: 72.9667 },
    { name: "Bhopal", lat: 23.2599, lng: 77.4126 },
    { name: "Visakhapatnam", lat: 17.6868, lng: 83.2185 },
    { name: "Patna", lat: 25.5941, lng: 85.1376 },
    { name: "Vadodara", lat: 22.3072, lng: 73.1812 },
    { name: "Ghaziabad", lat: 28.6692, lng: 77.4378 },
    { name: "Ludhiana", lat: 30.9010, lng: 75.8573 },
    { name: "Agra", lat: 27.1767, lng: 78.0081 },
    { name: "Nashik", lat: 19.9975, lng: 73.7898 },
    { name: "Faridabad", lat: 28.4089, lng: 77.3167 },
    { name: "Meerut", lat: 28.9845, lng: 77.7064 }
];

export default function MapView() {
    const mapContainer = useRef(null);
    const mapRef = useRef(null);
    const popupSessionRef = useRef(0);
    const lastRequestTimeRef = useRef(0);
    const yearRef = useRef(INITIAL_YEAR);
    const floodAnimRef = useRef(null);
    const floodDepthRef = useRef(0);
    const flyThroughTimeoutsRef = useRef([]);
    const rainfallRef = useRef(0);
    const macroDataRef = useRef(null);
    const lastAQIRef = useRef(null);

    const [year, setYear] = useState(INITIAL_YEAR);
    const [impactData, setImpactData] = useState(null);
    const [urbanAnalysis, setUrbanAnalysis] = useState(null);
    const [analysisLoading, setAnalysisLoading] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // ContextEngine state
    const [uiMode, setUiMode] = useState(null); // null | 'location' | 'terrain'
    const [locationData, setLocationData] = useState(null);

    const [layers, setLayers] = useState({
        aqi: true,
        flood: true,
        traffic: true,
        floodDepth: false,
        hospitals: false,
        policeStations: false,
        fireStations: false
    });

    const [mapStyle, setMapStyle] = useState("default");
    const [aqiGeo, setAqiGeo] = useState(null);
    const [loadingAQI, setLoadingAQI] = useState(false);
    const [floodData, setFloodData] = useState(null);
    const [macroData, setMacroData] = useState(null);
    const [demographics, setDemographics] = useState(null);
    const [activeLocation, setActiveLocation] = useState(null);
    const [facilityCheckOpen, setFacilityCheckOpen] = useState(false);
    const [showLayersMenu, setShowLayersMenu] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [facilityViewMode, setFacilityViewMode] = useState('coverage');
    const [hoveredFacility, setHoveredFacility] = useState(null);
    const [facilityData, setFacilityData] = useState(null);
    const [cityDemo, setCityDemo] = useState(null);
    const [locationPopulation, setLocationPopulation] = useState(null);
    const [cameraState, setCameraState] = useState({ bearing: MAP_CONFIG.bearing, pitch: MAP_CONFIG.pitch });
    const [floodMode, setFloodMode] = useState(false);
    const cameraStateRef = useRef({ bearing: MAP_CONFIG.bearing, pitch: MAP_CONFIG.pitch });
    const aqiGeoRef = useRef(null);
    const clickAbortControllerRef = useRef(null);
    const cameraRafIdRef = useRef(null);
    const yearDebounceRef = useRef(null);
    const floodFrameRef = useRef(0);
    const popupRef = useRef(null);
    const popupRootRef = useRef(null);
    const trafficSourceAddedRef = useRef(false);
    const trafficLayerAddedRef = useRef(false);

    // Sync macroData to ref for usage in callbacks
    useEffect(() => { macroDataRef.current = macroData; }, [macroData]);

    const fetchAllCitiesAQI = useCallback(async () => {
        if (!OPENWEATHER_KEY) {
            console.warn("OpenWeather API key not available");
            return null;
        }

        setLoadingAQI(true);
        const CHUNK_SIZE = 5;
        const features = [];

        for (let i = 0; i < MAJOR_INDIAN_CITIES.length; i += CHUNK_SIZE) {
            const chunk = MAJOR_INDIAN_CITIES.slice(i, i + CHUNK_SIZE);
            const results = await Promise.all(chunk.map(async (city) => {
                try {
                    const r = await fetchRealtimeAQI(city.lat, city.lng, OPENWEATHER_KEY);
                    if (!r) return null;
                    return {
                        type: "Feature",
                        properties: {
                            aqi: r.aqi,
                            city: city.name,
                            level: r.category || null,
                            pm25: r.pm25 ?? null,
                            pm10: r.pm10 ?? null
                        },
                        geometry: { type: "Point", coordinates: [city.lng, city.lat] }
                    };
                } catch (err) {
                    console.warn(`Failed to fetch AQI for ${city.name}:`, err);
                    return null;
                }
            }));

            features.push(...results.filter(Boolean));
            if (i + CHUNK_SIZE < MAJOR_INDIAN_CITIES.length) {
                await new Promise((resolve) => setTimeout(resolve, 200));
            }
        }

        return { type: "FeatureCollection", features };
    }, []);

    const ensureTrafficLayer = useCallback((map, isVisible, forceRecreate = false) => {
        if (!map || !TOMTOM_KEY) return;

        try {
            const layerExists = map.getLayer("traffic-layer");
            const sourceExists = map.getSource("traffic");

            // If force recreate (after style change), remove first
            if (forceRecreate && layerExists) {
                try {
                    map.removeLayer("traffic-layer");
                    trafficLayerAddedRef.current = false;
                } catch (e) {
                    console.warn('Could not remove traffic layer:', e);
                }
            }
            if (forceRecreate && sourceExists) {
                try {
                    map.removeSource("traffic");
                    trafficSourceAddedRef.current = false;
                } catch (e) {
                    console.warn('Could not remove traffic source:', e);
                }
            }

            // Always ensure source exists
            if (!map.getSource("traffic")) {
                map.addSource("traffic", {
                    type: "raster",
                    tiles: [
                        `https://api.tomtom.com/traffic/map/4/tile/flow/relative/{z}/{x}/{y}.png?key=${TOMTOM_KEY}`
                    ],
                    tileSize: 256
                });
                trafficSourceAddedRef.current = true;
            }

            // Always ensure layer exists
            if (!map.getLayer("traffic-layer")) {
                map.addLayer({
                    id: "traffic-layer",
                    type: "raster",
                    source: "traffic",
                    paint: {
                        "raster-opacity": 1.0,
                        "raster-fade-duration": 300
                    },
                    layout: {
                        visibility: isVisible ? "visible" : "none"
                    }
                });
                trafficLayerAddedRef.current = true;

                // Position layer correctly - place before UI layers
                try {
                    const layers = map.getStyle().layers || [];
                    let insertBeforeId = null;
                    
                    // Find first UI-focused layer to insert traffic before
                    for (const layer of layers) {
                        if (['aqi-layer', 'flood-layer', 'flood-fill', 'flood-risk-heatmap', 'facilities', 'hospitals-layer', 'police-layer', 'fire-layer'].includes(layer.id)) {
                            insertBeforeId = layer.id;
                            break;
                        }
                    }
                    
                    if (insertBeforeId && map.getLayer(insertBeforeId)) {
                        map.moveLayer('traffic-layer', insertBeforeId);
                    }
                } catch (e) {
                    console.warn('Could not reposition traffic layer:', e);
                }
            } else {
                // Layer exists, just update visibility
                try {
                    map.setLayoutProperty("traffic-layer", "visibility", isVisible ? "visible" : "none");
                } catch (e) {
                    console.warn('Could not set traffic visibility:', e);
                }
            }
        } catch (err) {
            console.error("Error ensuring traffic layer:", err);
        }
    }, []);

    // Helper function to remove traffic layer safely
    const removeTrafficLayer = useCallback((map) => {
        if (!map) return;

        try {
            if (map.getLayer("traffic-layer")) {
                map.removeLayer("traffic-layer");
                trafficLayerAddedRef.current = false;
            }
            if (map.getSource("traffic")) {
                map.removeSource("traffic");
                trafficSourceAddedRef.current = false;
            }
        } catch (err) {
            console.warn("Error removing traffic layer:", err);
        }
    }, []);

    const ensureFloodLayers = useCallback((map) => {
        if (!map || !floodData) return;

        try {
            if (!map.getSource("flood")) {
                map.addSource("flood", { type: "geojson", data: floodData });
            }
            if (!map.getLayer("flood-layer")) {
                map.addLayer({
                    id: "flood-layer",
                    type: "fill",
                    source: "flood",
                    paint: {
                        "fill-color": "#2563eb",
                        "fill-opacity": 0.45
                    },
                    layout: {
                        visibility: layers.flood ? "visible" : "none"
                    }
                });
            } else {
                map.setLayoutProperty("flood-layer", "visibility", layers.flood ? "visible" : "none");
            }

            if (!map.getSource("flood-depth")) {
                map.addSource("flood-depth", {
                    type: "geojson",
                    data: { type: "FeatureCollection", features: [] }
                });
            }
            if (!map.getLayer("flood-depth-layer")) {
                map.addLayer({
                    id: "flood-depth-layer",
                    type: "fill",
                    source: "flood-depth",
                    paint: {
                        "fill-color": [
                            "interpolate",
                            ["linear"],
                            ["get", "depth"],
                            0, "#bfdbfe",
                            1, "#60a5fa",
                            2, "#2563eb",
                            3, "#1e3a8a"
                        ],
                        "fill-opacity": [
                            "interpolate",
                            ["linear"],
                            ["get", "depth"],
                            0, 0.2,
                            3, 0.75
                        ]
                    },
                    layout: {
                        visibility: layers.floodDepth ? "visible" : "none"
                    }
                });
            } else {
                map.setLayoutProperty("flood-depth-layer", "visibility", layers.floodDepth ? "visible" : "none");
            }
        } catch (err) {
            console.warn("Error restoring flood layers:", err);
        }
    }, [floodData, layers.flood, layers.floodDepth]);

    const ensureFacilityCoverageLayer = useCallback((map) => {
        if (!map || !facilityData) return;

        try {
            if (!map.getSource("facility-coverage")) {
                const coverageCanvas = document.createElement('canvas');
                coverageCanvas.width = 1024;
                coverageCanvas.height = 1024;

                map.addSource("facility-coverage", {
                    type: "canvas",
                    canvas: coverageCanvas,
                    coordinates: [
                        [76.8, 28.8],
                        [77.4, 28.8],
                        [77.4, 28.4],
                        [76.8, 28.4]
                    ],
                    animate: true
                });
            }

            if (!map.getLayer("facility-coverage-layer")) {
                const beforeLayer = map.getLayer("hospitals-layer") ? "hospitals-layer" : undefined;
                const layerDef = {
                    id: "facility-coverage-layer",
                    type: "raster",
                    source: "facility-coverage",
                    paint: {
                        "raster-opacity": 0.6,
                        "raster-fade-duration": 0
                    }
                };

                if (beforeLayer) {
                    map.addLayer(layerDef, beforeLayer);
                } else {
                    map.addLayer(layerDef);
                }
            }
        } catch (err) {
            console.warn("Error ensuring facility coverage layer:", err);
        }
    }, [facilityData]);

    // Keyboard shortcut: F → toggle Facility Check panel
    useEffect(() => {
        const handleKeyDown = (e) => {
            const tag = e.target?.tagName?.toLowerCase();
            if (tag === 'input' || tag === 'textarea') return;
            if (e.key === 'f' || e.key === 'F') {
                setFacilityCheckOpen(prev => !prev);
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Load saved locations markers only when map is ready
    useEffect(() => {
        if (!mapRef.current || loading) return;

        try {
            const savedLocations = JSON.parse(localStorage.getItem('savedLocations') || '[]');
            savedLocations.forEach(loc => {
                new maplibregl.Marker({ color: '#f97316' })
                    .setLngLat([loc.lng, loc.lat])
                    .addTo(mapRef.current);
            });
        } catch (e) {
            console.warn('Could not load saved locations', e);
        }
    }, [loading]);

    // Recalculate projections when the selected location or year changes
    useEffect(() => {
        if (!activeLocation) return;
        clearTimeout(yearDebounceRef.current);

        yearDebounceRef.current = window.setTimeout(() => {
            const {
                lat: aLat,
                lng: aLng,
                placeName: aPlace,
                baseAQI,
                baseRainfall,
                baseTraffic,
                baseFloodRisk,
                worldBank
            } = activeLocation;

            const yearsElapsed = year - BASE_YEAR;
            const timeFactor = yearsElapsed / (MAX_YEAR - BASE_YEAR);

            const projectedAQI = Math.round(
                baseAQI + timeFactor * (IMPACT_MODEL.maxAQI - IMPACT_MODEL.baseAQI)
            );

            const projectedTraffic = Math.min(
                1,
                baseTraffic + timeFactor * 0.5
            );

            const projectedFloodRisk = Math.min(
                1,
                baseFloodRisk + timeFactor * 0.4
            );

            const impact = calculateImpactModel({
                year,
                baseYear: BASE_YEAR,
                populationBase: worldBank?.population?.value,
                aqi: projectedAQI,
                rainfallMm: baseRainfall,
                trafficCongestion: projectedTraffic,
                floodRisk: projectedFloodRisk,
                worldBank
            });

            const updatedImpactData = {
                zone: `${aPlace} (${year})`,
                people: impact.peopleAffected,
                loss: impact.economicLossCr,
                risk: impact.risk
            };

            const updatedDemographics = {
                population: impact.population,
                growthRate: 1.6,
                tfr: 1.9,
                migrantsPct: 21
            };

            setImpactData(updatedImpactData);
            setDemographics(updatedDemographics);

            try {
                if (popupRootRef.current && popupRef.current?.isOpen() && activeLocation?.sessionId === popupSessionRef.current) {
                    popupRootRef.current.render(
                        <LocationPopup
                            placeName={aPlace}
                            lat={aLat}
                            lng={aLng}
                            year={year}
                            baseYear={BASE_YEAR}
                            realTimeAQI={lastAQIRef.current}
                            finalAQI={projectedAQI}
                            rainfall={baseRainfall}
                            rainProbability={null}
                            macroData={worldBank}
                            impact={impact}
                            demographics={updatedDemographics}
                            analysis={urbanAnalysis}
                            analysisLoading={analysisLoading}
                            openWeatherKey={OPENWEATHER_KEY}
                            onSave={(name) => { if (window.saveLocation) window.saveLocation(name, aLat, aLng); }}
                        />
                    );
                }
            } catch (e) { console.warn("Popup render skipped (Year Change):", e); }
        }, 80);

        return () => clearTimeout(yearDebounceRef.current);
    }, [year, activeLocation]);

    /* ================= MAP INIT ================= */
    useEffect(() => {
        if (!mapContainer.current || mapRef.current) return;

        let isMounted = true;

        const map = new maplibregl.Map({
            container: mapContainer.current,
            style:
                "https://api.maptiler.com/maps/streets-v2/style.json?key=UQBNCVHquLf1PybiywBt",
            center: MAP_CONFIG.center,
            zoom: MAP_CONFIG.zoom,
            pitch: MAP_CONFIG.pitch,
            bearing: MAP_CONFIG.bearing,
            antialias: false,
            fadeDuration: 0,
            maxTileCacheSize: 50,
            trackResize: true
        });

        mapRef.current = map;
        popupRef.current = new maplibregl.Popup({
            className: 'custom-popup',
            closeButton: false,
            offset: 12,
            closeOnClick: false
        });

        // Setup persistent popup close listener
        const handlePopupClose = () => {
            try {
                if (popupRootRef.current) {
                    popupRootRef.current.unmount();
                    popupRootRef.current = null;
                }
            } catch (e) {
                console.warn("Popup unmount failed:", e);
            }
        };

        popupRef.current.on("close", handlePopupClose);

        map.addControl(new maplibregl.NavigationControl(), "top-right");

        const loadMapData = async () => {
            try {
                setLoading(true);
                setError(null);

                await new Promise((resolve) => {
                    if (map.loaded()) {
                        resolve();
                    } else {
                        map.once("load", resolve);
                    }
                });

                if (!isMounted) return;

                /* ===== TERRAIN ===== */
                map.addSource("terrain", {
                    type: "raster-dem",
                    url:
                        "https://api.maptiler.com/tiles/terrain-rgb/tiles.json?key=UQBNCVHquLf1PybiywBt",
                    tileSize: 256
                });

                map.setTerrain({ source: "terrain", exaggeration: 1.0 });

                /* ===== AQI (REAL-TIME FROM OPENWEATHER API) ===== */
                /* Use the shared fetchAllCitiesAQI helper here. */

                /* ===== AQI LAYER INIT ===== */
                const aqiData = await fetchAllCitiesAQI();
                if (aqiData && isMounted) {
                    map.addSource("aqi", { type: "geojson", data: aqiData });
                    map.addLayer({
                        id: "aqi-layer",
                        type: "circle",
                        source: "aqi",
                        paint: {
                            "circle-radius": 12,
                            "circle-opacity": 0.9,
                            "circle-stroke-width": 2,
                            "circle-stroke-color": "#ffffff",
                            "circle-stroke-opacity": 0.8,
                            "circle-color": [
                                "interpolate",
                                ["linear"],
                                ["get", "aqi"],
                                0, "#22c55e",
                                50, "#22c55e",
                                100, "#eab308",
                                150, "#f97316",
                                200, "#dc2626",
                                300, "#9333ea",
                                400, "#6b21a8"
                            ]
                        }
                    });
                    setAqiGeo(aqiData);
                }

                /* ===== STATIC FLOOD (DATA) ===== */
                try {
                    const floodResponse = await fetch("/data/flood.json");
                    if (!floodResponse.ok) throw new Error("Failed to load flood data");
                    const floodData = await floodResponse.json();

                    if (isMounted) {
                        map.addSource("flood", { type: "geojson", data: floodData });
                        map.addLayer({
                            id: "flood-layer",
                            type: "fill",
                            source: "flood",
                            paint: {
                                "fill-color": "#2563eb",
                                "fill-opacity": 0.45
                            }
                        });
                        setFloodData(floodData);
                    }
                } catch (err) {
                    console.error("Error loading flood data:", err);
                    if (isMounted) setError("Failed to load flood data");
                }

                /* ===== CITY DEMOGRAPHICS (local static) ===== */
                try {
                    const demoResp = await fetch('/data/demographics.json');
                    if (demoResp && demoResp.ok) {
                        const demo = await demoResp.json();
                        if (isMounted) setCityDemo(demo);
                    }
                } catch (err) {
                    console.warn('Could not load city demographics:', err);
                }

                /* ===== FACILITY DATA ===== */
                try {
                    const facilityResp = await fetch('/data/facilities.json');
                    if (facilityResp && facilityResp.ok) {
                        const facilities = await facilityResp.json();
                        if (isMounted) setFacilityData(facilities);
                    } else {
                        console.warn('Facility data fetch failed:', facilityResp.status);
                    }
                } catch (err) {
                    console.warn('Could not load facility data:', err);
                }

                /* ===== FLOOD DEPTH (ANIMATED) ===== */
                if (isMounted) {
                    map.addSource("flood-depth", {
                        type: "geojson",
                        data: { type: "FeatureCollection", features: [] }
                    });

                    map.addLayer({
                        id: "flood-depth-layer",
                        type: "fill",
                        source: "flood-depth",
                        paint: {
                            "fill-color": [
                                "interpolate",
                                ["linear"],
                                ["get", "depth"],
                                0, "#bfdbfe",
                                1, "#60a5fa",
                                2, "#2563eb",
                                3, "#1e3a8a"
                            ],
                            "fill-opacity": [
                                "interpolate",
                                ["linear"],
                                ["get", "depth"],
                                0, 0.2,
                                3, 0.75
                            ]
                        }
                    });
                }

                /* ===== TRAFFIC (TomTom API) ===== */
                if (isMounted && TOMTOM_KEY) {
                    ensureTrafficLayer(map, layers.traffic);
                }

                /* ===== 3D BUILDINGS ===== */
                if (isMounted && map.getSource && map.getSource("openmaptiles")) {
                    try {
                        map.addLayer({
                            id: "3d-buildings",
                            source: "openmaptiles",
                            "source-layer": "building",
                            type: "fill-extrusion",
                            minzoom: 14,
                            paint: {
                                "fill-extrusion-color": "#cbd5e1",
                                "fill-extrusion-height": ["get", "render_height"],
                                "fill-extrusion-base": ["get", "render_min_height"],
                                "fill-extrusion-opacity": 0.9
                            }
                        });
                    } catch (e) {
                        console.warn('Could not add 3d-buildings layer:', e);
                    }
                }

                if (isMounted) setLoading(false);
            } catch (err) {
                console.error("Error initializing map:", err);
                if (isMounted) {
                    setError("Failed to initialize map. Please refresh the page.");
                    setLoading(false);
                }
            }
        };

        // Fetch World Bank data once on mount
        (async () => {
            try {
                const data = await fetchIndiaMacroData();
                if (isMounted) setMacroData(data);
            } catch (e) {
                console.warn("World Bank data failed:", e);
            }
        })();

        /* NOTE: Replaced inline AQI fetch with centralized fetchRealtimeAQI in ../utils/aqi.js */

        /* ===== OPEN-METEO (RAIN + FLOOD SIGNAL) ===== */
        const fetchRainfall = async (lat, lng) => {
            try {
                const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=rain,precipitation_probability&forecast_days=1`;
                const res = await fetch(url);
                if (!res.ok) throw new Error("Open-Meteo error");

                const data = await res.json();

                const rainNow = data.hourly?.rain?.[0] ?? 0; // mm
                const rainProb = data.hourly?.precipitation_probability?.[0] ?? 0; // %

                return {
                    rain: rainNow,
                    probability: rainProb
                };
            } catch (err) {
                console.warn("Open-Meteo fetch failed:", err);
                return null;
            }
        };

        /* ===== REVERSE GEOCODING ===== */
        const getPlaceName = async (lat, lng) => {
            try {
                // Use OpenStreetMap Nominatim (free, no API key required)
                const response = await fetch(
                    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
                    {
                        headers: {
                            'User-Agent': 'UrbanRealityOS/1.0'
                        }
                    }
                );
                if (!response.ok) throw new Error('Geocoding failed');
                const data = await response.json();
                if (data.address) {
                    // Try to get a meaningful place name
                    const address = data.address;
                    return address.village || address.town || address.city || address.county || address.state || address.country || 'Unknown Location';
                }
                return 'Unknown Location';
            } catch (err) {
                console.warn('Reverse geocoding failed:', err);
                return 'Unknown Location';
            }
        };

        /* ===== AI IMPACT MODEL ===== */
        const handleMapClick = async (e) => {
            if (!mapRef.current) return;

            const { lng, lat } = e.lngLat;
            const y = yearRef.current;
            const macroData = macroDataRef.current;

            // Start a new popup session
            const sessionId = ++popupSessionRef.current;

            // Track request time to prevent race conditions
            const requestTime = Date.now();
            lastRequestTimeRef.current = requestTime;

            // Abort any previous click requests so old network responses cannot overwrite current state
            clickAbortControllerRef.current?.abort();
            const controller = new AbortController();
            clickAbortControllerRef.current = controller;
            const signal = controller.signal;

            // ── Show loading state immediately via ContextEngine ──
            setLocationData({
                placeName: 'Analyzing…',
                lat, lng,
                year: y,
                finalAQI: null,
                realTimeAQI: lastAQIRef.current,
                rainfall: 0,
                impact: null,
                demographics: null,
                analysis: null,
                analysisLoading: true,
            });
            setUiMode('location');

            try {
                // Set initial loading state with session ID
                setActiveLocation({ lat, lng, isInitialLoading: true, sessionId: sessionId });
                setAnalysisLoading(true);
                setUrbanAnalysis(null);

                // Parallel Data Fetching
                const [placeName, realTimeAQI, rainData, trafficJson] = await Promise.all([
                    // Place Name
                    getPlaceName(lat, lng).catch(err => {
                        console.warn("Geocoding failed:", err);
                        return "Unknown Location";
                    }),

                    // AQI Data (centralized helper)
                    (async () => {
                        try {
                            return await fetchRealtimeAQI(lat, lng, OPENWEATHER_KEY, signal);
                        } catch (e) {
                            if (e.name === 'AbortError') return null;
                            console.warn("AQI fetch failed:", e);
                            return null;
                        }
                    })(),

                    // Rainfall Data (race against timeout)
                    (async () => {
                        try {
                            return await Promise.race([
                                fetchRainfall(lat, lng, signal),
                                new Promise((_, r) => setTimeout(() => r(new Error('Rain Timeout')), 4000))
                            ]);
                        } catch (e) {
                            if (e.name === 'AbortError') return { rain: 0, probability: 0 };
                            console.warn("Rain fetch failed:", e);
                            return { rain: 0, probability: 0 };
                        }
                    })(),

                    // Traffic Data (race against timeout)
                    (async () => {
                        if (!TOMTOM_KEY) return null;
                        try {
                            const res = await Promise.race([
                                fetch(`https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?key=${TOMTOM_KEY}&point=${lat},${lng}`, { signal }),
                                new Promise((_, r) => setTimeout(() => r(new Error('Traffic Timeout')), 4000))
                            ]);
                            if (res.ok) return await res.json();
                            return null;
                        } catch (e) {
                            if (e.name === 'AbortError') return null;
                            return null;
                        }
                    })()
                ]);

                // 3. Process Data & Calculate Metrics

                // Rainfall
                const rainfall = rainData ? rainData.rain : 0;
                const rainProbability = rainData ? rainData.probability : 0;
                rainfallRef.current = rainfall; // Store for flood animation
                lastAQIRef.current = realTimeAQI; // Persist AQI for re-renders

                // Time Factor (use BASE_YEAR)
                const yearsElapsed = y - BASE_YEAR;
                const timeFactor = yearsElapsed / (MAX_YEAR - BASE_YEAR);

                // Traffic Calculation
                let currentTrafficFactor = IMPACT_MODEL.baseTraffic;
                if (trafficJson && trafficJson.flowSegmentData) {
                    const { currentSpeed, freeFlowSpeed } = trafficJson.flowSegmentData;
                    if (freeFlowSpeed > 0) {
                        const congestion = 1 - (currentSpeed / freeFlowSpeed);
                        currentTrafficFactor = Math.max(0, Math.min(1, congestion));
                    }
                }
                const projectedTraffic = currentTrafficFactor + (0.5 * timeFactor);

                // Risk & People Calculation
                const rainFactor = Math.min(rainfall / 20, 1);
                const rainProbFactor = rainProbability / 100;

                const FloodRisk = Math.min(
                    1,
                    IMPACT_MODEL.baseFloodRisk +
                    (IMPACT_MODEL.maxFloodRisk - IMPACT_MODEL.baseFloodRisk) * timeFactor +
                    rainFactor * 0.4 +
                    rainProbFactor * 0.2
                );

                // Determine nearest AQI from cached geo features if realtime missing
                let nearestVal = null;
                if (!realTimeAQI && aqiGeo && aqiGeo.features && aqiGeo.features.length) {
                    let bestDist = Infinity;
                    for (const f of aqiGeo.features) {
                        const [fx, fy] = f.geometry.coordinates;
                        const d = (lat - fy) * (lat - fy) + (lng - fx) * (lng - fx);
                        if (d < bestDist && Number.isFinite(f.properties?.aqi)) {
                            bestDist = d;
                            nearestVal = f.properties.aqi;
                        }
                    }
                }

                const finalAQI = realTimeAQI?.aqi ?? nearestVal ?? IMPACT_MODEL.baseAQI;

                // Use single-source deterministic impact model
                const impact = calculateImpactModel({
                    year: y,
                    baseYear: BASE_YEAR,
                    populationBase: macroData?.population?.value,
                    aqi: finalAQI,
                    rainfallMm: rainfall,
                    trafficCongestion: projectedTraffic,
                    floodRisk: FloodRisk,
                    worldBank: macroData
                });

                const nextImpactData = {
                    zone: `${placeName} (${y})`,
                    people: impact.peopleAffected,
                    loss: impact.economicLossCr,
                    risk: impact.risk
                };

                const nextDemographics = {
                    population: impact.population,
                    growthRate: 1.6,
                    tfr: 1.9,
                    migrantsPct: 21
                };

                const nextActiveLocation = {
                    lat,
                    lng,
                    placeName,
                    baseAQI: finalAQI,
                    baseRainfall: rainfall,
                    baseTraffic: currentTrafficFactor,
                    baseFloodRisk: FloodRisk,
                    worldBank: macroData,
                    sessionId: sessionId
                };

                const nextLocationData = {
                    placeName,
                    lat,
                    lng,
                    year: y,
                    finalAQI,
                    realTimeAQI,
                    rainfall,
                    impact,
                    demographics: nextDemographics,
                    analysis: null,
                    analysisLoading: true
                };

                startTransition(() => {
                    setImpactData(nextImpactData);
                    setLocationPopulation(null);
                    setDemographics(nextDemographics);
                    setActiveLocation(nextActiveLocation);
                    if (sessionId === popupSessionRef.current) {
                        setLocationData(nextLocationData);
                    }
                });

                // 7. Trigger AI Analysis (Background)
                (async () => {
                    try {
                        if (popupSessionRef.current !== sessionId) return;
                        setAnalysisLoading(true);
                        setUrbanAnalysis(null);

                        // Build sanitized payload for AI (explain-only)
                        const aiPayload = {
                            zone: placeName,
                            year: y,
                            baseYear: BASE_YEAR,
                            aqi: realTimeAQI?.aqi,
                            rainfallMm: rainfall,
                            traffic: projectedTraffic,
                            floodRisk: FloodRisk,
                            peopleAffected: impact.peopleAffected,
                            economicLossCr: impact.economicLossCr
                        };

                        // Fetch analysis with sanitized payload
                        const analysis = await getUrbanAnalysis(aiPayload);

                        // Guard completion update
                        if (popupSessionRef.current !== sessionId) return;

                        // Update ContextEngine with AI result
                        if (lastRequestTimeRef.current === requestTime) {
                            setLocationData(prev => prev ? ({ ...prev, analysis: analysis || 'No analysis available.', analysisLoading: false }) : null);
                            setUrbanAnalysis(analysis || 'No analysis available.');
                            setAnalysisLoading(false);
                        }
                    } catch (err) {
                        if (lastRequestTimeRef.current === requestTime && popupSessionRef.current === sessionId) {
                            console.error('AI Analysis Failed', err);
                            setUrbanAnalysis(null);
                            setAnalysisLoading(false);
                            setLocationData(prev => prev ? ({ ...prev, analysis: null, analysisLoading: false }) : null);
                        }
                    } finally {
                        if (lastRequestTimeRef.current === requestTime && popupSessionRef.current === sessionId) {
                            setAnalysisLoading(false);
                        }
                    }
                })();

            } catch (fatalError) {
                console.error('Fatal error in handleMapClick:', fatalError);
                setLocationData(prev => prev ? ({ ...prev, placeName: 'Error', analysis: 'Failed to load details', analysisLoading: false }) : null);
            }
        };

        map.on("click", handleMapClick);
        loadMapData();

        // Cleanup function
        return () => {
            isMounted = false;

            if (floodAnimRef.current) {
                cancelAnimationFrame(floodAnimRef.current);
                floodAnimRef.current = null;
            }

            flyThroughTimeoutsRef.current.forEach(clearTimeout);
            flyThroughTimeoutsRef.current = [];

            if (popupRef.current) {
                popupRef.current.remove();
                popupRef.current = null;
            }

            if (mapRef.current) {
                map.off("click", handleMapClick);
                map.remove();
                mapRef.current = null;
            }
        };
    }, []);

    // Expose saveLocation for popup buttons (local storage only, no backend)
    useEffect(() => {
        window.saveLocation = async (name, lat, lng) => {
            try {
                // Save to local storage only
                const savedLocations = JSON.parse(localStorage.getItem('savedLocations') || '[]');
                savedLocations.push({ name: name || 'Pinned Location', lat, lng, timestamp: Date.now() });
                localStorage.setItem('savedLocations', JSON.stringify(savedLocations));

                alert('Location saved locally');
                // Add marker immediately
                if (mapRef.current) {
                    const m = new maplibregl.Marker({ color: '#f59e0b' }).setLngLat([lng, lat]).addTo(mapRef.current);
                }
                return true;
            } catch (err) {
                console.error('saveLocation error', err);
                alert('Could not save location');
                return false;
            }
        };

        return () => { delete window.saveLocation; };
    }, []);


    /* ================= YEAR SYNC ================= */
    useEffect(() => {
        yearRef.current = year;
    }, [year]);

    /* ================= REFRESH AQI DATA PERIODICALLY ================= */
    useEffect(() => {
        if (!mapRef.current || !OPENWEATHER_KEY || !layers.aqi) return;

        const refreshAQIData = async () => {
            const aqiData = await fetchAllCitiesAQI();
            if (aqiData && aqiData.features?.length > 0 && mapRef.current) {
                const aqiSource = mapRef.current.getSource("aqi");
                if (aqiSource) {
                    aqiSource.setData(aqiData);
                    setAqiGeo(aqiData);
                }
            }
        };

        // Refresh immediately and then every 5 minutes (300000 ms)
        refreshAQIData();
        const interval = setInterval(refreshAQIData, 300000);

        return () => clearInterval(interval);
    }, [layers.aqi, fetchAllCitiesAQI]);

    /* ================= AQI LAYER HOVER SYNC ================= */
    useEffect(() => {
        if (!mapRef.current || !layers.aqi || loading) return;

        const map = mapRef.current;
        if (!map.getLayer("aqi-layer")) return;

        let hoverTimeout;

        const debouncedHoverUpdate = (e) => {
            clearTimeout(hoverTimeout);
            hoverTimeout = setTimeout(() => {
                if (!map.getLayer("aqi-layer") || !e.features || e.features.length === 0) return;

                const feature = e.features[0];
                const props = feature.properties;
                const coords = e.lngLat;

                // Update popup with hover data (if popup is open)
                if (popupRef.current && popupRef.current.isOpen() && popupRootRef.current) {
                    try {
                        const hoverAQI = {
                            aqi: props.aqi,
                            pm25: props.pm25 ?? null,
                            pm10: props.pm10 ?? null
                        };

                        popupRootRef.current.render(
                            <LocationPopup
                                placeName={props.city || "Hover Location"}
                                lat={coords.lat}
                                lng={coords.lng}
                                year={yearRef.current}
                                baseYear={BASE_YEAR}
                                realTimeAQI={hoverAQI}
                                finalAQI={props.aqi}
                                rainfall={0}
                                rainProbability={null}
                                macroData={macroDataRef.current}
                                impact={null}
                                demographics={null}
                                analysis={null}
                                analysisLoading={false}
                                openWeatherKey={OPENWEATHER_KEY}
                                onSave={null}
                            />
                        );
                    } catch (err) {
                        console.warn("Hover update failed:", err);
                    }
                }

                // Change cursor on hover
                map.getCanvas().style.cursor = "pointer";
            }, 120);
        };

        const handleMouseLeave = () => {
            clearTimeout(hoverTimeout);
            map.getCanvas().style.cursor = "";
        };

        map.on("mousemove", "aqi-layer", debouncedHoverUpdate);
        map.on("mouseleave", "aqi-layer", handleMouseLeave);

        return () => {
            clearTimeout(hoverTimeout);
            map.off("mousemove", "aqi-layer", debouncedHoverUpdate);
            map.off("mouseleave", "aqi-layer", handleMouseLeave);
        };
    }, [layers.aqi, loading]);

    /* ================= FLOOD DEPTH ANIMATION ================= */
    useEffect(() => {
        if (!mapRef.current) return;

        const map = mapRef.current;
        const floodSource = map.getSource("flood-depth");

        if (!floodSource) return;

        // Cancel any ongoing animation
        if (floodAnimRef.current) {
            cancelAnimationFrame(floodAnimRef.current);
            floodAnimRef.current = null;
        }

        // Reset flood depth when disabled
        if (!floodMode || !layers.floodDepth) {
            floodDepthRef.current = FLOOD_ANIMATION_CONFIG.resetDepth;
            floodFrameRef.current = 0;
            floodSource.setData({
                type: "FeatureCollection",
                features: []
            });
            return;
        }

        // Calculate max depth based on year and rainfall
        const yearsElapsed = year - BASE_YEAR;
        const timeFactor = yearsElapsed / (MAX_YEAR - BASE_YEAR);
        const rainAmplifier = Math.min(rainfallRef.current / 15, 1); // mm-based
        const maxDepth = 3 * (
            timeFactor +
            FLOOD_ANIMATION_CONFIG.baseDepthMultiplier +
            rainAmplifier * 0.6
        );

        // Reset depth when toggling on or year changes significantly
        if (floodDepthRef.current >= maxDepth) {
            floodDepthRef.current = FLOOD_ANIMATION_CONFIG.resetDepth;
        }

        const animateFlood = () => {
            if (!mapRef.current || !floodSource) return;

            const currentDepth = Math.min(
                floodDepthRef.current + FLOOD_ANIMATION_CONFIG.depthIncrement,
                maxDepth
            );
            floodDepthRef.current = currentDepth;

            floodSource.setData({
                type: "FeatureCollection",
                features: [
                    {
                        type: "Feature",
                        properties: { depth: floodDepthRef.current },
                        geometry: {
                            type: "Polygon",
                            coordinates: [[
                                [77.16, 28.56],
                                [77.32, 28.56],
                                [77.32, 28.70],
                                [77.16, 28.70],
                                [77.16, 28.56]
                            ]]
                        }
                    }
                ]
            });

            if (floodDepthRef.current >= maxDepth && floodAnimRef.current) {
                window.clearInterval(floodAnimRef.current);
                floodAnimRef.current = null;
            }
        };

        // Start animation loop at a stable cadence
        animateFlood();
        floodAnimRef.current = window.setInterval(() => {
            if (floodDepthRef.current < maxDepth) {
                animateFlood();
            }
        }, 200);

        // Cleanup on unmount or dependency change
        return () => {
            if (floodAnimRef.current) {
                window.clearInterval(floodAnimRef.current);
                floodAnimRef.current = null;
            }
        };
    }, [floodMode, year, layers.floodDepth]);

    /* ================= MAP STYLE SWITCHING ================= */
    const styleRef = useRef(null);
    const isInitialLoad = useRef(true);

    useEffect(() => {
        if (!mapRef.current || loading) return;
        const map = mapRef.current;

        // On initial load, just set the ref and skip style change
        if (isInitialLoad.current) {
            styleRef.current = mapStyle;
            isInitialLoad.current = false;
            return;
        }

        // Don't switch if already on this style
        if (styleRef.current === mapStyle) return;

        const styleUrls = {
            default: "https://api.maptiler.com/maps/streets-v2/style.json?key=UQBNCVHquLf1PybiywBt",
            satellite: "https://api.maptiler.com/maps/hybrid/style.json?key=UQBNCVHquLf1PybiywBt",
            terrain: "https://api.maptiler.com/maps/topo-v2/style.json?key=UQBNCVHquLf1PybiywBt"
        };

        const targetStyle = styleUrls[mapStyle];
        if (!targetStyle) return;

        styleRef.current = mapStyle;
        map.setStyle(targetStyle);

        // Re-add layers after style change
        map.once("style.load", () => {
            map.once("idle", () => {
                // Re-add terrain if needed
                if (mapStyle === "terrain" || mapStyle === "satellite") {
                    try {
                        map.addSource("terrain", {
                            type: "raster-dem",
                            url: "https://api.maptiler.com/tiles/terrain-rgb/tiles.json?key=UQBNCVHquLf1PybiywBt",
                            tileSize: 256
                        });
                        map.setTerrain({ source: "terrain", exaggeration: 1.0 });
                    } catch (err) {
                        console.error("Error adding terrain:", err);
                    }
                }

                // Force recreate traffic layer for all style changes to ensure it's visible
                ensureTrafficLayer(map, layers.traffic, true);

                // Re-add AQI layer if we have cached geo data
                if (aqiGeo) {
                    try {
                        if (!map.getSource("aqi")) {
                            map.addSource("aqi", { type: "geojson", data: aqiGeo });
                            map.addLayer({
                                id: "aqi-layer",
                                type: "circle",
                                source: "aqi",
                                paint: {
                                    "circle-radius": 12,
                                    "circle-opacity": 0.9,
                                    "circle-stroke-width": 2,
                                    "circle-stroke-color": "#ffffff",
                                    "circle-stroke-opacity": 0.8,
                                    "circle-color": [
                                        "interpolate",
                                        ["linear"],
                                        ["get", "aqi"],
                                        0, "#22c55e",
                                        50, "#22c55e",
                                        100, "#eab308",
                                        150, "#f97316",
                                        200, "#dc2626",
                                        300, "#9333ea",
                                        400, "#6b21a8"
                                    ]
                                },
                                layout: {
                                    visibility: layers.aqi ? "visible" : "none"
                                }
                            });
                        } else {
                            map.setLayoutProperty("aqi-layer", "visibility", layers.aqi ? "visible" : "none");
                        }
                    } catch (err) {
                        console.error("Error re-adding AQI layer:", err);
                    }
                }

                // Re-add other custom layers if needed
                if (facilityData) {
                    try {
                        if (facilityData.hospitals && !map.getSource("hospitals")) {
                            map.addSource("hospitals", {
                                type: "geojson", data: {
                                    type: "FeatureCollection",
                                    features: facilityData.hospitals.map(h => ({
                                        type: "Feature",
                                        properties: h,
                                        geometry: { type: "Point", coordinates: [h.lng, h.lat] }
                                    }))
                                }
                            });
                            map.addLayer({
                                id: "hospitals-layer",
                                type: "circle",
                                source: "hospitals",
                                paint: {
                                    "circle-radius": 8,
                                    "circle-color": "#06b6d4",
                                    "circle-stroke-width": 2,
                                    "circle-stroke-color": "#ffffff",
                                    "circle-opacity": 0.9
                                },
                                layout: {
                                    visibility: layers.hospitals ? "visible" : "none"
                                }
                            });
                        }

                        if (facilityData.policeStations && !map.getSource("policeStations")) {
                            map.addSource("policeStations", {
                                type: "geojson", data: {
                                    type: "FeatureCollection",
                                    features: facilityData.policeStations.map(p => ({
                                        type: "Feature",
                                        properties: p,
                                        geometry: { type: "Point", coordinates: [p.lng, p.lat] }
                                    }))
                                }
                            });
                            map.addLayer({
                                id: "police-layer",
                                type: "circle",
                                source: "policeStations",
                                paint: {
                                    "circle-radius": 8,
                                    "circle-color": "#8b5cf6",
                                    "circle-stroke-width": 2,
                                    "circle-stroke-color": "#ffffff",
                                    "circle-opacity": 0.9
                                },
                                layout: {
                                    visibility: layers.policeStations ? "visible" : "none"
                                }
                            });
                        }

                        if (facilityData.fireStations && !map.getSource("fireStations")) {
                            map.addSource("fireStations", {
                                type: "geojson", data: {
                                    type: "FeatureCollection",
                                    features: facilityData.fireStations.map(f => ({
                                        type: "Feature",
                                        properties: f,
                                        geometry: { type: "Point", coordinates: [f.lng, f.lat] }
                                    }))
                                }
                            });
                            map.addLayer({
                                id: "fire-layer",
                                type: "circle",
                                source: "fireStations",
                                paint: {
                                    "circle-radius": 8,
                                    "circle-color": "#f97316",
                                    "circle-stroke-width": 2,
                                    "circle-stroke-color": "#ffffff",
                                    "circle-opacity": 0.9
                                },
                                layout: {
                                    visibility: layers.fireStations ? "visible" : "none"
                                }
                            });
                        }

                        ensureFacilityCoverageLayer(map);
                    } catch (err) {
                        console.error("Error re-adding facility layers:", err);
                    }
                }

                ensureFloodLayers(map);
            });
        });
    }, [mapStyle, loading, layers.traffic, layers.aqi, aqiGeo, facilityData, layers.hospitals, layers.policeStations, layers.fireStations, ensureTrafficLayer]);

    /* ================= LAYER TOGGLES ================= */
    useEffect(() => {
        if (!mapRef.current || loading) return;
        const map = mapRef.current;

        const toggle = (id, visible) => {
            try {
                if (map.getLayer(id)) {
                    map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
                }
            } catch (err) {
                console.warn(`Error toggling layer ${id}:`, err);
            }
        };

        // Handle each layer with robust error handling
        toggle("aqi-layer", layers.aqi);
        toggle("flood-layer", layers.flood);
        toggle("flood-depth-layer", layers.floodDepth);
        toggle("hospitals-layer", layers.hospitals);
        toggle("police-layer", layers.policeStations);
        toggle("fire-layer", layers.fireStations);

        // Traffic layer has special handling to ensure it always works
        ensureTrafficLayer(map, layers.traffic);
    }, [layers, loading, ensureTrafficLayer]);

    /* ================= ADD FACILITY LAYERS ================= */
    useEffect(() => {
        if (!mapRef.current || !facilityData || loading) return;

        const map = mapRef.current;

        // Add facility layers
        if (facilityData.hospitals) {
            if (!map.getSource("hospitals")) {
                map.addSource("hospitals", {
                    type: "geojson", data: {
                        type: "FeatureCollection",
                        features: facilityData.hospitals.map(h => ({
                            type: "Feature",
                            properties: h,
                            geometry: { type: "Point", coordinates: [h.lng, h.lat] }
                        }))
                    }
                });
            }
            if (!map.getLayer("hospitals-layer")) {
                map.addLayer({
                    id: "hospitals-layer",
                    type: "circle",
                    source: "hospitals",
                    paint: {
                        "circle-radius": 8,
                        "circle-color": "#06b6d4",
                        "circle-stroke-width": 2,
                        "circle-stroke-color": "#ffffff",
                        "circle-opacity": 0.9
                    }
                });
            }
        }

        if (facilityData.policeStations) {
            if (!map.getSource("policeStations")) {
                map.addSource("policeStations", {
                    type: "geojson", data: {
                        type: "FeatureCollection",
                        features: facilityData.policeStations.map(p => ({
                            type: "Feature",
                            properties: p,
                            geometry: { type: "Point", coordinates: [p.lng, p.lat] }
                        }))
                    }
                });
            }
            if (!map.getLayer("police-layer")) {
                map.addLayer({
                    id: "police-layer",
                    type: "circle",
                    source: "policeStations",
                    paint: {
                        "circle-radius": 8,
                        "circle-color": "#8b5cf6",
                        "circle-stroke-width": 2,
                        "circle-stroke-color": "#ffffff",
                        "circle-opacity": 0.9
                    }
                });
            }
        }

        if (facilityData.fireStations) {
            if (!map.getSource("fireStations")) {
                map.addSource("fireStations", {
                    type: "geojson", data: {
                        type: "FeatureCollection",
                        features: facilityData.fireStations.map(f => ({
                            type: "Feature",
                            properties: f,
                            geometry: { type: "Point", coordinates: [f.lng, f.lat] }
                        }))
                    }
                });
            }
            if (!map.getLayer("fire-layer")) {
                map.addLayer({
                    id: "fire-layer",
                    type: "circle",
                    source: "fireStations",
                    paint: {
                        "circle-radius": 8,
                        "circle-color": "#f97316",
                        "circle-stroke-width": 2,
                        "circle-stroke-color": "#ffffff",
                        "circle-opacity": 0.9
                    }
                });
            }
        }


        // Add hover interactions for facility layers
        const facilityLayersList = ["hospitals-layer", "police-layer", "fire-layer"];

        const handleFacilityMouseMove = (e) => {
            map.getCanvas().style.cursor = 'pointer';
            if (e.features && e.features.length > 0) {
                const feature = e.features[0];
                setHoveredFacility({
                    ...feature.properties,
                    x: e.originalEvent.clientX,
                    y: e.originalEvent.clientY
                });
            }
        };

        const handleFacilityMouseLeave = () => {
            map.getCanvas().style.cursor = '';
            setHoveredFacility(null);
        };

        facilityLayersList.forEach(layerId => {
            if (!map.getLayer(layerId)) return;
            map.on('mousemove', layerId, handleFacilityMouseMove);
            map.on('mouseleave', layerId, handleFacilityMouseLeave);
        });

        // Add coverage visualization layer
        ensureFacilityCoverageLayer(map);

        return () => {
            const facilityLayersList = ["hospitals-layer", "police-layer", "fire-layer"];
            facilityLayersList.forEach(layerId => {
                if (!map.getLayer(layerId)) return;
                map.off('mousemove', layerId, handleFacilityMouseMove);
                map.off('mouseleave', layerId, handleFacilityMouseLeave);
            });
        };
    }, [facilityData, loading]);

    /* ================= FACILITY COVERAGE VISUALIZATION ================= */
    useEffect(() => {
        if (!mapRef.current || !facilityData) return;

        const map = mapRef.current;
        const coverageSource = map.getSource("facility-coverage");

        if (!coverageSource) return;

        const canvas = coverageSource.canvas;
        const ctx = canvas.getContext('2d');
        let intervalId = null;

        const renderCoverage = () => {
            // Clear canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            if (!layers.hospitals && !layers.policeStations && !layers.fireStations) {
                coverageSource.setCoordinates(coverageSource.coordinates);
                return;
            }

            // Get active facilities
            const activeFacilities = [];
            if (layers.hospitals) activeFacilities.push(...facilityData.hospitals.map(f => ({ ...f, type: 'hospital', color: '#06b6d4' })));
            if (layers.policeStations) activeFacilities.push(...facilityData.policeStations.map(f => ({ ...f, type: 'police', color: '#8b5cf6' })));
            if (layers.fireStations) activeFacilities.push(...facilityData.fireStations.map(f => ({ ...f, type: 'fire', color: '#f97316' })));

            const bounds = map.getBounds();
            const latRange = bounds.getNorth() - bounds.getSouth();
            const lngRange = bounds.getEast() - bounds.getWest();

            const latToY = (lat) => ((bounds.getNorth() - lat) / latRange) * canvas.height;
            const lngToX = (lng) => ((lng - bounds.getWest()) / lngRange) * canvas.width;

            // Calculate pulse based on time
            const now = performance.now();
            const pulsePhase = (Math.sin(now / 800) + 1) / 2;
            const pulseScale = 1 + (pulsePhase * 0.15);
            const pulseOpacity = 0.8 + (pulsePhase * 0.2);

            // Draw coverage rings
            activeFacilities.forEach(facility => {
                const x = lngToX(facility.lng);
                const y = latToY(facility.lat);

                if (facilityViewMode === 'coverage') {
                    const baseRadii = [facility.coverageRadius * 20, facility.coverageRadius * 40, facility.coverageRadius * 60];

                    baseRadii.forEach((baseRadius, index) => {
                        const radius = index === 0 ? baseRadius : baseRadius * (index === 2 ? pulseScale : 1 + (pulsePhase * 0.05));
                        if (radius <= 0) return;

                        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
                        const rawOpacity = index === 0 ? 0.8 : index === 1 ? 0.4 : 0.15;
                        const opacity = rawOpacity * (index > 0 ? pulseOpacity : 1);

                        const alphaHex = Math.round(opacity * 255).toString(16).padStart(2, '0');
                        gradient.addColorStop(0, facility.color + alphaHex);
                        gradient.addColorStop(0.7, facility.color + Math.round(opacity * 0.5 * 255).toString(16).padStart(2, '0'));
                        gradient.addColorStop(1, facility.color + '00');

                        ctx.beginPath();
                        ctx.arc(x, y, radius, 0, 2 * Math.PI);
                        ctx.fillStyle = gradient;
                        ctx.fill();
                    });
                }
            });

            coverageSource.setCoordinates(coverageSource.coordinates);
        };

        const updateCoverage = () => {
            renderCoverage();
        };

        const shouldAnimate = layers.hospitals || layers.policeStations || layers.fireStations;
        if (shouldAnimate) {
            renderCoverage();
            map.on('move', updateCoverage);
            map.on('zoom', updateCoverage);
        }

        return () => {
            map.off('move', updateCoverage);
            map.off('zoom', updateCoverage);
        };
    }, [layers, facilityData, facilityViewMode]);

    /* ================= CINEMATIC CAMERA ================= */
    const flyToPoint = useCallback((lng, lat, zoom = 14, pitch = 65, bearing = 0) => {
        if (!mapRef.current) return;

        mapRef.current.flyTo({
            center: [lng, lat],
            zoom,
            pitch,
            bearing,
            speed: 0.6,
            curve: 1.8,
            essential: true
        });
    }, []);

    /* ================= HANDLE LOCATION SEARCH ================= */
    const handleLocationSelect = useCallback((lng, lat, placeName) => {
        if (!mapRef.current || !popupRef.current) return;

        const sessionId = ++popupSessionRef.current;

        // Fly to the selected location
        if (mapRef.current) {
            mapRef.current.flyTo({
                center: [lng, lat],
                zoom: 14,
                pitch: 65,
                bearing: mapRef.current.getBearing(),
                speed: 0.6,
                curve: 1.8,
                essential: true
            });
        }

        try {
            // Clean up any previous root
            if (popupRootRef.current) {
                popupRootRef.current.unmount();
                popupRootRef.current = null;
            }

            const container = document.createElement("div");
            container.className = 'custom-popup';

            popupRef.current.setLngLat([lng, lat]).setDOMContent(container).addTo(mapRef.current);

            const root = createRoot(container);
            popupRootRef.current = root;

            root.render(
                <LocationPopup
                    placeName={placeName}
                    lat={lat}
                    lng={lng}
                    year={yearRef.current}
                    baseYear={BASE_YEAR}
                    realTimeAQI={null}
                    finalAQI={null}
                    rainfall={0}
                    rainProbability={null}
                    macroData={macroDataRef.current}
                    impact={null}
                    demographics={null}
                    analysis={null}
                    analysisLoading={false}
                    openWeatherKey={OPENWEATHER_KEY}
                    onSave={(name) => { if (window.saveLocation) window.saveLocation(name, lat, lng); }}
                />
            );

            // Set activeLocation so year slider updates work
            setActiveLocation({
                lat,
                lng,
                placeName,
                baseAQI: IMPACT_MODEL.baseAQI,
                baseRainfall: 0,
                baseTraffic: IMPACT_MODEL.baseTraffic,
                baseFloodRisk: IMPACT_MODEL.baseFloodRisk,
                worldBank: macroDataRef.current,
                sessionId
            });
        } catch (e) {
            console.warn("Search popup render skipped:", e);
        }
    }, []);

    /* ================= MOUSE CAMERA CONTROLS ================= */
    // Intercept right-click drag for custom rotation/tilt control
    useEffect(() => {
        if (!mapRef.current || !mapContainer.current || loading) return;

        const map = mapRef.current;
        const container = mapContainer.current;
        let isRightClickDragging = false;
        let startPos = { x: 0, y: 0, bearing: 0, pitch: 0 };

        const handleRightMouseDown = (e) => {
            if (e.button === 2) { // Right mouse button
                e.preventDefault();
                e.stopPropagation();
                isRightClickDragging = true;
                startPos = {
                    x: e.clientX,
                    y: e.clientY,
                    bearing: map.getBearing(),
                    pitch: map.getPitch()
                };
                container.style.cursor = 'grabbing';

                // Disable MapLibre's default right-click rotation if available
                if (map.dragRotate && typeof map.dragRotate.disable === 'function') {
                    map.dragRotate.disable();
                }
            }
        };

        let rightClickRaf = null;
        let pendingCamera = null;

        const handleMouseMove = (e) => {
            if (isRightClickDragging && mapRef.current) {
                e.preventDefault();
                const deltaX = e.clientX - startPos.x;
                const deltaY = e.clientY - startPos.y;

                const bearingSensitivity = 0.5;
                const newBearing = startPos.bearing + (deltaX * bearingSensitivity);
                const pitchSensitivity = 0.3;
                const newPitch = Math.max(0, Math.min(85, startPos.pitch - (deltaY * pitchSensitivity)));

                pendingCamera = { bearing: newBearing, pitch: newPitch };
                if (!rightClickRaf) {
                    rightClickRaf = requestAnimationFrame(() => {
                        if (mapRef.current && pendingCamera) {
                            mapRef.current.easeTo({
                                bearing: pendingCamera.bearing,
                                pitch: pendingCamera.pitch,
                                duration: 0,
                                essential: true
                            });
                            cameraStateRef.current = pendingCamera;
                        }
                        rightClickRaf = null;
                    });
                }
            }
        };

        const handleContextMenu = (e) => {
            if (isRightClickDragging) {
                e.preventDefault();
            }
        };

        const handleMouseUp = (e) => {
            if (isRightClickDragging && e.button === 2) {
                e.preventDefault();
                e.stopPropagation();
                isRightClickDragging = false;
                container.style.cursor = '';
                setCameraState(cameraStateRef.current);
                if (rightClickRaf) {
                    cancelAnimationFrame(rightClickRaf);
                    rightClickRaf = null;
                }
                if (mapRef.current && mapRef.current.dragRotate && typeof mapRef.current.dragRotate.enable === 'function') {
                    mapRef.current.dragRotate.enable();
                }
            }
        };

        container.addEventListener('mousedown', handleRightMouseDown);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        container.addEventListener('contextmenu', handleContextMenu); // Prevent context menu

        return () => {
            container.removeEventListener('mousedown', handleRightMouseDown);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            if (mapRef.current && mapRef.current.dragRotate && typeof mapRef.current.dragRotate.enable === 'function') {
                mapRef.current.dragRotate.enable();
            }
        };
    }, [loading]);


    const resetCamera = useCallback(() => {
        if (!mapRef.current) return;
        mapRef.current.flyTo({
            center: MAP_CONFIG.center,
            zoom: MAP_CONFIG.zoom,
            pitch: MAP_CONFIG.pitch,
            bearing: MAP_CONFIG.bearing,
            speed: 0.8,
            curve: 1.5
        });
        setCameraState({
            bearing: MAP_CONFIG.bearing,
            pitch: MAP_CONFIG.pitch
        });
    }, []);

    // Update camera state when map moves (for display purposes)
    useEffect(() => {
        if (!mapRef.current) return;
        const map = mapRef.current;

        const updateCameraState = () => {
            if (cameraRafIdRef.current) return;
            cameraRafIdRef.current = requestAnimationFrame(() => {
                setCameraState({
                    bearing: Math.round(map.getBearing()),
                    pitch: Math.round(map.getPitch())
                });
                cameraRafIdRef.current = null;
            });
        };

        map.on("rotate", updateCameraState);
        map.on("pitch", updateCameraState);

        return () => {
            if (cameraRafIdRef.current) {
                cancelAnimationFrame(cameraRafIdRef.current);
                cameraRafIdRef.current = null;
            }
            map.off("rotate", updateCameraState);
            map.off("pitch", updateCameraState);
        };
    }, []);

    const startCityFlyThrough = useCallback(() => {
        if (!mapRef.current) return;

        // Clear any existing fly-through timeouts
        flyThroughTimeoutsRef.current.forEach(clearTimeout);
        flyThroughTimeoutsRef.current = [];

        const tour = [
            { lng: 77.2090, lat: 28.6139, zoom: 13, bearing: -20 },
            { lng: 77.2200, lat: 28.6300, zoom: 15, bearing: 60 },
            { lng: 77.2300, lat: 28.6500, zoom: 14, bearing: 140 },
            { lng: 77.2000, lat: 28.6200, zoom: 16, bearing: 220 },
            { lng: 77.1850, lat: 28.6000, zoom: 13, bearing: 320 }
        ];

        let i = 0;

        const flyNext = () => {
            if (i >= tour.length || !mapRef.current) {
                flyThroughTimeoutsRef.current = [];
                return;
            }
            const p = tour[i];
            flyToPoint(p.lng, p.lat, p.zoom, 65, p.bearing);
            i++;
            const timeout = setTimeout(flyNext, 4500);
            flyThroughTimeoutsRef.current.push(timeout);
        };

        flyNext();
    }, [flyToPoint]);

    const toggleFloodMode = useCallback(() => {
        setFloodMode((prev) => {
            const newFloodMode = !prev;
            if (newFloodMode && !layers.floodDepth) {
                // Enable flood depth layer when starting flood mode
                setLayers((prevLayers) => ({ ...prevLayers, floodDepth: true }));
            }
            return newFloodMode;
        });
    }, [layers.floodDepth]);

    // Close layers menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (showLayersMenu && !e.target.closest('[data-layers-menu]')) {
                setShowLayersMenu(false);
            }
        };
        document.addEventListener("click", handleClickOutside);
        return () => document.removeEventListener("click", handleClickOutside);
    }, [showLayersMenu]);

    return (
        <>
            {/* Loading Overlay */}
            {loading && (
                <div
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: "rgba(2, 6, 23, 0.9)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 1000,
                        color: "#fff",
                        fontSize: 18,
                        backdropFilter: "blur(8px)"
                    }}
                >
                    <div style={{ textAlign: "center" }}>
                        <div style={{ marginBottom: 12, fontSize: 32 }}>🗺️</div>
                        <div>Loading map data...</div>
                    </div>
                </div>
            )}

            {/* Error Message */}
            {error && (
                <div
                    style={{
                        position: "absolute",
                        top: 120,
                        right: 20,
                        zIndex: 1000,
                        background: "rgba(220, 38, 38, 0.95)",
                        color: "#fff",
                        padding: "12px 18px",
                        borderRadius: 8,
                        maxWidth: 300,
                        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                        backdropFilter: "blur(8px)"
                    }}
                >
                    <strong>⚠️ Error:</strong> {error}
                    <button
                        onClick={() => setError(null)}
                        style={{
                            marginLeft: 12,
                            background: "rgba(255,255,255,0.2)",
                            border: "none",
                            color: "#fff",
                            padding: "4px 8px",
                            borderRadius: 4,
                            cursor: "pointer"
                        }}
                    >
                        ✕
                    </button>
                </div>
            )}

            <MapMenu layers={layers} setLayers={setLayers} mapStyle={mapStyle} setMapStyle={setMapStyle} mapRef={mapRef} />

            {/* Terrain Intelligence Layer */}
            <TerrainController
                map={mapRef.current}
                isActive={mapStyle === "terrain"}
                year={year}
            />

            <SearchBar mapRef={mapRef} onLocationSelect={handleLocationSelect} />
            <TimeSlider
                year={year}
                setYear={setYear}
                baseYear={BASE_YEAR}
                minYear={BASE_YEAR}
                maxYear={MAX_YEAR}
            />


            {/* === PREMIUM GLASSMORPHISM LAYER BAR - Bottom Left === */}
            <div style={{ position: "absolute", bottom: 20, left: 20, zIndex: 20 }}>

                {/* Facility Check Sub-Panel (slides up above bar) */}
                <div
                    style={{
                        position: "absolute",
                        bottom: "calc(100% + 12px)",
                        left: 0,
                        width: 272,
                        background: "rgba(8, 12, 28, 0.88)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        backdropFilter: "blur(12px)",
                        WebkitBackdropFilter: "blur(12px)",
                        borderRadius: 16,
                        boxShadow: "0 12px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.07)",
                        padding: "16px",
                        pointerEvents: facilityCheckOpen ? "all" : "none",
                        opacity: facilityCheckOpen ? 1 : 0,
                        transform: facilityCheckOpen ? "translateY(0px)" : "translateY(10px)",
                        transition: "opacity 220ms ease, transform 220ms ease",
                        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Panel Header */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 16 }}>🏥</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9", letterSpacing: "-0.2px" }}>Facility Check</span>
                        </div>
                        <span style={{ fontSize: 10, color: "#64748b", fontFamily: "monospace", background: "rgba(255,255,255,0.06)", padding: "2px 6px", borderRadius: 4 }}>F</span>
                    </div>

                    {/* Facility Toggles */}
                    <div style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: "#64748b", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 8 }}>Layers</div>
                        {[
                            { key: "hospitals", label: "Hospitals", icon: "🏥", color: "#06b6d4" },
                            { key: "policeStations", label: "Police Stations", icon: "🚔", color: "#8b5cf6" },
                            { key: "fireStations", label: "Fire Stations", icon: "🔥", color: "#f97316" },
                        ].map(({ key, label, icon, color }) => {
                            const active = layers[key];
                            return (
                                <button
                                    key={key}
                                    onClick={() => setLayers(prev => ({ ...prev, [key]: !prev[key] }))}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 10,
                                        width: "100%",
                                        padding: "8px 10px",
                                        marginBottom: 4,
                                        borderRadius: 10,
                                        border: active ? `1px solid ${color}44` : "1px solid rgba(255,255,255,0.06)",
                                        background: active ? `${color}18` : "rgba(255,255,255,0.03)",
                                        cursor: "pointer",
                                        transition: "all 180ms ease",
                                        textAlign: "left",
                                    }}
                                >
                                    <span style={{ fontSize: 15 }}>{icon}</span>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: active ? "#f1f5f9" : "#64748b", flex: 1, transition: "color 180ms" }}>{label}</span>
                                    <div style={{
                                        width: 28, height: 16, borderRadius: 8,
                                        background: active ? color : "rgba(255,255,255,0.1)",
                                        position: "relative",
                                        transition: "background 200ms ease",
                                        flexShrink: 0,
                                    }}>
                                        <div style={{
                                            position: "absolute",
                                            top: 2, left: active ? 14 : 2,
                                            width: 12, height: 12,
                                            borderRadius: "50%",
                                            background: "#fff",
                                            transition: "left 200ms ease",
                                            boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                                        }} />
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {/* Divider */}
                    <div style={{ height: 1, background: "rgba(255,255,255,0.07)", marginBottom: 12 }} />

                    {/* View Mode Pills */}
                    <div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: "#64748b", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 8 }}>View Mode</div>
                        <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: 3 }}>
                            {[
                                { key: "coverage", label: "Coverage", icon: "🎯" },
                                { key: "gap", label: "Gap", icon: "⚠️" },
                                { key: "heatmap", label: "Heatmap", icon: "🔥" },
                            ].map((mode) => (
                                <button
                                    key={mode.key}
                                    onClick={() => setFacilityViewMode(mode.key)}
                                    style={{
                                        flex: 1,
                                        padding: "6px 4px",
                                        borderRadius: 8,
                                        border: "none",
                                        background: facilityViewMode === mode.key ? "rgba(59,130,246,0.85)" : "transparent",
                                        color: facilityViewMode === mode.key ? "#fff" : "#64748b",
                                        cursor: "pointer",
                                        fontSize: 11,
                                        fontWeight: 600,
                                        transition: "all 180ms ease",
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        gap: 2,
                                        boxShadow: facilityViewMode === mode.key ? "0 2px 8px rgba(59,130,246,0.4)" : "none",
                                    }}
                                >
                                    <span>{mode.icon}</span>
                                    <span>{mode.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Main Layer Bar */}
                <div
                    style={{
                        display: "flex",
                        gap: 6,
                        background: "rgba(8, 12, 28, 0.78)",
                        border: "1px solid rgba(255,255,255,0.11)",
                        backdropFilter: "blur(12px)",
                        WebkitBackdropFilter: "blur(12px)",
                        borderRadius: 18,
                        padding: "8px",
                        boxShadow: "0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.07)",
                    }}
                >
                    {/* ── SATELLITE BUTTON ── */}
                    <button
                        onClick={() => {
                            setMapStyle(mapStyle === "satellite" ? "default" : "satellite");
                            setShowLayersMenu(false);
                            setFacilityCheckOpen(false);
                        }}
                        title="Satellite View"
                        style={{
                            width: 72, height: 76,
                            borderRadius: 12,
                            border: mapStyle === "satellite"
                                ? "2px solid #3b82f6"
                                : "1px solid rgba(255,255,255,0.08)",
                            background: mapStyle === "satellite" ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.04)",
                            cursor: "pointer",
                            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                            padding: 0,
                            transition: "all 200ms ease",
                            boxShadow: mapStyle === "satellite" ? "0 0 0 2px rgba(59,130,246,0.3), 0 0 18px rgba(59,130,246,0.25)" : "none",
                            transform: mapStyle === "satellite" ? "scale(1.02)" : "scale(1)",
                            overflow: "hidden",
                            gap: 4,
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = mapStyle === "satellite" ? "rgba(59,130,246,0.28)" : "rgba(255,255,255,0.09)"; e.currentTarget.style.transform = "scale(1.05)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = mapStyle === "satellite" ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.04)"; e.currentTarget.style.transform = mapStyle === "satellite" ? "scale(1.02)" : "scale(1)"; }}
                        onMouseDown={(e) => { e.currentTarget.style.transform = "scale(0.95)"; }}
                        onMouseUp={(e) => { e.currentTarget.style.transform = mapStyle === "satellite" ? "scale(1.02)" : "scale(1)"; }}
                    >
                        <div style={{ width: 50, height: 46, borderRadius: 8, overflow: "hidden", position: "relative", flexShrink: 0 }}>
                            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, #8b7355 0%, #6b5842 25%, #4a3d2e 50%, #8b7355 75%, #a69075 100%)" }} />
                            <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.08) 3px,rgba(0,0,0,0.08) 6px),repeating-linear-gradient(90deg,transparent,transparent 3px,rgba(0,0,0,0.08) 3px,rgba(0,0,0,0.08) 6px),radial-gradient(circle at 30% 40%,rgba(100,150,100,0.3) 0%,transparent 45%),radial-gradient(circle at 70% 65%,rgba(80,120,80,0.3) 0%,transparent 40%)" }} />
                            <div style={{ position: "absolute", top: "48%", left: "18%", width: "64%", height: 2, background: "#d4a574", transform: "rotate(15deg)", opacity: 0.8 }} />
                            <div style={{ position: "absolute", top: "28%", left: "10%", width: "80%", height: 2, background: "#d4a574", transform: "rotate(-10deg)", opacity: 0.8 }} />
                        </div>
                        <span style={{ fontSize: 10, color: mapStyle === "satellite" ? "#93c5fd" : "#94a3b8", fontWeight: 700, letterSpacing: "0.3px", fontFamily: "'Inter', sans-serif" }}>Satellite</span>
                    </button>

                    {/* ── TERRAIN BUTTON ── */}
                    <button
                        onClick={() => {
                            setMapStyle(mapStyle === "terrain" ? "default" : "terrain");
                            setShowLayersMenu(false);
                            setFacilityCheckOpen(false);
                        }}
                        title="Terrain View"
                        style={{
                            width: 72, height: 76,
                            borderRadius: 12,
                            border: mapStyle === "terrain"
                                ? "2px solid #3b82f6"
                                : "1px solid rgba(255,255,255,0.08)",
                            background: mapStyle === "terrain" ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.04)",
                            cursor: "pointer",
                            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                            padding: 0, gap: 4,
                            transition: "all 200ms ease",
                            boxShadow: mapStyle === "terrain" ? "0 0 0 2px rgba(59,130,246,0.3), 0 0 18px rgba(59,130,246,0.25)" : "none",
                            transform: mapStyle === "terrain" ? "scale(1.02)" : "scale(1)",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = mapStyle === "terrain" ? "rgba(59,130,246,0.28)" : "rgba(255,255,255,0.09)"; e.currentTarget.style.transform = "scale(1.05)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = mapStyle === "terrain" ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.04)"; e.currentTarget.style.transform = mapStyle === "terrain" ? "scale(1.02)" : "scale(1)"; }}
                        onMouseDown={(e) => { e.currentTarget.style.transform = "scale(0.95)"; }}
                        onMouseUp={(e) => { e.currentTarget.style.transform = mapStyle === "terrain" ? "scale(1.02)" : "scale(1)"; }}
                    >
                        <div style={{ width: 50, height: 46, borderRadius: 8, overflow: "hidden", position: "relative", flexShrink: 0 }}>
                            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, #d4e8d4 0%, #c0d8c0 20%, #8bb08b 40%, #6b8f6b 60%, #4a6f4a 80%, #2a4f2a 100%)" }} />
                            <svg width="50" height="46" style={{ position: "absolute", top: 0, left: 0 }}>
                                <path d="M 6 32 Q 16 20, 25 26 T 44 28" stroke="#4a6f4a" strokeWidth="1.2" fill="none" opacity="0.7" />
                                <path d="M 4 37 Q 15 28, 24 33 T 42 35" stroke="#4a6f4a" strokeWidth="1.2" fill="none" opacity="0.7" />
                                <path d="M 8 42 Q 18 36, 27 39 T 46 42" stroke="#4a6f4a" strokeWidth="1.2" fill="none" opacity="0.5" />
                            </svg>
                        </div>
                        <span style={{ fontSize: 10, color: mapStyle === "terrain" ? "#93c5fd" : "#94a3b8", fontWeight: 700, letterSpacing: "0.3px", fontFamily: "'Inter', sans-serif" }}>Terrain</span>
                    </button>

                    {/* ── TRAFFIC BUTTON ── */}
                    <div style={{ position: "relative" }}>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setLayers(prev => ({ ...prev, traffic: !prev.traffic }));
                                setShowLayersMenu(prev => !prev);
                                setFacilityCheckOpen(false);
                            }}
                            title="Traffic Layer"
                            style={{
                                width: 72, height: 76,
                                borderRadius: 12,
                                border: layers.traffic
                                    ? "2px solid #3b82f6"
                                    : "1px solid rgba(255,255,255,0.08)",
                                background: layers.traffic ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.04)",
                                cursor: "pointer",
                                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                                padding: 0, gap: 4,
                                transition: "all 200ms ease",
                                boxShadow: layers.traffic ? "0 0 0 2px rgba(59,130,246,0.3), 0 0 18px rgba(59,130,246,0.25)" : "none",
                                transform: layers.traffic ? "scale(1.02)" : "scale(1)",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = layers.traffic ? "rgba(59,130,246,0.28)" : "rgba(255,255,255,0.09)"; e.currentTarget.style.transform = "scale(1.05)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = layers.traffic ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.04)"; e.currentTarget.style.transform = layers.traffic ? "scale(1.02)" : "scale(1)"; }}
                            onMouseDown={(e) => { e.currentTarget.style.transform = "scale(0.95)"; }}
                            onMouseUp={(e) => { e.currentTarget.style.transform = layers.traffic ? "scale(1.02)" : "scale(1)"; }}
                        >
                            <div style={{ width: 50, height: 46, borderRadius: 8, background: "rgba(8,15,35,0.85)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                <svg width="36" height="36" viewBox="0 0 36 36">
                                    <line x1="18" y1="0" x2="18" y2="36" stroke="#334155" strokeWidth="3" />
                                    <line x1="0" y1="18" x2="36" y2="18" stroke="#334155" strokeWidth="3" />
                                    <line x1="18" y1="0" x2="18" y2="14" stroke="#22c55e" strokeWidth="4" strokeLinecap="round" />
                                    <line x1="18" y1="22" x2="18" y2="36" stroke="#eab308" strokeWidth="4" strokeLinecap="round" />
                                    <line x1="0" y1="18" x2="14" y2="18" stroke="#dc2626" strokeWidth="4" strokeLinecap="round" />
                                    <line x1="22" y1="18" x2="36" y2="18" stroke="#22c55e" strokeWidth="4" strokeLinecap="round" />
                                </svg>
                            </div>
                            <span style={{ fontSize: 10, color: layers.traffic ? "#93c5fd" : "#94a3b8", fontWeight: 700, letterSpacing: "0.3px", fontFamily: "'Inter', sans-serif" }}>Traffic</span>
                        </button>

                        {/* Traffic Legend Popup */}
                        {showLayersMenu && (
                            <div
                                data-layers-menu
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                    position: "absolute",
                                    bottom: "calc(100% + 10px)",
                                    left: 0,
                                    background: "rgba(8,12,28,0.92)",
                                    border: "1px solid rgba(255,255,255,0.1)",
                                    backdropFilter: "blur(12px)",
                                    WebkitBackdropFilter: "blur(12px)",
                                    padding: "12px 14px",
                                    borderRadius: 12,
                                    boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                                    minWidth: 170,
                                    zIndex: 1000,
                                    fontFamily: "'Inter', sans-serif",
                                }}
                            >
                                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10, color: "#f1f5f9", letterSpacing: "-0.2px" }}>Live Traffic</div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                    {[
                                        { color: "#22c55e", label: "Free-flowing" },
                                        { color: "#eab308", label: "Slow" },
                                        { color: "#dc2626", label: "Congested" },
                                    ].map(({ color, label }) => (
                                        <div key={label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                            <div style={{ width: 28, height: 4, background: color, borderRadius: 2 }} />
                                            <span style={{ fontSize: 12, color: "#94a3b8" }}>{label}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ── FACILITY CHECK BUTTON ── */}
                    <button
                        onClick={() => {
                            setFacilityCheckOpen(prev => !prev);
                            setShowLayersMenu(false);
                        }}
                        title="Facility Check (F)"
                        style={{
                            width: 72, height: 76,
                            borderRadius: 12,
                            border: facilityCheckOpen || (layers.hospitals || layers.policeStations || layers.fireStations)
                                ? "2px solid #06b6d4"
                                : "1px solid rgba(255,255,255,0.08)",
                            background: facilityCheckOpen || (layers.hospitals || layers.policeStations || layers.fireStations)
                                ? "rgba(6,182,212,0.15)"
                                : "rgba(255,255,255,0.04)",
                            cursor: "pointer",
                            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                            padding: 0, gap: 4,
                            transition: "all 200ms ease",
                            boxShadow: facilityCheckOpen || (layers.hospitals || layers.policeStations || layers.fireStations)
                                ? "0 0 0 2px rgba(6,182,212,0.25), 0 0 20px rgba(6,182,212,0.2)"
                                : "none",
                            transform: facilityCheckOpen ? "scale(1.02)" : "scale(1)",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = facilityCheckOpen ? "rgba(6,182,212,0.22)" : "rgba(255,255,255,0.09)"; e.currentTarget.style.transform = "scale(1.05)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = facilityCheckOpen || (layers.hospitals || layers.policeStations || layers.fireStations) ? "rgba(6,182,212,0.15)" : "rgba(255,255,255,0.04)"; e.currentTarget.style.transform = facilityCheckOpen ? "scale(1.02)" : "scale(1)"; }}
                        onMouseDown={(e) => { e.currentTarget.style.transform = "scale(0.95)"; }}
                        onMouseUp={(e) => { e.currentTarget.style.transform = facilityCheckOpen ? "scale(1.02)" : "scale(1)"; }}
                    >
                        <div style={{
                            width: 50, height: 46, borderRadius: 8,
                            background: facilityCheckOpen || (layers.hospitals || layers.policeStations || layers.fireStations) ? "rgba(6,182,212,0.14)" : "rgba(8,15,35,0.85)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            flexShrink: 0,
                            transition: "background 200ms",
                        }}>
                            <span style={{
                                fontSize: 26,
                                display: "inline-block",
                                animation: (layers.hospitals || layers.policeStations || layers.fireStations) ? "facilityPulse 2s ease-in-out infinite" : "none",
                            }}>🏥</span>
                        </div>
                        <span style={{
                            fontSize: 10,
                            color: facilityCheckOpen || (layers.hospitals || layers.policeStations || layers.fireStations) ? "#67e8f9" : "#94a3b8",
                            fontWeight: 700, letterSpacing: "0.3px",
                            fontFamily: "'Inter', sans-serif",
                        }}>Facility</span>
                    </button>
                </div>
            </div>

            {/* CSS animations for facility pulse */}
            <style>{`
                @keyframes facilityPulse {
                    0%, 100% { transform: scale(1); filter: drop-shadow(0 0 0px #06b6d4); }
                    50% { transform: scale(1.12); filter: drop-shadow(0 0 6px #06b6d400) drop-shadow(0 0 8px #06b6d4bb); }
                }
            `}</style>


            {/* Camera Controls Info - Mouse Instructions */}
            <div
                style={{
                    position: "absolute",
                    bottom: 20,
                    right: 20,
                    zIndex: 10,
                    background: "rgba(2, 6, 23, 0.85)",
                    padding: "12px 16px",
                    borderRadius: 8,
                    backdropFilter: "blur(8px)",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                    color: "#fff",
                    fontSize: 12,
                    lineHeight: 1.5,
                    maxWidth: 200
                }}
            >
                <div style={{ fontWeight: 600, marginBottom: 4 }}>🖱️ Mouse Controls</div>
                <div style={{ opacity: 0.9 }}>
                    <div>Right-click + Drag</div>
                    <div style={{ marginTop: 4, fontSize: 11, opacity: 0.8 }}>
                        Left/Right = Rotate<br />
                        Up/Down = Tilt
                    </div>
                </div>
            </div>

            {/* Control Buttons */}
            <div
                style={{
                    position: "absolute",
                    top: 20,
                    left: 620, // Moved right to avoid overlapping with search bar (200 + 400 width + 20 gap)
                    zIndex: 10,
                    display: "flex",
                    gap: 10
                }}
            >
                <button
                    onClick={startCityFlyThrough}
                    disabled={loading || !mapRef.current}
                    style={{
                        padding: "10px 16px",
                        borderRadius: 8,
                        border: "none",
                        background: loading || !mapRef.current ? "#374151" : "#020617",
                        color: "#fff",
                        cursor: loading || !mapRef.current ? "not-allowed" : "pointer",
                        fontSize: 14,
                        fontWeight: 500,
                        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                        transition: "all 0.2s",
                        opacity: loading || !mapRef.current ? 0.6 : 1
                    }}
                    onMouseEnter={(e) => {
                        if (!loading && mapRef.current) {
                            e.target.style.background = "#1e293b";
                            e.target.style.transform = "translateY(-1px)";
                        }
                    }}
                    onMouseLeave={(e) => {
                        if (!loading && mapRef.current) {
                            e.target.style.background = "#020617";
                            e.target.style.transform = "translateY(0)";
                        }
                    }}
                >
                    🎥 Fly Through City
                </button>

                <button
                    onClick={toggleFloodMode}
                    disabled={loading || !mapRef.current}
                    style={{
                        padding: "10px 16px",
                        borderRadius: 8,
                        border: "none",
                        background:
                            floodMode && layers.floodDepth
                                ? "#2563eb"
                                : loading || !mapRef.current
                                    ? "#374151"
                                    : "#020617",
                        color: "#fff",
                        cursor: loading || !mapRef.current ? "not-allowed" : "pointer",
                        fontSize: 14,
                        fontWeight: 500,
                        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                        transition: "all 0.2s",
                        opacity: loading || !mapRef.current ? 0.6 : 1
                    }}
                    onMouseEnter={(e) => {
                        if (!loading && mapRef.current) {
                            e.target.style.background =
                                floodMode && layers.floodDepth ? "#1d4ed8" : "#1e293b";
                            e.target.style.transform = "translateY(-1px)";
                        }
                    }}
                    onMouseLeave={(e) => {
                        if (!loading && mapRef.current) {
                            e.target.style.background =
                                floodMode && layers.floodDepth ? "#2563eb" : "#020617";
                            e.target.style.transform = "translateY(0)";
                        }
                    }}
                >
                    🌊 {floodMode ? "Stop" : "Start"} Flood Animation
                </button>
            </div>

            <EconomicPanel data={impactData} demographics={demographics} analysis={urbanAnalysis} analysisLoading={analysisLoading} />
            <CitySuggestions map={mapRef.current} visible={showSuggestions} />
            <FacilityStatsPanel facilityData={facilityData} layers={layers} facilityViewMode={facilityViewMode} />
            <CoordinateDisplay mapRef={mapRef} />
            <FacilityListPanel facilityData={facilityData} layers={layers} mapRef={mapRef} />
            {/* BottomLayers removed — Facility Check is now part of the bottom-left layer bar */}

            {/* Hover Tooltip for Facilities */}
            {hoveredFacility && (
                <div style={{
                    position: 'fixed',
                    left: hoveredFacility.x + 15,
                    top: hoveredFacility.y + 15,
                    background: 'rgba(15, 23, 42, 0.85)',
                    backdropFilter: 'blur(12px)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    padding: '12px 16px',
                    color: '#f8fafc',
                    zIndex: 1000,
                    pointerEvents: 'none',
                    minWidth: 180,
                    boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
                }}>
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>
                            {hoveredFacility.type === 'hospital' ? '🏥' :
                                hoveredFacility.type === 'police' ? '🚔' : '🔥'}
                        </span>
                        {hoveredFacility.name || "Facility"}
                    </div>
                    <div style={{ fontSize: 12, color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ opacity: 0.8 }}>Response Time:</span>
                            <span style={{ color: '#60a5fa', fontWeight: 600 }}>{hoveredFacility.responseTime || "5"} min</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ opacity: 0.8 }}>Coverage Radius:</span>
                            <span style={{ color: '#34d399', fontWeight: 600 }}>{hoveredFacility.coverageRadius || "2"} km</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ opacity: 0.8 }}>Available Units:</span>
                            <span style={{ color: '#fbbf24', fontWeight: 600 }}>{hoveredFacility.availableUnits || "3"}</span>
                        </div>
                    </div>
                </div>
            )}

            <div
                ref={mapContainer}
                style={{
                    width: "100%",
                    height: "100%",
                    position: "fixed",
                    top: 0,
                    left: 0
                }}
            />
        </>
    );
}
