// ================================================
// SpaceRenderer — WebGL Star Field for Satellite Mode
// Production-level, performant, cinematic space rendering
// ================================================
import { createLogger } from '../core/Logger';

const log = createLogger('SpaceRenderer');

/**
 * WebGL-based star field renderer for satellite mode
 * Features: 1000-3000 stars, random brightness, subtle twinkle, performance optimized
 */
class SpaceRenderer {
  constructor() {
    this.gl = null;
    this.program = null;
    this.starBuffer = null;
    this.starCount = 0;
    this.animationId = null;
    this.isEnabled = false;
    this.time = 0;
    this.starData = [];
    this.performanceMode = false;

    // Shader sources
    this.vertexShaderSource = `
      attribute vec2 aPosition;
      attribute float aBrightness;
      attribute float aTwinkleSpeed;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vBrightness;
      varying float vTwinkle;

      void main() {
        gl_Position = vec4(aPosition, 0.999, 1.0);
        gl_PointSize = (1.5 + aBrightness * 2.5) * uPixelRatio;

        float twinkle = sin(uTime * aTwinkleSpeed + aPosition.x * 10.0) * 0.25 + 0.75;
        vBrightness = aBrightness;
        vTwinkle = twinkle;
      }
    `;

    this.fragmentShaderSource = `
      precision mediump float;
      varying float vBrightness;
      varying float vTwinkle;

      void main() {
        // Create circular star with soft glow
        vec2 center = gl_PointCoord - vec2(0.5);
        float dist = length(center);

        if (dist > 0.5) discard;

        // Soft circular falloff
        float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
        alpha *= vBrightness * vTwinkle;

        // Star color with slight blue tint for space realism
        vec3 color = mix(vec3(1.0, 1.0, 0.95), vec3(0.8, 0.9, 1.0), vBrightness * 0.3);

        gl_FragColor = vec4(color, alpha);
      }
    `;
  }

  /**
   * Initialize the WebGL star field
   * @param {WebGLRenderingContext} gl
   * @param {number} starCount - Number of stars (1000-3000)
   */
  init(gl, starCount = 2000, map = null) {
    this.gl = gl;
    this._map = map;
    this.starCount = Math.min(Math.max(starCount, 500), 3000); // Clamp between 500-3000

    try {
      // Create shaders
      const vertexShader = this.createShader(gl.VERTEX_SHADER, this.vertexShaderSource);
      const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, this.fragmentShaderSource);

      // Create program
      this.program = gl.createProgram();
      gl.attachShader(this.program, vertexShader);
      gl.attachShader(this.program, fragmentShader);
      gl.linkProgram(this.program);

      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
        throw new Error('Shader program linking failed: ' + gl.getProgramInfoLog(this.program));
      }

      // Generate star data
      this.generateStars();

      // Create buffer
      this.starBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.starBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.starData), gl.STATIC_DRAW);

      log.info(`SpaceRenderer initialized with ${this.starCount} stars`);
    } catch (error) {
      log.error('Failed to initialize SpaceRenderer:', error);
      this.cleanup();
    }
  }

  /**
   * Generate random star positions and properties
   */
  generateStars() {
    this.starData = [];

    for (let i = 0; i < this.starCount; i++) {
      const x = Math.random() * 2.0 - 1.0;
      const y = Math.random() * 2.0 - 1.0;

      const brightness = 0.15 + Math.random() * 0.85;
      const twinkleSpeed = 0.3 + Math.random() * 2.5;

      this.starData.push(x, y, brightness, twinkleSpeed);
    }
  }

  /**
   * Create WebGL shader
   */
  createShader(type, source) {
    const shader = this.gl.createShader(type);
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      const error = this.gl.getShaderInfoLog(shader);
      this.gl.deleteShader(shader);
      throw new Error(`Shader compilation failed: ${error}`);
    }

    return shader;
  }

  /**
   * Enable space rendering
   */
  enable() {
    if (this.isEnabled) return;
    this.isEnabled = true;
    this.startAnimation();
    log.info('SpaceRenderer enabled');
  }

  /**
   * Disable space rendering
   */
  disable() {
    if (!this.isEnabled) return;
    this.isEnabled = false;
    this.stopAnimation();
    log.info('SpaceRenderer disabled');
  }

  /**
   * Set performance mode (reduces star count and animation)
   */
  setPerformanceMode(enabled) {
    this.performanceMode = enabled;
    if (enabled && this.starCount > 1000) {
      // Reduce star count in performance mode
      this.starCount = 1000;
      this.generateStars();
      if (this.gl && this.starBuffer) {
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.starBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(this.starData), this.gl.STATIC_DRAW);
        this._map?.triggerRepaint();
      }
    }
  }

  /**
   * Start animation loop
   */
  startAnimation() {
    if (this.animationId) return;

    const animate = (timestamp) => {
      if (!this.isEnabled) return;

      this.time = timestamp * 0.001; // Convert to seconds
      this._map?.triggerRepaint();
      this.animationId = requestAnimationFrame(animate);
    };

    this.animationId = requestAnimationFrame(animate);
  }

  /**
   * Stop animation loop
   */
  stopAnimation() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  /**
   * Render stars (called by MapLibre custom layer)
   * @param {WebGLRenderingContext} gl
   * @param {Float32Array} matrix - MapLibre projection matrix
   */
  render(gl, matrix) {
    if (!this.isEnabled || !this.program || !this.starBuffer) return;

    const blendWasEnabled = gl.getParameter(gl.BLEND);
    const depthWasEnabled = gl.getParameter(gl.DEPTH_TEST);
    const prevBlendSrc = gl.getParameter(gl.BLEND_SRC_RGB);
    const prevBlendDst = gl.getParameter(gl.BLEND_DST_RGB);

    gl.useProgram(this.program);

    const timeLoc = gl.getUniformLocation(this.program, 'uTime');
    const pixelRatioLoc = gl.getUniformLocation(this.program, 'uPixelRatio');
    gl.uniform1f(timeLoc, this.time);
    gl.uniform1f(pixelRatioLoc, window.devicePixelRatio || 1);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.starBuffer);

    const positionLoc = gl.getAttribLocation(this.program, 'aPosition');
    const brightnessLoc = gl.getAttribLocation(this.program, 'aBrightness');
    const twinkleLoc = gl.getAttribLocation(this.program, 'aTwinkleSpeed');

    gl.enableVertexAttribArray(positionLoc);
    gl.enableVertexAttribArray(brightnessLoc);
    gl.enableVertexAttribArray(twinkleLoc);

    const STRIDE = 16;
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, STRIDE, 0);
    gl.vertexAttribPointer(brightnessLoc, 1, gl.FLOAT, false, STRIDE, 8);
    gl.vertexAttribPointer(twinkleLoc, 1, gl.FLOAT, false, STRIDE, 12);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // additive blending for stars
    gl.disable(gl.DEPTH_TEST);

    gl.drawArrays(gl.POINTS, 0, this.starCount);

    // Restore exactly what was there before
    gl.blendFunc(prevBlendSrc, prevBlendDst);
    if (!blendWasEnabled) gl.disable(gl.BLEND);
    if (depthWasEnabled) gl.enable(gl.DEPTH_TEST);
  }

  /**
   * Cleanup WebGL resources
   */
  cleanup() {
    this.disable();

    if (this.gl && this.program) {
      const positionLoc = this.gl.getAttribLocation(this.program, 'aPosition');
      const brightnessLoc = this.gl.getAttribLocation(this.program, 'aBrightness');
      const twinkleLoc = this.gl.getAttribLocation(this.program, 'aTwinkleSpeed');
      if (positionLoc >= 0) this.gl.disableVertexAttribArray(positionLoc);
      if (brightnessLoc >= 0) this.gl.disableVertexAttribArray(brightnessLoc);
      if (twinkleLoc >= 0) this.gl.disableVertexAttribArray(twinkleLoc);
      this.gl.deleteProgram(this.program);
      this.program = null;
    }

    if (this.gl && this.starBuffer) {
      this.gl.deleteBuffer(this.starBuffer);
      this.starBuffer = null;
    }

    this.gl = null;
    this._map = null;
    this.starData = [];
    log.info('SpaceRenderer cleaned up');
  }
}

export default SpaceRenderer;