import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import {
  createGround,
  createRoadNetwork,
  createCityGrid,
  createTrafficSystem,
  createTrees,
  createStarField,
  createMoon,
} from './CityBuildAnimation';
import IntroOverlay from './IntroOverlay';

const TOTAL_DURATION = 12.5;

function isLowEndDevice() {
  if (typeof navigator === 'undefined') return false;
  const cores = navigator.hardwareConcurrency || 4;
  return cores <= 2 || !window.WebGLRenderingContext;
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function easeOutQuint(t) {
  return 1 - Math.pow(1 - t, 5);
}

export default function IntroScene({ onComplete }) {
  const canvasRef = useRef(null);
  const [showText, setShowText] = useState(false);
  const [hudPhase, setHudPhase] = useState(0); // 0=hidden 1=hud 2=logo 3=title
  const [progressPct, setProgressPct] = useState(0);
  const [typingText, setTypingText] = useState('INITIALIZING...');
  const textShownRef = useRef(false);

  const TYPING_SEQUENCE = [
    'INITIALIZING...',
    'LOADING TERRAIN...',
    'CONSTRUCTING GRID...',
    'POPULATING DISTRICT...',
    'ACTIVATING SYSTEMS...',
    'SIMULATION ONLINE',
  ];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Low-end fallback
    if (isLowEndDevice()) {
      const t1 = setTimeout(() => setHudPhase(3), 600);
      const t2 = setTimeout(() => setShowText(true), 1400);
      const t3 = setTimeout(() => onComplete?.(), 3000);
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }

    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;

    // ── Renderer ────────────────────────────────────────────────────────────
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
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // ── Scene ───────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x08101e);
    scene.fog = new THREE.FogExp2(0x0d1828, 0.008);

    // ── Camera ──────────────────────────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(36, width / height, 0.5, 700);
    camera.position.set(150, 95, 150);
    camera.lookAt(0, 14, 0);

    // ── Lights ──────────────────────────────────────────────────────────────
    // Sun (far off, directional for hard shadows)
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

    // Hemisphere (sky/ground ambient)
    const hemi = new THREE.HemisphereLight(0x3a6fa8, 0x1a2a18, 1.0);
    scene.add(hemi);

    // City ambient fill (from below — street glow)
    const streetGlow = new THREE.PointLight(0xff7733, 0.4, 400);
    streetGlow.position.set(0, 5, 0);
    scene.add(streetGlow);

    // ── World Objects ────────────────────────────────────────────────────────
    const ground = createGround();
    scene.add(ground);

    const roads = createRoadNetwork();
    scene.add(roads);

    const city = createCityGrid();
    scene.add(city);

    const trees = createTrees();
    scene.add(trees);

    const cars = createTrafficSystem();
    cars.forEach(car => scene.add(car));

    const stars = createStarField();
    scene.add(stars);

    const moonGroup = createMoon();
    scene.add(moonGroup);

    // ── Segregate city objects by type ───────────────────────────────────────
    const buildingMeshes = [];
    const windowOverlays = [];
    const beacons = [];
    const spires = [];

    city.children.forEach(obj => {
      if (obj.userData.isBeacon) {
        beacons.push(obj);
      } else if (obj.userData.isWindowOverlay) {
        windowOverlays.push(obj);
      } else if (obj.geometry?.type === 'CylinderGeometry') {
        spires.push(obj);
      } else if (obj.userData.fullH !== undefined) {
        buildingMeshes.push(obj);
      }
    });

    // Sort buildings by distance from centre (reveal from centre outward)
    buildingMeshes.sort((a, b) => {
      const da = Math.sqrt(a.position.x ** 2 + a.position.z ** 2);
      const db = Math.sqrt(b.position.x ** 2 + b.position.z ** 2);
      return da - db + (Math.random() - 0.5) * 15;
    });

    // Assign reveal times (buildings rise in a wave, 2.5s → 7s)
    buildingMeshes.forEach((b, i) => {
      b.userData.revealT = 2.5 + (i / buildingMeshes.length) * 4.2 + Math.random() * 0.5;
    });

    // Window overlays keyed by position to buildings
    // (already positioned in CityBuildAnimation, sync during animation)

    // ── Resize Handler ───────────────────────────────────────────────────────
    const onResize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    window.addEventListener('resize', onResize);

    // ── Camera Orbit Path ────────────────────────────────────────────────────
    const startAngle = Math.atan2(150, 150); // SW quadrant

    function getCameraTarget(elapsed) {
      const angle = startAngle + elapsed * 0.048;
      const radius = Math.max(80, 195 - elapsed * 8.5);
      const yHeight = Math.max(28, 98 - elapsed * 5);
      return new THREE.Vector3(Math.cos(angle) * radius, yHeight, Math.sin(angle) * radius);
    }

    // ── Animation Loop ───────────────────────────────────────────────────────
    let startTime = null;
    let rafId = null;
    let finishTimer = null;

    const skyNight = new THREE.Color(0x08101e);
    const skyDeep  = new THREE.Color(0x0d1828);

    const animate = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const elapsed = (timestamp - startTime) / 1000;
      const progress = Math.min(elapsed / TOTAL_DURATION, 1);

      // ── Sky ───────────────────────────────────────────────────────────────
      const skyT = Math.min(elapsed / 6, 1);
      const currentSky = new THREE.Color().lerpColors(skyNight, skyDeep, skyT);
      scene.background.copy(currentSky);
      scene.fog.color.copy(currentSky);
      scene.fog.density = Math.max(0.003, 0.012 - progress * 0.008);

      // Street glow increases as city lights up
      streetGlow.intensity = Math.min((elapsed - 4) / 3, 1) * 0.6;

      // ── Phase 1: Terrain reveal (0–2s) ───────────────────────────────────
      if (elapsed < 2.5) {
        const t = easeOutCubic(elapsed / 2.5);
        ground.material.opacity = t;
        roads.children.forEach(r => { r.material.opacity = t * 0.95; });
      } else {
        ground.material.opacity = 1;
        roads.children.forEach(r => { r.material.opacity = 0.95; });
      }

      // ── Phase 2: Buildings rise (2.5–7s) ──────────────────────────────────
      buildingMeshes.forEach(b => {
        const rt = b.userData.revealT;
        if (elapsed < rt) return;
        const age = elapsed - rt;
        const rise = easeOutQuint(Math.min(age / 0.6, 1));
        const fh = b.userData.fullH;
        b.position.y = (fh / 2) * rise;
        b.material.opacity = rise;

        // Emissive glow lights up after 4.5s
        if (elapsed > 4.5 && rise > 0.6) {
          const litT = Math.min((elapsed - 4.5) / 2.5, 1);
          b.material.emissiveIntensity = litT * b.userData.targetEmissive * rise;
        }
      });

      // Sync window overlays to their buildings
      windowOverlays.forEach(wo => {
        // Find corresponding building by XZ proximity
        const nearest = buildingMeshes.find(b =>
          Math.abs(b.position.x - wo.position.x) < 0.5 &&
          Math.abs(b.position.z - wo.position.z) < 0.5
        );
        if (nearest) {
          wo.position.y = nearest.position.y;
          if (elapsed > 5) {
            const litT = Math.min((elapsed - 5) / 2, 1);
            wo.material.opacity = litT * 0.6 * nearest.material.opacity;
            wo.material.emissiveIntensity = litT * 1.3 * nearest.material.opacity;
          }
        }
      });

      // ── Phase 3: Beacon flicker (from 6s) ────────────────────────────────
      beacons.forEach(beacon => {
        if (elapsed > 6) {
          beacon.material.emissiveIntensity = Math.sin(elapsed * 2.8 + beacon.position.x * 0.05) > 0.3 ? 3 : 0.15;
        }
      });

      // ── Phase 4: Traffic (from 6.5s) ──────────────────────────────────────
      if (elapsed > 6.5) {
        const trafficT = Math.min((elapsed - 6.5) / 1.5, 1);
        cars.forEach(car => {
          const d = car.userData;
          d.prog = (d.prog + d.speed * 0.004 * trafficT) % 1;
          const p = (d.prog * 280 - 140) * d.dir;
          if (d.axis === 'x') car.position.x = p;
          else car.position.z = p;
        });
      }

      // ── HUD / UI state triggers ───────────────────────────────────────────
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

      // ── Camera ────────────────────────────────────────────────────────────
      const targetPos = getCameraTarget(elapsed);
      camera.position.lerp(targetPos, 0.022);
      camera.lookAt(0, 14, 0);

      // ── Render ────────────────────────────────────────────────────────────
      renderer.render(scene, camera);

      if (progress < 1) {
        rafId = requestAnimationFrame(animate);
      } else {
        finishTimer = setTimeout(() => onComplete?.(), 300);
      }
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (finishTimer) clearTimeout(finishTimer);
      window.removeEventListener('resize', onResize);
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    </div>
  );
}
