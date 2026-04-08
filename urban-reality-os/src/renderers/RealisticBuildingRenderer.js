// ================================================
// RealisticBuildingRenderer
// Custom WebGL layer that re-renders MapLibre's extruded buildings
// with per-face Phong + specular shading, time-of-day sun, AO gradient,
// and roof/facade material differentiation.
//
// Drop-in companion to BuildingsLayerPlugin:
//   1. Keep the fill-extrusion layer as the geometry/data source (opacity=0 or hidden)
//   2. Add this custom layer ON TOP — it queries the same features and renders
//      them with a proper lighting model each frame.
//
// Usage:
//   const rbr = new RealisticBuildingRenderer();
//   map.addLayer(rbr.customLayer);
//   rbr.setTime(10.5);          // call from MapEngine.setTime()
// ================================================
import maplibregl from 'maplibre-gl';
import { createLogger } from '../core/Logger';

const log = createLogger('RealisticBuildingRenderer');

// ─── GLSL Sources ───────────────────────────────────────────────────────────

const VERT = /* glsl */ `
  precision highp float;

  // Per-vertex attributes (packed Mercator geometry)
  attribute vec3 aPosition;   // Mercator x,y,z
  attribute vec3 aNormal;     // face normal (unit)
  attribute float aHeight;    // metres — used for AO gradient
  attribute float aBaseHeight;
  attribute float aFaceType;  // 0=south wall, 1=north wall, 2=east, 3=west, 4=roof

  uniform mat4 uMatrix;       // MapLibre proj*view*model (from render callback)
  uniform float uFloorHeight; // metres per floor (for window grid)

  varying vec3  vNormal;
  varying float vHeight;
  varying float vBaseHeight;
  varying float vFaceType;
  varying vec3  vWorldPos;
  varying float vFloorT;      // 0..1 within a single floor band

  void main() {
    vNormal     = aNormal;
    vHeight     = aHeight;
    vBaseHeight = aBaseHeight;
    vFaceType   = aFaceType;
    vWorldPos   = aPosition;

    // Floor band position for window grid
    float totalH = max(aHeight - aBaseHeight, 1.0);
    float floorIdx = floor((aPosition.z - aBaseHeight) / uFloorHeight);
    vFloorT = fract((aPosition.z - aBaseHeight) / uFloorHeight);

    gl_Position = uMatrix * vec4(aPosition, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;

  varying vec3  vNormal;
  varying float vHeight;
  varying float vBaseHeight;
  varying float vFaceType;
  varying vec3  vWorldPos;
  varying float vFloorT;

  // ── Time-of-day sun ──────────────────────────────────────────────────────
  uniform vec3  uSunDir;          // normalised, world space (Mercator)
  uniform vec3  uSunColor;        // HDR sun colour
  uniform float uSunIntensity;    // 0..1 scaled by time

  // ── Sky / ambient ────────────────────────────────────────────────────────
  uniform vec3  uSkyColor;        // upper hemisphere bounce
  uniform vec3  uGroundColor;     // lower hemisphere bounce

  // ── Material ─────────────────────────────────────────────────────────────
  uniform vec3  uFacadeColor;     // base albedo for walls
  uniform vec3  uRoofColor;       // base albedo for roofs
  uniform float uSpecularPower;   // shininess (glass=64+, concrete=8)
  uniform float uSpecularStr;     // 0..1
  uniform float uAOStrength;      // 0..1 — how dark the base of buildings gets

  // ── Camera ───────────────────────────────────────────────────────────────
  uniform vec3  uCameraPos;       // Mercator
  uniform float uTime;            // hours 0..24

  // ─── Helpers ─────────────────────────────────────────────────────────────

  // Simple hash — for window pattern noise
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  // Window grid: returns 1.0 inside a lit window, 0.0 in spandrel/frame
  float windowMask(float floorT, vec2 wallUV) {
    // Subdivide facade horizontally into ~3 bays
    float bayT = fract(wallUV.x * 3.0);
    float insideBay  = step(0.15, bayT)  * step(bayT, 0.85);
    float insideFloor = step(0.12, floorT) * step(floorT, 0.82);
    return insideBay * insideFloor;
  }

  // Night window lit-up probability (random per floor+bay)
  float windowLit(vec2 wallUV) {
    vec2 cell = floor(vec2(wallUV.x * 3.0, wallUV.y));
    return step(0.35, hash(cell));   // ~65% of windows lit at night
  }

  void main() {
    vec3 N = normalize(vNormal);
    bool isRoof = vFaceType > 3.5;
    float totalH = max(vHeight - vBaseHeight, 1.0);

    // ── Vertical AO gradient (darkens building base like contact shadow) ──
    float aoT = clamp((vWorldPos.z - vBaseHeight) / totalH, 0.0, 1.0);
    float ao  = mix(1.0 - uAOStrength, 1.0, pow(aoT, 0.5));

    // ── Base material colour ──────────────────────────────────────────────
    vec3 albedo = isRoof ? uRoofColor : uFacadeColor;

    // Height-based material variation: taller = more glass (bluer, more specular)
    float glassFactor = clamp((vHeight - 20.0) / 120.0, 0.0, 1.0);
    // Mix concrete warm tone toward glass cool tone
    vec3 glassTint = vec3(0.72, 0.82, 0.92);
    albedo = mix(albedo, glassTint, glassFactor * (isRoof ? 0.0 : 0.55));

    // ── Hemisphere ambient (sky + ground) ─────────────────────────────────
    float upFacing = N.z * 0.5 + 0.5;  // 0=down, 1=up
    vec3 ambient = mix(uGroundColor, uSkyColor, upFacing) * 0.38;

    // ── Directional sun diffuse ───────────────────────────────────────────
    float NdotL = max(dot(N, uSunDir), 0.0);
    vec3 diffuse = uSunColor * uSunIntensity * NdotL * 0.72;

    // ── Specular (Blinn-Phong) ────────────────────────────────────────────
    vec3 camDir = normalize(uCameraPos - vWorldPos);
    vec3 H = normalize(uSunDir + camDir);
    float spec = pow(max(dot(N, H), 0.0), uSpecularPower + glassFactor * 96.0);
    float specStr = uSpecularStr * mix(0.08, 0.55, glassFactor);
    // Roofs get a matte AO bounce, not glass spec
    if (isRoof) specStr *= 0.15;
    vec3 specular = uSunColor * uSunIntensity * spec * specStr;

    // ── Soft self-shadow: south-face unlit when sun is north, etc. ────────
    // (NdotL already handles this — just make sure shadow is soft)
    float shadowSoft = mix(0.18, 1.0, NdotL + 0.18);

    // ── Night window glow ─────────────────────────────────────────────────
    vec3 windowGlow = vec3(0.0);
    bool isNight = uTime < 6.0 || uTime > 19.5;
    bool isDusk  = (uTime >= 17.5 && uTime <= 19.5) || (uTime >= 5.5 && uTime < 6.0);
    if (!isRoof && (isNight || isDusk)) {
      // Build a wall UV from the Mercator position
      vec2 wallUV = vec2(vWorldPos.x * 8000.0, (vWorldPos.z - vBaseHeight) / max(totalH, 1.0) * max(totalH / 3.5, 1.0));
      float wMask = windowMask(vFloorT, wallUV);
      float wLit  = windowLit(wallUV);
      float glow  = wMask * wLit;

      // Taller buildings have warmer/brighter office lighting
      float brightness = mix(0.55, 1.15, clamp(vHeight / 100.0, 0.0, 1.0));
      // Mix amber (offices) and cool white (modern glass towers)
      vec3 warmLight = vec3(1.0,  0.82, 0.45) * brightness;
      vec3 coolLight = vec3(0.85, 0.92, 1.0)  * brightness * 1.2;
      vec3 windowColor = mix(warmLight, coolLight, glassFactor);

      float nightFade = isNight ? 1.0 : (uTime - 17.5) / 2.0;
      windowGlow = windowColor * glow * nightFade * 0.9;

      // Facade bounce from window light
      albedo = mix(albedo, albedo + windowColor * 0.08, glow * nightFade * 0.4);
    }

    // ── Golden hour / sunrise tint ────────────────────────────────────────
    float goldenT = 0.0;
    if (uTime >= 6.0 && uTime <= 8.0)        goldenT = 1.0 - (uTime - 6.0) / 2.0;
    else if (uTime >= 17.0 && uTime <= 19.0) goldenT = (uTime - 17.0) / 2.0;
    vec3 goldenTint = vec3(1.0, 0.72, 0.35) * NdotL * goldenT * 0.35;

    // ── Compose ───────────────────────────────────────────────────────────
    vec3 color = (albedo * (ambient + diffuse * shadowSoft) + specular + goldenTint) * ao;
    color += windowGlow;

    // ── Tone mapping: ACES approximation ─────────────────────────────────
    color = color * (2.51 * color + 0.03) / (color * (2.43 * color + 0.59) + 0.14);
    color = clamp(color, 0.0, 1.0);

    // sRGB gamma
    color = pow(color, vec3(1.0 / 2.2));

    gl_FragColor = vec4(color, 1.0);
  }
`;

// ─── Geometry builder ───────────────────────────────────────────────────────

/**
 * Build interleaved vertex buffer from MapLibre building features.
 * Returns { buffer: Float32Array, count: number }
 * Layout per vertex: x,y,z (Mercator), nx,ny,nz (normal), height, baseHeight, faceType
 * = 9 floats = 36 bytes
 */
function buildGeometry(features) {
  const STRIDE = 9;
  // 4 faces × 2 triangles × 3 verts × STRIDE, plus roof quad
  // Pre-allocate conservatively
  const maxVerts = features.length * 6 * 6 * STRIDE;
  const buf = new Float32Array(maxVerts);
  let idx = 0;

  const push = (x, y, z, nx, ny, nz, h, bh, ft) => {
    buf[idx++] = x;  buf[idx++] = y;  buf[idx++] = z;
    buf[idx++] = nx; buf[idx++] = ny; buf[idx++] = nz;
    buf[idx++] = h;  buf[idx++] = bh; buf[idx++] = ft;
  };

  const quad = (ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, nx, ny, nz, h, bh, ft) => {
    // Two triangles: ABC, ACD
    push(ax,ay,az, nx,ny,nz, h,bh,ft);
    push(bx,by,bz, nx,ny,nz, h,bh,ft);
    push(cx,cy,cz, nx,ny,nz, h,bh,ft);
    push(ax,ay,az, nx,ny,nz, h,bh,ft);
    push(cx,cy,cz, nx,ny,nz, h,bh,ft);
    push(dx,dy,dz, nx,ny,nz, h,bh,ft);
  };

  for (const feature of features) {
    const props = feature.properties || {};
    const geom  = feature.geometry;
    if (!geom || !geom.coordinates) continue;

    const height = parseFloat(
      feature.state?.adjustedHeight ?? props.render_height ?? props.height ?? 0
    );
    const base = parseFloat(
      feature.state?.adjustedBase ?? props.render_min_height ?? props.min_height ?? 0
    );
    if (height <= 0) continue;

    const rings = geom.type === 'Polygon'
      ? geom.coordinates
      : geom.type === 'MultiPolygon'
        ? geom.coordinates.flat()
        : [];

    for (const ring of rings) {
      if (!ring || ring.length < 3) continue;

      // Convert ring from [lng, lat] to Mercator + determine base/top
      const mercCoords = ring.map(([lng, lat]) => {
        const mc = maplibregl.MercatorCoordinate.fromLngLat([lng, lat], 0);
        return { x: mc.x, y: mc.y, z: base };
      });

      const n = mercCoords.length - 1; // exclude repeated closing point

      // ── Walls (with normals pointing outward) ──────────────────────────

      for (let i = 0; i < n; i++) {
        const p0 = mercCoords[i];
        const p1 = mercCoords[(i + 1) % n];

        // Bottom-left, bottom-right, top-right, top-left
        const bl = { x: p0.x, y: p0.y, z: base };
        const br = { x: p1.x, y: p1.y, z: base };
        const tr = { x: p1.x, y: p1.y, z: height };
        const tl = { x: p0.x, y: p0.y, z: height };

        // Edge vector and up vector
        const edge = { x: p1.x - p0.x, y: p1.y - p0.y, z: 0 };
        const up = { x: 0, y: 0, z: 1 };

        // Normal = edge × up (pointing outward in plan view)
        const nx = edge.y * up.z - edge.z * up.y; // edge.y * 1
        const ny = edge.z * up.x - edge.x * up.z; // -edge.x * 1
        const nz = edge.x * up.y - edge.y * up.x; // 0

        // Normalize
        const nlen = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        const nnx = nx / nlen;
        const nny = ny / nlen;
        const nnz = nz / nlen;

        // Determine face type (rough azimuth)
        const angle = Math.atan2(nny, nnx);
        const deg = (angle * 180) / Math.PI;
        let faceType = 0;
        if (deg > -45 && deg <= 45) faceType = 2; // East
        else if (deg > 45 && deg <= 135) faceType = 1; // North
        else if (deg > 135 || deg <= -135) faceType = 3; // West
        else faceType = 0; // South

        quad(bl.x, bl.y, bl.z, br.x, br.y, br.z, tr.x, tr.y, tr.z, tl.x, tl.y, tl.z, nnx, nny, nnz, height, base, faceType);
      }

      // ── Roof (horizontal quad with upward-pointing normal) ──────────────

      if (n >= 3) {
        // Simple approach: emit triangulated roof (fan from first vertex)
        const ref = mercCoords[0];
        for (let i = 1; i < n - 1; i++) {
          const p1 = mercCoords[i];
          const p2 = mercCoords[i + 1];
          quad(ref.x, ref.y, height, p1.x, p1.y, height, p2.x, p2.y, height, ref.x, ref.y, height, 0, 0, 1, height, base, 4);
        }
      }
    }
  }

  return { buffer: buf.subarray(0, idx), count: idx / STRIDE };
}

// ─── Colour helpers ─────────────────────────────────────────────────────────

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b];
}

// Sun direction in Mercator world: azimuth (deg, 0=N CW) + elevation (deg)
function sunDirectionFromAzimuthElevation(azimuthDeg, elevationDeg) {
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (elevationDeg * Math.PI) / 180;
  // In Mercator: +X = east, +Y = north (inverted in map), +Z = up
  const x =  Math.cos(el) * Math.sin(az);
  const y = -Math.cos(el) * Math.cos(az);
  const z =  Math.sin(el);
  const len = Math.sqrt(x * x + y * y + z * z) || 1;
  return [x / len, y / len, z / len];
}

// ─── Main class ─────────────────────────────────────────────────────────────

export default class RealisticBuildingRenderer {
  constructor() {
    this._gl = null;
    this._map = null;
    this._program = null;
    this._vbo = null;
    this._vertCount = 0;
    this._currentHour = 12;
    this._needsRebuild = true;
    this._buildScheduled = false;
    this._contextLost = false;
    this._onContextLost = null;
    this._onContextRestored = null;
    this._featureCache = [];

    // Uniform locations cache
    this._u = {};
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  get customLayer() {
    return {
      id: 'realistic-buildings',
      type: 'custom',
      renderingMode: '3d',
      onAdd:    (map, gl) => this._onAdd(map, gl),
      render:   (gl, matrix) => this._onRender(gl, matrix),
      onRemove: ()           => this._onRemove(),
    };
  }

  /**
   * Update time of day (0–23.99). Call from MapEngine.setTime().
   * @param {number} hour
   */
  setTime(hour) {
    this._currentHour = Math.max(0, Math.min(23.99, hour));
  }

  /**
   * Mark geometry as dirty — call after zoom/move to refresh queried features.
   */
  invalidate() {
    this._needsRebuild = true;
    if (this._map) this._map.triggerRepaint();
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  _onAdd(map, gl) {
    this._map = map;
    this._gl  = gl;

    this._program = this._compileProgram(gl, VERT, FRAG);
    this._cacheUniformLocations(gl);
    this._vbo = gl.createBuffer();

    // Rebuild geometry on map movement
    const rebuild = () => this.invalidate();
    map.on('moveend', rebuild);
    map.on('zoomend', rebuild);
    map.on('pitchend', rebuild);
    this._rebuildListener = rebuild;

    // Context loss handling
    const canvas = map.getCanvas();
    this._onContextLost = (e) => {
      this._contextLost = true;
    };
    this._onContextRestored = () => {
      this._contextLost = false;
      this._program = this._compileProgram(gl, VERT, FRAG);
      this._cacheUniformLocations(gl);
      this._needsRebuild = true;
    };
    canvas.addEventListener('webglcontextlost',    this._onContextLost);
    canvas.addEventListener('webglcontextrestored', this._onContextRestored);

    log.info('RealisticBuildingRenderer added');
  }

  _onRemove() {
    const gl = this._gl;
    if (!gl) return;
    if (this._vbo)     gl.deleteBuffer(this._vbo);
    if (this._program) gl.deleteProgram(this._program);

    if (this._map) {
      this._map.off('moveend', this._rebuildListener);
      this._map.off('zoomend', this._rebuildListener);
      this._map.off('pitchend', this._rebuildListener);
      const canvas = this._map.getCanvas();
      canvas.removeEventListener('webglcontextlost',    this._onContextLost);
      canvas.removeEventListener('webglcontextrestored', this._onContextRestored);
    }
    this._program = null;
    this._vbo = null;
    this._map = null;
    this._gl  = null;
  }

  _onRender(gl, matrix) {
    if (!this._program || !this._vbo || this._contextLost) return;

    const map = this._map;
    if (!map) return;

    const zoom  = map.getZoom();
    const pitch = map.getPitch();
    if (zoom < 13.8 || pitch < 15) return;

    // ── Rebuild geometry if dirty ────────────────────────────────────────
    if (this._needsRebuild && !this._buildScheduled) {
      this._buildScheduled = true;
      setTimeout(() => {
        this._rebuildGeometry(gl);
        this._buildScheduled = false;
      }, 0);
    }

    // ── Compute sun uniforms from hour ───────────────────────────────────
    const hour = this._currentHour;
    const azimuth   = (hour / 24) * 360;
    const elevRaw   = Math.sin(((hour - 6) / 12) * Math.PI);
    const elevation = Math.max(-10, elevRaw * 78);
    const sunDir    = sunDirectionFromAzimuthElevation(azimuth, elevation);
    const sunInt    = Math.max(0, elevRaw);

    // Sun colour: warm at dawn/dusk, white at noon, dark at night
    let sunR = 1.0, sunG = 0.95, sunB = 0.85;
    const isGolden = (hour >= 5.5 && hour <= 8) || (hour >= 16.5 && hour <= 19.5);
    if (isGolden) {
      sunR = 1.0; sunG = 0.78; sunB = 0.45;
    } else if (sunInt < 0.2) {
      sunR = 0.5; sunG = 0.6; sunB = 0.8; // moonlight
    }

    // Sky / ground ambient colours change through the day
    let skyR, skyG, skyB, gndR, gndG, gndB;
    if (sunInt > 0.3) {
      skyR = 0.52; skyG = 0.74; skyB = 0.98;
      gndR = 0.92; gndG = 0.88; gndB = 0.78;
    } else {
      skyR = 0.08; skyG = 0.15; skyB = 0.35;
      gndR = 0.02; gndG = 0.04; gndB = 0.08;
    }

    // Facade base colour: warm concrete in day, dark at night
    const fDay   = Math.max(0, sunInt);
    const facadeR = 0.76 * fDay + 0.08 * (1 - fDay);
    const facadeG = 0.72 * fDay + 0.10 * (1 - fDay);
    const facadeB = 0.68 * fDay + 0.12 * (1 - fDay);
    const roofR   = 0.82 * fDay + 0.05 * (1 - fDay);
    const roofG   = 0.80 * fDay + 0.06 * (1 - fDay);
    const roofB   = 0.78 * fDay + 0.08 * (1 - fDay);

    // Camera position in Mercator
    const center = map.getCenter();
    const camMC  = maplibregl.MercatorCoordinate.fromLngLat(center, 0);
    const matrixData = normalizeMatrix4(matrix);

    // ── WebGL state ──────────────────────────────────────────────────────
    gl.useProgram(this._program);

    const u = this._u;
    // Matrix
    gl.uniformMatrix4fv(u.uMatrix, false, matrixData);
    // Sun
    gl.uniform3fv(u.uSunDir,       sunDir);
    gl.uniform3f(u.uSunColor,      sunR, sunG, sunB);
    gl.uniform1f(u.uSunIntensity,  sunInt);
    // Ambient
    gl.uniform3f(u.uSkyColor,      skyR, skyG, skyB);
    gl.uniform3f(u.uGroundColor,   gndR, gndG, gndB);
    // Material
    gl.uniform3f(u.uFacadeColor,   facadeR, facadeG, facadeB);
    gl.uniform3f(u.uRoofColor,     roofR,   roofG,   roofB);
    gl.uniform1f(u.uSpecularPower, 24.0);
    gl.uniform1f(u.uSpecularStr,   0.6);
    gl.uniform1f(u.uAOStrength,    0.45);
    // Camera
    gl.uniform3f(u.uCameraPos, camMC.x, camMC.y, 0.0);
    // Time
    gl.uniform1f(u.uTime, hour);
    // Floor height in Mercator units
    const mpu = camMC.meterInMercatorCoordinateUnits();
    gl.uniform1f(u.uFloorHeight, 3.2 * mpu);

    // ── Draw ─────────────────────────────────────────────────────────────
    const STRIDE = 9 * 4; // 9 floats × 4 bytes
    gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);

    const posLoc = gl.getAttribLocation(this._program, 'aPosition');
    const norLoc = gl.getAttribLocation(this._program, 'aNormal');
    const hLoc   = gl.getAttribLocation(this._program, 'aHeight');
    const bhLoc  = gl.getAttribLocation(this._program, 'aBaseHeight');
    const ftLoc  = gl.getAttribLocation(this._program, 'aFaceType');

    gl.enableVertexAttribArray(posLoc);
    gl.enableVertexAttribArray(norLoc);
    gl.enableVertexAttribArray(hLoc);
    gl.enableVertexAttribArray(bhLoc);
    gl.enableVertexAttribArray(ftLoc);

    gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, STRIDE, 0);
    gl.vertexAttribPointer(norLoc, 3, gl.FLOAT, false, STRIDE, 12);
    gl.vertexAttribPointer(hLoc,   1, gl.FLOAT, false, STRIDE, 24);
    gl.vertexAttribPointer(bhLoc,  1, gl.FLOAT, false, STRIDE, 28);
    gl.vertexAttribPointer(ftLoc,  1, gl.FLOAT, false, STRIDE, 32);

    // Save and restore MapLibre's WebGL state
    const depthTest  = gl.getParameter(gl.DEPTH_TEST);
    const cullFace   = gl.getParameter(gl.CULL_FACE);
    const blendOn    = gl.getParameter(gl.BLEND);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.disable(gl.BLEND);

    gl.drawArrays(gl.TRIANGLES, 0, this._vertCount);

    // Restore
    if (!depthTest)  gl.disable(gl.DEPTH_TEST);
    if (!cullFace)   gl.disable(gl.CULL_FACE);
    if (blendOn)     gl.enable(gl.BLEND);

    gl.disableVertexAttribArray(posLoc);
    gl.disableVertexAttribArray(norLoc);
    gl.disableVertexAttribArray(hLoc);
    gl.disableVertexAttribArray(bhLoc);
    gl.disableVertexAttribArray(ftLoc);
  }

  // ─── Geometry ──────────────────────────────────────────────────────────────

  _rebuildGeometry(gl) {
    if (!this._map || !gl) return;

    let features = [];
    try {
      const layerId = this._map.getLayer('3d-buildings')
        ? '3d-buildings'
        : this._map.getLayer('building')
          ? 'building'
          : null;

      if (!layerId) {
        this._vertCount = 0;
        this._needsRebuild = false;
        return;
      }

      features = this._map.queryRenderedFeatures({ layers: [layerId] });
    } catch (e) {
      log.warn('queryRenderedFeatures error:', e);
      this._vertCount = 0;
      this._needsRebuild = false;
      return;
    }

    if (!features || features.length === 0) return;

    const { buffer, count } = buildGeometry(features);
    if (count === 0) return;

    gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);
    gl.bufferData(gl.ARRAY_BUFFER, buffer, gl.DYNAMIC_DRAW);
    this._vertCount = count;
    this._needsRebuild = false;
  }

  // ─── Shader compilation ────────────────────────────────────────────────────

  _compileProgram(gl, vertSrc, fragSrc) {
    const compile = (type, src) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        log.error(`Shader compile error: ${gl.getShaderInfoLog(shader)}`);
      }
      return shader;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER,   vertSrc));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fragSrc));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      log.error(`Program link error: ${gl.getProgramInfoLog(prog)}`);
    }
    return prog;
  }

  _cacheUniformLocations(gl) {
    const prog = this._program;
    this._u.uMatrix           = gl.getUniformLocation(prog, 'uMatrix');
    this._u.uFloorHeight      = gl.getUniformLocation(prog, 'uFloorHeight');
    this._u.uSunDir           = gl.getUniformLocation(prog, 'uSunDir');
    this._u.uSunColor         = gl.getUniformLocation(prog, 'uSunColor');
    this._u.uSunIntensity     = gl.getUniformLocation(prog, 'uSunIntensity');
    this._u.uSkyColor         = gl.getUniformLocation(prog, 'uSkyColor');
    this._u.uGroundColor      = gl.getUniformLocation(prog, 'uGroundColor');
    this._u.uFacadeColor      = gl.getUniformLocation(prog, 'uFacadeColor');
    this._u.uRoofColor        = gl.getUniformLocation(prog, 'uRoofColor');
    this._u.uSpecularPower    = gl.getUniformLocation(prog, 'uSpecularPower');
    this._u.uSpecularStr      = gl.getUniformLocation(prog, 'uSpecularStr');
    this._u.uAOStrength       = gl.getUniformLocation(prog, 'uAOStrength');
    this._u.uCameraPos        = gl.getUniformLocation(prog, 'uCameraPos');
    this._u.uTime             = gl.getUniformLocation(prog, 'uTime');
  }
}

function normalizeMatrix4(matrix) {
  if (matrix instanceof Float32Array && matrix.length === 16) return matrix;
  if (Array.isArray(matrix) && matrix.length === 16) return new Float32Array(matrix);
  if (matrix && typeof matrix === 'object') {
    if (ArrayBuffer.isView(matrix) && matrix.length === 16) return new Float32Array(matrix);
    if (Array.isArray(matrix.matrix) && matrix.matrix.length === 16) return new Float32Array(matrix.matrix);
    if (ArrayBuffer.isView(matrix.matrix) && matrix.matrix.length === 16) return new Float32Array(matrix.matrix);
    if (Array.isArray(matrix.value) && matrix.value.length === 16) return new Float32Array(matrix.value);
  }
  return new Float32Array(16);
}
