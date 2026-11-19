import * as THREE from 'three';

/* ================================================================================================
 * Math helpers and a fixed-topology parametric surface.
 *
 * Every body and garment part is a grid of (cols + 1) × (rows + 1) vertices whose positions are
 * recomputed in place when the measurements change. The index buffer and UVs layout never change, so
 * a slider morph is just "refill the position buffer, recompute normals" with no allocation.
 * ============================================================================================== */

export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export function smoothstep(e0: number, e1: number, x: number) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
/** Gaussian bump, 1 at x = mu. */
export const gauss = (x: number, mu: number, sigma: number) => Math.exp(-((x - mu) * (x - mu)) / (2 * sigma * sigma));
/** Gaussian with a different spread on each side of the peak (e.g. a pectoral with a sharper lower edge). */
export const gauss2 = (x: number, mu: number, below: number, above: number) => gauss(x, mu, x < mu ? below : above);
/** Shortest signed angle difference a - b, in (-π, π]. */
export function angleDiff(a: number, b: number) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Monotone cubic interpolation (Fritsch–Carlson) through [x, y] keys. Smooth like a spline, but it
 * never overshoots between keys, so a body outline cannot develop bulges the keys don't ask for.
 */
export function monotone(keys: ReadonlyArray<readonly [number, number]>): (x: number) => number {
  const n = keys.length;
  const xs = keys.map((k) => k[0]);
  const ys = keys.map((k) => k[1]);
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  const m: number[] = new Array(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

/** Point on a superellipse of half-width a, half-depth b and exponent n; θ = 0 faces +z (front). */
export function superPoint(theta: number, a: number, b: number, n: number, out: { x: number; z: number; nx: number; nz: number }) {
  const s = Math.sin(theta);
  const c = Math.cos(theta);
  const e = 2 / n;
  out.x = a * Math.sign(s) * Math.pow(Math.abs(s), e);
  out.z = b * Math.sign(c) * Math.pow(Math.abs(c), e);
  // outward normal of |x/a|^n + |z/b|^n = 1
  const gx = (Math.sign(out.x) * Math.pow(Math.abs(out.x / a), n - 1)) / a;
  const gz = (Math.sign(out.z) * Math.pow(Math.abs(out.z / b), n - 1)) / b;
  const len = Math.sqrt(gx * gx + gz * gz) || 1;
  out.nx = gx / len;
  out.nz = gz / len;
  return out;
}

/**
 * Superellipse evaluation for a fixed set of column angles. Precomputes log|sin θ| and log|cos θ| so a
 * point (and its outward normal) costs two `exp` calls instead of trig + four `pow` calls. Used by the
 * dense torso and garment grids, which are re-evaluated every frame while a measurement morphs.
 */
export class SuperColumns {
  private readonly ls: Float64Array;
  private readonly lc: Float64Array;
  private readonly ss: Float64Array;
  private readonly sc: Float64Array;
  private readonly s2: Float64Array;
  private readonly c2: Float64Array;

  constructor(count: number, thetaOf: (i: number) => number) {
    this.ls = new Float64Array(count);
    this.lc = new Float64Array(count);
    this.ss = new Float64Array(count);
    this.sc = new Float64Array(count);
    this.s2 = new Float64Array(count);
    this.c2 = new Float64Array(count);
    for (let i = 0; i < count; i++) {
      const th = thetaOf(i);
      let s = Math.sin(th);
      let c = Math.cos(th);
      if (Math.abs(s) < 1e-12) s = 0;
      if (Math.abs(c) < 1e-12) c = 0;
      this.ss[i] = Math.sign(s);
      this.sc[i] = Math.sign(c);
      this.ls[i] = Math.log(Math.abs(s));
      this.lc[i] = Math.log(Math.abs(c));
      this.s2[i] = s * s;
      this.c2[i] = c * c;
    }
  }

  /** Same result as `superPoint(θ_i, a, b, n, out)`. */
  point(i: number, a: number, b: number, n: number, out: { x: number; z: number; nx: number; nz: number }) {
    const e = 2 / n;
    const px = Math.exp(e * this.ls[i]);
    const pz = Math.exp(e * this.lc[i]);
    out.x = a * this.ss[i] * px;
    out.z = b * this.sc[i] * pz;
    // gradient of |x/a|^n + |z/b|^n: |s|^(2-e) / a  =  s² / (|s|^e · a)
    const gx = px > 0 ? (this.ss[i] * this.s2[i]) / (px * a) : 0;
    const gz = pz > 0 ? (this.sc[i] * this.c2[i]) / (pz * b) : 0;
    const len = Math.sqrt(gx * gx + gz * gz) || 1;
    out.nx = gx / len;
    out.nz = gz / len;
    return out;
  }
}

const trigCache = new Map<string, { sin: Float64Array; cos: Float64Array }>();
/**
 * sin/cos of u·2π for each of the `cols + 1` columns, optionally "squared off" (|x|^p keeping sign),
 * cached per (cols, p). Tubes look these up instead of calling trig/pow for every vertex.
 */
export function ringTable(cols: number, p = 1) {
  const key = `${cols}:${p}`;
  let t = trigCache.get(key);
  if (!t) {
    const sin = new Float64Array(cols + 1);
    const cos = new Float64Array(cols + 1);
    for (let i = 0; i <= cols; i++) {
      const ph = (i / cols) * Math.PI * 2;
      const s = Math.sin(ph);
      const c = Math.cos(ph);
      sin[i] = p === 1 ? s : Math.sign(s) * Math.pow(Math.abs(s), p);
      cos[i] = p === 1 ? c : Math.sign(c) * Math.pow(Math.abs(c), p);
    }
    t = { sin, cos };
    trigCache.set(key, t);
  }
  return t;
}

export type SurfaceFn = (u: number, v: number, out: THREE.Vector3) => void;

export interface SurfaceOptions {
  cols: number;
  rows: number;
  /** u wraps around (closed tube): the seam column's normals are welded so no shading seam shows. */
  wrapU?: boolean;
  /** Row v = 0 / v = 1 collapses to a single point (a pole): its normals are averaged. */
  poleStart?: boolean;
  poleEnd?: boolean;
  /** UV extent around u and along v, in metres (materials set texture repeat per metre). */
  uvScale?: [number, number];
  /** Flip triangle winding (for surfaces whose parametrisation faces inward). */
  flip?: boolean;
}

/** A grid mesh geometry that is re-evaluated in place. */
export class ParametricSurface {
  readonly geometry = new THREE.BufferGeometry();
  private readonly pos: Float32Array;
  private readonly nrm: Float32Array;
  private readonly opts: Required<SurfaceOptions>;
  private readonly tmp = new THREE.Vector3();

  constructor(opts: SurfaceOptions) {
    this.opts = { wrapU: false, poleStart: false, poleEnd: false, uvScale: [1, 1], flip: false, ...opts };
    const { cols, rows } = this.opts;
    const count = (cols + 1) * (rows + 1);
    this.pos = new Float32Array(count * 3);
    this.nrm = new Float32Array(count * 3);
    const uv = new Float32Array(count * 2);
    const uScale = this.opts.uvScale[0];
    for (let j = 0; j <= rows; j++)
      for (let i = 0; i <= cols; i++) {
        const k = j * (cols + 1) + i;
        uv[k * 2] = (i / cols) * uScale;
        uv[k * 2 + 1] = (j / rows) * this.opts.uvScale[1];
      }
    const index: number[] = [];
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const a = j * (cols + 1) + i;
        const b = a + 1;
        const c = a + cols + 1;
        const d = c + 1;
        if (this.opts.flip) index.push(a, b, c, b, d, c);
        else index.push(a, c, b, b, c, d);
      }
    const posAttr = new THREE.BufferAttribute(this.pos, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', posAttr);
    const nrmAttr = new THREE.BufferAttribute(this.nrm, 3);
    nrmAttr.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('normal', nrmAttr);
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.geometry.setIndex(index);
  }

  /** Re-evaluate every vertex, then recompute smooth normals and bounds. */
  update(fn: SurfaceFn) {
    const { cols, rows } = this.opts;
    const p = this.tmp;
    for (let j = 0; j <= rows; j++) {
      const v = j / rows;
      for (let i = 0; i <= cols; i++) {
        fn(i / cols, v, p);
        const k = (j * (cols + 1) + i) * 3;
        this.pos[k] = p.x;
        this.pos[k + 1] = p.y;
        this.pos[k + 2] = p.z;
      }
    }
    const g = this.geometry;
    g.attributes.position.needsUpdate = true;
    this.gridNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();
  }

  /**
   * Smooth normals straight from the grid (central differences along u and v). One pass, no per-
   * triangle accumulation; the wrap seam uses neighbours across the seam, so it shades seamlessly, and
   * pole rows point away from the adjacent ring.
   */
  private gridNormals() {
    const { cols, rows, wrapU, flip, poleStart, poleEnd } = this.opts;
    const P = this.pos;
    const N = this.nrm;
    const W = cols + 1;
    for (let j = 0; j <= rows; j++) {
      const j0 = j > 0 ? j - 1 : 0;
      const j1 = j < rows ? j + 1 : rows;
      for (let i = 0; i <= cols; i++) {
        let i0 = i - 1;
        let i1 = i + 1;
        if (wrapU) {
          if (i0 < 0) i0 = cols - 1;
          if (i1 > cols) i1 = 1;
        } else {
          if (i0 < 0) i0 = 0;
          if (i1 > cols) i1 = cols;
        }
        const a = (j * W + i0) * 3;
        const b = (j * W + i1) * 3;
        const c = (j0 * W + i) * 3;
        const d = (j1 * W + i) * 3;
        const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
        const vx = P[d] - P[c], vy = P[d + 1] - P[c + 1], vz = P[d + 2] - P[c + 2];
        // flip=false triangles face (dv × du); flip=true face (du × dv)
        let nx = vy * uz - vz * uy;
        let ny = vz * ux - vx * uz;
        let nz = vx * uy - vy * ux;
        if (flip) {
          nx = -nx;
          ny = -ny;
          nz = -nz;
        }
        const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        const k = (j * W + i) * 3;
        N[k] = nx / l;
        N[k + 1] = ny / l;
        N[k + 2] = nz / l;
      }
    }
    const pole = (j: number, nb: number) => {
      let cx = 0, cy = 0, cz = 0;
      for (let i = 0; i < cols; i++) {
        const k = (nb * W + i) * 3;
        cx += P[k];
        cy += P[k + 1];
        cz += P[k + 2];
      }
      const k0 = j * W * 3;
      let nx = P[k0] - cx / cols, ny = P[k0 + 1] - cy / cols, nz = P[k0 + 2] - cz / cols;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l;
      ny /= l;
      nz /= l;
      for (let i = 0; i <= cols; i++) {
        const k = (j * W + i) * 3;
        N[k] = nx;
        N[k + 1] = ny;
        N[k + 2] = nz;
      }
    };
    if (poleStart) pole(0, 1);
    if (poleEnd) pole(rows, rows - 1);
    this.geometry.attributes.normal.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
  }
}

const Z = new THREE.Vector3(0, 0, 1);
const Y = new THREE.Vector3(0, 1, 0);
/**
 * Cross-section frame along a limb axis. For a downward axis `side` is +x and `front` is +z; for a
 * forward (foot) axis `front` is +y. Cross-sections are `side·sinφ + front·cosφ`, which with v running
 * along the tangent gives outward-facing triangles without flipping.
 */
export function limbFrame(tangent: THREE.Vector3, side: THREE.Vector3, front: THREE.Vector3) {
  const ref = Math.abs(tangent.z) > 0.9 ? Y : Z;
  front.copy(ref).addScaledVector(tangent, -tangent.dot(ref)).normalize();
  side.crossVectors(front, tangent).normalize();
}
