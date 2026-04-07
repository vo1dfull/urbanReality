# Implementation Plan: 3D Buildings Upgrade

## Overview

Implement the 3D buildings upgrade in two phases. Phase 1 updates `BuildingsLayerPlugin` with height-based color interpolation and updates `MapEngine` with fog and map-anchored sun lighting. Phase 2 creates `ThreeJSBuildingRenderer` as a new MapLibre custom layer with GLTF model management, camera sync, and security allowlist. All changes must preserve the existing flood simulation, LOD system, and performance guards.

## Tasks

- [x] 1. Phase 1 — Update BuildingsLayerPlugin paint configuration
  - [x] 1.1 Replace `fill-extrusion-color` with height-based interpolation expression
    - In `src/layers/BuildingsLayerPlugin.js`, update the `paint` object passed to `_addLayer` in `init()`
    - Replace the existing two-branch `case` expression with a three-branch `case`: `isCritical` → critical pulse, `submersionRatio` branch removed from top-level (it becomes the default arm of the height interpolation), default → height-based `interpolate` over `coalesce(adjustedHeight, render_height, height, 0)` with stops: 0→`#1e3a5f`, 15→`#1e3a5f`, 30→`#2d6a9f`, 60→`#3a82c4`, 100→`#4a9eff`, 200→`#e0f0ff`
    - Keep the existing `isCritical` pulse branch as the first `case` arm (highest priority)
    - The submersion gradient (`submersionRatio` → `#475569`/`#f97316`) must remain as a second `case` arm before the height interpolation default, preserving Requirement 4.2
    - Set `fill-extrusion-vertical-gradient: true` in the initial paint config (always on)
    - Set `fill-extrusion-ambient-occlusion-ground-radius: 18` in the initial paint config
    - Keep `fill-extrusion-ambient-occlusion-intensity: 0.85` unchanged
    - Update opacity stops to: zoom 13.8→0, 14.2→0.78, 16→0.92
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.7, 4.1, 4.2, 4.3, 4.4_

  - [ ]* 1.2 Write property test for height-color expression (Property 1)
    - **Property 1: Height-color expression resolves for all building heights**
    - Use fast-check `fc.float({ min: 0, max: 500 })` to generate heights
    - Evaluate the expression array against each height and assert the result is a valid hex color string
    - **Validates: Requirements 2.1**

  - [ ]* 1.3 Write property test for isCritical override (Property 2)
    - **Property 2: isCritical overrides height-based color**
    - Use fast-check to generate arbitrary heights; with `isCritical=true`, assert resolved color matches critical pulse output, not height interpolation
    - **Validates: Requirements 2.2, 4.1**

- [x] 2. Phase 1 — Update `_syncLODState` in BuildingsLayerPlugin
  - In `_syncLODState`, change `fill-extrusion-vertical-gradient` to always be `true` (remove the `zoom >= HIGH_DETAIL_ZOOM` condition)
  - Verify AO radius logic remains: `zoom >= HIGH_DETAIL_ZOOM` → 18, else → 12
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [ ]* 2.1 Write property test for LOD visibility rule (Property 8)
    - **Property 8: LOD visibility rule holds for all zoom/pitch combinations**
    - Use fast-check `fc.float` for zoom and pitch; assert `visibility === 'visible'` iff `zoom >= 14 && pitch >= 25`
    - **Validates: Requirements 3.1, 3.2**

- [x] 3. Checkpoint — Ensure all Phase 1 BuildingsLayerPlugin tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Phase 1 — Update MapEngine fog and lighting
  - [x] 4.1 Add `_applyFog()` method to `MapEngine`
    - Add a new `_applyFog()` method that calls `this._map.setFog({ range: [0.5, 10], color: '#ddeeff', 'horizon-blend': 0.1 })` wrapped in try/catch with `log.warn` on error
    - _Requirements: 1.1, 1.3, 1.5_

  - [x] 4.2 Update `_applySceneLighting()` to use map-anchored sun light
    - Replace the existing `setLight` call in `_applySceneLighting()` with: `anchor: 'map'`, `color: '#fffbe6'`, `intensity: 0.55`, `position: [1.5, 225, 65]`
    - Wrap in try/catch with `log.warn` on error (already done, keep it)
    - _Requirements: 1.2, 1.4, 1.6_

  - [x] 4.3 Call `_applyFog()` from all style-load finalization points
    - In `init()`, add `this._applyFog()` call inside the `map.once('style.load', ...)` handler, after `_applySceneLighting()`
    - In `_executeStyleSwitch`'s `finalize()` function, add `this._applyFog()` call after `this._applySceneLighting()`
    - _Requirements: 1.1, 1.3, 10.3_

  - [ ]* 4.4 Write property test for fog persistence across style switches (Property 4)
    - **Property 4: Fog is non-null after any style switch**
    - Use fast-check `fc.constantFrom('default', 'satellite', 'terrain')` to generate style names; after each simulated switch, assert `map.getFog()` returns a config matching FOG_CONFIG
    - **Validates: Requirements 1.1, 1.3**

- [x] 5. Checkpoint — Ensure all Phase 1 MapEngine tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Phase 2 — Create ThreeJSBuildingRenderer
  - [x] 6.1 Create `src/engines/ThreeJSBuildingRenderer.js` with core class structure
    - Create the file with `ThreeJSBuildingRenderer` class
    - Constructor initializes: `this._scene = new THREE.Scene()`, `this._camera = new THREE.Camera()`, `this._renderer = null`, `this._models = {}`, `this._loader = new GLTFLoader()`, `this._map = null`, `this._allowlist = []`, `this._contextLost = false`
    - Implement the `customLayer` getter returning `{ id: 'threejs-buildings', type: 'custom', renderingMode: '3d', onAdd, render }`
    - In `onAdd(map, gl)`: store `this._map = map`, create `THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true })`, set `renderer.autoClear = false`, add `DirectionalLight(0xfffbe6, 1.2)` and `AmbientLight(0xffffff, 0.4)` to scene, attach `webglcontextlost` listener
    - In `render(gl, matrix)`: sync camera via `THREE.Matrix4().fromArray(matrix)`, call `renderer.resetState()`, `renderer.render(scene, camera)`, `map.triggerRepaint()`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 6.2 Implement CameraSync logic inside `render()`
    - In the `render(gl, matrix)` callback, convert the 16-element `matrix` array to `THREE.Matrix4` via `fromArray`
    - Assign to `this._camera.projectionMatrix` and compute inverse for `this._camera.projectionMatrixInverse`
    - _Requirements: 6.1, 6.2, 6.3_

  - [ ]* 6.3 Write property test for CameraSync inverse identity (Property 7)
    - **Property 7: CameraSync projection matrix inverse identity**
    - Use fast-check `fc.array(fc.float({ noNaN: true }), { minLength: 16, maxLength: 16 })` to generate matrix arrays; assert `projectionMatrix * projectionMatrixInverse ≈ Identity` within epsilon 1e-10
    - **Validates: Requirements 6.4**

- [x] 7. Phase 2 — Implement model management in ThreeJSBuildingRenderer
  - [x] 7.1 Implement URL allowlist validation
    - Add `setAllowlist(origins)` method that sets `this._allowlist = origins`
    - In `addModel`, validate `gltfUrl` origin against `this._allowlist`; if allowlist is non-empty and origin not in list, log security warning and return without loading
    - If allowlist is empty, only permit relative URLs (no `://` in URL string, i.e., same-origin `public/models/` paths)
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 7.2 Implement `addModel(id, gltfUrl, lngLat, options)`
    - Guard: if `id` already in `this._models`, return immediately (idempotency)
    - Guard: if map zoom < 15, defer loading (store pending model in a `_pendingModels` queue and load when zoom reaches 15)
    - Project `lngLat` to Mercator: `const mc = MercatorCoordinate.fromLngLat(lngLat, options.altitude ?? 0)`
    - Compute scale: `const s = mc.meterInMercatorCoordinateUnits() * (options.scale ?? 1)`
    - Load via `this._loader.loadAsync(gltfUrl)` in try/catch; on error log and return
    - Set `model.position.set(mc.x, mc.y, mc.z)`, `model.scale.set(s, s, s)`, `model.rotation.y = (options.rotation ?? 0) * Math.PI / 180`
    - If `options.castShadow`, traverse and set `castShadow = receiveShadow = true` on all `THREE.Mesh` children
    - Add to `this._scene` and store in `this._models[id]`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.8_

  - [ ]* 7.3 Write property test for addModel idempotency (Property 5)
    - **Property 5: addModel is idempotent per id**
    - Use fast-check `fc.string()` for model ids; call `addModel` twice with same id and assert `scene.children` contains exactly one model with that id
    - **Validates: Requirements 7.2**

  - [ ]* 7.4 Write property test for projectLngLatToWorld finite coordinates (Property 6)
    - **Property 6: projectLngLatToWorld returns finite coordinates**
    - Use fast-check `fc.tuple(fc.float({ min: -180, max: 180 }), fc.float({ min: -85, max: 85 }))` for lng/lat pairs; assert all THREE.Vector3 components are finite
    - **Validates: Requirements 7.3**

  - [ ]* 7.5 Write property test for GLTF URL allowlist rejection (Property 9)
    - **Property 9: GLTF URL allowlist rejects untrusted origins**
    - Use fast-check to generate URLs with origins not in the allowlist; assert `addModel` does not add to scene and logs a warning
    - **Validates: Requirements 9.2**

  - [x] 7.6 Implement `removeModel(id)` and `setModelVisibility(id, visible)`
    - `removeModel`: remove from `this._scene`, delete from `this._models`
    - `setModelVisibility`: look up model in `this._models`, set `model.visible = visible`
    - _Requirements: 7.6, 7.7_

- [x] 8. Phase 2 — Implement error handling and lifecycle in ThreeJSBuildingRenderer
  - [x] 8.1 Implement WebGL context loss/restore handling
    - In `onAdd`, attach `webglcontextlost` listener on `map.getCanvas()` that sets `this._contextLost = true` and pauses render
    - Attach `webglcontextrestored` listener that reinitializes `THREE.WebGLRenderer` and reloads all models from `this._models` keys
    - In `render()`, guard with `if (this._contextLost) return`
    - _Requirements: 8.2, 8.3_

  - [x] 8.2 Implement `destroy()` method
    - Dispose `this._renderer` (call `renderer.dispose()`)
    - Clear `this._scene` (remove all children)
    - Clear `this._models = {}`
    - Remove canvas event listeners
    - _Requirements: 8.5_

- [x] 9. Checkpoint — Ensure all Phase 2 ThreeJSBuildingRenderer tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Integration — Wire ThreeJSBuildingRenderer into the project
  - [x] 10.1 Export ThreeJSBuildingRenderer from `src/engines/ThreeJSBuildingRenderer.js`
    - Ensure the class is the default export
    - Verify imports: `three`, `three-stdlib` GLTFLoader, `maplibre-gl` MercatorCoordinate
    - _Requirements: 5.1, 10.2_

  - [x] 10.2 Verify no regression in existing MapEngine and BuildingsLayerPlugin behavior
    - Confirm `_applySceneLighting` and `_applyFog` are both called in `init()` style.load handler and in `_executeStyleSwitch` finalize
    - Confirm `BuildingsLayerPlugin._syncLODState` still correctly gates visibility on zoom/pitch and adjusts AO radius
    - Confirm flood simulation feature-state updates (`isCritical`, `submersionRatio`, `adjustedHeight`, `adjustedBase`) still flow through the worker pipeline unchanged
    - _Requirements: 4.5, 10.1, 10.3, 10.4_

- [x] 11. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at phase boundaries
- Property tests use fast-check and validate the correctness properties defined in design.md
- The Three.js renderer shares the MapLibre WebGL context — `renderer.resetState()` must be called every frame
- GLTF model assets should be placed in `public/models/` for same-origin loading without allowlist configuration
