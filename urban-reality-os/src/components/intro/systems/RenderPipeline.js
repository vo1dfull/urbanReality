import {
  EffectComposer,
  RenderPass,
  EffectPass,
  BloomEffect,
  DepthOfFieldEffect,
  VignetteEffect,
} from 'postprocessing';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader';
import * as THREE from 'three';

/**
 * AAA Graphics Pipeline
 * Handles all post-processing: bloom, depth of field, vignette
 * + HDR environment lighting for photorealistic rendering
 */
export function createRenderPipeline(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);

  // Base render pass
  composer.addPass(new RenderPass(scene, camera));

  // Post-processing effects (tuned for photorealism)
  const bloom = new BloomEffect({
    intensity: 1.2, // Reduced for realism
    luminanceThreshold: 0.4, // Higher threshold = only bright lights glow
    mipmapBlur: true,
  });

  const dof = new DepthOfFieldEffect(camera, {
    focusDistance: 0.02,
    focalLength: 0.03,
    bokehScale: 2,
  });

  const vignette = new VignetteEffect({
    darkness: 0.5,
    offset: 0.35,
  });

  composer.addPass(new EffectPass(camera, bloom, dof, vignette));

  // ════════════════════════════════════════════════════════════════════════
  // 🌍 HDR ENVIRONMENT LIGHTING (PHOTOREALISM CORE)
  // ════════════════════════════════════════════════════════════════════════

  // Load HDR for realistic reflections & lighting
  const rgbeLoader = new RGBELoader();
  
  // Option 1: Load from your own HDR file
  // Place your .hdr file in /public/hdr/
  rgbeLoader.load('/hdr/city.hdr', (hdri) => {
    hdri.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = hdri;
    // Optional: use as background for ultra-realism
    // scene.background = hdri;
  });

  // Option 2: Fallback - use gradient environment if no HDR
  // This ensures the scene still looks good without HDR
  setupFallbackEnvironment(scene);

  return composer;
}

/**
 * Fallback environment if HDR is not available
 * Creates a subtle sky gradient for reflections
 */
function setupFallbackEnvironment(scene) {
  // This runs if HDR fails to load
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Create dark sky gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, '#1a1a2e'); // dark top
  gradient.addColorStop(0.5, '#16213e'); // mid
  gradient.addColorStop(1, '#0f3460'); // lighter bottom

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);

  const envTexture = new THREE.CanvasTexture(canvas);
  envTexture.mapping = THREE.EquirectangularReflectionMapping;
  
  // Set as fallback (will be overridden by HDR if it loads)
  if (!scene.environment) {
    scene.environment = envTexture;
  }
}
