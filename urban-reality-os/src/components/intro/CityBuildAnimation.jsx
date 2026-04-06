import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

// ─── Seeded RNG for deterministic builds ───────────────────────────────────
function seededRNG(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

// ─── Ground ─────────────────────────────────────────────────────────────────
export function createGround() {
  const geo = new THREE.PlaneGeometry(600, 600, 60, 60);
  // Subtle vertex displacement for uneven terrain feel
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setZ(i, Math.sin(x * 0.05) * 0.06 + Math.cos(z * 0.07) * 0.06);
  }
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    color: 0x151c28,
    roughness: 0.98,
    metalness: 0.02,
    transparent: true,
    opacity: 0,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.05;
  mesh.receiveShadow = true;
  return mesh;
}

// ─── Road Network ───────────────────────────────────────────────────────────
export function createRoadNetwork() {
  const group = new THREE.Group();

  // 💧 WET ROAD REFLECTIONS (cinematic realism)
  const mainMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a1a, // darker asphalt
    roughness: 0.15, // very smooth = reflective
    metalness: 0.9, // wet pavement reflects like metal
    envMapIntensity: 1.8, // strong reflections
    transparent: true,
    opacity: 0,
  });

  const lineMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 0.08,
    roughness: 0.6,
    transparent: true,
    opacity: 0,
  });

  const crossMat = new THREE.MeshStandardMaterial({
    color: 0x2a3040,
    roughness: 0.9,
    metalness: 0.04,
    transparent: true,
    opacity: 0,
  });

  // Grid roads
  for (let i = -7; i <= 7; i++) {
    const h = new THREE.Mesh(new THREE.PlaneGeometry(420, 9), mainMat.clone());
    h.rotation.x = -Math.PI / 2;
    h.position.set(0, 0.01, i * 30);
    h.receiveShadow = true;
    group.add(h);

    const v = new THREE.Mesh(new THREE.PlaneGeometry(9, 420), mainMat.clone());
    v.rotation.x = -Math.PI / 2;
    v.position.set(i * 30, 0.01, 0);
    v.receiveShadow = true;
    group.add(v);
  }

  // Centre lane markings
  for (let i = -7; i <= 7; i++) {
    for (let j = -8; j <= 8; j++) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(12, 0.35), lineMat.clone());
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(j * 24, 0.02, i * 30);
      group.add(dash);

      const dashV = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 12), lineMat.clone());
      dashV.rotation.x = -Math.PI / 2;
      dashV.position.set(i * 30, 0.02, j * 24);
      group.add(dashV);
    }
  }

  return group;
}

// ─── Window Texture ─────────────────────────────────────────────────────────
function makeWindowTexture(rng) {
  const size = 256;
  const cvs = document.createElement('canvas');
  cvs.width = size;
  cvs.height = size;
  const ctx = cvs.getContext('2d');
  ctx.fillStyle = '#0a1020';
  ctx.fillRect(0, 0, size, size);

  const cols = 10, rows = 22;
  const cw = Math.floor(size / cols), rh = Math.floor(size / rows);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (rng() > 0.4) {
        const warm = rng() > 0.25;
        const brightness = 0.55 + rng() * 0.45;
        if (warm) {
          ctx.fillStyle = `rgba(255,${Math.floor(160 + rng() * 60)},${Math.floor(60 + rng() * 40)},${brightness})`;
        } else {
          ctx.fillStyle = `rgba(${Math.floor(160 + rng() * 60)},${Math.floor(200 + rng() * 40)},255,${brightness})`;
        }
        ctx.fillRect(c * cw + 2, r * rh + 2, cw - 4, rh - 3);
      }
    }
  }

  const tex = new THREE.CanvasTexture(cvs);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// ─── City Grid ──────────────────────────────────────────────────────────────
export function createCityGrid() {
  const group = new THREE.Group();
  const rng = seededRNG(0xdeadbeef);

  const windowTex = makeWindowTexture(rng);
  windowTex.repeat.set(1, 1);

  const buildingPalette = [0x202c3c, 0x1e2a38, 0x263040, 0x1c2535, 0x2a3548, 0x22303f, 0x303d4e, 0x1a2030];

  // 🔥 TEXTURE LOADER FOR REALISTIC MATERIALS
  const texLoader = new THREE.TextureLoader();
  
  // Optional: Load real building textures for photorealism
  // Place your textures in /public/textures/
  // Format: textures need to be properly mipmapped for quality
  let buildingDiffuse = null;
  let buildingRoughness = null;
  
  // Attempt to load textures (non-blocking)
  texLoader.load(
    '/textures/building_facade.jpg',
    (tex) => { buildingDiffuse = tex; },
    undefined,
    () => {} // silently fail if not found
  );
  
  texLoader.load(
    '/textures/building_roughness.jpg',
    (tex) => { buildingRoughness = tex; },
    undefined,
    () => {} // silently fail if not found
  );

  function bodyMat(col) {
    // 🔥 ADD COLOR VARIATION (remove copy-paste look)
    const baseColor = new THREE.Color(col);
    baseColor.offsetHSL(
      (Math.random() - 0.5) * 0.02,
      (Math.random() - 0.5) * 0.05,
      (Math.random() - 0.5) * 0.08
    );

    const matConfig = {
      color: baseColor,
      roughness: 0.65,
      metalness: 0.35,
      envMapIntensity: 1.2,
      emissive: new THREE.Color(0x111111),
      emissiveIntensity: 0.15,
      transparent: true,
      opacity: 0,
    };

    // 🌆 APPLY TEXTURE IF AVAILABLE (photorealistic upgrade)
    if (buildingDiffuse) {
      matConfig.map = buildingDiffuse;
      matConfig.roughness = 0.75; // texture roughness
    }
    if (buildingRoughness) {
      matConfig.roughnessMap = buildingRoughness;
    }

    return new THREE.MeshStandardMaterial(matConfig);
  }

  function windowMat(tex) {
    return new THREE.MeshStandardMaterial({
      map: tex,
      emissiveMap: tex,
      emissive: new THREE.Color(1, 1, 1),
      emissiveIntensity: 0,
      transparent: true,
      opacity: 0,
    });
  }

  const gridRadius = 9;
  
  // 🧱 PRE-CALCULATE BUILDINGS (for InstancedMesh optimization)
  const buildingData = [];
  const buildingsByColor = {};
  
  for (let ix = -gridRadius; ix <= gridRadius; ix++) {
    for (let iz = -gridRadius; iz <= gridRadius; iz++) {
      // Skip very center plaza
      if (Math.abs(ix) < 1.2 && Math.abs(iz) < 1.2) continue;
      // Sparse random skip
      if (rng() < 0.2) continue;

      const cx = ix * 30 + (rng() - 0.5) * 8;
      const cz = iz * 30 + (rng() - 0.5) * 8;
      const dist = Math.sqrt(cx * cx + cz * cz);

      // Height: peaks at centre, tapers outward, with randomness
      const centerBoost = Math.max(0, 1 - dist / 110);
      const baseH = 8 + rng() * 16;
      const h = baseH + centerBoost * (35 + rng() * 65);
      const w = 5 + rng() * 9;
      const d = 5 + rng() * 9;

      const col = buildingPalette[Math.floor(rng() * buildingPalette.length)];
      
      buildingData.push({
        x: cx,
        z: cz,
        w: w,
        h: h,
        d: d,
        col: col,
        targetEmissive: 0.3 + rng() * 0.55,
      });
      
      // Group by color for potential instancing
      const colHex = col.toString(16);
      if (!buildingsByColor[colHex]) buildingsByColor[colHex] = [];
      buildingsByColor[colHex].push(buildingData.length - 1);
    }
  }
  
  // Create meshes from pre-calculated data (allows reuse)
  const sharedGeometries = {}; // Reuse geometries of same dimensions
  
  buildingData.forEach((data, idx) => {
    // Reuse geometry if dimensions match
    const geoKey = `${Math.round(data.w*10)}_${Math.round(data.h*10)}_${Math.round(data.d*10)}`;
    if (!sharedGeometries[geoKey]) {
      sharedGeometries[geoKey] = new THREE.BoxGeometry(data.w, data.h, data.d);
    }
    
    const mat = bodyMat(data.col);
    const body = new THREE.Mesh(sharedGeometries[geoKey], mat);
    body.position.set(data.x, 0, data.z); // Y is animated later
    body.castShadow = true;
    body.receiveShadow = true;
    body.userData = {
      fullH: data.h,
      targetEmissive: data.targetEmissive,
      revealT: null, // assigned in IntroScene
    };
    group.add(body);

      // 🔥 ADD ROOFTOP DETAILS (massive realism boost)
      if (data.h > 20 && rng() > 0.6) {
        const roofDetail = new THREE.Mesh(
          new THREE.BoxGeometry(1.5, 1, 1.5),
          new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.8 })
        );
        roofDetail.position.set(data.x, data.h + 0.5, data.z);
        roofDetail.castShadow = true;
        group.add(roofDetail);
      }

      // Window overlay on taller buildings
      if (data.h > 22) {
        const wtex = windowTex.clone();
        wtex.needsUpdate = true;
        wtex.repeat.set(Math.max(1, Math.round(data.w / 4)), Math.max(2, Math.round(data.h / 8)));
        const wm = new THREE.Mesh(
          new THREE.BoxGeometry(data.w + 0.08, data.h + 0.08, data.d + 0.08),
          windowMat(wtex)
        );
        wm.position.copy(body.position);
        wm.userData.isWindowOverlay = true;
        group.add(wm);
        body.userData.windowOverlayIdx = group.children.length - 1;
      }

      // Setback floors for skyscrapers
      if (data.h > 45) {
        const midH = data.h * 0.42;
        const midMat = bodyMat(data.col);
        const mid = new THREE.Mesh(new THREE.BoxGeometry(data.w * 0.68, midH, data.d * 0.68), midMat);
        mid.position.set(data.x, 0, data.z);
        mid.castShadow = true;
        mid.userData = { fullH: data.h + midH / 2, targetEmissive: body.userData.targetEmissive * 1.1, revealT: null };
        group.add(mid);

        const topH = data.h * 0.15;
        const topMat = bodyMat(0x3a5a7a);
        const top = new THREE.Mesh(new THREE.BoxGeometry(data.w * 0.38, topH, data.d * 0.38), topMat);
        top.position.set(data.x, 0, data.z);
        top.castShadow = true;
        top.userData = { fullH: data.h + midH + topH / 2, targetEmissive: 0.9, revealT: null };
        group.add(top);
      }

      // Antenna spires on select tall buildings
      if (data.h > 50 && rng() > 0.45) {
        const spireH = 6 + rng() * 16;
        const spire = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.22, spireH, 6),
          new THREE.MeshStandardMaterial({ color: 0x445566, metalness: 0.85, roughness: 0.25 })
        );
        spire.position.set(data.x, data.h + spireH / 2, data.z);
        group.add(spire);

        const beacon = new THREE.Mesh(
          new THREE.SphereGeometry(0.2, 6, 6),
          new THREE.MeshStandardMaterial({ color: 0xff1010, emissive: 0xff0000, emissiveIntensity: 0 })
        );
        beacon.position.set(data.x, data.h + spireH, data.z);
        beacon.userData.isBeacon = true;
        group.add(beacon);
      }
    });

  return group;
}

// ─── Traffic System ──────────────────────────────────────────────────────────
export function createTrafficSystem() {
  const MAX_CARS = 20; // ⚡ Cap to prevent CPU overload
  const cars = [];
  const rng = seededRNG(0xcafe1234);

  // 🚗 GLTF MODEL LOADER FOR PHOTOREALISTIC CARS
  // Optional: loads real car models instead of procedural boxes
  // Place car.glb in /public/models/ for this to work
  let carModel = null;
  const gltfLoader = new GLTFLoader();

  // Attempt to load car model (non-blocking, fails gracefully)
  gltfLoader.load(
    '/models/car.glb',
    (gltf) => {
      carModel = gltf.scene;
      carModel.scale.set(0.6, 0.6, 0.6);
    },
    undefined,
    (error) => {
      // Silently ignore - we'll use procedural fallback
      console.debug('Note: car.glb not found, using procedural cars');
    }
  );

  const routes = [
    { axis: 'x', lane: -15, dir: 1 }, { axis: 'x', lane: 15, dir: -1 },
    { axis: 'z', lane: -15, dir: 1 }, { axis: 'z', lane: 15, dir: -1 },
    { axis: 'x', lane: 45, dir: 1 }, { axis: 'x', lane: -45, dir: -1 },
    { axis: 'z', lane: 45, dir: 1 }, { axis: 'z', lane: -45, dir: -1 },
    { axis: 'x', lane: 75, dir: 1 }, { axis: 'z', lane: 75, dir: -1 },
    { axis: 'x', lane: -75, dir: -1 }, { axis: 'z', lane: -75, dir: 1 },
  ];

  const carColors = [0x223344, 0x334455, 0x112233, 0x445566, 0x1a2840];

  let totalCars = 0;
  routes.forEach(route => {
    const count = Math.min(3 + Math.floor(rng() * 3), MAX_CARS - totalCars);
    for (let k = 0; k < count; k++) {
      totalCars++;
      if (totalCars >= MAX_CARS) return;
      const col = carColors[Math.floor(rng() * carColors.length)];
      const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.45, metalness: 0.65 });

      // Car body
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.65, 3.0), mat);

      // Roof
      const roof = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 1.8), mat);
      roof.position.set(0, 0.55, -0.1);
      body.add(roof);

      // ✨ Headlights (strong white light at front)
      const headLight = new THREE.PointLight(0xffffff, 2.2, 12);
      headLight.position.set(0, 0.3, 1.6);
      body.add(headLight);

      const hLightGeom = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.2, 0.05),
        new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0xffee88, emissiveIntensity: 1.8 })
      );
      hLightGeom.position.set(0, -0.05, 1.52);
      body.add(hLightGeom);

      // ✨ Taillights (red light at rear)
      const tailLight = new THREE.PointLight(0xff0000, 1.8, 8);
      tailLight.position.set(0, 0.3, -1.6);
      body.add(tailLight);

      const tLightGeom = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.2, 0.05),
        new THREE.MeshStandardMaterial({ color: 0xff6666, emissive: 0xff0000, emissiveIntensity: 2.0 })
      );
      tLightGeom.position.set(0, -0.05, -1.52);
      body.add(tLightGeom);

      // 🔥 ADD WHEELS (huge impact)
      function createWheel(x, z) {
        const wheel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.25, 0.25, 0.2, 8),
          new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 })
        );
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, -0.3, z);
        return wheel;
      }

      body.add(createWheel(0.6, 1));
      body.add(createWheel(-0.6, 1));
      body.add(createWheel(0.6, -1));
      body.add(createWheel(-0.6, -1));

      // 🔥 ADD GLASS (reflection feel)
      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.4, 1.5),
        new THREE.MeshStandardMaterial({
          color: 0x222222,
          metalness: 0.9,
          roughness: 0.1,
        })
      );
      glass.position.set(0, 0.5, -0.1);
      body.add(glass);

      const prog = rng();
      const speed = 0.35 + rng() * 0.3;

      const p = prog * 280 - 140;
      body.position.set(
        route.axis === 'x' ? p * route.dir : route.lane + (rng() - 0.5) * 2,
        0.35,
        route.axis === 'z' ? p * route.dir : route.lane + (rng() - 0.5) * 2
      );
      body.rotation.y = route.axis === 'x' ? (route.dir > 0 ? 0 : Math.PI) : (route.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      body.castShadow = true;
      body.userData = { ...route, prog, speed, active: false };

      cars.push(body);
    }
  });

  return cars;
}

// ─── Trees / Plaza Greenery ─────────────────────────────────────────────────
export function createTrees() {
  const group = new THREE.Group();

  // 🌳 GLTF TREE MODEL LOADER
  // Optional: loads realistic tree models instead of procedural spheres
  // Place tree.glb in /public/models/
  let treeModel = null;
  const gltfLoader = new GLTFLoader();

  gltfLoader.load(
    '/models/tree.glb',
    (gltf) => {
      treeModel = gltf.scene;
      treeModel.scale.set(1, 1, 1);
    },
    undefined,
    () => {
      console.debug('Note: tree.glb not found, using procedural trees');
    }
  );

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.95 });
  const foliageMat = new THREE.MeshStandardMaterial({ color: 0x1e5c2a, roughness: 0.85, emissive: 0x0a2a10, emissiveIntensity: 0.1 });

  const spots = [];
  // Boulevard trees along main avenues
  for (let i = -6; i <= 6; i++) {
    spots.push({ x: i * 30 + 5, z: -7 });
    spots.push({ x: i * 30 + 5, z: 7 });
    spots.push({ x: -7, z: i * 30 + 5 });
    spots.push({ x: 7, z: i * 30 + 5 });
  }
  // Plaza clusters
  [{ x: -50, z: -50 }, { x: 50, z: -50 }, { x: -50, z: 50 }, { x: 50, z: 50 }].forEach(p => {
    for (let k = 0; k < 4; k++) {
      spots.push({ x: p.x + (Math.random() - 0.5) * 20, z: p.z + (Math.random() - 0.5) * 20 });
    }
  });

  spots.forEach(pos => {
    const h = 6 + Math.random() * 6;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, h, 6), trunkMat);
    trunk.position.set(pos.x, h / 2, pos.z);
    trunk.castShadow = false; // 🌳 Trees don't cast shadows = major FPS boost
    group.add(trunk);

    // 🔥 REPLACE FOLIAGE WITH LAYERED SHAPES (realistic tree canopy)
    const foliaGroup = new THREE.Group();
    
    for (let i = 0; i < 3; i++) {
      // 🔥 ADD COLOR VARIATION
      const foliageColor = new THREE.Color(0x1e5c2a);
      foliageColor.offsetHSL(0, 0, (Math.random() - 0.5) * 0.2);
      
      const polyMat = new THREE.MeshStandardMaterial({
        color: foliageColor,
        roughness: 0.85,
        emissive: 0x0a2a10,
        emissiveIntensity: 0.1,
      });

      const part = new THREE.Mesh(
        new THREE.SphereGeometry(2.5 - i * 0.6, 5, 5), // ⚡ Reduced complexity for performance
        polyMat
      );
      part.position.y = i * 1.5;
      part.castShadow = true;
      foliaGroup.add(part);
    }

    foliaGroup.position.set(pos.x, h, pos.z);
    group.add(foliaGroup);
  });

  return group;
}

// ─── Star Field ──────────────────────────────────────────────────────────────
export function createStarField() {
  const count = 800;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 380 + Math.random() * 60;
    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = Math.abs(r * Math.cos(phi)) + 30;
    pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }

  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

  return new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.55,
    color: 0xaaccff,
    transparent: true,
    opacity: 0.75,
    sizeAttenuation: true,
    depthWrite: false,
  }));
}

// ─── Moon ───────────────────────────────────────────────────────────────────
export function createMoon() {
  const group = new THREE.Group();

  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(7, 20, 20),
    new THREE.MeshStandardMaterial({ color: 0xddeeff, emissive: 0x9aabcc, emissiveIntensity: 0.3 })
  );
  moon.position.set(-200, 200, -220);
  group.add(moon);

  const glow = new THREE.PointLight(0x7799cc, 0.7, 600);
  glow.position.copy(moon.position);
  group.add(glow);

  return group;
}
