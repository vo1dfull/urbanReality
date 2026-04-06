import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { EffectComposer, RenderPass, BloomEffect, EffectPass } from 'postprocessing';
import { GLTFLoader } from 'three-stdlib';
import { createCityGrid, createRoadLines, createParticleField } from './CityBuildAnimation';
import IntroOverlay from './IntroOverlay';

const TOTAL_DURATION = 8.5;

function isLowEndDevice() {
  if (typeof navigator === 'undefined') return false;
  const cores = navigator.hardwareConcurrency || 4;
  return cores <= 2 || window.devicePixelRatio > 2.25 || !window.WebGLRenderingContext;
}

export default function IntroScene({ onComplete }) {
  const canvasRef = useRef(null);
  const textVisibleRef = useRef(false);
  const [showText, setShowText] = useState(false);

  console.log('[IntroScene] Mounted', { canvasRef: !!canvasRef.current });

  useEffect(() => {
    const canvas = canvasRef.current;
    console.log('[IntroScene] useEffect running', { canvas: !!canvas, width: canvas?.clientWidth, height: canvas?.clientHeight });
    if (!canvas) return;

    const lowEnd = isLowEndDevice();
    if (lowEnd) {
      const fallbackTimer = window.setTimeout(() => onComplete?.(), 2800);
      const textTimer = window.setTimeout(() => setShowText(true), 1400);
      return () => {
        window.clearTimeout(fallbackTimer);
        window.clearTimeout(textTimer);
      };
    }

    // Ensure canvas has dimensions (use window dimensions as fallback)
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;

    console.log('[IntroScene] Renderer params', { width, height, devicePixelRatio: window.devicePixelRatio });

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    console.log('[IntroScene] WebGL Renderer created', { renderer: !!renderer });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(width, height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x070f1a, 1);
    console.log('[IntroScene] Renderer configured');

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070f1a);
    scene.fog = new THREE.FogExp2(0x070f1a, 0.04);

    const camera = new THREE.PerspectiveCamera(26, width / height, 0.1, 250);
    camera.position.set(0, 10, 28);
    camera.lookAt(0, 2, 0);

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    const ambientLight = new THREE.AmbientLight(0x4a7eff, 0.22);
    scene.add(ambientLight);

    // Cinematic directional light
    const dirLight = new THREE.DirectionalLight(0x6bf2ff, 1.2);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);

    // Rim light for depth
    const rimLight = new THREE.PointLight(0xd874ff, 1.5, 50);
    rimLight.position.set(-10, 6, -10);
    scene.add(rimLight);

    const coreLight = new THREE.PointLight(0x60e2ff, 0.45, 80, 2);
    coreLight.position.set(0, 4.8, 0);
    scene.add(coreLight);

    const ringLight = new THREE.PointLight(0x9d66ff, 0.15, 50, 2);
    ringLight.position.set(0, 6.5, 0);
    scene.add(ringLight);

    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(62, 62, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x050819, roughness: 0.98, metalness: 0.02 })
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -0.04;
    scene.add(plane);

    const grid = new THREE.GridHelper(58, 14, 0x1a4063, 0x0b1732);
    grid.material.transparent = true;
    grid.material.opacity = 0.14;
    scene.add(grid);

    const city = createCityGrid();
    scene.add(city);

    const roads = createRoadLines();
    scene.add(roads);

    const particles = createParticleField();
    scene.add(particles);

    const coreSphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.3, 24, 18),
      new THREE.MeshStandardMaterial({
        color: 0x7ff8ff,
        emissive: 0x4fc9ff,
        emissiveIntensity: 0.8,
        transparent: true,
        opacity: 0.95,
        roughness: 0.1,
        metalness: 0.25,
      })
    );
    coreSphere.position.set(0, 2.2, 0);
    scene.add(coreSphere);

    const coreHalo = new THREE.Mesh(
      new THREE.SphereGeometry(2.3, 32, 24),
      new THREE.MeshBasicMaterial({ color: 0x4de6ff, transparent: true, opacity: 0.12 })
    );
    coreHalo.position.copy(coreSphere.position);
    scene.add(coreHalo);

    let startTime = null;
    let animationFrame = null;
    let finishTimer = null;
    const lineDrawDurations = [];

    roads.children.forEach((line) => {
      line.geometry.setDrawRange(0, 0);
      line.material = line.material.clone();
      line.material.opacity = 0.9;
      lineDrawDurations.push({ line, pathLength: line.geometry.attributes.position.count });
    });

    const resize = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    resize();
    window.addEventListener('resize', resize);

    // Post-processing setup
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    const bloomEffect = new BloomEffect({
      intensity: 2.2,
      luminanceThreshold: 0.2,
      luminanceSmoothing: 0.6,
    });

    const bloomPass = new EffectPass(camera, bloomEffect);
    composer.addPass(bloomPass);

    const animate = (time) => {
      if (!startTime) {
        startTime = time;
        console.log('[IntroScene] Animation started');
      }
      const elapsed = (time - startTime) / 1000;
      const progress = Math.min(elapsed / TOTAL_DURATION, 1);

      // Phase 1: BLACK VOID + AUDIO BOOT (0-1.2s)
      if (elapsed < 1.2) {
        scene.background = new THREE.Color(0x000000);
        coreSphere.scale.setScalar(0.05 + elapsed * 0.2);
        coreLight.intensity = elapsed * 0.3;
        camera.position.set(0, 2, 40 - elapsed * 10);
      }

      // Phase 2: ENERGY CORE IGNITION (1.2-2.0s)
      if (elapsed >= 1.2 && elapsed < 2.0) {
        const stage = (elapsed - 1.2) / 0.8;
        coreLight.intensity = THREE.MathUtils.lerp(0.36, 2.5, stage);
        ringLight.intensity = THREE.MathUtils.lerp(0, 0.8, stage);
        coreSphere.scale.setScalar(0.29 + stage * 0.8);
        coreSphere.material.emissiveIntensity = 3 + Math.sin(elapsed * 8) * 1.2;
        coreSphere.scale.setScalar(1.2 + Math.sin(elapsed * 6) * 0.15);
        coreHalo.scale.setScalar(1.5 + Math.sin(elapsed * 3) * 0.3);
        coreSphere.rotation.y += 0.02;
      }

      // Phase 3: CITY MATERIALIZATION (2.0-3.5s)
      if (elapsed >= 2.0 && elapsed < 3.5) {
        const stage = Math.min((elapsed - 2.0) / 1.5, 1);
        city.children.forEach((building, i) => {
          const delay = i * 0.04;
          const t = Math.max(0, (elapsed - 2.0 - delay) * 1.2);
          const height = building.userData.targetScaleY;
          building.scale.y = Math.min(height, t * height);
          building.position.y = building.scale.y * 0.5;
          if (t > 0.6) {
            building.material.emissiveIntensity = 0.5 + Math.sin(i + elapsed * 5) * 0.2;
          }
        });

        roads.children.forEach((line, i) => {
          const t = Math.max(0, (elapsed - 2.5 - i * 0.15));
          line.geometry.setDrawRange(0, Math.floor(t * 80));
          line.material.opacity = 0.5 + Math.sin(elapsed * 5 + i) * 0.5;
        });
      }

      // Phase 4: AI SYSTEM LINK (3.5-5.0s)
      if (elapsed >= 3.5 && elapsed < 5.0) {
        const stage = Math.min((elapsed - 3.5) / 1.5, 1);
        coreLight.intensity = 2.5 + stage * 1.5;
        ringLight.intensity = 0.8 + stage * 0.7;
        city.children.forEach((building, index) => {
          building.material.emissiveIntensity = 0.7 + Math.sin(elapsed * 6 + index) * 0.3;
        });
        particles.rotation.y += 0.004;
        particles.rotation.x += 0.001;
        particles.material.size = 0.2 + Math.sin(elapsed * 3) * 0.08;
        if (!textVisibleRef.current) {
          textVisibleRef.current = true;
          setShowText(true);
        }
      }

      // Phase 5: CINEMATIC CAMERA REVEAL (5.0s+)
      if (elapsed >= 5.0) {
        const t = (elapsed - 5.0) * 0.4;
        camera.position.x = Math.sin(t) * 8;
        camera.position.z = 22 - t * 10;
        camera.position.y = 6 + Math.sin(t * 2) * 2;
        camera.lookAt(0, 2.5, 0);
      }

      const particlePositions = particles.geometry.attributes.position;
      for (let i = 0; i < particlePositions.count; i++) {
        let y = particlePositions.getY(i);
        y += Math.sin(elapsed * 1.3 + i) * 0.0008;
        if (y > 13) y = 0.8;
        particlePositions.setY(i, y);
      }
      particlePositions.needsUpdate = true;

      // Render with post-processing composer
      composer.render();

      if (elapsed < TOTAL_DURATION) {
        animationFrame = requestAnimationFrame(animate);
      } else {
        console.log('[IntroScene] Animation complete, calling onComplete');
        finishTimer = window.setTimeout(() => {
          console.log('[IntroScene] Final onComplete callback');
          onComplete?.();
        }, 240);
      }
    };

    animationFrame = requestAnimationFrame(animate);

    return () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      if (finishTimer) window.clearTimeout(finishTimer);
      window.removeEventListener('resize', resize);
      renderer.dispose();
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((mat) => mat.dispose());
          else obj.material.dispose();
        }
      });
    };
  }, [onComplete]);

  return (
    <div
      className="intro-scene"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        pointerEvents: 'none',
        overflow: 'hidden',
        backgroundColor: '#070f1a',
      }}
    >
      <canvas ref={canvasRef} className="intro-scene__canvas" />
      <IntroOverlay showText={showText} />
    </div>
  );
}
