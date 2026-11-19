import * as THREE from 'three';
import { angleDiff, clamp, gauss, gauss2, lerp, monotone, smoothstep, superPoint } from './surface';

/* ================================================================================================
 * Parametric anatomy. Turns tape measurements (cm) plus a few shape parameters per body type into:
 *   - torso cross-sections (superellipses) keyed by height, solved so the girth at chest / waist /
 *     hips matches the tape measurement
 *   - separable anatomical bumps (pectorals, bust, scapulae, spine, glutes, clavicles) evaluated as
 *     column(θ) × row(height) factors, so a whole surface refresh stays cheap enough to morph live
 *   - limb skeletons (arms, legs) as smooth curves with radius profiles, plus hand / foot / head shapes
 * World units are metres; the soles sit on y = 0 and the mannequin faces +z.
 * ============================================================================================== */

export type BodyType = 'male' | 'female' | 'neutral';

export interface BodyParams {
  /** Tape measurements, cm. */
  chest: number;
  waist: number;
  hips: number;
  /** Shoulder width, seam to seam across the back (cm). */
  shoulders: number;
  height: number;
  /** Shape parameters (set by the body-type preset, morphed with it). */
  bust: number;
  pecs: number;
  glutes: number;
  muscle: number;
  /** Waist and hip heights as a fraction of stature. */
  waistF: number;
  hipF: number;
  /** Limb girth multiplier. */
  limb: number;
  /** Neck girth multiplier. */
  neck: number;
  /** Depth / width ratio of the chest, waist and hip sections. */
  chestK: number;
  waistK: number;
  hipK: number;
}

export type MeasurementKey = 'chest' | 'waist' | 'hips' | 'shoulders' | 'height';

export const MEASUREMENTS: Array<{ key: MeasurementKey; label: string; min: number; max: number }> = [
  { key: 'chest', label: 'Chest', min: 76, max: 132 },
  { key: 'waist', label: 'Waist', min: 56, max: 122 },
  { key: 'hips', label: 'Hips', min: 80, max: 134 },
  { key: 'shoulders', label: 'Shoulder width', min: 32, max: 54 },
  { key: 'height', label: 'Height', min: 150, max: 200 },
];

export const BODY_PRESETS: Record<BodyType, { label: string; params: BodyParams }> = {
  male: {
    label: 'Athletic Male',
    params: {
      chest: 102, waist: 80, hips: 97, shoulders: 47, height: 183,
      bust: 0, pecs: 1, glutes: 0.8, muscle: 1, waistF: 0.612, hipF: 0.515, limb: 1, neck: 1,
      chestK: 0.66, waistK: 0.74, hipK: 0.7,
    },
  },
  female: {
    label: 'Female',
    params: {
      chest: 90, waist: 68, hips: 98, shoulders: 39, height: 170,
      bust: 1, pecs: 0.15, glutes: 1.15, muscle: 0.35, waistF: 0.625, hipF: 0.508, limb: 0.86, neck: 0.84,
      chestK: 0.6, waistK: 0.72, hipK: 0.68,
    },
  },
  neutral: {
    label: 'Neutral Unisex',
    params: {
      chest: 95, waist: 78, hips: 97, shoulders: 43, height: 176,
      bust: 0.25, pecs: 0.5, glutes: 0.95, muscle: 0.6, waistF: 0.62, hipF: 0.512, limb: 0.93, neck: 0.92,
      chestK: 0.64, waistK: 0.73, hipK: 0.71,
    },
  },
};

export interface Section {
  a: number;
  b: number;
  zc: number;
  n: number;
}

/** Number of separable bump terms. */
export const BUMP_TERMS = 8;

/**
 * θ-dependent bump factors, one per term (they depend only on the angle, so a grid computes them once).
 * `fabric`: cloth bridges hollows (cleavage, spine, under the glutes) instead of following them.
 */
export function bumpColumn(theta: number, fabric: boolean, out: Float32Array) {
  const pair = (c: number, sig: number) => gauss(angleDiff(theta, c), 0, sig) + gauss(angleDiff(theta, -c), 0, sig);
  const back = (c: number, sig: number) => gauss(angleDiff(theta, Math.PI - c), 0, sig) + gauss(angleDiff(theta, Math.PI + c), 0, sig);
  out[0] = pair(0.45, 0.32);
  if (fabric) {
    const d = Math.min(Math.abs(angleDiff(theta, 0.4)), Math.abs(angleDiff(theta, -0.4)));
    out[1] = Math.abs(angleDiff(theta, 0)) < 0.4 ? 1 : gauss(d, 0, 0.32);
  } else out[1] = pair(0.4, 0.3);
  out[2] = gauss(angleDiff(theta, 0), 0, 0.55);
  out[3] = back(0.62, 0.35);
  out[4] = fabric ? 0 : gauss(angleDiff(theta, Math.PI), 0, 0.09);
  if (fabric) {
    const d = Math.min(Math.abs(angleDiff(theta, Math.PI - 0.5)), Math.abs(angleDiff(theta, Math.PI + 0.5)));
    out[5] = Math.abs(angleDiff(theta, Math.PI)) < 0.5 ? 1 : gauss(d, 0, 0.42);
  } else out[5] = back(0.5, 0.42);
  out[6] = fabric ? 0 : pair(0.55, 0.3);
  out[7] = fabric ? 0 : gauss(angleDiff(theta, 0), 0, 0.07);
  return out;
}

/** Perimeter of the superellipse with a = 1, b = k. */
function unitPerimeter(k: number, n: number) {
  const p = { x: 0, z: 0, nx: 0, nz: 0 };
  let per = 0;
  let px = 0;
  let pz = 0;
  const N = 128;
  for (let i = 0; i <= N; i++) {
    superPoint((i / N) * Math.PI * 2, 1, k, n, p);
    if (i) per += Math.hypot(p.x - px, p.z - pz);
    px = p.x;
    pz = p.z;
  }
  return per;
}

export interface LimbShape {
  side: 1 | -1;
  curve: THREE.CatmullRomCurve3;
  /** Arc length of the curve. */
  length: number;
  /** Arc length at which the hemispherical cap ends and the limb proper (joint) begins. */
  start: number;
  /** Cross-section half-sizes [side, front] and a front/back centre offset at arc length s. */
  shape(s: number): { rx: number; rz: number; dz: number };
}

export interface HandShape {
  side: 1 | -1;
  wrist: THREE.Vector3;
  dir: THREE.Vector3;
  length: number;
  /** Fingers curl toward the thigh. */
  curl: number;
  scale: number;
}

export interface FootShape {
  side: 1 | -1;
  ankle: THREE.Vector3;
  heelZ: number;
  length: number;
  /** Toe-out angle (radians). */
  yaw: number;
  scale: number;
}

export class Anatomy {
  readonly p: BodyParams;
  readonly H: number;
  /** Scale relative to a 1.75 m reference figure. */
  readonly s: number;
  readonly chestA: number;
  readonly chestB: number;
  readonly waistA: number;
  readonly waistB: number;
  readonly hipA: number;
  readonly hipB: number;
  readonly neckA: number;
  readonly neckB: number;
  /** Half shoulder width (m). */
  readonly sh: number;
  /** Key heights as fractions of stature. */
  readonly f = { crotch: 0.452, chest: 0.72, bust: 0.712, underarm: 0.748, shoulder: 0.81, neckBase: 0.832, chin: 0.868, neckTop: 0.905 };
  readonly deltoid: number;
  readonly arms: [LimbShape, LimbShape];
  readonly legs: [LimbShape, LimbShape];
  readonly hands: [HandShape, HandShape];
  readonly feet: [FootShape, FootShape];

  private readonly fa: (f: number) => number;
  private readonly fb: (f: number) => number;
  private readonly fzc: (f: number) => number;
  private readonly fn: (f: number) => number;
  readonly amp: { pec: number; bust: number; ab: number; scap: number; spine: number; glute: number; clav: number; sternum: number };

  constructor(p: BodyParams) {
    this.p = p;
    const H = (this.H = p.height / 100);
    const s = (this.s = H / 1.75);
    const f = this.f;
    f.bust = lerp(0.72, 0.712, clamp(p.bust, 0, 1));

    this.amp = {
      pec: 0.011 * s * p.pecs * (0.5 + 0.5 * p.muscle),
      bust: 0.03 * s * p.bust * clamp((p.chest - p.waist) / 22, 0.6, 1.5),
      ab: 0.006 * s * (1 - 0.5 * p.muscle) + 0.03 * Math.max(0, (p.waist - p.hips + 8) / 100),
      scap: 0.006 * s,
      spine: 0.004 * s * (0.4 + 0.6 * p.muscle),
      glute: 0.018 * s * p.glutes,
      clav: 0.0025 * s * (0.5 + 0.5 * p.muscle),
      sternum: 0.003 * s * p.muscle * p.pecs,
    };

    // girths: solve the section width so its perimeter (+ the bumps' share) matches the tape
    const chestC = p.chest / 100 - 1.5 * this.amp.bust - 1.3 * this.amp.pec;
    this.chestA = chestC / unitPerimeter(p.chestK, 2.3);
    this.chestB = this.chestA * p.chestK;
    this.waistA = p.waist / 100 / unitPerimeter(p.waistK, 2.1);
    this.waistB = this.waistA * p.waistK;
    const hipC = p.hips / 100 - 2.0 * this.amp.glute;
    this.hipA = hipC / unitPerimeter(p.hipK, 2.2);
    this.hipB = this.hipA * p.hipK;
    const neckC = 0.375 * p.neck * Math.sqrt(p.chest / 100) * s;
    this.neckA = neckC / unitPerimeter(0.9, 2);
    this.neckB = this.neckA * 0.9;
    this.sh = p.shoulders / 200;

    const { chestA, chestB, waistA, waistB, hipA, hipB, neckA, neckB, sh } = this;
    const wf = p.waistF;
    const hf = p.hipF;
    const cf = f.chest;
    this.fa = monotone([
      [f.crotch, hipA * 0.55],
      [0.47, hipA * 0.9],
      [0.49, hipA * 0.97],
      [hf, hipA],
      [lerp(hf, wf, 0.4), lerp(hipA, waistA, 0.55)],
      [wf, waistA],
      [lerp(wf, cf, 0.45), lerp(waistA, chestA, 0.62)],
      [0.7, chestA * 0.985],
      [cf, chestA],
      [f.underarm, chestA * 1.01],
      [0.778, lerp(chestA, sh * 0.93, 0.6)],
      [0.798, sh * 0.93],
      [f.shoulder, sh * 0.85],
      [0.822, sh * 0.62],
      [f.neckBase + 0.004, neckA * 1.45],
      [0.85, neckA * 1.08],
      [0.866, neckA],
      [f.neckTop, neckA * 0.96],
    ]);
    this.fb = monotone([
      [f.crotch, hipB * 0.5],
      [0.47, hipB * 0.8],
      [0.49, hipB * 0.94],
      [hf, hipB],
      [wf, waistB],
      [cf, chestB],
      [f.underarm, chestB * 0.98],
      [0.778, chestB * 0.9],
      [0.798, chestB * 0.74],
      [f.shoulder, chestB * 0.64],
      [0.822, neckB * 1.6],
      [f.neckBase + 0.004, neckB * 1.3],
      [0.85, neckB * 1.08],
      [0.866, neckB],
      [f.neckTop, neckB * 0.98],
    ]);
    this.fzc = monotone([
      [f.crotch, (-0.006 - 0.008 * p.glutes) * s],
      [hf, (-0.006 - 0.011 * p.glutes) * s],
      [wf, 0],
      [cf, 0.008 * s],
      [0.798, -0.004 * s],
      [0.822, -0.012 * s],
      [0.85, 0],
      [f.neckTop, 0.014 * s],
    ]);
    this.fn = monotone([
      [f.crotch, 2.0],
      [hf, 2.25],
      [wf, 2.1],
      [cf, 2.35],
      [0.79, 2.7],
      [f.shoulder, 2.6],
      [0.83, 2.2],
      [0.85, 2.0],
      [f.neckTop, 2.0],
    ]);

    // ---------------------------------------------------------------- arms
    const gA = s * p.limb * Math.sqrt(p.chest / 96);
    this.deltoid = 0.05 * gA * (0.78 + 0.22 * p.muscle);
    this.arms = [this.buildArm(1, gA), this.buildArm(-1, gA)];
    this.hands = [this.buildHand(this.arms[0], gA), this.buildHand(this.arms[1], gA)];

    // ---------------------------------------------------------------- legs
    const gL = s * Math.pow(p.hips / 98, 0.9) * Math.sqrt(p.limb);
    this.legs = [this.buildLeg(1, gL), this.buildLeg(-1, gL)];
    this.feet = [this.buildFoot(1), this.buildFoot(-1)];
  }

  /** Torso section at height y (metres). */
  section(y: number, out: Section): Section {
    const t = y / this.H;
    out.a = this.fa(t);
    out.b = this.fb(t);
    out.zc = this.fzc(t);
    out.n = this.fn(t);
    return out;
  }

  /** Height-dependent bump amplitudes (metres), matching `bumpColumn`. */
  bumpRow(y: number, fabric: boolean, out: Float32Array) {
    const t = y / this.H;
    const a = this.amp;
    const hf = this.p.hipF;
    out[0] = a.pec * gauss2(t, 0.738, fabric ? 0.03 : 0.012, 0.03);
    out[1] = a.bust * (fabric ? 0.97 * gauss2(t, this.f.bust, 0.055, 0.04) : gauss2(t, this.f.bust, 0.018, 0.038));
    out[2] = a.ab * gauss(t, 0.575, 0.035);
    out[3] = a.scap * gauss(t, 0.765, 0.028);
    out[4] = -a.spine * smoothstep(0.5, 0.56, t) * (1 - smoothstep(0.79, 0.82, t));
    out[5] = a.glute * gauss2(t, hf - 0.01, fabric ? 0.06 : 0.02, 0.045);
    out[6] = a.clav * gauss(t, 0.807, 0.011);
    out[7] = -a.sternum * gauss(t, 0.735, 0.03);
    return out;
  }

  // ------------------------------------------------------------------------------------- limbs

  private buildArm(side: 1 | -1, g: number): LimbShape {
    const H = this.H;
    const R0 = this.deltoid;
    const J = new THREE.Vector3(side * (this.sh - R0 * 0.55), 0.792 * H, -0.004 * this.s);
    const L1 = 0.188 * H;
    const L2 = 0.146 * H;
    const ab = THREE.MathUtils.degToRad(9);
    const dirU = new THREE.Vector3(side * Math.sin(ab), -Math.cos(ab), -0.03).normalize();
    const E = J.clone().addScaledVector(dirU, L1);
    const dirF = new THREE.Vector3(side * Math.sin(ab - 0.05), -Math.cos(ab - 0.05), 0.16).normalize();
    const W = E.clone().addScaledVector(dirF, L2);
    const cap = R0 * 0.95;
    const pts = [
      J.clone().addScaledVector(dirU, -cap),
      J.clone(),
      J.clone().addScaledVector(dirU, L1 * 0.5),
      E,
      E.clone().addScaledVector(dirF, L2 * 0.5),
      W,
      W.clone().addScaledVector(dirF, 0.022 * g),
    ];
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const length = curve.getLength();
    const radius = monotone([
      [0, R0],
      [0.055 * g, R0 * 1.02],
      [0.11 * g, 0.044 * g],
      [L1 * 0.62, 0.042 * g],
      [L1 - 0.02 * g, 0.034 * g],
      [L1, 0.033 * g],
      [L1 + 0.055 * g, 0.039 * g],
      [L1 + 0.11 * g, 0.033 * g],
      [L1 + L2 - 0.012 * g, 0.026 * g],
      [L1 + L2, 0.025 * g],
    ]);
    const end = L1 + L2;
    const tip = 0.022 * g;
    return {
      side,
      curve,
      length,
      start: cap,
      shape: (sArc: number) => {
        const t = sArc - cap;
        let r: number;
        if (t < 0) r = R0 * Math.sqrt(Math.max(0, 1 - (t / cap) ** 2));
        else if (t > end) r = radius(end) * Math.sqrt(Math.max(0, 1 - ((t - end) / tip) ** 2));
        else r = radius(t);
        const k = smoothstep(L1 * 0.8, end, t);
        return { rx: r * lerp(0.95, 0.78, k), rz: r * lerp(1.02, 1.18, k), dz: 0 };
      },
    };
  }

  private buildHand(arm: LimbShape, g: number): HandShape {
    const wrist = arm.curve.getPointAt((arm.length - 0.022 * g - 0.012) / arm.length);
    const dir = arm.curve.getTangentAt(0.97).add(new THREE.Vector3(-arm.side * 0.1, 0, 0.03)).normalize();
    return { side: arm.side, wrist, dir, length: 0.108 * this.H * Math.sqrt(this.p.limb), curl: 0.03 * g, scale: g };
  }

  private buildLeg(side: 1 | -1, g: number): LimbShape {
    const H = this.H;
    const s = this.s;
    const hf = this.p.hipF;
    const hx = this.hipA * 0.45;
    const Hj = new THREE.Vector3(side * hx, (hf - 0.015) * H, -0.004 * s);
    const K = new THREE.Vector3(side * this.hipA * 0.37, 0.285 * H, 0.006 * s);
    const A = new THREE.Vector3(side * this.hipA * 0.33, 0.046 * H, -0.012 * s);
    const pts = [
      Hj.clone().add(new THREE.Vector3(0, 0.06 * s, 0)),
      Hj,
      Hj.clone().lerp(K, 0.5).add(new THREE.Vector3(0, 0, 0.008 * s)),
      K,
      K.clone().lerp(A, 0.45).add(new THREE.Vector3(0, 0, -0.004 * s)),
      A,
      A.clone().add(new THREE.Vector3(0, -0.03 * s, 0.004 * s)),
    ];
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const length = curve.getLength();
    const byY = monotone([
      [0.03, 0.033],
      [0.055, 0.032],
      [0.08, 0.034],
      [0.12, 0.042],
      [0.17, 0.052],
      [0.215, 0.058],
      [0.25, 0.054],
      [0.285, 0.05],
      [0.31, 0.052],
      [0.36, 0.062],
      [0.42, 0.076],
      [0.47, 0.084],
      [hf - 0.01, 0.086],
      [hf + 0.035, 0.07],
    ]);
    const tmp = new THREE.Vector3();
    const tip = 0.03 * s;
    return {
      side,
      curve,
      length,
      start: 0,
      shape: (sArc: number) => {
        curve.getPointAt(clamp(sArc / length, 0, 1), tmp);
        const t = tmp.y / H;
        let r = byY(t) * g;
        const fromEnd = length - sArc;
        if (fromEnd < tip) r *= Math.sqrt(Math.max(0, 1 - ((tip - fromEnd) / tip) ** 2));
        const calf = gauss(t, 0.215, 0.04);
        const knee = gauss(t, 0.285, 0.02);
        // upper thigh is deeper front-to-back than wide where it meets the pelvis
        const upper = gauss(t, 0.47, 0.03);
        return {
          rx: r * (1 + 0.06 * knee - 0.04 * calf - 0.04 * upper),
          rz: r * (1 + 0.08 * calf + 0.1 * upper),
          dz: (-0.012 * calf + 0.006 * gauss(t, 0.42, 0.05)) * s,
        };
      },
    };
  }

  private buildFoot(side: 1 | -1): FootShape {
    const leg = this.legs[side === 1 ? 0 : 1];
    const ankle = leg.curve.getPointAt(0.97);
    const sc = this.s * (0.9 + 0.1 * this.p.limb);
    return { side, ankle, heelZ: ankle.z - 0.055 * sc, length: 0.25 * sc, yaw: side * THREE.MathUtils.degToRad(8), scale: sc };
  }
}
