import { useCallback } from "react";
import maplibregl from "maplibre-gl";
import { TERRAIN_SOURCE_ID } from '../../constants/mapConstants';

export function useMapInit() {
    const ensureHillshade = useCallback((map) => {
        if (!map) return;

        const addHillshadeLayer = () => {
            if (map.getLayer("terrain-hillshade")) return;
            if (!map.getSource(TERRAIN_SOURCE_ID)) return;

            try {
                map.addLayer({
                    id: "terrain-hillshade",
                    type: "hillshade",
                    source: TERRAIN_SOURCE_ID,
                    paint: {
                        "hillshade-exaggeration": 0.6,
                        "hillshade-shadow-color": "#3d3d3d",
                        "hillshade-highlight-color": "#ffffff",
                        "hillshade-accent-color": "#9c8468"
                    }
                });
            } catch (e) {
                console.warn("ensureHillshade failed:", e);
            }
        };

        if (map.getSource(TERRAIN_SOURCE_ID)) {
            addHillshadeLayer();
        } else {
            const onSourceData = (event) => {
                if (event.sourceId === TERRAIN_SOURCE_ID && event.isSourceLoaded) {
                    map.off('sourcedata', onSourceData);
                    addHillshadeLayer();
                }
            };
            map.on('sourcedata', onSourceData);
        }
    }, []);

    const add3DBuildings = useCallback((map, vectorSourceId, sourceLayer) => {
        if (!map) return;
        if (!vectorSourceId || !sourceLayer) {
            console.warn('add3DBuildings requires explicit source and layer names. Skipping 3D building creation.');
            return;
        }

        const addBuildingsLayer = () => {
            if (map.getLayer("3d-buildings")) return;
            if (!map.getSource(vectorSourceId)) return;

            try {
                map.addLayer({
                    id: "3d-buildings",
                    source: vectorSourceId,
                    "source-layer": sourceLayer,
                    type: "fill-extrusion",
                    minzoom: 14,
                    paint: {
                        "fill-extrusion-color": "#d1d1d1",
                        "fill-extrusion-height": ["coalesce", ["get", "render_height"], ["get", "height"], 12],
                        "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
                        "fill-extrusion-opacity": 0.85
                    }
                });
            } catch (e) {
                console.warn("add3DBuildings failed:", e);
            }
        };

        if (map.getSource(vectorSourceId)) {
            addBuildingsLayer();
        } else {
            const onSourceData = (event) => {
                if (event.sourceId === vectorSourceId && event.isSourceLoaded) {
                    map.off('sourcedata', onSourceData);
                    addBuildingsLayer();
                }
            };
            map.on('sourcedata', onSourceData);
        }
    }, []);

    const updateSunLighting = useCallback((map, hour = 14) => {
        if (!map) return;
        try {
            const azimuth = (hour / 24) * 360;
            const altitude = Math.max(15, 80 - Math.abs(12 - hour) * 5);
            map.setLight({
                anchor: "map",
                position: [azimuth, altitude, 80],
                intensity: 0.8,
                color: "#ffffff"
            });
        } catch (e) { }
    }, []);

    const rehydrateCustomLayers = useCallback((map, layers) => {
        if (!map) return;
        try {
            // Restore Terrain
            if (map.getSource(TERRAIN_SOURCE_ID)) {
                map.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration: 1.4 });
            }

            ensureHillshade(map);
            add3DBuildings(map, 'openmaptiles', 'building');

            // Re-apply visibility based on state
            if (map.getLayer("terrain-hillshade")) {
                map.setLayoutProperty("terrain-hillshade", "visibility", layers.hillshade ? "visible" : "none");
            }
            if (map.getLayer("3d-buildings")) {
                map.setLayoutProperty("3d-buildings", "visibility", map.getZoom() > 14 ? "visible" : "none");
            }

            map.setFog({
                range: [0.6, 10],
                color: "#dbe7f3",
                "horizon-blend": 0.2
            });

            updateSunLighting(map, 16);
        } catch (e) {
            console.warn("rehydrateCustomLayers failed:", e);
        }
    }, [ensureHillshade, add3DBuildings, updateSunLighting]);

    return {
        ensureHillshade,
        add3DBuildings,
        updateSunLighting,
        rehydrateCustomLayers
    };
}
