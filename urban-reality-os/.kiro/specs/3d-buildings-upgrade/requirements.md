# Requirements Document

## Introduction

This document defines the requirements for the 3D Buildings Upgrade feature in Urban Reality OS. The upgrade enhances the city visualization from flat fill-extrusion buildings to a fully immersive 3D experience across two primary phases. Phase 1 improves the existing MapLibre pipeline with height-based color interpolation, directional sun lighting, atmospheric fog, and refined ambient occlusion. Phase 2 introduces a Three.js hybrid custom layer for GLTF/GLB landmark models synchronized with the MapLibre camera. All changes must preserve the existing flood simulation, LOD system, and performance guards already in place.

## Glossary

- **BuildingsLayerPlugin**: The existing plugin (`src/layers/BuildingsLayerPlugin.js`) that manages the `3d-buildings` fill-extrusion layer, flood simulation feature states, pulse animation, and LOD sync.
- **MapEngine**: The existing engine (`src/engines/MapEngine.js`) responsible for map initialization, style switching, lighting, and fog configuration.
- **ThreeJSBuildingRenderer**: The new Phase 2 component that registers as a MapLibre custom layer and renders Three.js GLTF/GLB models synchronized with the MapLibre camera.
- **CameraSync**: The Phase 2 utility that translates MapLibre's projection matrix into Three.js camera matrices each render frame.
- **fill-extrusion**: The MapLibre layer type used to render 3D building footprints with height.
- **feature-state**: MapLibre's per-feature mutable state mechanism used to drive flood simulation overrides (`isCritical`, `submersionRatio`, `pulsePhase`, `adjustedHeight`, `adjustedBase`).
- **LOD**: Level of Detail — the system that controls building layer visibility based on zoom and pitch thresholds.
- **MercatorCoordinate**: MapLibre's coordinate class used to project geographic lng/lat positions into the Three.js world space.
- **GLTFLoader**: The `three-stdlib` loader used to load `.gltf` and `.glb` 3D model files.
- **FOG_CONFIG**: The fog configuration object `{ range: [0.5, 10], color: '#ddeeff', 'horizon-blend': 0.1 }`.
- **SUN_LIGHT_CONFIG**: The directional light configuration `{ anchor: 'map', color: '#fffbe6', intensity: 0.55, position: [1.5, 225, 65] }`.
- **MIN_ZOOM**: The minimum zoom level (14) at which the buildings layer becomes visible.
- **HIGH_DETAIL_ZOOM**: The zoom level (16) at which full AO radius and vertical gradient are applied.

---

## Requirements

### Requirement 1: Scene Lighting and Fog (Phase 1 — MapEngine)

**User Story:** As a user, I want the city to have realistic atmospheric depth and directional sunlight, so that buildings appear immersive and visually distinct at different heights and orientations.

#### Acceptance Criteria

1. WHEN the MapLibre map style finishes loading, THE MapEngine SHALL call `map.setFog` with FOG_CONFIG.
2. WHEN the MapLibre map style finishes loading, THE MapEngine SHALL call `map.setLight` with SUN_LIGHT_CONFIG (anchor: 'map', color: '#fffbe6', intensity: 0.55, position: [1.5, 225, 65]).
3. WHEN a style switch completes and the new style has loaded, THE MapEngine SHALL re-apply FOG_CONFIG via `map.setFog`.
4. WHEN a style switch completes and the new style has loaded, THE MapEngine SHALL re-apply SUN_LIGHT_CONFIG via `map.setLight`.
5. IF `map.setFog` throws an error, THEN THE MapEngine SHALL log a warning and continue map operation without fog.
6. IF `map.setLight` throws an error, THEN THE MapEngine SHALL log a warning and continue map operation without the updated light.

---

### Requirement 2: Height-Based Building Color Interpolation (Phase 1 — BuildingsLayerPlugin)

**User Story:** As a user, I want buildings to be colored by height so that low-rise, mid-rise, high-rise, and skyscraper buildings are visually distinguishable at a glance.

#### Acceptance Criteria

1. THE BuildingsLayerPlugin SHALL configure `fill-extrusion-color` using a height-based linear interpolation expression with stops: 0m → `#1e3a5f`, 15m → `#1e3a5f`, 30m → `#2d6a9f`, 60m → `#3a82c4`, 100m → `#4a9eff`, 200m → `#e0f0ff`.
2. WHEN the `isCritical` feature state is `true`, THE BuildingsLayerPlugin SHALL override the height-based color with the existing critical pulse interpolation (`pulsePhase` → `#fecaca`/`#dc2626`/`#fecaca`).
3. WHEN the `isCritical` feature state is `false` and `submersionRatio` is set, THE BuildingsLayerPlugin SHALL apply the existing submersion color interpolation (0 → `#475569`, 1 → `#f97316`).
4. THE BuildingsLayerPlugin SHALL set `fill-extrusion-vertical-gradient` to `true` in the initial layer paint configuration.
5. THE BuildingsLayerPlugin SHALL set `fill-extrusion-ambient-occlusion-intensity` to `0.85` in the initial layer paint configuration.
6. THE BuildingsLayerPlugin SHALL set `fill-extrusion-ambient-occlusion-ground-radius` to `18` in the initial layer paint configuration.

---

### Requirement 3: LOD and Visibility Sync (Phase 1 — BuildingsLayerPlugin)

**User Story:** As a user, I want buildings to appear only when the camera is close enough and tilted, so that the map remains performant and uncluttered at low zoom levels.

#### Acceptance Criteria

1. WHEN zoom is greater than or equal to MIN_ZOOM (14) AND pitch is greater than or equal to 25 degrees, THE BuildingsLayerPlugin SHALL set the `3d-buildings` layer visibility to `'visible'`.
2. WHEN zoom is less than MIN_ZOOM OR pitch is less than 25 degrees, THE BuildingsLayerPlugin SHALL set the `3d-buildings` layer visibility to `'none'`.
3. WHEN zoom is greater than or equal to HIGH_DETAIL_ZOOM (16), THE BuildingsLayerPlugin SHALL set `fill-extrusion-ambient-occlusion-ground-radius` to `18`.
4. WHEN zoom is less than HIGH_DETAIL_ZOOM (16), THE BuildingsLayerPlugin SHALL set `fill-extrusion-ambient-occlusion-ground-radius` to `12`.
5. WHEN zoom is greater than or equal to HIGH_DETAIL_ZOOM (16), THE BuildingsLayerPlugin SHALL set `fill-extrusion-vertical-gradient` to `true`.
6. IF the `3d-buildings` layer does not exist when `_syncLODState` is called, THEN THE BuildingsLayerPlugin SHALL return without throwing an error.
7. THE BuildingsLayerPlugin SHALL apply a zoom-based opacity ramp: zoom 13.8 → 0, zoom 14.2 → 0.78, zoom 16 → 0.92.

---

### Requirement 4: Flood Simulation Backward Compatibility (Phase 1)

**User Story:** As a system operator, I want the existing flood simulation feature states to continue working correctly after the Phase 1 paint changes, so that critical infrastructure alerts and submersion visualization are not broken.

#### Acceptance Criteria

1. WHEN the `isCritical` feature state is set to `true` on a building, THE BuildingsLayerPlugin SHALL display the critical pulse color animation, overriding the height-based color.
2. WHEN the `submersionRatio` feature state is updated, THE BuildingsLayerPlugin SHALL update the building color along the submersion gradient independently of the height-based color.
3. WHEN the `adjustedHeight` feature state is set, THE BuildingsLayerPlugin SHALL use it as the primary height source for `fill-extrusion-height`, falling back to `render_height`, then `height`, then `0`.
4. WHEN the `adjustedBase` feature state is set, THE BuildingsLayerPlugin SHALL use it as the primary base source for `fill-extrusion-base`, falling back to `render_min_height`, then `min_height`, then `0`.
5. THE BuildingsLayerPlugin SHALL preserve all existing worker-based submersion update logic, throttle gates, adaptive building caps, and pulse animation behavior unchanged.

---

### Requirement 5: ThreeJSBuildingRenderer — Custom Layer Registration (Phase 2)

**User Story:** As a developer, I want a Three.js custom layer registered with MapLibre, so that GLTF landmark models can be rendered in the same 3D scene as the map.

#### Acceptance Criteria

1. THE ThreeJSBuildingRenderer SHALL expose a `customLayer` object with `id: 'threejs-buildings'`, `type: 'custom'`, and `renderingMode: '3d'`.
2. WHEN MapLibre calls `onAdd(map, gl)`, THE ThreeJSBuildingRenderer SHALL initialize a `THREE.WebGLRenderer` sharing the MapLibre WebGL context (`canvas` and `context` from the map).
3. WHEN MapLibre calls `onAdd(map, gl)`, THE ThreeJSBuildingRenderer SHALL set `renderer.autoClear` to `false`.
4. WHEN MapLibre calls `onAdd(map, gl)`, THE ThreeJSBuildingRenderer SHALL add a `THREE.DirectionalLight` (color `#fffbe6`, intensity 1.2) and a `THREE.AmbientLight` (color `#ffffff`, intensity 0.4) to the scene.
5. WHEN MapLibre calls `render(gl, matrix)` each frame, THE ThreeJSBuildingRenderer SHALL call `renderer.resetState()` before rendering to avoid corrupting MapLibre's WebGL state.
6. WHEN MapLibre calls `render(gl, matrix)` each frame, THE ThreeJSBuildingRenderer SHALL call `map.triggerRepaint()` to maintain continuous animation.

---

### Requirement 6: CameraSync — Projection Matrix Synchronization (Phase 2)

**User Story:** As a developer, I want the Three.js camera to be synchronized with the MapLibre camera every frame, so that GLTF models appear correctly positioned and oriented relative to the map.

#### Acceptance Criteria

1. WHEN `render(gl, matrix)` is called, THE CameraSync SHALL convert the MapLibre column-major `matrix` (16-element array) to a `THREE.Matrix4` using `fromArray`.
2. WHEN `render(gl, matrix)` is called, THE CameraSync SHALL assign the converted matrix to `camera.projectionMatrix`.
3. WHEN `render(gl, matrix)` is called, THE CameraSync SHALL compute and assign the inverse to `camera.projectionMatrixInverse`.
4. FOR ALL valid 16-element projection matrices, the resulting `projectionMatrix` multiplied by `projectionMatrixInverse` SHALL equal the identity matrix within floating-point tolerance (epsilon ≤ 1e-10).

---

### Requirement 7: ThreeJSBuildingRenderer — Model Management (Phase 2)

**User Story:** As a developer, I want to add, remove, and toggle GLTF landmark models on the map, so that key buildings and infrastructure can be highlighted with high-fidelity 3D models.

#### Acceptance Criteria

1. WHEN `addModel(id, gltfUrl, lngLat, options)` is called with a new `id`, THE ThreeJSBuildingRenderer SHALL load the GLTF/GLB file and add the model to the Three.js scene.
2. WHEN `addModel(id, gltfUrl, lngLat, options)` is called with an `id` that already exists in `_models`, THE ThreeJSBuildingRenderer SHALL return without adding a duplicate model to the scene.
3. WHEN a model is added, THE ThreeJSBuildingRenderer SHALL project the `lngLat` position to Mercator world space using `MercatorCoordinate.fromLngLat`.
4. WHEN a model is added, THE ThreeJSBuildingRenderer SHALL apply the Mercator scale factor (`meterInMercatorCoordinateUnits`) multiplied by `options.scale` to the model's world-space scale.
5. WHEN `options.castShadow` is `true`, THE ThreeJSBuildingRenderer SHALL set `castShadow` and `receiveShadow` to `true` on all `THREE.Mesh` children of the loaded model.
6. WHEN `removeModel(id)` is called, THE ThreeJSBuildingRenderer SHALL remove the model from the Three.js scene and delete it from `_models`.
7. WHEN `setModelVisibility(id, visible)` is called, THE ThreeJSBuildingRenderer SHALL set `model.visible` to the given boolean value.
8. WHEN the map zoom is less than 15, THE ThreeJSBuildingRenderer SHALL defer GLTF model loading until zoom reaches 15 or above.

---

### Requirement 8: ThreeJSBuildingRenderer — Error Handling (Phase 2)

**User Story:** As a system operator, I want the Three.js renderer to handle errors gracefully, so that GLTF load failures or WebGL context loss do not crash the map or break existing layers.

#### Acceptance Criteria

1. IF a GLTF/GLB file fails to load (network error or invalid file), THEN THE ThreeJSBuildingRenderer SHALL log the error and skip adding the model to the scene without throwing.
2. IF the WebGL context is lost, THEN THE ThreeJSBuildingRenderer SHALL pause the Three.js render loop by listening for the `webglcontextlost` event on the map canvas.
3. WHEN the WebGL context is restored, THE ThreeJSBuildingRenderer SHALL reinitialize the `THREE.WebGLRenderer` and reload all previously registered models.
4. WHEN a MapLibre style switch occurs, THE ThreeJSBuildingRenderer SHALL reinitialize the renderer in the `onAdd` callback and reload all models.
5. WHEN `destroy()` is called, THE ThreeJSBuildingRenderer SHALL dispose of the Three.js renderer, clear the scene, and remove all model references.

---

### Requirement 9: Security — GLTF Model URL Allowlist (Phase 2)

**User Story:** As a security engineer, I want GLTF/GLB model URLs to be validated against a trusted allowlist before loading, so that arbitrary 3D content cannot be injected into the map scene.

#### Acceptance Criteria

1. THE ThreeJSBuildingRenderer SHALL maintain a configurable allowlist of trusted URL origins for GLTF/GLB model loading.
2. WHEN `addModel` is called with a `gltfUrl` whose origin is not in the allowlist, THE ThreeJSBuildingRenderer SHALL reject the request and log a security warning without loading the file.
3. WHEN `addModel` is called with a `gltfUrl` whose origin is in the allowlist, THE ThreeJSBuildingRenderer SHALL proceed with loading the model.
4. WHERE the allowlist is empty or not configured, THE ThreeJSBuildingRenderer SHALL only permit relative URLs (same-origin assets from `public/models/`).

---

### Requirement 10: Phase 1 and Phase 2 Integration — No Regression

**User Story:** As a developer, I want Phase 1 and Phase 2 changes to integrate without breaking any existing features, so that the upgrade can be deployed safely.

#### Acceptance Criteria

1. WHEN the Phase 1 paint changes are applied, THE BuildingsLayerPlugin SHALL continue to process all existing flood simulation worker messages and apply feature-state updates correctly.
2. WHEN the ThreeJSBuildingRenderer custom layer is added to the map, THE MapEngine SHALL continue to render all existing MapLibre layers (satellite raster, space background, stars, terrain) without visual corruption.
3. WHEN the map style is switched while the ThreeJSBuildingRenderer is active, THE MapEngine SHALL re-apply fog and lighting after the style switch completes.
4. THE BuildingsLayerPlugin SHALL not introduce any new synchronous blocking operations on the main thread beyond those already present.
5. THE ThreeJSBuildingRenderer SHALL limit the Three.js scene to landmark-scale models and SHALL NOT attempt per-building GLTF rendering at city scale.
