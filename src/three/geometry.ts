import * as THREE from 'three';

/* ================================================================================================
 * Geometry toolkit for the procedural garments. Everything is in inches (y up, floor at 0, the wearer
 * faces +z). Surfaces are parametric grids; UVs are measured in inches along the surface so fabric
 * textures tile at real-world scale (texture.repeat = 1 / tileInches).
 * ============================================================================================== */

export type GridFn = (u: number, v: number) => THREE.Vector3;

export interface GridOpts {
  cols: number;
  rows: number;
  /** u wraps around (tubes): the seam column gets averaged normals. */
  wrapU?: boolean;
  /** Drop triangles (e.g. armholes, parts hidden inside another panel). Gets the triangle centroid. */
  keep?: (centroid: THREE.Vector3) => boolean;
  /** A point the surface should face away from (decides the winding so normals point outward). */
  inside?: THREE.Vector3 | ((u: number, v: number) => THREE.Vector3);
}

export function gridGeometry(fn: GridFn, o: GridOpts): THREE.BufferGeometry {
  const C = o.cols;
  const R = o.rows;
  const W = C + 1;
  const pts: THREE.Vector3[] = [];
  for (let j = 0; j <= R; j++) for (let i = 0; i <= C; i++) pts.push(fn(i / C, j / R));

  const pos = new Float32Array(pts.length * 3);
  pts.forEach((p, k) => p.toArray(pos, k * 3));

  // inch-based UVs: arc length along each row (u) and each column (v)
  const uv = new Float32Array(pts.length * 2);
  for (let j = 0; j <= R; j++) {
    let acc = 0;
    for (let i = 0; i <= C; i++) {
      if (i) acc += pts[j * W + i].distanceTo(pts[j * W + i - 1]);
      uv[(j * W + i) * 2] = acc;
    }
  }
  for (let i = 0; i <= C; i++) {
    let acc = 0;
    for (let j = 0; j <= R; j++) {
      if (j) acc += pts[j * W + i].distanceTo(pts[(j - 1) * W + i]);
      uv[(j * W + i) * 2 + 1] = acc;
    }
  }

  // winding: compare a mid-surface normal with the direction away from `inside`
  let flip = false;
  if (o.inside) {
    const i = Math.floor(C / 2);
    const j = Math.floor(R / 2);
    const a = pts[j * W + i];
    const b = pts[j * W + i + 1];
    const d = pts[(j + 1) * W + i + 1];
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a));
    const ref = typeof o.inside === 'function' ? o.inside(i / C, j / R) : o.inside;
    flip = n.dot(new THREE.Vector3().subVectors(a, ref)) < 0;
  }

  const idx: number[] = [];
  const cen = new THREE.Vector3();
  const tri = (x: number, y: number, z: number) => {
    if (o.keep) {
      cen.copy(pts[x]).add(pts[y]).add(pts[z]).multiplyScalar(1 / 3);
      if (!o.keep(cen)) return;
    }
    if (flip) idx.push(x, z, y);
    else idx.push(x, y, z);
  };
  for (let j = 0; j < R; j++)
    for (let i = 0; i < C; i++) {
      const a = j * W + i;
      const b = a + 1;
      const c = a + W;
      const d = c + 1;
      tri(a, b, d);
      tri(a, d, c);
    }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (o.wrapU) {
    const n = g.getAttribute('normal') as THREE.BufferAttribute;
    const t = new THREE.Vector3();
    for (let j = 0; j <= R; j++) {
      const a = j * W;
      const b = j * W + C;
      t.set(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize();
      n.setXYZ(a, t.x, t.y, t.z);
      n.setXYZ(b, t.x, t.y, t.z);
    }
  }
  return g;
}

/* ---------- shapes ---------- */

/** Superellipse point: theta 0 = front (+z), increasing toward +x. p = 2 is an ellipse; higher is boxier. */
export function superPoint(theta: number, hw: number, hd: number, p = 2.4): { x: number; z: number } {
  const s = Math.sin(theta);
  const c = Math.cos(theta);
  const e = 2 / p;
  return { x: hw * Math.sign(s) * Math.pow(Math.abs(s), e), z: hd * Math.sign(c) * Math.pow(Math.abs(c), e) };
}

/** True when (x, z) lies inside the superellipse (with a margin factor). */
export function insideSuper(x: number, z: number, hw: number, hd: number, p = 2.4, margin = 1): boolean {
  return Math.pow(Math.abs(x) / (hw * margin), p) + Math.pow(Math.abs(z) / (hd * margin), p) < 1;
}

/** Linear interpolation through sorted keyframes [x, ...values]; smoothstepped between keys. */
export function keyframes(keys: number[][], x: number): number[] {
  if (x <= keys[0][0]) return keys[0].slice(1);
  const last = keys[keys.length - 1];
  if (x >= last[0]) return last.slice(1);
  let i = 0;
  while (keys[i + 1][0] < x) i++;
  const a = keys[i];
  const b = keys[i + 1];
  let t = (x - a[0]) / (b[0] - a[0]);
  t = t * t * (3 - 2 * t);
  return a.slice(1).map((v, k) => v + (b[k + 1] - v) * t);
}

export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Cheap deterministic 2D value noise in [-1, 1]. */
export function noise2(x: number, y: number, seed = 0): number {
  const h = (i: number, j: number) => {
    const s = Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
  };
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = h(xi, yi);
  const b = h(xi + 1, yi);
  const c = h(xi, yi + 1);
  const d = h(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/* ---------- tubes ---------- */

export interface Frame {
  c: THREE.Vector3;
  /** Unit vectors spanning the cross-section: n is "front", b is "side". */
  n: THREE.Vector3;
  b: THREE.Vector3;
}

/** Frames along a straight axis; `front` is projected to be perpendicular to the axis. */
export function straightFrames(a: THREE.Vector3, b: THREE.Vector3, front = new THREE.Vector3(0, 0, 1)) {
  const t = new THREE.Vector3().subVectors(b, a).normalize();
  const n = front.clone().sub(t.clone().multiplyScalar(front.dot(t))).normalize();
  const bb = new THREE.Vector3().crossVectors(t, n).normalize();
  return (v: number): Frame => ({ c: a.clone().lerp(b, v), n, b: bb });
}

/** Frames along a curve, with "n" kept as close to `up` as possible (no Frenet twisting). */
export function curveFrames(curve: THREE.Curve<THREE.Vector3>, up = new THREE.Vector3(0, 1, 0)) {
  return (v: number): Frame => {
    const c = curve.getPointAt(v);
    const t = curve.getTangentAt(v).normalize();
    let n = up.clone().sub(t.clone().multiplyScalar(up.dot(t)));
    if (n.lengthSq() < 1e-6) n = new THREE.Vector3(0, 0, 1);
    n.normalize();
    const b = new THREE.Vector3().crossVectors(t, n).normalize();
    return { c, n, b };
  };
}

/**
 * Tube along frames; radius(v, theta) may return [rN, rB] for an elliptical section. theta 0 points
 * along the frame's n.
 */
export function tubeGeometry(
  frames: (v: number) => Frame,
  radius: (v: number, theta: number) => number | [number, number],
  opts: { cols?: number; rows?: number; keep?: GridOpts['keep']; displace?: (p: THREE.Vector3, v: number, theta: number, out: THREE.Vector3) => void } = {},
): THREE.BufferGeometry {
  const fn: GridFn = (u, v) => {
    const f = frames(v);
    const th = u * Math.PI * 2;
    const r = radius(v, th);
    const [rn, rb] = Array.isArray(r) ? r : [r, r];
    const out = f.n.clone().multiplyScalar(Math.cos(th)).add(f.b.clone().multiplyScalar(Math.sin(th)));
    const p = f.c.clone().add(f.n.clone().multiplyScalar(Math.cos(th) * rn)).add(f.b.clone().multiplyScalar(Math.sin(th) * rb));
    opts.displace?.(p, v, th, out);
    return p;
  };
  return gridGeometry(fn, {
    cols: opts.cols ?? 48,
    rows: opts.rows ?? 32,
    wrapU: true,
    keep: opts.keep,
    inside: (_u, v) => frames(v).c,
  });
}
