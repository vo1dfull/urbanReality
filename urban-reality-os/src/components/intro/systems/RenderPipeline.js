import {
  EffectComposer,
  RenderPass,
  EffectPass,
  BloomEffect,
  DepthOfFieldEffect,
  VignetteEffect,
} from 'postprocessing';

/**
 * AAA Graphics Pipeline
 * Handles all post-processing: bloom, depth of field, vignette
 */
export function createRenderPipeline(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);

  // Base render pass
  composer.addPass(new RenderPass(scene, camera));

  // Post-processing effects
  const bloom = new BloomEffect({
    intensity: 1.4,
    luminanceThreshold: 0.3,
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

  return composer;
}
