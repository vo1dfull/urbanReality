import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as THREE from 'three';
import { createCityGrid, createRoadLines, createParticleField } from './CityBuildAnimation';
import IntroOverlay from './IntroOverlay';

const TOTAL_DURATION = 4.0;

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

    const camera = new THREE.PerspectiveCamera(26, width / height, 0.1, 250);
    camera.position.set(0, 10, 28);
    camera.lookAt(0, 2, 0);

    const ambientLight = new THREE.AmbientLight(0x4a7eff, 0.22);
    scene.add(ambientLight);

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

    const animate = (time) => {
      if (!startTime) {
        startTime = time;
        console.log('[IntroScene] Animation started');
      }
      const elapsed = (time - startTime) / 1000;
      const progress = Math.min(elapsed / TOTAL_DURATION, 1);

      // Phase 1: black void + ambient glow
      if (elapsed < 0.5) {
        ambientLight.intensity = 0.08 + elapsed * 0.24;
        coreLight.intensity = 0;
        coreSphere.scale.setScalar(0.35 + elapsed * 0.5);
        plane.material.color.lerp(new THREE.Color(0x070f1a), 0.4);
      }

      // Phase 2: energy formation
      if (elapsed >= 0.5 && elapsed < 1.2) {
        const stage = (elapsed - 0.5) / 0.7;
        coreLight.intensity = THREE.MathUtils.lerp(0, 1.8, stage);
        ringLight.intensity = THREE.MathUtils.lerp(0, 0.45, stage);
        coreSphere.scale.setScalar(0.85 + stage * 0.5);
        const glow = Math.sin(stage * Math.PI) * 0.18;
        coreHalo.material.opacity = 0.12 + glow;
      }

      // Phase 3: city generation
      if (elapsed >= 1.2 && elapsed < 2.5) {
        const stage = Math.min((elapsed - 1.2) / 1.3, 1);
        city.children.forEach((building) => {
          const target = building.userData.targetScaleY;
          const buildProgress = Math.max(0, (stage - building.userData.delay / TOTAL_DURATION) * 1.8);
          building.scale.y = THREE.MathUtils.lerp(0.02, target, Math.min(buildProgress, 1));
          building.position.y = building.scale.y * 0.5;
        });

        lineDrawDurations.forEach((entry, index) => {
          const drawStage = Math.min(Math.max((elapsed - 1.35 - index * 0.12) / 0.7, 0), 1);
          entry.line.geometry.setDrawRange(0, Math.round(entry.pathLength * drawStage));
        });
      }

      // Phase 4: AI activation
      if (elapsed >= 2.5) {
        const stage = Math.min((elapsed - 2.5) / 0.7, 1);
        coreLight.intensity = 1.8 + stage * 1.2;
        ringLight.intensity = 0.45 + stage * 0.45;
        city.children.forEach((building, index) => {
          building.material.emissiveIntensity = 0.16 + Math.sin(elapsed * 4 + index) * 0.04;
        });
        particles.rotation.y += 0.0012;
        if (!textVisibleRef.current) {
          textVisibleRef.current = true;
          setShowText(true);
        }
      }

      if (elapsed >= 3.2) {
        const stage = Math.min((elapsed - 3.2) / 0.8, 1);
        camera.position.set(0, 7 + stage * 4.2, 22 - stage * 10.5);
        camera.rotation.x = THREE.MathUtils.lerp(0, -0.08, stage);
        camera.lookAt(0, 2.6, 0);
      }

      const particlePositions = particles.geometry.attributes.position;
      for (let i = 0; i < particlePositions.count; i++) {
        let y = particlePositions.getY(i);
        y += Math.sin(elapsed * 1.3 + i) * 0.0008;
        if (y > 13) y = 0.8;
        particlePositions.setY(i, y);
      }
      particlePositions.needsUpdate = true;

      renderer.render(scene, camera);

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
    <AnimatePresence>
      <motion.div
        className="intro-scene"
        initial={{ opacity: 1 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, scale: 1.02 }}
        transition={{ duration: 0.4, ease: 'easeInOut' }}
      >
        <canvas ref={canvasRef} className="intro-scene__canvas" />
        <IntroOverlay showText={showText} />
      </motion.div>
    </AnimatePresence>
  );
}
