import {
  createGround,
  createRoadNetwork,
  createCityGrid,
  createTrafficSystem,
  createTrees,
  createStarField,
  createMoon,
} from '../CityBuildAnimation';

/**
 * World Builder
 * Encapsulates all scene object creation and initialization
 */
export function buildWorld(scene) {
  // Terrain
  const ground = createGround();
  const roads = createRoadNetwork();

  // City
  const city = createCityGrid();
  const trees = createTrees();

  // Environment
  const stars = createStarField();
  const moon = createMoon();

  // Dynamic systems
  const cars = createTrafficSystem();

  // Add to scene
  scene.add(ground);
  scene.add(roads);
  scene.add(city);
  scene.add(trees);
  scene.add(stars);
  scene.add(moon);
  cars.forEach(car => scene.add(car));

  // Segregate city objects by type for animation
  const buildingMeshes = [];
  const windowOverlays = [];
  const beacons = [];

  city.children.forEach(obj => {
    if (obj.userData.isBeacon) {
      beacons.push(obj);
    } else if (obj.userData.isWindowOverlay) {
      windowOverlays.push(obj);
    } else if (obj.userData.fullH !== undefined) {
      buildingMeshes.push(obj);
    }
  });

  // Sort buildings by distance (reveal from center outward)
  buildingMeshes.sort((a, b) => {
    const da = Math.sqrt(a.position.x ** 2 + a.position.z ** 2);
    const db = Math.sqrt(b.position.x ** 2 + b.position.z ** 2);
    return da - db + (Math.random() - 0.5) * 15;
  });

  // Assign reveal times (staggered rise)
  buildingMeshes.forEach((b, i) => {
    b.userData.revealT = 2.5 + (i / buildingMeshes.length) * 4.2 + Math.random() * 0.5;
  });

  // ════════════════════════════════════════════════════════════════════════
  // FIX: FORCE INITIAL STATE (no first-frame flicker/pop-in)
  // ════════════════════════════════════════════════════════════════════════

  // Buildings start invisible & at ground level
  buildingMeshes.forEach(b => {
    b.position.y = 0;
    b.material.opacity = 0;
    b.material.transparent = true;
  });

  // Window overlays start invisible
  windowOverlays.forEach(wo => {
    wo.material.opacity = 0;
    wo.material.emissiveIntensity = 0;
  });

  // Ground and roads start invisible
  ground.material.opacity = 0;
  roads.children.forEach(r => {
    r.material.opacity = 0;
  });

  return {
    ground,
    roads,
    city,
    cars,
    trees,
    stars,
    moon,
    buildingMeshes,
    windowOverlays,
    beacons,
  };
}
