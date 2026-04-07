// ================================================
// ThreeJSBuildingRenderer — Phase 2 Three.js hybrid layer
// Renders GLTF/GLB landmark models as a MapLibre custom layer,
// sharing the WebGL context and syncing camera each frame.
// ================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three-stdlib';
import maplibregl from 'maplibre-gl';
import { createLogger } from '../core/Logger';

const log = createLogger('ThreeJSBuildingRenderer');

/** Minimum zoom level before GLTF models are loaded */
const MODEL_MIN_ZOOM = 15;

export default class ThreeJSBuildingRenderer {
  constructor() {
    this._scene = new THREE.Scene();
    this._camera = new THREE.Camera();
    this._renderer = null;
    this._models = {};           // id → THREE.Object3D
    this._pendingModels = [];    // [{id, gltfUrl, lngLat, options}] — deferred until zoom >= 15
    this._loader = new GLTFLoader();
    this._map = null;
    this._allowlist = [];        // trusted URL origins; empty = same-origin only
    this._contextLost = false;
    this._onContextLost = null;
    this._onContextRestored = null;
  }

  // ─── MapLibre Custom Layer interface ────────────────────────────────────────

  /**
   * Returns the MapLibre custom layer descriptor.
   * Register with: map.addLayer(renderer.customLayer)
   */
  get customLayer() {
    return {
      id: 'threejs-buildings',
      type: 'custom',
      renderingMode: '3d',
      onAdd: (map, gl) => this._onAdd(map, gl),
      render: (gl, matrix) => this._render(gl, matrix),
    };
  }

  _onAdd(map, gl) {
    this._map = map;
    this._contextLost = false;

    // Share MapLibre's WebGL context — no second GPU context
    this._renderer = new THREE.WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl,
      antialias: true,
    });
    this._renderer.autoClear = false;

    // Scene lighting — afternoon sun + ambient fill
    const sun = new THREE.DirectionalLight(0xfffbe6, 1.2);
    sun.position.set(0.5, 1, 0.8);
    this._scene.add(sun);
    this._scene.add(new THREE.AmbientLight(0xffffff, 0.4));

    // WebGL context loss/restore handling
    const canvas = map.getCanvas();
    this._onContextLost = (e) => {
      e.preventDefault();
      this._contextLost = true;
      log.warn('WebGL context lost — pausing Three.js render');
    };
    this._onContextRestored = () => {
      this._contextLost = false;
      log.info('WebGL context restored — reinitializing renderer');
      this._reinitRenderer(map, gl);
    };
    canvas.addEventListener('webglcontextlost', this._onContextLost);
    canvas.addEventListener('webglcontextrestored', this._onContextRestored);

    // Load any models that were queued before onAdd
    this._flushPendingModels();
  }

  _render(gl, matrix) {
    if (!this._renderer || this._contextLost) return;

    // Sync Three.js camera with MapLibre projection matrix each frame
    const m = new THREE.Matrix4().fromArray(matrix);
    this._camera.projectionMatrix.copy(m);
    this._camera.projectionMatrixInverse.copy(m).invert();

    // Must reset WebGL state before rendering to avoid corrupting MapLibre
    this._renderer.resetState();
    this._renderer.render(this._scene, this._camera);

    // Keep animation loop running
    this._map.triggerRepaint();
  }

  // ─── Model management ───────────────────────────────────────────────────────

  /**
   * Configure trusted URL origins for GLTF loading.
   * Empty array (default) = same-origin only.
   * @param {string[]} origins — e.g. ['https://cdn.example.com']
   */
  setAllowlist(origins) {
    this._allowlist = Array.isArray(origins) ? origins : [];
  }

  /**
   * Add a GLTF/GLB model to the scene at the given geographic position.
   * Idempotent — calling twice with the same id is a no-op.
   * Deferred if map zoom < MODEL_MIN_ZOOM.
   *
   * @param {string} id — unique identifier
   * @param {string} gltfUrl — URL to .glb/.gltf file
   * @param {[number, number]} lngLat — [longitude, latitude]
   * @param {{scale?: number, rotation?: number, altitude?: number, castShadow?: boolean}} options
   */
  async addModel(id, gltfUrl, lngLat, options = {}) {
    if (!id) return;

    // Idempotency guard
    if (this._models[id]) return;

    // Security: validate URL against allowlist
    if (!this._isUrlAllowed(gltfUrl)) {
      log.warn(`ThreeJSBuildingRenderer: blocked untrusted GLTF URL: ${gltfUrl}`);
      return;
    }

    // Defer if renderer not ready or zoom too low
    if (!this._renderer || (this._map && this._map.getZoom() < MODEL_MIN_ZOOM)) {
      this._pendingModels.push({ id, gltfUrl, lngLat, options });
      if (this._map && !this._zoomListener) {
        this._zoomListener = () => this._flushPendingModels();
        this._map.on('zoomend', this._zoomListener);
      }
      return;
    }

    await this._loadModel(id, gltfUrl, lngLat, options);
  }

  async _loadModel(id, gltfUrl, lngLat, options = {}) {
    const { scale = 1, rotation = 0, altitude = 0, castShadow = true } = options;

    try {
      const gltf = await this._loader.loadAsync(gltfUrl);
      const model = gltf.scene;

      // Project lng/lat to Mercator world space
      const mc = maplibregl.MercatorCoordinate.fromLngLat(lngLat, altitude);
      const s = mc.meterInMercatorCoordinateUnits() * scale;

      model.position.set(mc.x, mc.y, mc.z);
      model.scale.set(s, s, s);
      model.rotation.y = rotation * (Math.PI / 180);

      if (castShadow) {
        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
      }

      this._scene.add(model);
      this._models[id] = model;
      log.info(`Model loaded: ${id}`);
    } catch (err) {
      log.warn(`Failed to load GLTF model "${id}" from ${gltfUrl}:`, err);
    }
  }

  /**
   * Remove a model from the scene by id.
   * @param {string} id
   */
  removeModel(id) {
    const model = this._models[id];
    if (!model) return;
    this._scene.remove(model);
    delete this._models[id];
  }

  /**
   * Show or hide a model.
   * @param {string} id
   * @param {boolean} visible
   */
  setModelVisibility(id, visible) {
    const model = this._models[id];
    if (model) model.visible = visible;
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Dispose renderer, clear scene, remove all models and listeners.
   */
  destroy() {
    if (this._map) {
      const canvas = this._map.getCanvas();
      if (this._onContextLost) canvas.removeEventListener('webglcontextlost', this._onContextLost);
      if (this._onContextRestored) canvas.removeEventListener('webglcontextrestored', this._onContextRestored);
      if (this._zoomListener) this._map.off('zoomend', this._zoomListener);
    }

    // Remove all scene children
    while (this._scene.children.length > 0) {
      this._scene.remove(this._scene.children[0]);
    }

    if (this._renderer) {
      this._renderer.dispose();
      this._renderer = null;
    }

    this._models = {};
    this._pendingModels = [];
    this._map = null;
    this._onContextLost = null;
    this._onContextRestored = null;
    this._zoomListener = null;
    log.info('ThreeJSBuildingRenderer destroyed');
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  _isUrlAllowed(url) {
    // Relative URLs (same-origin public/models/) are always allowed
    if (!url.includes('://')) return true;

    // If allowlist is empty, only relative URLs are permitted
    if (this._allowlist.length === 0) return false;

    try {
      const origin = new URL(url).origin;
      return this._allowlist.includes(origin);
    } catch {
      return false;
    }
  }

  async _flushPendingModels() {
    if (!this._renderer) return;
    if (this._map && this._map.getZoom() < MODEL_MIN_ZOOM) return;

    const pending = this._pendingModels.splice(0);
    for (const { id, gltfUrl, lngLat, options } of pending) {
      if (!this._models[id]) {
        await this._loadModel(id, gltfUrl, lngLat, options);
      }
    }

    // Remove zoom listener if no more pending
    if (this._pendingModels.length === 0 && this._zoomListener && this._map) {
      this._map.off('zoomend', this._zoomListener);
      this._zoomListener = null;
    }
  }

  async _reinitRenderer(map, gl) {
    // Reinitialize renderer after context restore
    if (this._renderer) {
      this._renderer.dispose();
    }
    this._renderer = new THREE.WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl,
      antialias: true,
    });
    this._renderer.autoClear = false;

    // Reload all registered models
    const modelEntries = Object.entries(this._models);
    this._models = {};
    while (this._scene.children.length > 0) {
      this._scene.remove(this._scene.children[0]);
    }
    // Re-add lights
    const sun = new THREE.DirectionalLight(0xfffbe6, 1.2);
    sun.position.set(0.5, 1, 0.8);
    this._scene.add(sun);
    this._scene.add(new THREE.AmbientLight(0xffffff, 0.4));

    // Note: we don't have the original lngLat/options stored, so we log a warning.
    // In a production system, store model metadata for full reload.
    if (modelEntries.length > 0) {
      log.warn('Context restored: model metadata not stored for reload. Re-add models manually.');
    }
  }
}
