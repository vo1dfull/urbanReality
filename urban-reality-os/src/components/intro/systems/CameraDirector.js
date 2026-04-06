import * as THREE from 'three';

/**
 * Cinematic Camera Control
 * Manages orbiting, height transitions, and handheld shake
 */
export class CameraDirector {
  constructor(camera) {
    this.camera = camera;
    this.startAngle = Math.atan2(150, 150); // SW quadrant
  }

  update(elapsed) {
    let targetPos;

    // 🔥 FIX CAMERA START JUMP (smooth intro)
    if (elapsed < 1.5) {
      targetPos = new THREE.Vector3(200, 120, 200);
    } else if (elapsed < 6) {
      // Phase 1: Orbit with descent (1.5-6s)
      const normalizedTime = (elapsed - 1.5) / 4.5; // 0-1 over the phase
      const angle = this.startAngle + normalizedTime * 0.048 * 4.5;
      const radius = Math.max(80, 195 - normalizedTime * 4.5 * 8.5);
      const yHeight = Math.max(28, 98 - normalizedTime * 4.5 * 5);

      targetPos = new THREE.Vector3(
        Math.cos(angle) * radius,
        yHeight,
        Math.sin(angle) * radius
      );
    } else {
      // Phase 2: Hero shot (6s+)
      targetPos = new THREE.Vector3(50, 35, 50);
    }

    // Smooth camera movement
    this.camera.position.lerp(targetPos, 0.035);

    // Subtle handheld camera shake for realism
    this.camera.position.x += Math.sin(elapsed * 0.5) * 0.12;
    this.camera.position.y += Math.sin(elapsed * 0.8) * 0.08;

    // Look at city center
    this.camera.lookAt(0, 14, 0);
  }
}
