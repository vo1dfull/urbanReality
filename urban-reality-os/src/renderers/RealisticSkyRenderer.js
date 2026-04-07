// ================================================
// RealisticSkyRenderer
// Ultra-realistic atmospheric scattering sky
// per-pixel atmosphere simulation with Rayleigh + Mie scattering
// ================================================
import { createLogger } from '../core/Logger';
import maplibregl from 'maplibre-gl';

const log = createLogger('RealisticSkyRenderer');

// ─── GLSL Shaders ───────────────────────────────────────────────────────────

const SKY_VERT = /* glsl */ `
  attribute vec2 aPosition;
  
  void main() {
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

const SKY_FRAG = /* glsl */ `
  precision highp float;

  uniform vec3 uSunDir;              // normalized sun direction
  uniform vec3 uCameraPos;           // camera position 
  uniform mat4 uInvViewProj;         // inverse view-projection matrix
  uniform float uSunIntensity;       // 0..1
  uniform float uTime;               // 0..24

  // === Constants ===
  const float PI = 3.14159265359;
  const float EARTH_RADIUS = 6371.0;
  const float ATMOSPHERE_HEIGHT = 100.0;

  // Rayleigh scattering coefficient (per km)
  const vec3 RAYLEIGH_COEFF = vec3(5.804, 13.558, 33.1) * 0.000001;

  // Mie scattering
  const float MIE_COEFF = 21.0 * 0.000001;
  const float MIE_DIRECTIONAL_G = 0.76;

  // ─── Helper: optical depth (simplified) ───
  float opticalDepth(vec3 p, vec3 lightDir) {
    float u = dot(p, lightDir);
    return exp(-u);
  }

  // ─── Helper: Rayleigh phase function ─────
  float rayleighPhase(float cosTheta) {
    return (3.0 / (16.0 * PI)) * (1.0 + cosTheta * cosTheta);
  }

  // ─── Helper: Mie phase function ──────────
  float miePhase(float cosTheta, float g) {
    float g2 = g * g;
    float denom = 1.0 + g2 - 2.0 * g * cosTheta;
    return (1.0 - g2) / (4.0 * PI * denom * sqrt(denom));
  }

  // ─── Sky colour via atmospheric scattering ──
  vec3 computeSky(vec3 rayDir, vec3 sunDir) {
    // Rayleigh scattering (makes blue sky)
    float cosAngle = dot(rayDir, sunDir);
    float rayleigh = rayleighPhase(cosAngle);

    // Mie scattering (sun glow halo)
    float mie = miePhase(cosAngle, MIE_DIRECTIONAL_G);

    // Optical depth estimation
    vec3 rayOrigin = vec3(0.0, EARTH_RADIUS, 0.0);
    float optDepth = 1.0 - (rayDir.y + 1.0) * 0.5;
    optDepth = max(0.0, optDepth);

    // Rayleigh colour: strong blue
    vec3 rayleighColour = RAYLEIGH_COEFF * rayleigh * (1.0 - optDepth * 0.6);

    // Mie colour: white/yellow near sun
    vec3 mieColour = vec3(1.0, 0.95, 0.8) * MIE_COEFF * mie * 0.5;

    // Sun visibility gradient
    float sunVisible = max(0.0, sunDir.y) * uSunIntensity;

    return rayleighColour + mieColour * sunVisible;
  }

  void main() {
    // Normalize to -1..1
    vec2 uv = gl_FragCoord.xy / vec2(1280.0, 720.0);
    uv = uv * 2.0 - 1.0;

    // Reconstruct 3D ray direction from screen coordinates
    vec4 rayClip = vec4(uv, 1.0, 1.0);
    vec4 rayEye = uInvViewProj * rayClip;
    vec3 rayDir = normalize(rayEye.xyz);

    // Compute sky
    vec3 sky = computeSky(rayDir, uSunDir);

    // ── Time-of-day colouring ──
    float timeNorm = mod(uTime, 24.0) / 24.0;
    
    // Sunrise/sunset: warm
    float sunriseBlend = 0.0;
    if (uTime >= 5.5 && uTime <= 7.5) {
      sunriseBlend = 1.0 - abs(uTime - 6.5) / 1.0;
    } else if (uTime >= 17.0 && uTime <= 19.0) {
      sunriseBlend = 1.0 - abs(uTime - 18.0) / 1.0;
    }

    // Gold/orange tint at sunrise/sunset
    vec3 sunsetTint = mix(
      sky,
      sky * vec3(1.2, 0.8, 0.5),
      sunriseBlend * 0.7
    );

    // Night: stars + deep blue
    float nightBlend = 0.0;
    if (uTime < 5.5 || uTime > 19.0) {
      nightBlend = max(0.0, min(1.0, (uTime - 19.0) / 0.5));
      if (uTime < 5.5) nightBlend = 1.0;
    }

    vec3 nightSky = vec3(0.01, 0.02, 0.05) + vec3(0.05, 0.1, 0.2) * (1.0 - nightBlend);
    
    // Twinkle stars (pseudo-random)
    if (nightBlend > 0.5) {
      vec3 starNoise = fract(sin(rayDir * 1000.0) * 43758.5453);
      nightSky += starNoise * 0.3 * nightBlend;
    }

    vec3 finalSky = mix(sunsetTint, nightSky, nightBlend);

    // Tone mapping
    finalSky = finalSky / (finalSky + vec3(1.0));
    finalSky = pow(finalSky, vec3(1.0 / 2.2)); // sRGB

    gl_FragColor = vec4(finalSky, 1.0);
  }
`;

// ─── RealisticSkyRenderer Class ────────────────────────────────────────────

export default class RealisticSkyRenderer {
  constructor() {
    this._gl = null;
    this._map = null;
    this._program = null;
    this._vao = null;
    this._vbo = null;
    this._currentHour = 12;
    this._u = {};
  }

  get customLayer() {
    return {
      id: 'realistic-sky',
      type: 'custom',
      renderingMode: '3d',
      onAdd:    (map, gl) => this._onAdd(map, gl),
      render:   (gl, matrix) => this._onRender(gl, matrix),
      onRemove: ()           => this._onRemove(),
    };
  }

  setTime(hour) {
    this._currentHour = Math.max(0, Math.min(23.99, hour));
    if (this._map) this._map.triggerRepaint();
  }

  _onAdd(map, gl) {
    this._map = map;
    this._gl = gl;

    try {
      this._program = this._compileProgram(gl, SKY_VERT, SKY_FRAG);
      this._cacheUniformLocations(gl);

      // Create fullscreen quad
      this._vbo = gl.createBuffer();
      const quadVertices = new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
         1,  1,
      ]);
      gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);
      gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);

      log.info('RealisticSkyRenderer added');
    } catch (err) {
      log.error('RealisticSkyRenderer init failed:', err);
    }
  }

  _onRemove() {
    const gl = this._gl;
    if (!gl) return;
    if (this._vbo)     gl.deleteBuffer(this._vbo);
    if (this._program) gl.deleteProgram(this._program);
    this._program = null;
    this._vbo = null;
    this._map = null;
    this._gl = null;
  }

  _onRender(gl, matrix) {
    if (!this._program || !this._vbo) return;

    const map = this._map;
    if (!map) return;

    const zoom = map.getZoom();
    const pitch = map.getPitch();

    // Only render in terrain mode with pitch
    if (zoom < 10 || pitch < 20) return;

    gl.useProgram(this._program);

    // Compute sun direction from hour
    const hour = this._currentHour;
    const azimuth = (hour / 24) * Math.PI * 2;
    const elevRaw = Math.sin(((hour - 6) / 12) * Math.PI);
    const elevation = Math.max(-20 * Math.PI / 180, elevRaw * 78 * Math.PI / 180);
    const sunDir = [
      Math.cos(elevation) * Math.sin(azimuth),
      Math.sin(elevation),
      -Math.cos(elevation) * Math.cos(azimuth),
    ];
    const len = Math.sqrt(sunDir[0] * sunDir[0] + sunDir[1] * sunDir[1] + sunDir[2] * sunDir[2]);
    sunDir[0] /= len;
    sunDir[1] /= len;
    sunDir[2] /= len;

    const sunInt = Math.max(0, elevRaw);

    // Camera
    const center = map.getCenter();
    const camMC = maplibregl.MercatorCoordinate.fromLngLat(center, 0);

    // Set uniforms
    const u = this._u;
    gl.uniform3fv(u.uSunDir, sunDir);
    gl.uniform3f(u.uCameraPos, camMC.x, camMC.y, 0.0);
    gl.uniformMatrix4fv(u.uInvViewProj, false, this._invertMatrix(matrix));
    gl.uniform1f(u.uSunIntensity, sunInt);
    gl.uniform1f(u.uTime, hour);

    // Draw fullscreen quad
    const posLoc = gl.getAttribLocation(this._program, 'aPosition');
    gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 8, 0);

    const depthTest = gl.getParameter(gl.DEPTH_TEST);
    gl.disable(gl.DEPTH_TEST);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (depthTest) gl.enable(gl.DEPTH_TEST);

    gl.disableVertexAttribArray(posLoc);
  }

  _compileProgram(gl, vertSrc, fragSrc) {
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        throw new Error(`Shader error: ${gl.getShaderInfoLog(s)}`);
      }
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vertSrc));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fragSrc));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`Program link error: ${gl.getProgramInfoLog(prog)}`);
    }
    return prog;
  }

  _cacheUniformLocations(gl) {
    const prog = this._program;
    this._u = {
      uSunDir: gl.getUniformLocation(prog, 'uSunDir'),
      uCameraPos: gl.getUniformLocation(prog, 'uCameraPos'),
      uInvViewProj: gl.getUniformLocation(prog, 'uInvViewProj'),
      uSunIntensity: gl.getUniformLocation(prog, 'uSunIntensity'),
      uTime: gl.getUniformLocation(prog, 'uTime'),
    };
  }

  _invertMatrix(m) {
    const inv = new Float32Array(16);
    const m00 = m[0], m01 = m[1], m02 = m[2], m03 = m[3];
    const m10 = m[4], m11 = m[5], m12 = m[6], m13 = m[7];
    const m20 = m[8], m21 = m[9], m22 = m[10], m23 = m[11];
    const m30 = m[12], m31 = m[13], m32 = m[14], m33 = m[15];

    const b00 = m00 * m11 - m01 * m10;
    const b01 = m00 * m12 - m02 * m10;
    const b02 = m00 * m13 - m03 * m10;
    const b03 = m01 * m12 - m02 * m11;
    const b04 = m01 * m13 - m03 * m11;
    const b05 = m02 * m13 - m03 * m12;
    const b06 = m20 * m31 - m21 * m30;
    const b07 = m20 * m32 - m22 * m30;
    const b08 = m20 * m33 - m23 * m30;
    const b09 = m21 * m32 - m22 * m31;
    const b10 = m21 * m33 - m23 * m31;
    const b11 = m22 * m33 - m23 * m32;

    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (det === 0) return m; // Fallback

    det = 1.0 / det;

    inv[0] = (m11 * b11 - m12 * b10 + m13 * b09) * det;
    inv[1] = (m02 * b10 - m01 * b11 - m03 * b09) * det;
    inv[2] = (m31 * b05 - m32 * b04 + m33 * b03) * det;
    inv[3] = (m12 * b04 - m11 * b05 - m13 * b03) * det;
    inv[4] = (m12 * b08 - m10 * b11 - m13 * b07) * det;
    inv[5] = (m00 * b11 - m02 * b08 + m03 * b07) * det;
    inv[6] = (m32 * b02 - m30 * b05 - m33 * b01) * det;
    inv[7] = (m10 * b05 - m12 * b02 + m13 * b01) * det;
    inv[8] = (m10 * b10 - m11 * b08 + m13 * b06) * det;
    inv[9] = (m01 * b08 - m00 * b10 - m03 * b06) * det;
    inv[10] = (m30 * b04 - m31 * b02 + m33 * b00) * det;
    inv[11] = (m11 * b02 - m10 * b04 - m13 * b00) * det;
    inv[12] = (m11 * b07 - m10 * b09 - m12 * b06) * det;
    inv[13] = (m00 * b09 - m01 * b07 + m02 * b06) * det;
    inv[14] = (m31 * b01 - m30 * b03 - m32 * b00) * det;
    inv[15] = (m10 * b03 - m11 * b01 + m12 * b00) * det;

    return inv;
  }
}
