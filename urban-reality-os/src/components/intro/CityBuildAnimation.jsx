import * as THREE from 'three';

export function createCityGrid() {
  const group = new THREE.Group();
  const baseGeometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({
    color: 0x78b7ff,
    emissive: 0x1f4d9c,
    emissiveIntensity: 0.25,
    metalness: 0.2,
    roughness: 0.35,
  });

  const layout = [
    [1, 0, 1, 0, 1],
    [0, 1, 1, 1, 0],
    [1, 1, 0, 1, 1],
    [0, 1, 1, 1, 0],
    [1, 0, 1, 0, 1],
  ];

  layout.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      if (!cell) return;
      const building = new THREE.Mesh(baseGeometry, material);
      const height = 1.8 + Math.random() * 4.5;
      building.scale.set(0.9, 0.02, 0.9);
      building.position.set((colIndex - 2) * 3.4, 0.01, (rowIndex - 2) * 3.4);
      building.userData = { targetScaleY: height, delay: 1.3 + Math.random() * 0.5 };
      building.castShadow = false;
      group.add(building);
    });
  });

  return group;
}

export function createRoadLines() {
  const group = new THREE.Group();
  const material = new THREE.LineBasicMaterial({
    color: 0x64d7ff,
    transparent: true,
    opacity: 0.85,
  });

  const roadPaths = [
    [new THREE.Vector3(-10, 0.04, -10), new THREE.Vector3(10, 0.04, -10), new THREE.Vector3(10, 0.04, 10)],
    [new THREE.Vector3(-10, 0.04, 0), new THREE.Vector3(10, 0.04, 0)],
    [new THREE.Vector3(0, 0.04, -10), new THREE.Vector3(0, 0.04, 10)],
    [new THREE.Vector3(-10, 0.04, 10), new THREE.Vector3(10, 0.04, 10)],
  ];

  roadPaths.forEach((points) => {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, material);
    line.userData = { totalPoints: points.length, drawProgress: 0 };
    group.add(line);
  });

  return group;
}

export function createParticleField() {
  const count = 180;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * 32;
    const y = Math.random() * 10 + 0.8;
    const z = (Math.random() - 0.5) * 32;
    positions.set([x, y, z], i * 3);
    const t = Math.random();
    colors.set([0.32 + t * 0.5, 0.82, 1.0], i * 3);
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.14,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });

  const particles = new THREE.Points(geometry, material);
  particles.userData = { speed: 0.002 + Math.random() * 0.004 };
  return particles;
}
