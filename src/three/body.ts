import * as THREE from 'three';
import { gridGeometry, keyframes, straightFrames, superPoint, tubeGeometry } from './geometry';

/* ================================================================================================
 * Mannequin (men's M, inches). Garments are built from these measurements plus ease, so they always
 * clear the body. The arm angle is a parameter: a boxy tee holds its sleeves further from the body
 * than a hoodie, so each garment poses the mannequin to match.
 * ============================================================================================== */

export const BODY = {
  HPS: 57.5, // high point shoulder (neck base)
  SHOULDER: 56,
  CHEST: 50,
  UNDERARM: 52,
  WAIST: 42.5,
  HIP: 36,
  CROTCH: 31.5,
  KNEE: 18.5,
  ANKLE: 3.2,
  HEAD: new THREE.Vector3(0, 64.8, 0.2),
  HEAD_R: new THREE.Vector3(2.95, 4.2, 3.6),
};

/** [y, half width, half depth, z centre] — torso cross-sections. */
const TORSO: number[][] = [
  [28.6, 0.4, 0.4, 0],
  [29.6, 4.2, 3.3, 0],
  [31.5, 6.5, 4.5, 0],
  [34, 7.0, 4.8, -0.1],
  [36, 7.1, 4.8, -0.2],
  [39, 6.7, 4.4, 0],
  [42.5, 6.2, 4.1, 0.1],
  [46, 6.6, 4.5, 0.2],
  [50, 7.0, 5.0, 0.3],
  [52.5, 7.2, 4.8, 0.2],
  [54.5, 7.7, 4.3, 0],
  [55.8, 7.8, 3.5, -0.2],
  [56.9, 5.4, 2.9, -0.3],
  [57.6, 2.6, 2.4, -0.35],
];

export function torsoSection(y: number): { hw: number; hd: number; zc: number } {
  const [hw, hd, zc] = keyframes(TORSO, y);
  return { hw, hd, zc };
}

export interface Limb {
  /** Joint (top) position. */
  top: THREE.Vector3;
  /** Unit direction down the limb. */
  dir: THREE.Vector3;
  length: number;
  /** Radius at a distance along the limb. */
  radius(t: number): number;
  at(t: number): THREE.Vector3;
}

const ARM_R = [
  [0, 2.25],
  [3, 2.05],
  [10, 1.65],
  [12, 1.6],
  [15, 1.75],
  [22.5, 1.15],
];
const LEG_R = [
  [0, 3.5],
  [3, 3.35],
  [14.5, 2.15],
  [16, 2.15],
  [19.5, 2.35],
  [29.3, 1.35],
];

/** Left (+x, wearer's left) or right arm, `angle` in degrees from vertical. */
export function arm(side: 1 | -1, angle = 18): Limb {
  const a = THREE.MathUtils.degToRad(angle);
  const top = new THREE.Vector3(6.9 * side, 54.4, -0.2);
  const dir = new THREE.Vector3(Math.sin(a) * side, -Math.cos(a), 0).normalize();
  return {
    top,
    dir,
    length: 22.5,
    radius: (t) => keyframes(ARM_R, t)[0],
    at: (t) => top.clone().addScaledVector(dir, t),
  };
}

export function leg(side: 1 | -1): Limb {
  const top = new THREE.Vector3(3.7 * side, 33.5, 0);
  const bottom = new THREE.Vector3(4.3 * side, BODY.ANKLE, -0.3);
  const dir = bottom.clone().sub(top);
  const length = dir.length();
  dir.normalize();
  return {
    top,
    dir,
    length,
    radius: (t) => keyframes(LEG_R, t)[0],
    at: (t) => top.clone().addScaledVector(dir, t),
  };
}

/** Mannequin mesh. Matte "dress form" finish so it never competes with the garment. */
export function buildMannequin(armAngle: number, clip: THREE.Plane[]): THREE.Group {
  const mat = new THREE.MeshStandardMaterial({ color: '#cdc8bf', roughness: 0.62, metalness: 0, clippingPlanes: clip });
  const g = new THREE.Group();
  g.name = 'mannequin';

  const torso = gridGeometry(
    (u, v) => {
      const y = 28.6 + v * (57.6 - 28.6);
      const s = torsoSection(y);
      const p = superPoint(u * Math.PI * 2, s.hw, s.hd, 2.25);
      return new THREE.Vector3(p.x, y, p.z + s.zc);
    },
    { cols: 64, rows: 72, wrapU: true, inside: (_u, v) => new THREE.Vector3(0, 28.6 + v * 29, 0) },
  );
  g.add(new THREE.Mesh(torso, mat));

  // neck + head
  const neck = new THREE.CylinderGeometry(2.25, 2.4, 5, 32, 1, true);
  neck.translate(0, 58.6, -0.4);
  g.add(new THREE.Mesh(neck, mat));
  const head = new THREE.SphereGeometry(1, 48, 32);
  head.scale(BODY.HEAD_R.x, BODY.HEAD_R.y, BODY.HEAD_R.z);
  head.translate(BODY.HEAD.x, BODY.HEAD.y, BODY.HEAD.z);
  g.add(new THREE.Mesh(head, mat));

  for (const side of [1, -1] as const) {
    const a = arm(side, armAngle);
    g.add(new THREE.Mesh(tubeGeometry(straightFrames(a.at(-0.3), a.at(a.length)), (v) => a.radius(-0.3 + v * (a.length + 0.3)), { cols: 28, rows: 24 }), mat));
    const hand = new THREE.SphereGeometry(1, 24, 16);
    hand.scale(0.85, 3.2, 1.6);
    const hp = a.at(a.length + 3);
    hand.applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.atan2(a.dir.x, -a.dir.y)));
    hand.translate(hp.x, hp.y, hp.z);
    g.add(new THREE.Mesh(hand, mat));
    const shoulder = new THREE.SphereGeometry(a.radius(0) * 0.88, 24, 16);
    shoulder.translate(a.top.x - side * 0.35, a.top.y - 0.45, a.top.z);
    g.add(new THREE.Mesh(shoulder, mat));

    const l = leg(side);
    g.add(new THREE.Mesh(tubeGeometry(straightFrames(l.at(-2), l.at(l.length + 1.8)), (v) => l.radius(-2 + v * (l.length + 3.8)), { cols: 32, rows: 40 }), mat));
    const foot = new THREE.SphereGeometry(1, 24, 16);
    foot.scale(1.6, 1.15, 4.7);
    foot.translate(l.at(l.length).x, 1.15, 2.3);
    g.add(new THREE.Mesh(foot, mat));
  }
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}
