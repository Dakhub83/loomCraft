import * as THREE from 'three';
import { Anatomy, BUMP_TERMS, bumpColumn, type FootShape, type HandShape, type LimbShape, type Section } from './anatomy';
import { ParametricSurface, SuperColumns, clamp, limbFrame, monotone, ringTable, superPoint } from './surface';

/* ================================================================================================
 * The procedural mannequin: one smooth parametric surface per body part, re-evaluated in place when
 * the anatomy changes. Parts overlap at the joints (shoulder caps sit inside the deltoid, leg tops
 * inside the pelvis, wrists inside the hands), which reads as one continuous sculpt.
 * ============================================================================================== */

export type BodyMode = 'full' | 'dressform';

const TORSO_COLS = 128;
const TORSO_ROWS = 170;

/** θ for torso column u: the seam sits at the centre back. */
export const torsoTheta = (u: number) => Math.PI + u * Math.PI * 2;

/** Superellipse tables for the torso column angles (shared with the garment, which uses the same grid). */
export const torsoColumns = (cols: number) => new SuperColumns(cols + 1, (i) => torsoTheta(i / cols));

/** Column bump factors for a torso-like grid (they depend only on θ, so they're computed once). */
export function columnFactors(cols: number, fabric: boolean, thetaOf: (u: number) => number) {
  const out = new Float32Array((cols + 1) * BUMP_TERMS);
  const tmp = new Float32Array(BUMP_TERMS);
  for (let i = 0; i <= cols; i++) {
    bumpColumn(thetaOf(i / cols), fabric, tmp);
    out.set(tmp, i * BUMP_TERMS);
  }
  return out;
}

export class ProceduralMannequin extends THREE.Group {
  private readonly torso = new ParametricSurface({ cols: TORSO_COLS, rows: TORSO_ROWS, wrapU: true, flip: true, uvScale: [0.95, 0.8] });
  private readonly bottomCap = new ParametricSurface({ cols: TORSO_COLS, rows: 8, wrapU: true, poleEnd: true, uvScale: [0.6, 0.2] });
  private readonly topCap = new ParametricSurface({ cols: TORSO_COLS, rows: 8, wrapU: true, poleEnd: true, flip: true, uvScale: [0.3, 0.1] });
  private readonly head = new ParametricSurface({ cols: 96, rows: 84, wrapU: true, poleStart: true, poleEnd: true, uvScale: [0.6, 0.26] });
  private readonly arms = [0, 1].map(() => new ParametricSurface({ cols: 40, rows: 120, wrapU: true, poleStart: true, poleEnd: true, uvScale: [0.25, 0.6] }));
  private readonly hands = [0, 1].map(() => new ParametricSurface({ cols: 32, rows: 44, wrapU: true, poleEnd: true, uvScale: [0.15, 0.2] }));
  private readonly thumbs = [0, 1].map(() => new ParametricSurface({ cols: 20, rows: 16, wrapU: true, poleEnd: true, uvScale: [0.06, 0.07] }));
  private readonly legs = [0, 1].map(() => new ParametricSurface({ cols: 48, rows: 140, wrapU: true, poleEnd: true, uvScale: [0.45, 0.95] }));
  private readonly feet = [0, 1].map(() => new ParametricSurface({ cols: 40, rows: 52, wrapU: true, poleStart: true, poleEnd: true, uvScale: [0.2, 0.26] }));

  private readonly meshes: Record<string, THREE.Mesh[]> = {};
  private readonly cols = columnFactors(TORSO_COLS, false, torsoTheta);
  private readonly superCols = torsoColumns(TORSO_COLS);
  private readonly headCols = new SuperColumns(97, (i) => (i / 96) * Math.PI * 2 + Math.PI);
  private material: THREE.Material;
  private capMaterial: THREE.Material;
  private mode: BodyMode = 'full';
  anatomy: Anatomy | null = null;

  constructor(material: THREE.Material, capMaterial: THREE.Material) {
    super();
    this.name = 'procedural-mannequin';
    this.material = material;
    this.capMaterial = capMaterial;
    const add = (key: string, surfaces: ParametricSurface[], mat = material) => {
      this.meshes[key] = surfaces.map((s) => {
        const m = new THREE.Mesh(s.geometry, mat);
        m.castShadow = true;
        m.receiveShadow = true;
        m.name = key;
        this.add(m);
        return m;
      });
    };
    add('torso', [this.torso]);
    add('bottomCap', [this.bottomCap]);
    add('topCap', [this.topCap]);
    add('head', [this.head]);
    add('arms', this.arms);
    add('hands', this.hands);
    add('thumbs', this.thumbs);
    add('legs', this.legs);
    add('feet', this.feet);
  }

  /** Torso height range for the current mode. */
  torsoRange(a: Anatomy): [number, number] {
    return this.mode === 'full' ? [a.f.crotch * a.H, a.f.neckTop * a.H] : [0.49 * a.H, 0.876 * a.H];
  }

  setMode(mode: BodyMode) {
    this.mode = mode;
    const full = mode === 'full';
    for (const k of ['head', 'arms', 'hands', 'thumbs', 'legs', 'feet']) for (const m of this.meshes[k]) m.visible = full;
    this.meshes.topCap[0].material = full ? this.material : this.capMaterial;
    if (this.anatomy) this.update(this.anatomy);
  }

  setMaterial(material: THREE.Material, capMaterial: THREE.Material) {
    this.material = material;
    this.capMaterial = capMaterial;
    for (const [k, list] of Object.entries(this.meshes))
      for (const m of list) m.material = k === 'topCap' && this.mode === 'dressform' ? capMaterial : material;
  }

  update(a: Anatomy) {
    this.anatomy = a;
    this.updateTorso(a);
    if (this.mode === 'full') {
      this.updateHead(a);
      a.arms.forEach((l, i) => this.updateLimb(this.arms[i], l));
      a.hands.forEach((h, i) => this.updateHand(this.hands[i], this.thumbs[i], h));
      a.legs.forEach((l, i) => this.updateLimb(this.legs[i], l));
      a.feet.forEach((f, i) => this.updateFoot(this.feet[i], f));
    }
  }

  /** Point on the bare torso (no bumps cached): used for the stand fittings. */
  torsoRing(a: Anatomy, y: number, u: number, out: THREE.Vector3) {
    const sec: Section = { a: 0, b: 0, zc: 0, n: 2 };
    a.section(y, sec);
    const sp = { x: 0, z: 0, nx: 0, nz: 0 };
    superPoint(torsoTheta(u), sec.a, sec.b, sec.n, sp);
    return out.set(sp.x, y, sp.z + sec.zc);
  }

  private updateTorso(a: Anatomy) {
    const [y0, y1] = this.torsoRange(a);
    const sec: Section = { a: 0, b: 0, zc: 0, n: 2 };
    const sp = { x: 0, z: 0, nx: 0, nz: 0 };
    const row = new Float32Array(BUMP_TERMS);
    const cols = this.cols;
    let lastV = -1;
    const point = (u: number, y: number, out: THREE.Vector3) => {
      const i = Math.round(u * TORSO_COLS);
      this.superCols.point(i, sec.a, sec.b, sec.n, sp);
      let bump = 0;
      for (let k = 0; k < BUMP_TERMS; k++) bump += cols[i * BUMP_TERMS + k] * row[k];
      out.set(sp.x + sp.nx * bump, y, sp.z + sec.zc + sp.nz * bump);
    };
    const ringAt = (y: number) => {
      a.section(y, sec);
      a.bumpRow(y, false, row);
    };
    this.torso.update((u, v, out) => {
      const y = y0 + (y1 - y0) * v;
      if (v !== lastV) {
        ringAt(y);
        lastV = v;
      }
      point(u, y, out);
    });

    // caps: shrink the end ring to its centre, slightly domed
    const ring = new THREE.Vector3();
    const cap = (surface: ParametricSurface, y: number, dome: number) => {
      ringAt(y);
      surface.update((u, v, out) => {
        point(u, y, ring);
        const k = v * v * (3 - 2 * v);
        out.set(ring.x * (1 - k), y + dome * Math.sin((v * Math.PI) / 2), sec.zc + (ring.z - sec.zc) * (1 - k));
      });
    };
    cap(this.bottomCap, y0, this.mode === 'full' ? -0.012 * a.s : -0.004 * a.s);
    cap(this.topCap, y1, this.mode === 'full' ? 0.01 * a.s : 0.003 * a.s);
  }

  private updateHead(a: Anatomy) {
    const s = a.s * (0.95 + 0.05 * a.p.limb);
    const hh = 0.132 * a.H;
    const top = a.H;
    const wKeys = monotone([[0, 0], [0.012, 0.022], [0.035, 0.038], [0.12, 0.062], [0.3, 0.076], [0.5, 0.075], [0.62, 0.07], [0.74, 0.058], [0.84, 0.043], [0.92, 0.032], [0.975, 0.02], [1, 0]]);
    const fKeys = monotone([[0, 0], [0.012, 0.024], [0.035, 0.042], [0.12, 0.075], [0.3, 0.094], [0.45, 0.1], [0.6, 0.1], [0.72, 0.096], [0.84, 0.088], [0.92, 0.07], [0.975, 0.04], [1, 0]]);
    const bKeys = monotone([[0, 0], [0.012, 0.026], [0.035, 0.046], [0.12, 0.085], [0.3, 0.103], [0.45, 0.101], [0.6, 0.086], [0.72, 0.062], [0.84, 0.047], [0.92, 0.036], [0.975, 0.022], [1, 0]]);
    const zc = 0.014 * a.s;
    const sp = { x: 0, z: 0, nx: 0, nz: 0 };
    let lastV = -1;
    let w = 0, fz = 0, bz = 0;
    this.head.update((u, v, out) => {
      if (v !== lastV) {
        w = wKeys(v) * s;
        fz = fKeys(v) * s;
        bz = bKeys(v) * s;
        lastV = v;
      }
      const i = Math.round(u * 96);
      // front half (cos θ > 0) uses the face depth, the back half the skull depth
      const front = i > 24 && i < 72;
      this.headCols.point(i, w, front ? fz : bz, 2.15, sp);
      out.set(sp.x, top - v * hh * 1.06, sp.z + zc);
    });
  }

  private updateLimb(surface: ParametricSurface, l: LimbShape) {
    const c = new THREE.Vector3();
    const t = new THREE.Vector3();
    const side = new THREE.Vector3();
    const front = new THREE.Vector3();
    let lastV = -1;
    let sh = { rx: 0, rz: 0, dz: 0 };
    const cols = surface === this.legs[0] || surface === this.legs[1] ? 48 : 40;
    const ring = ringTable(cols);
    surface.update((u, v, out) => {
      if (v !== lastV) {
        const vv = clamp(v, 0.0005, 0.9995);
        l.curve.getPointAt(vv, c);
        l.curve.getTangentAt(vv, t);
        limbFrame(t, side, front);
        sh = l.shape(v * l.length);
        lastV = v;
      }
      const i = Math.round(u * cols);
      const sx = ring.sin[i] * sh.rx;
      const sz = ring.cos[i] * sh.rz + sh.dz;
      out.copy(c).addScaledVector(side, sx).addScaledVector(front, sz);
    });
  }

  private updateHand(surface: ParametricSurface, thumb: ParametricSurface, h: HandShape) {
    const g = h.scale;
    const thick = monotone([[0, 0.011], [0.15, 0.013], [0.4, 0.0122], [0.6, 0.0106], [0.85, 0.0088], [1, 0.0078]]);
    const width = monotone([[0, 0.02], [0.15, 0.026], [0.4, 0.0288], [0.6, 0.0278], [0.85, 0.0242], [1, 0.02]]);
    const inward = new THREE.Vector3(-h.side, 0, 0);
    const center = (t: number, out: THREE.Vector3) => out.copy(h.wrist).addScaledVector(h.dir, t * h.length).addScaledVector(inward, h.curl * Math.max(0, t) ** 2);
    const c = new THREE.Vector3();
    const c2 = new THREE.Vector3();
    const tan = new THREE.Vector3();
    const side = new THREE.Vector3();
    const front = new THREE.Vector3();
    let lastV = -1;
    let rx = 0, rz = 0;
    const handRing = ringTable(32, 0.8);
    surface.update((u, v, out) => {
      if (v !== lastV) {
        const t = -0.06 + v * 1.06;
        center(t, c);
        center(t + 0.01, c2);
        tan.subVectors(c2, c).normalize();
        limbFrame(tan, side, front);
        const tt = clamp(t, 0, 1);
        const env = t > 0.82 ? Math.sqrt(Math.max(0, 1 - ((t - 0.82) / 0.18) ** 2)) : 1;
        rx = thick(tt) * g * env;
        rz = width(tt) * g * env;
        lastV = v;
      }
      // a softly squared cross-section reads as a hand rather than a tube
      const i = Math.round(u * 32);
      out.copy(c).addScaledVector(side, handRing.sin[i] * rx).addScaledVector(front, handRing.cos[i] * rz);
    });

    // thumb: on the front edge of the palm, pointing forward and down
    const base = new THREE.Vector3().copy(h.wrist).addScaledVector(h.dir, 0.28 * h.length).add(new THREE.Vector3(0, 0, 0.017 * g)).addScaledVector(inward, 0.004 * g);
    const dir = new THREE.Vector3().copy(h.dir).multiplyScalar(0.75).add(new THREE.Vector3(0, 0, 0.5)).addScaledVector(inward, 0.25).normalize();
    const len = 0.062 * g;
    lastV = -1;
    let r = 0;
    const thumbRing = ringTable(20);
    thumb.update((u, v, out) => {
      if (v !== lastV) {
        c.copy(base).addScaledVector(dir, v * len);
        limbFrame(dir, side, front);
        const env = v > 0.78 ? Math.sqrt(Math.max(0, 1 - ((v - 0.78) / 0.22) ** 2)) : 1;
        r = (0.0105 - 0.0018 * v) * g * env;
        lastV = v;
      }
      const i = Math.round(u * 20);
      out.copy(c).addScaledVector(side, thumbRing.sin[i] * r * 0.85).addScaledVector(front, thumbRing.cos[i] * r);
    });
  }

  private updateFoot(surface: ParametricSurface, f: FootShape) {
    const w = monotone([[0, 0.026], [0.1, 0.031], [0.3, 0.034], [0.55, 0.041], [0.75, 0.046], [0.9, 0.042], [1, 0.035]]);
    const hgt = monotone([[0, 0.05], [0.1, 0.068], [0.3, 0.082], [0.5, 0.06], [0.75, 0.036], [0.9, 0.028], [1, 0.022]]);
    const g = f.scale;
    const cosY = Math.cos(f.yaw);
    const sinY = Math.sin(f.yaw);
    const ax = f.ankle.x;
    const az = f.ankle.z;
    let lastV = -1;
    let hw = 0, hh = 0, z = 0;
    const footRing = ringTable(40, 0.75);
    surface.update((u, v, out) => {
      if (v !== lastV) {
        const env = v < 0.07 ? Math.sqrt(Math.max(0, 1 - ((0.07 - v) / 0.07) ** 2)) : v > 0.88 ? Math.sqrt(Math.max(0, 1 - ((v - 0.88) / 0.12) ** 2)) : 1;
        hw = w(v) * g * env;
        hh = (hgt(v) * g) / 2;
        const env2 = v > 0.88 ? env : v < 0.07 ? env : 1;
        hh *= 0.35 + 0.65 * env2;
        z = f.heelZ + v * f.length;
        lastV = v;
      }
      const i = Math.round(u * 40);
      const sx = footRing.sin[i];
      const sy = footRing.cos[i];
      const lx = sx * hw;
      const ly = Math.max(0.002, hh + sy * hh);
      const lz = z - az;
      // toe-out around the ankle
      out.set(ax + lx * cosY + lz * sinY, ly, az - lx * sinY + lz * cosY);
    });
  }

  dispose() {
    for (const s of [this.torso, this.bottomCap, this.topCap, this.head, ...this.arms, ...this.hands, ...this.thumbs, ...this.legs, ...this.feet]) s.dispose();
  }
}
