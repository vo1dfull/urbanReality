import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky';

import { buildWorld } from './systems/WorldBuilder';
import { createRenderPipeline } from './systems/RenderPipeline';
import { CameraDirector } from './systems/CameraDirector';
import { Timeline } from './systems/Timeline';
import IntroOverlay from './IntroOverlay';

const TOTAL_DURATION = 12.5;

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function easeOutQuint(t) {
  return 1 - Math.pow(1 - t, 5);
}

function isLowEndDevice() {
  if (typeof navigator === 'undefined') return false;
  const cores = navigator.hardwareConcurrency || 4;
  return cores <= 2 || !window.WebGLRenderingContext;
}

export default function IntroScene({ onComplete }) {
  const canvasRef = useRef(null);
  const [showText, setShowText] = useState(false);
  const [hudPhase, setHudPhase] = useState(0);
  const [progressPct, setProgressPct] = useState(0);
  const [typingText, setTypingText] = useState('INITIALIZING...');
  const textShownRef = useRef(false);
  const stoppedRef = useRef(false);

  const TYPING_SEQUENCE = [
    'INITIALIZING...',
    'LOADING TERRAIN...',
    'CONSTRUCTING GRID...',
    'POPULATING DISTRICT...',
    'ACTIVATING SYSTEMS...',
    'SIMULATION ONLINE',
  ];

  // 🔥 SKIP BUTTON HANDLER
  const handleSkip = () => {
    stoppedRef.current = true;
    onComplete?.();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Low-end device fallback
    if (isLowEndDevice()) {
      const t1 = setTimeout(() => setHudPhase(3), 600);
      const t2 = setTimeout(() => setShowText(true), 1400);
      const t3 = setTimeout(() => onComplete?.(), 3000);
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }

    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;

    // ════════════════════════════════════════════════════════════════════════
    // RENDERER SETUP
    // ════════════════════════════════════════════════════════════════════════

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height, false);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // ════════════════════════════════════════════════════════════════════════
    // SCENE SETUP
    // ════════════════════════════════════════════════════════════════════════

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x08101e);
    scene.fog = new THREE.FogExp2(0x0d1828, 0.0025);

    // Physical sky
    const sky = new Sky();
    sky.scale.setScalar(450000);
    scene.add(sky);
    const sunPosition = new THREE.Vector3(100, 200, 100);
    sky.material.uniforms['sunPosition'].value.copy(sunPosition);

    // ════════════════════════════════════════════════════════════════════════
    // CAMERA SETUP
    // ════════════════════════════════════════════════════════════════════════

    const camera = new THREE.PerspectiveCamera(36, width / height, 0.5, 700);
    camera.position.set(150, 95, 150);
    camera.lookAt(0, 14, 0);

    // ════════════════════════════════════════════════════════════════════════
    // LIGHTING SETUP
    // ════════════════════════════════════════════════════════════════════════

    // Sun (main directional light with shadows)
    const sun = new THREE.DirectionalLight(0xfff4dd, 2.4);
    sun.position.set(100, 200, 80);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.far = 500;
    sun.shadow.camera.left = -220;
    sun.shadow.camera.right = 220;
    sun.shadow.camera.top = 220;
    sun.shadow.camera.bottom = -220;
    sun.shadow.bias = -0.0002;
    scene.add(sun);

    // Hemisphere light (ambient)
    const hemi = new THREE.HemisphereLight(0x3a6fa8, 0x1a2a18, 1.0);
    scene.add(hemi);

    // Street glow (warm city light from below)
    const streetGlow = new THREE.PointLight(0xff7733, 0.4, 400);
    streetGlow.position.set(0, 5, 0);
    scene.add(streetGlow);

    // ════════════════════════════════════════════════════════════════════════
    // SYSTEM INITIALIZATION
    // ════════════════════════════════════════════════════════════════════════

    // World system
    const world = buildWorld(scene);

    // Graphics pipeline
    const composer = createRenderPipeline(renderer, scene, camera);

    // Camera director
    const director = new CameraDirector(camera);

    // Animation timeline
    const timeline = new Timeline();

    // ════════════════════════════════════════════════════════════════════════
    // RESIZE HANDLING
    // ════════════════════════════════════════════════════════════════════════

    const onResize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
    };

    window.addEventListener('resize', onResize);

    // ════════════════════════════════════════════════════════════════════════
    // ANIMATION LOOP
    // ════════════════════════════════════════════════════════════════════════

    let startTime = null;
    let rafId = null;
    let finishTimer = null;

    const skyNight = new THREE.Color(0x08101e);
    const skyDeep = new THREE.Color(0x0d1828);

    const animate = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const elapsed = (timestamp - startTime) / 1000;
      const progress = Math.min(elapsed / TOTAL_DURATION, 1);

      // 🔥 STOP ANIMATION IF SKIP PRESSED
      if (stoppedRef.current) return;

      // ────────────────────────────────────────────────────────────────────
      // SKY & ATMOSPHERE
      // ────────────────────────────────────────────────────────────────────

      const skyT = timeline.sky(elapsed);
      const currentSky = new THREE.Color().lerpColors(skyNight, skyDeep, skyT);
      scene.background.copy(currentSky);
      scene.fog.color.copy(currentSky);
      scene.fog.density = Math.max(0.0015, 0.0025 - progress * 0.001);

      // Night lighting boost
      if (elapsed > 5) {
        scene.background.lerp(new THREE.Color(0x05070d), 0.015);
      }

      // Street glow intensity
      streetGlow.intensity = Math.min((elapsed - 4) / 3, 1) * 0.6;

      // ────────────────────────────────────────────────────────────────────
      // TERRAIN PHASE (Ground & Roads)
      // ────────────────────────────────────────────────────────────────────

      const terrainT = timeline.terrain(elapsed);
      world.ground.material.opacity = easeOutCubic(terrainT);
      world.roads.children.forEach(r => {
        r.material.opacity = easeOutCubic(terrainT) * 0.95;
      });

      // ────────────────────────────────────────────────────────────────────
      // BUILD PHASE (Buildings Rise)
      // ────────────────────────────────────────────────────────────────────

      world.buildingMeshes.forEach(b => {
        const rt = b.userData.revealT;
        if (elapsed < rt) return;

        const age = elapsed - rt;
        const rise = easeOutQuint(Math.min(age / 0.6, 1));
        const fh = b.userData.fullH;
        b.position.y = (fh / 2) * rise;
        b.material.opacity = rise;

        // Lighting phase
        if (elapsed > 4.5 && rise > 0.6) {
          const lightT = Math.min((elapsed - 4.5) / 2.5, 1);
          b.material.emissiveIntensity = lightT * b.userData.targetEmissive * rise;
        }
      });

      // ────────────────────────────────────────────────────────────────────
      // WINDOW OVERLAY SYNC
      // ────────────────────────────────────────────────────────────────────

      world.windowOverlays.forEach(wo => {
        const nearest = world.buildingMeshes.find(b =>
          Math.abs(b.position.x - wo.position.x) < 0.5 &&
          Math.abs(b.position.z - wo.position.z) < 0.5
        );
        if (nearest) {
          wo.position.y = nearest.position.y;
          if (elapsed > 5) {
            const lightT = Math.min((elapsed - 5) / 2, 1);
            wo.material.opacity = lightT * 0.6 * nearest.material.opacity;
            wo.material.emissiveIntensity = lightT * 2.2 * nearest.material.opacity;
          }
        }
      });

      // ────────────────────────────────────────────────────────────────────
      // BEACON PHASE
      // ────────────────────────────────────────────────────────────────────

      world.beacons.forEach(beacon => {
        if (elapsed > 6) {
          beacon.material.emissiveIntensity = 
            Math.sin(elapsed * 2.8 + beacon.position.x * 0.05) > 0.3 ? 3 : 0.15;
        }
      });

      // ────────────────────────────────────────────────────────────────────
      // TRAFFIC PHASE
      // ────────────────────────────────────────────────────────────────────

      const trafficT = timeline.traffic(elapsed);
      world.cars.forEach(car => {
        const d = car.userData;
        d.prog = (d.prog + d.speed * 0.004 * trafficT) % 1;
        const p = (d.prog * 280 - 140) * d.dir;
        if (d.axis === 'x') car.position.x = p;
        else car.position.z = p;
      });

      // ────────────────────────────────────────────────────────────────────
      // CAMERA UPDATE (Director)
      // ────────────────────────────────────────────────────────────────────

      director.update(elapsed);

      // ────────────────────────────────────────────────────────────────────
      // HUD/UI STATE TRIGGERS
      // ────────────────────────────────────────────────────────────────────

      if (elapsed > 0.4 && hudPhase < 1) setHudPhase(1);
      if (elapsed > 1.0 && hudPhase < 2) setHudPhase(2);
      if (elapsed > 2.2 && hudPhase < 3) setHudPhase(3);
      if (elapsed > 4.8 && !textShownRef.current) {
        textShownRef.current = true;
        setShowText(true);
      }

      const tIdx = Math.min(Math.floor(elapsed / 1.8), TYPING_SEQUENCE.length - 1);
      setTypingText(TYPING_SEQUENCE[tIdx]);
      setProgressPct(Math.floor(Math.min(Math.max((elapsed - 2.5) / 4.5, 0), 1) * 100));

      // ────────────────────────────────────────────────────────────────────
      // RENDER WITH POST-PROCESSING
      // ────────────────────────────────────────────────────────────────────

      composer.render();

      // Continue or finish
      if (progress < 1) {
        rafId = requestAnimationFrame(animate);
      } else {
        finishTimer = setTimeout(() => onComplete?.(), 300);
      }
    };

    rafId = requestAnimationFrame(animate);

    // ════════════════════════════════════════════════════════════════════════
    // CLEANUP
    // ════════════════════════════════════════════════════════════════════════

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (finishTimer) clearTimeout(finishTimer);
      window.removeEventListener('resize', onResize);
      composer.dispose();
      renderer.dispose();
      scene.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach(m => {
            if (m.map) m.map.dispose();
            if (m.emissiveMap) m.emissiveMap.dispose();
            m.dispose();
          });
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
        backgroundColor: '#08101e',
      }}
    >
      <canvas
        ref={canvasRef}
        className="intro-scene__canvas"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />
      <IntroOverlay
        showText={showText}
        hudPhase={hudPhase}
        progressPct={progressPct}
        typingText={typingText}
      />
      
      {/* 🔥 SKIP BUTTON (clean + working) */}
      <button
        onClick={handleSkip}
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          zIndex: 1000000,
          background: 'rgba(0, 0, 0, 0.4)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          color: '#dce6f0',
          padding: '6px 12px',
          fontSize: '10px',
          letterSpacing: '2px',
          cursor: 'pointer',
          fontWeight: 600,
          textTransform: 'uppercase',
          backdropFilter: 'blur(8px)',
          transition: 'all 0.2s ease',
          pointerEvents: 'auto',
        }}
        onMouseEnter={(e) => {
          e.target.style.background = 'rgba(100, 150, 255, 0.2)';
          e.target.style.borderColor = 'rgba(200, 220, 255, 0.4)';
        }}
        onMouseLeave={(e) => {
          e.target.style.background = 'rgba(0, 0, 0, 0.4)';
          e.target.style.borderColor = 'rgba(255, 255, 255, 0.2)';
        }}
      >
        SKIP →
      </button>
    </div>
  );
}
