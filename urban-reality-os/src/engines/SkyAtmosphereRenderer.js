// ================================================
// SkyAtmosphereRenderer — Realistic Sky for Terrain/3D Mode
// Time-based atmosphere with sunrise/sunset transitions
// ================================================
import { createLogger } from '../core/Logger';

const log = createLogger('SkyAtmosphereRenderer');

/**
 * Manages realistic sky atmosphere for terrain and 3D modes
 * Features: Time-based sun position, atmospheric scattering, smooth transitions
 */
class SkyAtmosphereRenderer {
  constructor() {
    this.map = null;
    this.isEnabled = false;
    this.currentHour = 12; // Default to noon
    this.animationId = null;
    this.performanceMode = false;
    this.timeProvider = null;
    this.skyLayerId = 'sky-atmosphere';
    this.fallbackLayerId = 'sky-fallback-layer';
    this.fallbackProgram = null;
    this.fallbackBuffer = null;
    this.fallbackStartTime = 0;
    this.fogSettings = {
      default: {
        color: "rgb(186, 210, 235)",
        "high-color": "rgb(36, 92, 223)",
        "horizon-blend": 0.02,
        "space-color": "rgb(11, 11, 25)"
      },
      space: {
        color: "rgb(11, 11, 25)",
        "high-color": "rgb(5, 5, 15)",
        "horizon-blend": 0.05,
        "space-color": "rgb(2, 2, 8)"
      }
    };
  }

  /**
   * Initialize sky atmosphere renderer
   * @param {maplibregl.Map} map
   */
  init(map) {
    this.map = map;
    log.info('SkyAtmosphereRenderer initialized');
  }

  /**
   * Setup MapLibre sky layer
   */
  setupSkyLayer() {
    if (!this.map) return;

    try {
      // Remove existing sky layer or fallback layer if present
      if (this.map.getLayer(this.skyLayerId)) {
        this.map.removeLayer(this.skyLayerId);
      }
      if (this.map.getLayer(this.fallbackLayerId)) {
        this.map.removeLayer(this.fallbackLayerId);
      }
      if (this.map.getLayer('sky-fallback')) {
        this.map.removeLayer('sky-fallback');
      }

      // Add sky layer
      this.map.addLayer({
        id: this.skyLayerId,
        type: 'sky',
        paint: {
          'sky-type': 'atmosphere',
          'sky-atmosphere-sun': this.getSunPosition(this.currentHour),
          'sky-atmosphere-sun-intensity': this.getSunIntensity(this.currentHour)
        }
      });

      log.info('Sky layer added');
    } catch (error) {
      log.warn('Sky layer unavailable, using fallback gradient layer:', error);
      try {
        this.map.addLayer(this.createFallbackLayer());
        log.info('Sky fallback gradient layer added');
      } catch (fallbackError) {
        log.error('Failed to add sky fallback layer:', fallbackError);
      }
    }
  }

  /**
   * Enable sky atmosphere rendering
   */
  enable() {
    if (this.isEnabled) return;
    this.isEnabled = true;
    this.setupSkyLayer();
    this.setFog('default');
    this.startTimeSync();
    log.info('SkyAtmosphereRenderer enabled');
  }

  /**
   * Disable sky atmosphere rendering
   */
  disable() {
    this.isEnabled = false;
    this.stopTimeSync();
    this.removeSkyLayer();
    log.info('SkyAtmosphereRenderer disabled');
  }

  /**
   * Enable space mode (dark fog, no sky)
   */
  enableSpaceMode() {
    this.stopTimeSync();
    this.isEnabled = false;
    this.setFog('space');
    this.removeSkyLayer();
  }

  /**
   * Enable atmosphere mode (sky + atmospheric fog)
   */
  enableAtmosphereMode() {
    if (!this.isEnabled) {
      this.isEnabled = true;
      this.startTimeSync();
    }
    this.setFog('default');
    if (this.map && !this.map.getLayer(this.skyLayerId)) {
      this.setupSkyLayer();
    } else {
      this.updateSky();
    }
  }

  /**
   * Remove sky layer
   */
  removeSkyLayer() {
    if (!this.map) return;

    try {
      if (this.map.getLayer(this.skyLayerId)) {
        this.map.removeLayer(this.skyLayerId);
      }
      if (this.map.getLayer(this.fallbackLayerId)) {
        this.map.removeLayer(this.fallbackLayerId);
      }
    } catch (error) {
      log.warn('Failed to remove sky layer:', error);
    }
  }

  createFallbackLayer() {
    return {
      id: this.fallbackLayerId,
      type: 'custom',
      renderingMode: '3d',
      onAdd: (map, gl) => {
        this._initFallbackGl(gl);
      },
      render: (gl) => {
        this._renderFallbackSky(gl);
      },
      onRemove: () => {
        if (this.fallbackProgram && this._fallbackGl) {
          try {
            this._fallbackGl.deleteProgram(this.fallbackProgram);
          } catch (_) {}
        }
        if (this.fallbackBuffer && this._fallbackGl) {
          try {
            this._fallbackGl.deleteBuffer(this.fallbackBuffer);
          } catch (_) {}
        }
        this.fallbackProgram = null;
        this.fallbackBuffer = null;
        this._fallbackGl = null;
      }
    };
  }

  _initFallbackGl(gl) {
    const vertexSource = `
      attribute vec2 aPosition;
      varying vec2 vPosition;
      void main() {
        vPosition = aPosition;
        gl_Position = vec4(aPosition, 0.0, 1.0);
      }
    `;
    const fragmentSource = `
      precision mediump float;
      varying vec2 vPosition;
      uniform float uTime;
      void main() {
        float t = vPosition.y * 0.5 + 0.5;
        vec3 skyTop = vec3(0.25, 0.65, 0.95);
        vec3 skyBottom = vec3(0.73, 0.91, 1.0);
        vec3 color = mix(skyBottom, skyTop, smoothstep(0.0, 1.0, t));
        float glow = exp(-pow((t - 0.85) * 12.0, 2.0)) * 0.12;
        color += glow * vec3(1.0, 0.9, 0.7);
        gl_FragColor = vec4(color, 1.0);
      }
    `;

    const createShader = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader));
      }
      return shader;
    };

    const vertexShader = createShader(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = createShader(gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program));
    }

    this.fallbackProgram = program;
    this._fallbackGl = gl;
    this.fallbackBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.fallbackBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
       1,  1,
    ]), gl.STATIC_DRAW);
    this.fallbackStartTime = performance.now();
  }

  _renderFallbackSky(gl) {
    if (!this.fallbackProgram || !this.fallbackBuffer) return;

    const prevViewport = gl.getParameter(gl.VIEWPORT);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

    const posLoc = gl.getAttribLocation(this.fallbackProgram, 'aPosition');
    const timeLoc = gl.getUniformLocation(this.fallbackProgram, 'uTime');

    gl.useProgram(this.fallbackProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.fallbackBuffer);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const elapsed = (performance.now() - this.fallbackStartTime) * 0.001;
    if (timeLoc) {
      gl.uniform1f(timeLoc, elapsed);
    }

    const blendOn = gl.getParameter(gl.BLEND);
    const depthOn = gl.getParameter(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    if (!blendOn) gl.disable(gl.BLEND);
    if (depthOn) gl.enable(gl.DEPTH_TEST);
    gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3]);
  }

  /**
   * Set fog configuration
   * @param {string} mode - 'default' or 'space'
   */
  setFog(mode) {
    if (!this.map) return;

    const fogConfig = this.fogSettings[mode] || this.fogSettings.default;

    try {
      this.map.setFog(fogConfig);
      log.info(`Fog set to ${mode} mode`);
    } catch (error) {
      log.warn('Failed to set fog:', error);
    }
  }

  /**
   * Update current time (0-23.99)
   * @param {number} hour
   */
  setTime(hour) {
    this.currentHour = Math.max(0, Math.min(23.99, hour));
    this.updateSky();
  }

  /**
   * Get sun position based on hour
   * @param {number} hour
   * @returns {Array<number>} [azimuth, elevation]
   */
  getSunPosition(hour) {
    // Convert hour to angle (0 = midnight, 12 = noon)
    const angle = ((hour - 6) / 12) * Math.PI; // -π/2 to π/2 (dawn to dusk)

    // Azimuth: East to West
    const azimuth = Math.PI - angle; // Start from East, move West

    // Elevation: Sine wave from -π/2 to π/2
    const elevation = Math.sin(angle) * Math.PI / 2;

    return [azimuth, elevation];
  }

  /**
   * Get sun intensity based on hour
   * @param {number} hour
   * @returns {number} Intensity 0-20
   */
  getSunIntensity(hour) {
    // Peak at noon, zero at night
    const dayProgress = Math.sin(((hour - 6) / 12) * Math.PI);
    const intensity = Math.max(0, dayProgress) * 20;

    // Soften transitions
    return intensity * intensity * 0.8;
  }

  /**
   * Update sky based on current time
   */
  updateSky() {
    if (!this.map || !this.isEnabled) return;
    if (!this.map.getLayer(this.skyLayerId)) return;

    try {
      const sunPosition = this.getSunPosition(this.currentHour);
      const sunIntensity = this.getSunIntensity(this.currentHour);

      this.map.setPaintProperty(this.skyLayerId, 'sky-atmosphere-sun', sunPosition);
      this.map.setPaintProperty(this.skyLayerId, 'sky-atmosphere-sun-intensity', sunIntensity);

      this.updateFogColor();
    } catch (error) {
      log.warn('Failed to update sky:', error);
    }
  }

  /**
   * Compute dynamic map.setLight config for the current hour.
   * Returns null when sky mode is not active (caller decides whether to apply).
   * @returns {{anchor: string, color: string, intensity: number, position: number[]} | null}
   */
  getLightConfig() {
    const hour = this.currentHour;
    const isDay = hour >= 6 && hour <= 18;
    const isDawnDusk = (hour >= 5 && hour < 6) || (hour > 18 && hour <= 19);

    // Azimuth sweeps 0→360 over 24h; elevation peaks at noon
    const azimuth = (hour / 24) * 360;
    const elevationRaw = Math.sin(((hour - 6) / 12) * Math.PI);
    const elevation = Math.max(5, elevationRaw * 75); // clamp to 5° min so light never goes underground

    if (isDay) {
      // Warm white sun, full intensity at noon
      const intensity = 0.35 + Math.max(0, elevationRaw) * 0.45;
      return { anchor: 'map', color: '#fffbe6', intensity, position: [1.5, azimuth, elevation] };
    } else if (isDawnDusk) {
      // Golden hour — warm orange
      return { anchor: 'map', color: '#ffb347', intensity: 0.3, position: [1.5, azimuth, 10] };
    } else {
      // Night — cool blue moonlight
      return { anchor: 'map', color: '#334466', intensity: 0.15, position: [1.5, azimuth, 30] };
    }
  }

  /**
   * Update fog color based on time of day
   */
  updateFogColor() {
    if (!this.map) return;

    const hour = this.currentHour;
    let fogColor, highColor;

    if (hour >= 6 && hour <= 18) {
      // Daytime: blue sky
      fogColor = "rgb(186, 210, 235)";
      highColor = "rgb(36, 92, 223)";
    } else if ((hour >= 5 && hour < 6) || (hour > 18 && hour <= 19)) {
      // Dawn/dusk: warm tones
      fogColor = "rgb(255, 180, 150)";
      highColor = "rgb(255, 120, 80)";
    } else {
      // Night: dark blue
      fogColor = "rgb(20, 30, 60)";
      highColor = "rgb(5, 10, 25)";
    }

    try {
      const existingFog = this.map.getFog() ?? {};
      this.map.setFog({
        ...existingFog,
        color: fogColor,
        "high-color": highColor
      });
    } catch (error) {
      // Fog might not be set yet
    }
  }

  /**
   * Start time synchronization (for smooth animations)
   */
  startTimeSync() {
    if (this.animationId) return;

    let lastUpdate = Date.now();
    const updateInterval = this.performanceMode ? 5000 : 1000; // Update every 1-5 seconds

    const sync = () => {
      if (!this.isEnabled) return;

      const now = Date.now();
      const updateInterval = this.performanceMode ? 5000 : 1000;
      if (now - lastUpdate >= updateInterval) {
        const realHour = typeof this.timeProvider === 'function'
          ? this.timeProvider()
          : (new Date().getHours() + new Date().getMinutes() / 60) % 24;
        this.setTime(realHour);
        lastUpdate = now;
      }

      this.animationId = requestAnimationFrame(sync);
    };

    this.animationId = requestAnimationFrame(sync);
  }

  /**
   * Stop time synchronization
   */
  stopTimeSync() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  /**
   * Set performance mode
   * @param {boolean} enabled
   */
  setPerformanceMode(enabled) {
    this.performanceMode = enabled;
    if (enabled) {
      this.stopTimeSync();
      // Reduce sky complexity if needed
    } else if (this.isEnabled) {
      this.startTimeSync();
    }
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    this.disable();
    this.map = null;
    log.info('SkyAtmosphereRenderer cleaned up');
  }
}

export default SkyAtmosphereRenderer;