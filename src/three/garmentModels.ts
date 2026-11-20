import * as THREE from 'three';
import { GARMENT_W, garmentShape, getView, garmentViews, hasView, zonePpi } from '../data/garments';
import { getFabric, type FabricDef } from '../data/fabrics';
import type { GarmentId, ViewId } from '../types';
import { BODY, arm, leg, torsoSection, type Limb } from './body';
import { curveFrames, gridGeometry, insideSuper, keyframes, noise2, smoothstep, superPoint, tubeGeometry, type Frame } from './geometry';
import { fabricMaterial } from './fabricMaterials';

/* ================================================================================================
 * Procedural 3D garments, built around the mannequin in inches. Each builder returns the meshes, the
 * print anchors for every view of the garment (where its print zone sits on the 3D surface and which
 * way to project), trim decals (pockets, zippers, plackets) and hardware (buttons, snaps, cords).
 * Garments without a builder (custom photo blanks) fall back to the flat-lay viewer.
 * ============================================================================================== */

export interface Anchor {
  mesh: THREE.Mesh;
  /** Zone centre in front of the surface (the ray starts here, minus `dir` × reach). */
  center: THREE.Vector3;
  /** Projection direction, pointing into the surface. */
  dir: THREE.Vector3;
  /** Decal "up" (toward the top of the artwork). */
  up: THREE.Vector3;
  depth: number;
}

export interface Trim {
  anchor: Anchor;
  w: number;
  h: number;
  /** Paint onto a w×h-inch canvas at `ppi`. `ink` is a stitch color that reads on this garment. */
  paint(ctx: CanvasRenderingContext2D, ppi: number, ink: string, shade: string): void;
}

export interface GarmentModel {
  group: THREE.Group;
  anchors: Partial<Record<ViewId, Anchor>>;
  label?: Anchor;
  trims: Trim[];
  armAngle: number;
  mannequin: boolean;
  /** Region the camera frames. */
  frame: THREE.Box3;
  /** Materials created here, for disposal and the inside/outside split. */
  materials: THREE.Material[];
}

interface Ctx {
  color: string;
  fabric: FabricDef;
  clip: THREE.Plane[];
  group: THREE.Group;
  materials: THREE.Material[];
}

/* ---------- shared bits ---------- */

const RIB = getFabric('rib')!;

/** Outer (front-face) + inner (back-face) meshes for one surface; returns the outer mesh. */
function addPart(c: Ctx, geom: THREE.BufferGeometry, fabric: FabricDef = c.fabric, opts: { tileScale?: number; inner?: boolean; color?: string } = {}): THREE.Mesh {
  const color = opts.color ?? c.color;
  const outer = fabricMaterial(fabric, color, { clip: c.clip, tileScale: opts.tileScale });
  const mesh = new THREE.Mesh(geom, outer);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.part = 'outer';
  c.group.add(mesh);
  c.materials.push(outer);
  if (opts.inner !== false) {
    const innerMat = fabricMaterial(fabric, color, { clip: c.clip, side: THREE.BackSide, inside: true, tileScale: opts.tileScale });
    const inner = new THREE.Mesh(geom, innerMat);
    inner.receiveShadow = true;
    inner.userData.part = 'inner';
    c.group.add(inner);
    c.materials.push(innerMat);
  }
  return mesh;
}

function addCord(c: Ctx, pts: THREE.Vector3[], r: number, color = '#efefec') {
  const curve = new THREE.CatmullRomCurve3(pts);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.75, clippingPlanes: c.clip });
  c.materials.push(mat);
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, r, 10, false), mat);
  m.castShadow = true;
  c.group.add(m);
  const tipMat = new THREE.MeshStandardMaterial({ color: '#b9b9b4', roughness: 0.3, metalness: 0.8, clippingPlanes: c.clip });
  c.materials.push(tipMat);
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.25, r * 1.25, 1.1, 12), tipMat);
  const end = pts[pts.length - 1];
  tip.position.copy(end).add(new THREE.Vector3(0, -0.4, 0));
  c.group.add(tip);
}

/** Buttons / snaps placed on a mesh by raycasting toward it. */
function addStuds(c: Ctx, target: THREE.Mesh, points: THREE.Vector3[], dir: THREE.Vector3, kind: 'snap' | 'button' | 'shirt') {
  const mat =
    kind === 'snap'
      ? new THREE.MeshStandardMaterial({ color: '#c9c9c4', roughness: 0.25, metalness: 0.9, clippingPlanes: c.clip })
      : new THREE.MeshStandardMaterial({ color: kind === 'shirt' ? '#f1efe8' : '#3a2f27', roughness: 0.45, clippingPlanes: c.clip });
  c.materials.push(mat);
  const r = kind === 'shirt' ? 0.22 : kind === 'snap' ? 0.3 : 0.36;
  const geo = new THREE.CylinderGeometry(r, r * 1.05, 0.14, 24);
  target.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  for (const p of points) {
    ray.set(p.clone().addScaledVector(dir, -20), dir);
    const hit = ray.intersectObject(target, false)[0];
    if (!hit?.face) continue;
    const n = hit.face.normal.clone().transformDirection(target.matrixWorld);
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(hit.point).addScaledVector(n, 0.07);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    m.castShadow = true;
    c.group.add(m);
  }
}

const anchor = (mesh: THREE.Mesh, center: THREE.Vector3, dir: THREE.Vector3, up = new THREE.Vector3(0, 1, 0), depth = 6): Anchor => ({
  mesh,
  center,
  dir: dir.clone().normalize(),
  up: up.clone().normalize(),
  depth,
});
const FRONT = new THREE.Vector3(0, 0, -1); // projection direction for a front print (into the surface)
const BACK = new THREE.Vector3(0, 0, 1);

/** Horizontal centre offset of a view's zone in inches (viewer's right positive), from the flat-lay. */
function zoneCx(garment: GarmentId, view: ViewId): number {
  const z = getView(garment, view).zone;
  return (z.x + z.w / 2 - 250) / zonePpi(z);
}
const zoneSize = (garment: GarmentId, view: ViewId) => {
  const z = getView(garment, view).zone;
  return { w: z.widthIn, h: z.heightIn };
};

/* ================================================================================================
 * TOPS
 * ============================================================================================== */

interface TopSpec {
  ease: number;
  hemY: number;
  /** 0 = hangs straight from the chest (boxy) … 1 = follows the waist. */
  fit: number;
  flare: number;
  drop: number;
  neck: 'crew' | 'vneck' | 'mock' | 'polo' | 'hood' | 'collar' | 'tank';
  frontDrop: number;
  backDrop: number;
  neckW: number;
  sleeve: null | { kind: 'short'; length: number; endR: number } | { kind: 'long'; cuff: number; fullness: number };
  armAngle: number;
  hemBand: number;
  folds: number;
  front?: 'zip' | 'halfzip' | 'snaps' | 'buttons' | 'placket';
  /** Padded elbows (goalkeeper jerseys). */
  pads?: boolean;
  pocket?: 'kangaroo' | 'split' | 'chest-flaps';
  drawcordHem?: boolean;
  /** Print zones: distance from HPS to the top of each view's zone. */
  zoneTop: Partial<Record<ViewId, number>>;
}

const TOPS: Record<string, TopSpec> = {
  tee: { ease: 3.0, hemY: 28.5, fit: 0, flare: 0.4, drop: 1.4, neck: 'crew', frontDrop: 2.5, backDrop: 0.8, neckW: 3.1, sleeve: { kind: 'short', length: 9, endR: 3.9 }, armAngle: 26, hemBand: 0, folds: 0.22, zoneTop: { front: 3, back: 3.25 } },
  longsleeve: { ease: 2.0, hemY: 28.5, fit: 0.35, flare: 0.2, drop: 0.3, neck: 'crew', frontDrop: 2.4, backDrop: 0.8, neckW: 3.0, sleeve: { kind: 'long', cuff: 1.75, fullness: 0.9 }, armAngle: 17, hemBand: 0, folds: 0.2, zoneTop: { front: 3, back: 3.25 } },
  polo: { ease: 2.0, hemY: 28, fit: 0.4, flare: 0.2, drop: 0.2, neck: 'polo', frontDrop: 2.1, backDrop: 0.6, neckW: 3.0, sleeve: { kind: 'short', length: 8.5, endR: 3.3 }, armAngle: 21, hemBand: 0, folds: 0.18, front: 'placket', zoneTop: { front: 7.5, back: 3.25 } },
  tank: { ease: 1.8, hemY: 28.5, fit: 0.4, flare: 0.3, drop: 0, neck: 'tank', frontDrop: 4.8, backDrop: 2.4, neckW: 3.6, sleeve: null, armAngle: 12, hemBand: 0, folds: 0.2, zoneTop: { front: 5.5, back: 3.5 } },
  crop: { ease: 3.0, hemY: 41.5, fit: 0, flare: 0.3, drop: 1.4, neck: 'crew', frontDrop: 2.5, backDrop: 0.8, neckW: 3.1, sleeve: { kind: 'short', length: 9, endR: 3.9 }, armAngle: 26, hemBand: 0, folds: 0.15, zoneTop: { front: 3, back: 3.25 } },
  hoodie: { ease: 3.2, hemY: 30, fit: 0, flare: 0, drop: 1.6, neck: 'hood', frontDrop: 2.2, backDrop: 0.8, neckW: 3.2, sleeve: { kind: 'long', cuff: 1.85, fullness: 1.25 }, armAngle: 17, hemBand: 2.6, folds: 0.3, pocket: 'kangaroo', zoneTop: { front: 4.6, back: 6.5 } },
  ziphoodie: { ease: 3.0, hemY: 29.5, fit: 0, flare: 0, drop: 1.4, neck: 'hood', frontDrop: 2.2, backDrop: 0.8, neckW: 3.2, sleeve: { kind: 'long', cuff: 1.85, fullness: 1.2 }, armAngle: 17, hemBand: 2.6, folds: 0.28, front: 'zip', pocket: 'split', zoneTop: { front: 5, back: 6.5 } },
  crewneck: { ease: 2.8, hemY: 30, fit: 0, flare: 0, drop: 1.2, neck: 'crew', frontDrop: 2.4, backDrop: 0.8, neckW: 3.1, sleeve: { kind: 'long', cuff: 1.8, fullness: 1.15 }, armAngle: 17, hemBand: 2.6, folds: 0.26, zoneTop: { front: 3, back: 3.25 } },
  coach: { ease: 3.4, hemY: 29, fit: 0, flare: 0.2, drop: 1.0, neck: 'collar', frontDrop: 3.2, backDrop: 0.7, neckW: 3.2, sleeve: { kind: 'long', cuff: 1.9, fullness: 1.2 }, armAngle: 18, hemBand: 0, folds: 0.34, front: 'snaps', drawcordHem: true, zoneTop: { front: 5.5, back: 3.75 } },
  work: { ease: 3.0, hemY: 29, fit: 0, flare: 0.1, drop: 0.8, neck: 'collar', frontDrop: 3.2, backDrop: 0.7, neckW: 3.2, sleeve: { kind: 'long', cuff: 2.0, fullness: 1.1 }, armAngle: 18, hemBand: 0, folds: 0.24, front: 'buttons', pocket: 'chest-flaps', zoneTop: { front: 9.2, back: 6 } },
  'soccer-jersey': { ease: 1.5, hemY: 28.5, fit: 0.55, flare: 0.2, drop: 0, neck: 'vneck', frontDrop: 4.3, backDrop: 0.8, neckW: 3.0, sleeve: { kind: 'short', length: 8, endR: 3.25 }, armAngle: 19, hemBand: 0, folds: 0.15, zoneTop: { front: 3, back: 2.5 } },
  'gk-jersey': { ease: 1.9, hemY: 28.3, fit: 0.45, flare: 0.2, drop: 0.2, neck: 'crew', frontDrop: 2.3, backDrop: 0.8, neckW: 3.0, sleeve: { kind: 'long', cuff: 1.7, fullness: 0.95 }, armAngle: 17, hemBand: 0, folds: 0.18, pads: true, zoneTop: { front: 3, back: 2.5 } },
  'base-layer': { ease: 1.1, hemY: 29, fit: 0.6, flare: 0, drop: 0.2, neck: 'crew', frontDrop: 2.3, backDrop: 0.8, neckW: 3.0, sleeve: { kind: 'long', cuff: 1.5, fullness: 0.8 }, armAngle: 17, hemBand: 0, folds: 0.05, zoneTop: { front: 4.4, back: 2 } },
  'training-top': { ease: 1.4, hemY: 29, fit: 0.6, flare: 0.1, drop: 0, neck: 'mock', frontDrop: 1.0, backDrop: 0.4, neckW: 3.0, sleeve: { kind: 'long', cuff: 1.6, fullness: 0.9 }, armAngle: 16, hemBand: 0, folds: 0.14, front: 'halfzip', zoneTop: { front: 4.6, back: 3.5 } },
};

function buildTop(garment: GarmentId, spec: TopSpec, c: Ctx): Omit<GarmentModel, 'group' | 'materials' | 'frame'> {
  const { CHEST, SHOULDER, HPS } = BODY;
  const chest = torsoSection(CHEST);
  const hemTop = spec.hemY + spec.hemBand;

  const section = (y: number) => {
    const b = torsoSection(y);
    const upper = smoothstep(CHEST - 1, SHOULDER - 0.3, y);
    const e = spec.ease * (1 - upper) + 0.7 * upper;
    let hw = b.hw + e;
    let hd = b.hd + e * 0.72;
    let zc = b.zc;
    // Below the chest the fabric hangs from the chest instead of following the waist. Blend the two over
    // ~5 in so there is no crease where they meet.
    const w = smoothstep(CHEST + 2.5, CHEST - 2.5, y);
    if (w > 0) {
      const k = smoothstep(CHEST, spec.hemY, y);
      const hangW = chest.hw + spec.ease + spec.flare * k;
      const hangD = chest.hd + spec.ease * 0.72 + spec.flare * 0.4 * k;
      const hw2 = Math.max(b.hw + 0.6, hangW + (b.hw + spec.ease * 0.8 - hangW) * spec.fit);
      const hd2 = Math.max(b.hd + 0.5, hangD + (b.hd + spec.ease * 0.6 - hangD) * spec.fit);
      const zc2 = chest.zc + (b.zc - chest.zc) * spec.fit;
      hw += (hw2 - hw) * w;
      hd += (hd2 - hd) * w;
      zc += (zc2 - zc) * w;
    }
    hw += spec.drop * 0.55 * Math.exp(-(((y - (SHOULDER - 1.6)) / 2.6) ** 2));
    return { hw, hd, zc };
  };

  const yN = HPS + 0.35;
  const inNeck = (p: THREE.Vector3) => {
    const zc = section(p.y).zc;
    const front = p.z > zc;
    const drop = front ? spec.frontDrop : spec.backDrop;
    if (front && spec.neck === 'vneck') {
      // straight-sided V: depth falls linearly with distance from the centre line
      const ax = Math.abs(p.x) / spec.neckW;
      return ax < 1 && yN - p.y < drop * (1 - ax);
    }
    return (p.x / spec.neckW) ** 2 + ((p.y - yN) / drop) ** 2 < 1;
  };
  const inArmhole = (p: THREE.Vector3) => spec.neck === 'tank' && ((Math.abs(p.x) - 7.7) / 3.15) ** 2 + ((p.y - 55.6) / 4.9) ** 2 < 1;

  // ---- body
  const top = HPS + 0.2;
  const bodyGeo = gridGeometry(
    (u, v) => {
      const y = hemTop + (top - hemTop) * (1 - Math.pow(1 - v, 1.45));
      const s = section(y);
      const th = u * Math.PI * 2;
      const p = superPoint(th, s.hw, s.hd, 2.4);
      // gravity folds below the chest, more toward the hem
      const k = smoothstep(CHEST - 2, hemTop, y);
      const fold = spec.folds * 1.6 * k * (Math.sin(th * 5 + y * 0.12) * 0.55 + noise2(th * 2.2, y * 0.12, 4) * 0.9) + spec.folds * 0.5 * smoothstep(hemTop + 3, hemTop, y) * Math.sin(th * 9);
      const r = Math.hypot(p.x, p.z) || 1;
      return new THREE.Vector3(p.x + (p.x / r) * fold, y, p.z + s.zc + (p.z / r) * fold);
    },
    { cols: 160, rows: 160, wrapU: true, inside: (_u, v) => new THREE.Vector3(0, hemTop + (top - hemTop) * (1 - Math.pow(1 - v, 1.45)), 0), keep: (p) => !inNeck(p) && !inArmhole(p) },
  );
  const body = addPart(c, bodyGeo);

  const insideBody = (p: THREE.Vector3, margin = 0.985) => {
    if (p.y > top || p.y < hemTop - 0.1) return false;
    const s = section(p.y);
    return insideSuper(p.x, p.z - s.zc, s.hw, s.hd, 2.4, margin);
  };

  // ---- hem band (rib, slightly gathered)
  if (spec.hemBand) {
    const g = gridGeometry(
      (u, v) => {
        const y = spec.hemY + v * spec.hemBand;
        const s = section(hemTop);
        const gather = 0.93 + 0.07 * smoothstep(0, 1, v);
        const p = superPoint(u * Math.PI * 2, s.hw * gather, s.hd * gather, 2.4);
        return new THREE.Vector3(p.x, y, p.z + s.zc);
      },
      { cols: 120, rows: 6, wrapU: true, inside: new THREE.Vector3(0, spec.hemY + 1, 0) },
    );
    addPart(c, g, RIB, { tileScale: 0.7 });
  }

  // ---- neckline loop (for collars / hood / label)
  const neckLoop = (phi: number, lift = 0) => {
    const x = spec.neckW * 0.985 * Math.sin(phi);
    const front = Math.cos(phi) >= 0;
    const y =
      front && spec.neck === 'vneck'
        ? yN - spec.frontDrop * (1 - Math.abs(Math.sin(phi))) * 0.985
        : yN - (front ? spec.frontDrop : spec.backDrop) * Math.abs(Math.cos(phi)) * 0.985;
    const s = section(y);
    const e = Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(x) / s.hw), 2.4));
    const z = s.zc + (front ? 1 : -1) * s.hd * Math.pow(e, 1 / 2.4);
    return new THREE.Vector3(x, y + lift, z);
  };

  // ---- collars
  if (spec.neck === 'crew' || spec.neck === 'vneck' || spec.neck === 'hood' || spec.neck === 'tank' || spec.neck === 'mock') {
    const width = spec.neck === 'tank' ? 0.45 : spec.neck === 'mock' ? 2.4 : spec.neck === 'vneck' ? 0.7 : 0.85;
    const g = gridGeometry(
      (u, v) => {
        const p = neckLoop(u * Math.PI * 2);
        const toAxis = new THREE.Vector3(-p.x, 0, section(p.y).zc - p.z).normalize();
        const h = -0.35 + v * (width + 0.35);
        return p.add(new THREE.Vector3(0, h, 0)).addScaledVector(toAxis, v * 0.25 - (1 - v) * 0.08);
      },
      { cols: 96, rows: 4, wrapU: true, inside: new THREE.Vector3(0, HPS - 6, 0) },
    );
    addPart(c, g, spec.neck === 'tank' || spec.neck === 'mock' ? c.fabric : RIB, { tileScale: 0.6 });
  } else {
    // polo / shirt collar: stand, then fold down over the shoulders; open at centre front
    const stand = spec.neck === 'polo' ? 1.1 : 1.4;
    const fall = spec.neck === 'polo' ? 2.0 : 2.8;
    const g = gridGeometry(
      (u, v) => {
        const phi = -Math.PI * 0.94 + u * Math.PI * 1.88 + Math.PI; // leave a gap at the front
        const base = neckLoop(phi);
        const out = new THREE.Vector3(base.x, 0, base.z - section(base.y).zc).normalize();
        const point = Math.pow(Math.max(0, Math.cos(phi)), 6) * (spec.neck === 'polo' ? 1.0 : 1.8); // collar points
        if (v < 0.35) return base.add(new THREE.Vector3(0, (v / 0.35) * stand, 0));
        const t = (v - 0.35) / 0.65;
        return base.add(new THREE.Vector3(0, stand - t * (fall * 0.55 + point * 0.6), 0)).addScaledVector(out, 0.35 + t * (fall * 0.8 + point * 0.4));
      },
      { cols: 96, rows: 10, inside: new THREE.Vector3(0, HPS - 8, 0) },
    );
    addPart(c, g, spec.neck === 'polo' ? RIB : c.fabric, { tileScale: 0.6 });
  }

  // ---- hood (down): a soft roll around the back of the neck
  if (spec.neck === 'hood') {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-2.6, 55.6, 3.0),
      new THREE.Vector3(-4.6, 57.1, 0.4),
      new THREE.Vector3(-4.2, 58.0, -2.8),
      new THREE.Vector3(0, 58.3, -5.0),
      new THREE.Vector3(4.2, 58.0, -2.8),
      new THREE.Vector3(4.6, 57.1, 0.4),
      new THREE.Vector3(2.6, 55.6, 3.0),
    ]);
    const frames = curveFrames(curve);
    const g = tubeGeometry(
      (v) => {
        const f = frames(v);
        // sit the roll on the shoulders: push the centre outward and down a little
        const out = new THREE.Vector3(f.c.x, 0, f.c.z + 0.5).normalize();
        return { ...f, c: f.c.clone().addScaledVector(out, 0.9).add(new THREE.Vector3(0, -0.4, 0)) } as Frame;
      },
      (v, th) => {
        const bulk = Math.pow(Math.sin(Math.PI * v), 0.8);
        return [0.9 + 2.0 * bulk + 0.15 * Math.sin(th * 3 + v * 9), 0.8 + 1.5 * bulk];
      },
      { cols: 40, rows: 64 },
    );
    addPart(c, g);
    // drawcords
    for (const s of [-1, 1]) addCord(c, [new THREE.Vector3(1.1 * s, 55.4, 4.6), new THREE.Vector3(1.3 * s, 52, 5.2), new THREE.Vector3(1.5 * s, 47.5, 5.4)], 0.13);
  }

  // ---- sleeves
  let sleeveMesh: THREE.Mesh | null = null;
  let sleeveLimb: Limb | null = null;
  let sleeveLen = 0;
  let nUp = new THREE.Vector3();
  const sleeves: Array<{ mesh: THREE.Mesh; limb: Limb; up: THREE.Vector3; side: number }> = [];
  if (spec.sleeve) {
    const sl = spec.sleeve;
    for (const side of [1, -1] as const) {
      const a = arm(side, spec.armAngle);
      const ang = THREE.MathUtils.degToRad(spec.armAngle);
      const up = new THREE.Vector3(Math.cos(ang) * side, Math.sin(ang), 0).normalize();
      const t0 = -3 - spec.drop * 0.6;
      const tEnd = sl.kind === 'short' ? sl.length : a.length + 1.2 - sl.cuff * 0;
      const rAt = (t: number) => {
        if (sl.kind === 'short') return keyframes([[t0, 4.5 + spec.ease * 0.15], [0, 4.4 + spec.ease * 0.1], [sl.length, sl.endR]], t)[0];
        const f = sl.fullness;
        return keyframes([[t0, 4.4 + spec.ease * 0.1], [0, 4.0 * Math.max(0.9, f * 0.85)], [10, 2.85 * f], [17, 2.5 * f], [tEnd - 2.2, 2.35 * f], [tEnd, sl.cuff + 0.1]], t)[0];
      };
      const axis = (t: number) => {
        const r = rAt(t);
        const c0 = a.at(Math.max(0, t)).addScaledVector(up, -Math.max(0, r - a.radius(Math.max(0, t)) - 0.35));
        return t < 0 ? c0.add(new THREE.Vector3(side * t, t * 0.55, 0)) : c0;
      };
      const frames = (v: number): Frame => {
        const t = t0 + v * (tEnd - t0);
        const cpt = axis(t);
        const n = new THREE.Vector3(0, 0, 1);
        return { c: cpt, n, b: new THREE.Vector3().crossVectors(a.dir, n).normalize() };
      };
      const g = tubeGeometry(frames, (v, th) => {
        const t = t0 + v * (tEnd - t0);
        let r = rAt(t);
        if (sl.kind === 'long') r += 0.16 * Math.sin(t * 2.3 + th) * smoothstep(13, tEnd - 2, t) * sl.fullness; // stacking at the cuff
        else r += 0.12 * Math.sin(th * 5 + side) * smoothstep(sl.length - 4, sl.length, t);
        return [r * 1.02, r * 0.95];
      }, { cols: 56, rows: 48, keep: (p) => !insideBody(p, 0.99) });
      const m = addPart(c, g);
      sleeves.push({ mesh: m, limb: a, up, side });
      if (side === 1) {
        sleeveMesh = m;
        sleeveLimb = a;
        sleeveLen = tEnd;
        nUp = up;
      }
      if (sl.kind === 'long') {
        const cuffLen = 2.4;
        const cuff = tubeGeometry(
          (v) => {
            const t = tEnd - 0.4 + v * cuffLen;
            const cpt = a.at(t).addScaledVector(up, -Math.max(0, sl.cuff - a.radius(Math.min(a.length, t)) - 0.2));
            const n = new THREE.Vector3(0, 0, 1);
            return { c: cpt, n, b: new THREE.Vector3().crossVectors(a.dir, n).normalize() };
          },
          (v) => sl.cuff * (1 - 0.06 * v),
          { cols: 40, rows: 6 },
        );
        addPart(c, cuff, c.fabric.id === 'nylon' || c.fabric.id === 'canvas' ? c.fabric : RIB, { tileScale: 0.6 });
      }
    }
  }

  // ---- anchors
  const anchors: GarmentModel['anchors'] = {};
  const zoneAnchor = (view: ViewId, back: boolean) => {
    if (!hasView(garment, view)) return;
    const { h } = zoneSize(garment, view);
    const topIn = spec.zoneTop[view] ?? 3;
    const cx = zoneCx(garment, view) * (back ? -1 : 1);
    anchors[view] = anchor(body, new THREE.Vector3(cx, HPS - topIn - h / 2, back ? -12 : 12), back ? BACK : FRONT);
  };
  zoneAnchor('front', false);
  zoneAnchor('back', true);
  if (hasView(garment, 'sleeve') && sleeveMesh && sleeveLimb) {
    const { h } = zoneSize(garment, 'sleeve');
    const t = spec.sleeve?.kind === 'short' ? sleeveLen - 1.5 - h / 2 : 2 + h / 2;
    const at = (sleeveLimb as Limb).at(t);
    anchors.sleeve = anchor(sleeveMesh, at.clone().addScaledVector(nUp, 8), nUp.clone().negate(), (sleeveLimb as Limb).dir.clone().negate(), 6);
  }

  // ---- trims & hardware
  const trims: Trim[] = [];
  const frontTrim = (cx: number, cy: number, w: number, h: number, paint: Trim['paint'], depth = 6) =>
    trims.push({ anchor: anchor(body, new THREE.Vector3(cx, cy, 12), FRONT, undefined, depth), w, h, paint });
  const neckFrontY = yN - spec.frontDrop;

  if (spec.pocket === 'kangaroo') frontTrim(0, hemTop + 4.1, 13, 7.6, paintKangaroo);
  if (spec.pocket === 'split') {
    frontTrim(-4.6, hemTop + 4.2, 3.2, 6.4, (x, p, ink, sh) => paintWelt(x, p, ink, sh, -1));
    frontTrim(4.6, hemTop + 4.2, 3.2, 6.4, (x, p, ink, sh) => paintWelt(x, p, ink, sh, 1));
  }
  if (spec.pocket === 'chest-flaps') {
    frontTrim(-4.3, HPS - 6.3, 4.6, 5.2, paintFlapPocket);
    frontTrim(4.3, HPS - 6.3, 4.6, 5.2, paintFlapPocket);
  }
  if (spec.front === 'zip') {
    const len = neckFrontY - spec.hemY;
    frontTrim(0, spec.hemY + len / 2, 0.9, len, paintZip, 8);
  }
  if (spec.front === 'halfzip') frontTrim(0, neckFrontY - 3.6, 0.9, 7.6, paintZip, 8);
  if (spec.front === 'placket') frontTrim(0, neckFrontY - 3, 1.5, 6.4, paintPlacket);
  if (spec.pads)
    for (const sl of sleeves) {
      const at = sl.limb.at(11.5);
      // elbow: outer-back side of the arm
      const out = sl.up.clone().multiplyScalar(0.55).add(new THREE.Vector3(0, 0, -0.85)).normalize();
      trims.push({ anchor: anchor(sl.mesh, at.clone().addScaledVector(out, 9), out.clone().negate(), sl.limb.dir.clone().negate(), 5), w: 4.4, h: 5.2, paint: paintPad });
    }
  if (spec.front === 'snaps' || spec.front === 'buttons') {
    const len = neckFrontY - spec.hemY;
    frontTrim(0.35, spec.hemY + len / 2, 2.2, len, paintFrontEdge, 8);
  }

  if (spec.front === 'placket') addStuds(c, body, [0, 1, 2].map((i) => new THREE.Vector3(0, neckFrontY - 1.1 - i * 2, 0)), FRONT, 'shirt');
  if (spec.front === 'snaps' || spec.front === 'buttons') {
    const n = 5;
    const yTop = neckFrontY - 1;
    const step = (yTop - (spec.hemY + 3)) / (n - 1);
    addStuds(c, body, Array.from({ length: n }, (_, i) => new THREE.Vector3(0.35, yTop - i * step, 0)), FRONT, spec.front === 'snaps' ? 'snap' : 'button');
  }
  if (spec.front === 'zip' || spec.front === 'halfzip') {
    const mat = new THREE.MeshStandardMaterial({ color: '#c4c4bf', roughness: 0.25, metalness: 0.9, clippingPlanes: c.clip });
    c.materials.push(mat);
    const pull = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.2, 0.12), mat);
    const s = section(neckFrontY - 1);
    pull.position.set(0, neckFrontY - 1.3, s.zc + s.hd + 0.12);
    c.group.add(pull);
  }
  if (spec.drawcordHem) {
    for (const s of [-1, 1]) {
      const sec = section(spec.hemY + 0.5);
      addCord(c, [new THREE.Vector3(s * sec.hw * 0.75, spec.hemY + 0.6, sec.zc + sec.hd * 0.75), new THREE.Vector3(s * sec.hw * 0.72, spec.hemY - 1.5, sec.zc + sec.hd * 0.8), new THREE.Vector3(s * sec.hw * 0.7, spec.hemY - 4, sec.zc + sec.hd * 0.8)], 0.12, '#1d1d1f');
    }
  }

  // inside neck label, on the back panel
  const label = garmentShape(garment) === 'top'
    ? anchor(body, new THREE.Vector3(0, HPS - spec.backDrop - 1.6, -12), BACK, undefined, 3)
    : undefined;

  return { anchors, trims, label, armAngle: spec.armAngle, mannequin: true };
}

/* ================================================================================================
 * BOTTOMS
 * ============================================================================================== */

interface BottomSpec {
  ease: number;
  legEndY: number;
  /** [distance along the leg, radius] */
  legR: number[][];
  cuff: number | null;
  waistband: 'rib' | 'self';
  drawcord: boolean;
  cargo: boolean;
  fly: boolean;
  folds: number;
  /** Contrast side stripe down each leg (football shorts). */
  stripes?: boolean;
  /** Extra crotch depth in inches: slim legs sit apart, so the pelvis panel has to reach lower. */
  crotch?: number;
  /** Back print on the back of the wearer's left thigh, this far below the crotch (a jacket covers the seat). */
  backThighDrop?: number;
}

const BOTTOMS: Record<string, BottomSpec> = {
  joggers: { ease: 1.2, legEndY: 4.4, legR: [[-2, 4.6], [3, 4.4], [14, 3.5], [22, 3.0], [26.5, 2.75], [28.8, 2.15]], cuff: 1.95, waistband: 'rib', drawcord: true, cargo: false, fly: false, folds: 0.25 },
  shorts: { ease: 1.4, legEndY: 19.5, legR: [[-2, 4.7], [3, 4.6], [14, 4.85]], cuff: null, waistband: 'rib', drawcord: true, cargo: false, fly: false, folds: 0.22 },
  'soccer-shorts': { ease: 1.6, legEndY: 21.5, legR: [[-2, 4.9], [3, 4.85], [12, 5.05]], cuff: null, waistband: 'rib', drawcord: true, cargo: false, fly: false, folds: 0.18, stripes: true },
  'compression-shorts': { ease: 1.0, legEndY: 20, legR: [[-2, 4.6], [3, 4.4], [8, 3.55], [13, 3.0]], cuff: null, waistband: 'rib', drawcord: false, cargo: false, fly: false, folds: 0.04, crotch: 1.6 },
  cargo: { ease: 1.1, legEndY: 1.6, legR: [[-2, 4.5], [3, 4.3], [14, 3.7], [26, 3.45], [31.5, 3.5]], cuff: null, waistband: 'self', drawcord: false, cargo: true, fly: true, folds: 0.2 },
};

/**
 * `ids` names the views whose zones sit on the pelvis front / back. A set (tracksuit) passes its own
 * pant view ids, because its `front` and `back` views belong to the jacket. `null` = no such view.
 */
function buildBottom(
  garment: GarmentId,
  spec: BottomSpec,
  c: Ctx,
  ids: { front: ViewId | null; back: ViewId | null } = { front: 'front', back: 'back' },
): Omit<GarmentModel, 'group' | 'materials' | 'frame'> {
  const WAIST_TOP = 41.8;
  const bandH = 1.9;
  const deep = spec.crotch ?? 0;
  const yLow = BODY.CROTCH - 2.3 - deep;
  // bottom edge: dips to the crotch at centre front/back, rises at the sides where the legs take over
  const yBottom = (th: number) => yLow + (7 + deep) * Math.pow(Math.abs(Math.sin(th)), 0.8);
  const section = (y: number) => {
    const b = torsoSection(Math.max(y, 30.2));
    const tuck = 1 - 0.1 * smoothstep(36, 31, y); // narrows into the legs so its side edges stay hidden
    return { hw: (b.hw + spec.ease) * tuck, hd: b.hd + spec.ease * 0.5, zc: b.zc };
  };
  const pelvis = gridGeometry(
    (u, v) => {
      const th = u * Math.PI * 2;
      const yb = yBottom(th);
      const y = yb + v * (WAIST_TOP - bandH - yb);
      const s = section(y);
      const p = superPoint(th, s.hw, s.hd, 2.3);
      return new THREE.Vector3(p.x, y, p.z + s.zc);
    },
    { cols: 96, rows: 40, wrapU: true, inside: new THREE.Vector3(0, 36, 0) },
  );
  const pelvisMesh = addPart(c, pelvis);
  const insidePelvis = (p: THREE.Vector3) => {
    if (p.y > WAIST_TOP || p.y < yLow) return false;
    const s = section(p.y);
    if (p.y < yBottom(Math.atan2(p.x, p.z - s.zc)) + 0.3) return false; // below the panel's (dipping) bottom edge
    return insideSuper(p.x, p.z - s.zc, s.hw, s.hd, 2.3, 0.985);
  };

  // waistband
  const band = gridGeometry(
    (u, v) => {
      const y = WAIST_TOP - bandH + v * bandH;
      const s = section(WAIST_TOP - bandH);
      const k = 1 - 0.03 * v;
      const p = superPoint(u * Math.PI * 2, s.hw * k, s.hd * k, 2.3);
      return new THREE.Vector3(p.x, y, p.z + s.zc);
    },
    { cols: 96, rows: 6, wrapU: true, inside: new THREE.Vector3(0, 40, 0) },
  );
  addPart(c, band, spec.waistband === 'rib' ? RIB : c.fabric, { tileScale: 0.7 });

  const legMeshes: Record<number, THREE.Mesh> = {};
  const legs: Record<number, Limb> = {};
  for (const side of [1, -1] as const) {
    const l = leg(side);
    legs[side] = l;
    const tEnd = (l.top.y - spec.legEndY) / -l.dir.y;
    const g = tubeGeometry(
      (v) => {
        const t = -2.5 + v * (tEnd + 2.5);
        const n = new THREE.Vector3(0, 0, 1);
        return { c: l.at(t), n: n.clone().sub(l.dir.clone().multiplyScalar(n.dot(l.dir))).normalize(), b: new THREE.Vector3().crossVectors(l.dir, n).normalize() };
      },
      (v, th) => {
        const t = -2.5 + v * (tEnd + 2.5);
        let r = keyframes(spec.legR, t)[0];
        r += spec.folds * (Math.sin(th * 4 + t * 0.7) * 0.5 + noise2(th * 2, t * 0.3, side) * 0.6) * smoothstep(8, tEnd, t);
        return [r * 1.04, r * 0.98];
      },
      { cols: 48, rows: 72, keep: (p) => !insidePelvis(p) },
    );
    legMeshes[side] = addPart(c, g);
    if (spec.cuff) {
      const cuff = tubeGeometry(
        (v) => {
          const t = tEnd - 0.3 + v * 2.6;
          const n = new THREE.Vector3(0, 0, 1);
          return { c: l.at(t), n: n.clone().sub(l.dir.clone().multiplyScalar(n.dot(l.dir))).normalize(), b: new THREE.Vector3().crossVectors(l.dir, n).normalize() };
        },
        (v) => spec.cuff! * (1 - 0.05 * v),
        { cols: 40, rows: 6 },
      );
      addPart(c, cuff, RIB, { tileScale: 0.6 });
    }
  }

  if (spec.drawcord) {
    const s = section(WAIST_TOP - 1);
    for (const side of [-1, 1]) addCord(c, [new THREE.Vector3(side * 0.7, WAIST_TOP - 1, s.zc + s.hd + 0.1), new THREE.Vector3(side * 0.9, WAIST_TOP - 4, s.zc + s.hd + 0.4), new THREE.Vector3(side * 1.1, WAIST_TOP - 7.5, s.zc + s.hd + 0.3)], 0.12);
  }

  const trims: Trim[] = [];
  if (spec.fly) trims.push({ anchor: anchor(pelvisMesh, new THREE.Vector3(-0.5, WAIST_TOP - bandH - 3.4, 12), FRONT), w: 2.4, h: 6.6, paint: paintFly });
  if (spec.stripes) {
    for (const side of [1, -1] as const) {
      const l = legs[side];
      const len = BODY.CROTCH + 2 - spec.legEndY;
      const y = spec.legEndY + len / 2;
      const p = l.at((l.top.y - y) / -l.dir.y);
      trims.push({ anchor: anchor(legMeshes[side], new THREE.Vector3(p.x + side * 10, y, p.z), new THREE.Vector3(-side, 0, 0), undefined, 6), w: 1.7, h: len, paint: paintStripe });
    }
  }
  if (spec.cargo) {
    for (const side of [1, -1] as const) {
      const l = legs[side];
      const t = (l.top.y - 21) / -l.dir.y;
      const p = l.at(t);
      trims.push({
        anchor: anchor(legMeshes[side], new THREE.Vector3(p.x + side * 10, 21, p.z), new THREE.Vector3(-side, 0, 0), undefined, 6),
        w: 7,
        h: 8.4,
        paint: paintCargo,
      });
    }
  }

  const anchors: GarmentModel['anchors'] = {};
  const top = WAIST_TOP - bandH;
  if (ids.front && hasView(garment, ids.front)) {
    const { h } = zoneSize(garment, ids.front);
    anchors[ids.front] = anchor(pelvisMesh, new THREE.Vector3(zoneCx(garment, ids.front), top - 1 - h / 2, 12), FRONT);
  }
  if (ids.back && hasView(garment, ids.back)) {
    const { h } = zoneSize(garment, ids.back);
    if (spec.cargo || spec.backThighDrop != null) {
      // back of the wearer's left thigh
      const l = legs[1];
      const y = BODY.CROTCH - (spec.backThighDrop ?? 1) - h / 2;
      const p = l.at((l.top.y - y) / -l.dir.y);
      anchors[ids.back] = anchor(legMeshes[1], new THREE.Vector3(p.x, y, -12), BACK);
    } else anchors[ids.back] = anchor(pelvisMesh, new THREE.Vector3(0, top - 0.6 - h / 2, -12), BACK);
  }
  for (const [view, side] of [['left-leg', 1], ['right-leg', -1]] as const) {
    if (!hasView(garment, view)) continue;
    const { h } = zoneSize(garment, view);
    const l = legs[side];
    const y = spec.legEndY > 15 ? spec.legEndY + 1.5 + h / 2 : BODY.CROTCH - 2 - h / 2;
    const p = l.at((l.top.y - y) / -l.dir.y);
    anchors[view] = anchor(legMeshes[side], new THREE.Vector3(p.x, y, 12), FRONT);
  }
  return { anchors, trims, armAngle: 14, mannequin: true };
}

/* ================================================================================================
 * HEADWEAR & BAGS
 * ============================================================================================== */

interface CapSpec {
  /** Crown radii (x, height, z). */
  R: [number, number, number];
  phi0: number;
  /** How much the front panels sit lower and flatter (unstructured); negative = fuller, structured front. */
  frontDip: number;
  brimLen: number;
  /** Brim angular span, degrees. */
  brimSpan: number;
  /** Brim curvature: overall droop and extra bend at the sides. */
  brimDrop: number;
  brimSideBend: number;
  /** Height of each view's zone bottom above the brim seam. */
  frontLift: number;
  backLift: number;
}

const CAPS: Record<'dad' | 'snap', CapSpec> = {
  dad: { R: [3.5, 3.85, 4.05], phi0: -0.24, frontDip: 0.06, brimLen: 2.85, brimSpan: 116, brimDrop: 0.12, brimSideBend: 0.55, frontLift: 0.55, backLift: 1.5 },
  snap: { R: [3.62, 4.5, 4.12], phi0: -0.2, frontDip: -0.04, brimLen: 3.05, brimSpan: 124, brimDrop: 0.04, brimSideBend: 0.06, frontLift: 0.7, backLift: 1.9 },
};

function buildCap(garment: GarmentId, c: Ctx, spec: CapSpec): Omit<GarmentModel, 'group' | 'materials' | 'frame'> {
  const C = new THREE.Vector3(0, 65.55, 0.25);
  const R = new THREE.Vector3(...spec.R);
  const phi0 = spec.phi0;
  const crownPt = (th: number, phi: number) =>
    new THREE.Vector3(C.x + R.x * Math.cos(phi) * Math.sin(th), C.y + R.y * Math.sin(phi), C.z + R.z * Math.cos(phi) * Math.cos(th));
  const crownGeo = gridGeometry(
    (u, v) => {
      const th = u * Math.PI * 2;
      // unstructured: front panels sit a little lower and flatter
      const phi = phi0 + v * (Math.PI / 2 - phi0) - spec.frontDip * Math.max(0, Math.cos(th)) * (1 - v);
      const p = crownPt(th, Math.min(phi, Math.PI / 2 - 1e-4));
      return p;
    },
    { cols: 96, rows: 40, wrapU: true, inside: C },
  );
  const crown = addPart(c, crownGeo);

  // brim: curved, pre-bent downward at the sides
  const brimGeo = gridGeometry(
    (u, v) => {
      const th = (u - 0.5) * THREE.MathUtils.degToRad(spec.brimSpan);
      const base = crownPt(th, phi0 - 0.01);
      // longest at the front, tapering to nothing where it meets the crown at the sides
      const len = spec.brimLen * Math.pow(Math.max(0, Math.cos(th * (1.45 * 116) / spec.brimSpan)), 0.75);
      const out = new THREE.Vector3(Math.sin(th) * 0.3, 0, Math.cos(th)).normalize();
      const p = base.addScaledVector(out, v * len);
      p.y -= spec.brimDrop * v + spec.brimSideBend * Math.pow(Math.sin(th), 2) * v; // pre-curved: sides bend down
      return p;
    },
    { cols: 64, rows: 12, inside: new THREE.Vector3(0, 70, 0) },
  );
  addPart(c, brimGeo);

  // panel seams + button
  const seamMat = fabricMaterial(c.fabric, new THREE.Color(c.color).multiplyScalar(0.78).getStyle(), { clip: c.clip });
  c.materials.push(seamMat);
  for (let k = 0; k < 6; k++) {
    const th = (k / 6) * Math.PI * 2 + Math.PI / 6;
    const pts = Array.from({ length: 16 }, (_, i) => {
      const phi = phi0 + 0.05 + (i / 15) * (Math.PI / 2 - phi0 - 0.08);
      const p = crownPt(th, phi);
      return p.add(p.clone().sub(C).normalize().multiplyScalar(0.03));
    });
    c.group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.05, 6), seamMat));
  }
  const btn = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), fabricMaterial(c.fabric, c.color, { clip: c.clip }));
  c.materials.push(btn.material as THREE.Material);
  btn.scale.set(1, 0.45, 1);
  btn.position.set(C.x, C.y + R.y - 0.02, C.z);
  c.group.add(btn);

  const brimY = C.y + R.y * Math.sin(phi0);
  const anchors: GarmentModel['anchors'] = {};
  if (hasView(garment, 'front')) anchors.front = anchor(crown, new THREE.Vector3(0, brimY + spec.frontLift + zoneSize(garment, 'front').h / 2, 12), FRONT, undefined, 3);
  if (hasView(garment, 'back')) anchors.back = anchor(crown, new THREE.Vector3(0, brimY + spec.backLift + zoneSize(garment, 'back').h / 2, -12), BACK, undefined, 3);
  return { anchors, trims: [], armAngle: 14, mannequin: true };
}

function buildBeanie(garment: GarmentId, c: Ctx): Omit<GarmentModel, 'group' | 'materials' | 'frame'> {
  const C = new THREE.Vector3(0, 64.6, 0.2);
  const R = new THREE.Vector3(3.6, 5.3, 4.15);
  const phi0 = -0.42;
  const pt = (th: number, phi: number, grow = 0) =>
    new THREE.Vector3(C.x + (R.x + grow) * Math.cos(phi) * Math.sin(th), C.y + (R.y + grow) * Math.sin(phi), C.z + (R.z + grow) * Math.cos(phi) * Math.cos(th));
  const crownGeo = gridGeometry((u, v) => pt(u * Math.PI * 2, Math.min(phi0 + v * (Math.PI / 2 - phi0), Math.PI / 2 - 1e-4)), {
    cols: 96,
    rows: 48,
    wrapU: true,
    inside: C,
  });
  addPart(c, crownGeo, c.fabric, { tileScale: 0.9 });
  // turned-up cuff
  const cuffTop = 0.15;
  const cuffGeo = gridGeometry(
    (u, v) => {
      const phi = phi0 + v * (cuffTop - phi0);
      return pt(u * Math.PI * 2, phi, 0.32 - 0.05 * v);
    },
    { cols: 96, rows: 10, wrapU: true, inside: C },
  );
  const cuff = addPart(c, cuffGeo, c.fabric, { tileScale: 0.9 });
  const anchors: GarmentModel['anchors'] = {};
  if (hasView(garment, 'front')) {
    const y = C.y + R.y * Math.sin((phi0 + cuffTop) / 2);
    anchors.front = anchor(cuff, new THREE.Vector3(0, y, 12), FRONT, undefined, 3);
  }
  return { anchors, trims: [], armAngle: 14, mannequin: true };
}

function buildTote(garment: GarmentId, c: Ctx): Omit<GarmentModel, 'group' | 'materials' | 'frame'> {
  const W = 7.5;
  const D = 1.7;
  const H = 16;
  const bodyGeo = gridGeometry(
    (u, v) => {
      const y = v * H;
      const bulge = Math.sin(Math.PI * Math.min(1, v * 1.05));
      const p = superPoint(u * Math.PI * 2, W * (1 + 0.015 * bulge), D * (0.75 + 0.55 * bulge), 6);
      const sag = 0.12 * Math.sin(u * Math.PI * 8) * (1 - v) * 0.6;
      return new THREE.Vector3(p.x, y, p.z + sag);
    },
    { cols: 120, rows: 60, wrapU: true, inside: new THREE.Vector3(0, H / 2, 0) },
  );
  const body = addPart(c, bodyGeo);
  const bottom = gridGeometry(
    (u, v) => {
      const p = superPoint(u * Math.PI * 2, W * 0.75 * v + 0.01, D * 0.75 * v + 0.01, 6);
      return new THREE.Vector3(p.x, 0, p.z);
    },
    { cols: 64, rows: 6, inside: new THREE.Vector3(0, 5, 0) },
  );
  addPart(c, bottom);
  for (const s of [1, -1]) {
    const z = s * D * 0.72;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-3.6, H - 2.5, z + s * 0.05),
      new THREE.Vector3(-3.7, H + 3, z * 0.8),
      new THREE.Vector3(0, H + 10.5, z * 0.4),
      new THREE.Vector3(3.7, H + 3, z * 0.8),
      new THREE.Vector3(3.6, H - 2.5, z + s * 0.05),
    ]);
    const frames = curveFrames(curve, new THREE.Vector3(0, 0, s));
    addPart(c, tubeGeometry(frames, () => [0.12, 0.6], { cols: 12, rows: 64 }));
  }
  const anchors: GarmentModel['anchors'] = {};
  if (hasView(garment, 'front')) anchors.front = anchor(body, new THREE.Vector3(0, 8.2, 12), FRONT, undefined, 4);
  if (hasView(garment, 'back')) anchors.back = anchor(body, new THREE.Vector3(0, 8.2, -12), BACK, undefined, 4);
  return { anchors, trims: [], armAngle: 14, mannequin: false };
}

function buildSocks(garment: GarmentId, c: Ctx): Omit<GarmentModel, 'group' | 'materials' | 'frame'> {
  const TOP_Y = 17;
  const stripe = new THREE.Color(c.color);
  const hsl = { h: 0, s: 0, l: 0 };
  stripe.getHSL(hsl);
  stripe.setHSL(hsl.h, hsl.s, hsl.l > 0.45 ? hsl.l * 0.35 : Math.min(0.92, hsl.l + 0.55));
  const anchors: GarmentModel['anchors'] = {};
  for (const side of [1, -1] as const) {
    const l = leg(side);
    const tAt = (y: number) => (l.top.y - y) / -l.dir.y;
    const tTop = tAt(TOP_Y);
    const tEnd = l.length + 1.9; // down into the foot shell: no gap at the ankle
    const along = (t0: number, t1: number) => (v: number): Frame => {
      const t = t0 + v * (t1 - t0);
      const n = new THREE.Vector3(0, 0, 1);
      return { c: l.at(t), n: n.clone().sub(l.dir.clone().multiplyScalar(n.dot(l.dir))).normalize(), b: new THREE.Vector3().crossVectors(l.dir, n).normalize() };
    };
    const legGeo = tubeGeometry(along(tTop, tEnd), (v) => l.radius(tTop + v * (tEnd - tTop)) + 0.14, { cols: 40, rows: 40 });
    const legMesh = addPart(c, legGeo);
    // fold-over rib cuff
    addPart(c, tubeGeometry(along(tTop - 0.3, tTop + 2.6), (v) => l.radius(tTop + v * 2.9) + 0.34, { cols: 40, rows: 6 }), RIB, { tileScale: 0.6 });
    // knitted-in stripes below the cuff
    for (const [a, b] of [[3.1, 3.7], [4.0, 4.3]]) {
      addPart(c, tubeGeometry(along(tTop + a, tTop + b), (v) => l.radius(tTop + a + v * (b - a)) + 0.17, { cols: 40, rows: 2 }), RIB, { tileScale: 0.6, color: `#${stripe.getHexString()}`, inner: false });
    }
    // foot: a slightly larger shell around the mannequin's foot
    const fx = l.at(l.length).x;
    const C = new THREE.Vector3(fx, 1.15, 2.3);
    const Rf = new THREE.Vector3(1.6 * 1.09, 1.15 * 1.12, 4.7 * 1.04);
    const footGeo = gridGeometry(
      (u, v) => {
        const th = u * Math.PI * 2;
        const ph = -Math.PI / 2 + v * Math.PI;
        return new THREE.Vector3(C.x + Rf.x * Math.cos(ph) * Math.sin(th), C.y + Rf.y * Math.sin(ph), C.z + Rf.z * Math.cos(ph) * Math.cos(th));
      },
      { cols: 48, rows: 24, wrapU: true, inside: C },
    );
    addPart(c, footGeo);
    if (side === 1 && hasView(garment, 'front')) {
      const { h } = zoneSize(garment, 'front');
      const y = TOP_Y - 4.6 - h / 2;
      const p = l.at(tAt(y));
      anchors.front = anchor(legMesh, new THREE.Vector3(p.x, y, 12), FRONT, undefined, 4);
    }
  }
  return { anchors, trims: [], armAngle: 14, mannequin: true };
}

/* ================================================================================================
 * BAGS & FOOTWEAR (standalone products: no mannequin; they stand on the floor at y = 0)
 * ============================================================================================== */

type Built = Omit<GarmentModel, 'group' | 'materials' | 'frame'>;

const FOAM = getFabric('eva-foam')!;
const shadeOf = (hex: string, k: number) => new THREE.Color(hex).multiplyScalar(k).getStyle();

function solidMat(c: Ctx, color: string, roughness = 0.6, metalness = 0): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color, roughness, metalness, clippingPlanes: c.clip });
  c.materials.push(m);
  return m;
}

/** A round tube through `pts` (zips, cords, laces). */
function addTube(c: Ctx, pts: THREE.Vector3[], r: number, mat: THREE.Material, segments = 64) {
  const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), segments, r, 8, false), mat);
  m.castShadow = true;
  c.group.add(m);
  return m;
}

/** A flat strap (webbing) along `pts`: `thick` along the `normal` hint, `width` across it. */
function addStrap(c: Ctx, pts: THREE.Vector3[], normal: THREE.Vector3, thick: number, width: number, color: string) {
  const frames = curveFrames(new THREE.CatmullRomCurve3(pts), normal);
  return addPart(c, tubeGeometry(frames, () => [thick / 2, width / 2], { cols: 12, rows: 64 }), c.fabric, { color });
}

/** Superellipse surface z (front, +) at x for half-width a, half-depth b. */
const superZ = (x: number, a: number, b: number, n: number) => (Math.abs(x) >= a ? 0 : b * Math.pow(1 - Math.pow(Math.abs(x) / a, n), 1 / n));

function buildBackpack(garment: GarmentId, c: Ctx): Built {
  const W = 6;
  const D = 3;
  const H = 18;
  const yd = H - 3.6;
  const N = 3.2;
  const sec = (y: number) => {
    const k = y > yd ? Math.sqrt(Math.max(0, 1 - ((y - yd) / (H - yd)) ** 2)) : 1;
    return { a: W * (1 - 0.05 * (y / H)) * k, b: D * (0.86 + 0.14 * Math.sin(Math.PI * Math.min(1, y / H))) * Math.sqrt(k) };
  };
  const shape = (z: number) => (z > 0 ? z * 1.12 : z * 0.88); // fuller front, flatter back
  const body = addPart(
    c,
    gridGeometry(
      (u, v) => {
        const y = v * H;
        const s = sec(y);
        const p = superPoint(u * Math.PI * 2, s.a, s.b, N);
        return new THREE.Vector3(p.x, y, shape(p.z));
      },
      { cols: 96, rows: 72, wrapU: true, inside: new THREE.Vector3(0, H / 2, 0) },
    ),
  );
  addPart(
    c,
    gridGeometry(
      (u, v) => {
        const s = sec(0);
        const p = superPoint(u * Math.PI * 2, s.a * (1 - v) + 0.01, s.b * (1 - v) + 0.01, N);
        return new THREE.Vector3(p.x, 0, shape(p.z));
      },
      { cols: 64, rows: 6, inside: new THREE.Vector3(0, 5, 0) },
    ),
    c.fabric,
    { color: shadeOf(c.color, 0.8) },
  );
  const frontZ = (x: number, y: number) => {
    const s = sec(y);
    return 1.12 * superZ(x, s.a, s.b, N);
  };
  const backZ = (x: number, y: number) => {
    const s = sec(y);
    return -0.88 * superZ(x, s.a, s.b, N);
  };

  // padded front pocket
  const P = { x: 4.9, y0: 1.0, y1: 8.6 };
  const bulge = (u: number, v: number) => 1.1 * Math.pow(Math.sin(Math.PI * u), 0.5) * Math.pow(Math.sin(Math.PI * v), 0.35) + 0.06;
  const pocketPt = (u: number, v: number) => {
    const x = (u - 0.5) * 2 * P.x;
    const y = P.y0 + v * (P.y1 - P.y0);
    return new THREE.Vector3(x, y, frontZ(x, y) + bulge(u, v));
  };
  const pocket = addPart(c, gridGeometry(pocketPt, { cols: 48, rows: 32, inside: new THREE.Vector3(0, 5, 0) }), c.fabric, { color: shadeOf(c.color, 0.94) });

  // padded back panel
  const pad = addPart(
    c,
    gridGeometry(
      (u, v) => {
        const x = (u - 0.5) * 2 * 4.6;
        const y = 2.5 + v * (H - 6);
        return new THREE.Vector3(x, y, backZ(x, y) - (0.45 * Math.pow(Math.sin(Math.PI * u), 0.4) * Math.pow(Math.sin(Math.PI * v), 0.4) + 0.04));
      },
      { cols: 40, rows: 40, inside: new THREE.Vector3(0, 9, 0) },
    ),
    c.fabric,
    { color: shadeOf(c.color, 0.9) },
  );

  // zips and pulls
  const zipMat = solidMat(c, '#1d1d20', 0.5);
  const pullMat = solidMat(c, '#9ea2a8', 0.3, 0.85);
  const zip: THREE.Vector3[] = [];
  for (let i = 0; i <= 28; i++) {
    const x = -5.4 + (i / 28) * 10.8;
    const y = 12.9 + 1.5 * (1 - (x / 5.6) ** 2);
    zip.push(new THREE.Vector3(x, y, frontZ(x, y) + 0.05));
  }
  addTube(c, zip, 0.07, zipMat);
  addTube(c, Array.from({ length: 21 }, (_, i) => pocketPt(0.06 + (i / 20) * 0.88, 0.93).add(new THREE.Vector3(0, 0, 0.05))), 0.06, zipMat);
  for (const p of [zip[24], pocketPt(0.86, 0.93)]) {
    const tab = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.9, 0.08), pullMat);
    tab.position.copy(p).add(new THREE.Vector3(0, -0.5, 0.12));
    c.group.add(tab);
  }

  // shoulder straps and top handle
  const strapColor = shadeOf(c.color, 0.72);
  for (const s of [1, -1]) {
    const zb = -D * 0.88;
    addStrap(
      c,
      [
        new THREE.Vector3(s * 2.3, H - 2.4, zb + 0.2),
        new THREE.Vector3(s * 2.7, H - 5, zb - 2.0),
        new THREE.Vector3(s * 3.2, 9, zb - 2.5),
        new THREE.Vector3(s * 4.1, 3.2, zb - 1.4),
        new THREE.Vector3(s * 4.5, 1.3, zb - 0.1),
      ],
      new THREE.Vector3(0, 0, -1),
      0.55,
      2.3,
      strapColor,
    );
  }
  addStrap(c, [new THREE.Vector3(-1.3, H - 0.4, -0.6), new THREE.Vector3(-0.9, H + 1.3, -0.6), new THREE.Vector3(0, H + 1.8, -0.6), new THREE.Vector3(0.9, H + 1.3, -0.6), new THREE.Vector3(1.3, H - 0.4, -0.6)], new THREE.Vector3(0, 0, 1), 0.25, 1.0, strapColor);

  const anchors: Built['anchors'] = {};
  if (hasView(garment, 'front')) anchors.front = anchor(body, new THREE.Vector3(zoneCx(garment, 'front'), P.y1 + 0.5 + zoneSize(garment, 'front').h / 2, 14), FRONT, undefined, 3);
  if (hasView(garment, 'pocket')) anchors.pocket = anchor(pocket, new THREE.Vector3(zoneCx(garment, 'pocket'), (P.y0 + P.y1) / 2, 14), FRONT, undefined, 3);
  if (hasView(garment, 'side')) anchors.side = anchor(body, new THREE.Vector3(14, 12.4, 0), new THREE.Vector3(-1, 0, 0), undefined, 3);
  if (hasView(garment, 'back')) anchors.back = anchor(pad, new THREE.Vector3(0, H - 5, -14), BACK, undefined, 3);
  return { anchors, trims: [], armAngle: 14, mannequin: false };
}

function buildDuffel(garment: GarmentId, c: Ctx): Built {
  const L = 11;
  const Wz = 5.5;
  const Hh = 5.5;
  const yc = Hh;
  const ring = (x: number, th: number, grow = 0) => {
    const k = 1 + 0.035 * Math.cos((x / L) * (Math.PI / 2));
    const p = superPoint(th, Wz * k + grow, Hh * k + grow, 2.8);
    return new THREE.Vector3(x, Math.max(0, yc + p.z), p.x);
  };
  const body = addPart(c, gridGeometry((u, v) => ring(-L + v * 2 * L, u * Math.PI * 2), { cols: 96, rows: 64, wrapU: true, inside: (_u, v) => new THREE.Vector3(-L + v * 2 * L, yc, 0) }));
  const ends: Record<number, THREE.Mesh> = {};
  for (const s of [1, -1]) {
    ends[s] = addPart(
      c,
      gridGeometry(
        (u, v) => {
          const r = ring(s * L, u * Math.PI * 2);
          const p = r.lerp(new THREE.Vector3(s * L, yc, 0), v);
          p.x += s * 0.9 * Math.sin((v * Math.PI) / 2);
          return p;
        },
        { cols: 96, rows: 14, inside: new THREE.Vector3(s * (L - 3), yc, 0) },
      ),
    );
  }
  const band = shadeOf(c.color, 0.78);
  for (const xw of [-5.2, 5.2])
    addPart(c, gridGeometry((u, v) => ring(xw - 0.6 + v * 1.2, u * Math.PI * 2, 0.06), { cols: 96, rows: 4, wrapU: true, inside: new THREE.Vector3(xw, yc, 0) }), c.fabric, { color: band });
  for (const zs of [1, -1])
    addStrap(
      c,
      [new THREE.Vector3(-5.2, yc + Hh - 0.2, zs * 1.1), new THREE.Vector3(-4.6, yc + Hh + 3.2, zs * 0.8), new THREE.Vector3(0, yc + Hh + 5, zs * 0.25), new THREE.Vector3(4.6, yc + Hh + 3.2, zs * 0.8), new THREE.Vector3(5.2, yc + Hh - 0.2, zs * 1.1)],
      new THREE.Vector3(0, 0, zs),
      0.3,
      1.5,
      band,
    );
  addTube(c, Array.from({ length: 31 }, (_, i) => ring(-L + 1.2 + (i / 30) * (2 * L - 2.4), 0).add(new THREE.Vector3(0, 0.05, 0))), 0.08, solidMat(c, '#1d1d20', 0.5));
  const ringMat = solidMat(c, '#a9adb3', 0.3, 0.85);
  for (const s of [1, -1]) {
    const d = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.09, 10, 28), ringMat);
    d.position.set(s * (L + 0.75), yc + Hh * 0.55, 0);
    d.rotation.y = Math.PI / 2;
    c.group.add(d);
  }
  const anchors: Built['anchors'] = {};
  if (hasView(garment, 'front')) anchors.front = anchor(body, new THREE.Vector3(zoneCx(garment, 'front'), 6.2, 14), FRONT, undefined, 3);
  if (hasView(garment, 'back')) anchors.back = anchor(body, new THREE.Vector3(-zoneCx(garment, 'back'), 6.2, -14), BACK, undefined, 3);
  if (hasView(garment, 'end')) anchors.end = anchor(ends[1], new THREE.Vector3(L + 14, yc - 0.9, 0), new THREE.Vector3(-1, 0, 0), undefined, 3);
  return { anchors, trims: [], armAngle: 14, mannequin: false };
}

function buildBeltBag(garment: GarmentId, c: Ctx): Built {
  const L = 6.5;
  const Hh = 2.75;
  const Dz = 1.45;
  const y0 = 6;
  const yc = (x: number) => y0 + 0.55 * (x / L) ** 2;
  const pt = (x: number, th: number, grow = 0) => {
    const env = Math.pow(Math.max(0, 1 - (x / L) ** 2), 0.42);
    const p = superPoint(th, Dz * env + grow, Hh * env + grow, 2.4);
    return new THREE.Vector3(x, yc(x) + p.z, p.x > 0 ? p.x * 1.15 : p.x * 0.7);
  };
  const body = addPart(c, gridGeometry((u, v) => pt(-L + v * 2 * L, u * Math.PI * 2), { cols: 64, rows: 64, wrapU: true, inside: (_u, v) => new THREE.Vector3(-L + v * 2 * L, yc(-L + v * 2 * L), 0) }));
  const zipMat = solidMat(c, '#1d1d20', 0.5);
  addTube(c, Array.from({ length: 25 }, (_, i) => pt(-L + 1 + (i / 24) * (2 * L - 2), 0.75, 0.05)), 0.06, zipMat);
  addTube(c, Array.from({ length: 21 }, (_, i) => pt(-L + 2.2 + (i / 20) * (2 * L - 4.4), 1.55, 0.05)), 0.05, zipMat);
  const beltPts = [
      new THREE.Vector3(L - 0.4, y0 + 0.4, -0.4),
      new THREE.Vector3(L + 3.2, y0 + 0.6, -3),
      new THREE.Vector3(L + 2, y0 + 0.6, -7.6),
      new THREE.Vector3(0, y0 + 0.6, -9.4),
      new THREE.Vector3(-L - 2, y0 + 0.6, -7.6),
      new THREE.Vector3(-L - 3.2, y0 + 0.6, -3),
      new THREE.Vector3(-L + 0.4, y0 + 0.4, -0.4),
  ];
  // a waist belt: 1.5 in tall along the frame's n (≈ up), thin across
  addPart(c, tubeGeometry(curveFrames(new THREE.CatmullRomCurve3(beltPts), new THREE.Vector3(0, 1, 0)), () => [0.75, 0.1], { cols: 12, rows: 96 }), c.fabric, { color: shadeOf(c.color, 0.7) });
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.8, 0.35), solidMat(c, '#222225', 0.45));
  buckle.position.set(0, y0 + 0.6, -9.5);
  c.group.add(buckle);
  const anchors: Built['anchors'] = {};
  if (hasView(garment, 'front')) anchors.front = anchor(body, new THREE.Vector3(zoneCx(garment, 'front'), y0 + 0.9, 14), FRONT, undefined, 2.5);
  return { anchors, trims: [], armAngle: 14, mannequin: false };
}

function buildDrawstring(garment: GarmentId, c: Ctx): Built {
  const W = 7;
  const D = 1.0;
  const H = 18;
  const body = addPart(
    c,
    gridGeometry(
      (u, v) => {
        const y = v * H;
        const g = smoothstep(H - 4, H, y);
        const bulgeK = Math.sin(Math.PI * Math.min(1, v * 1.05));
        const p = superPoint(u * Math.PI * 2, W * (1 + 0.015 * bulgeK) * (1 - 0.32 * g * g), D * (0.75 + 0.55 * bulgeK) * (1 + 0.9 * g), 6 - 3 * g);
        // gathers under the drawstring channel
        return new THREE.Vector3(p.x, y, p.z + 0.12 * Math.sin(u * Math.PI * 16) * g * Math.abs(Math.cos(u * Math.PI * 2)));
      },
      { cols: 120, rows: 60, wrapU: true, inside: new THREE.Vector3(0, H / 2, 0) },
    ),
  );
  addPart(
    c,
    gridGeometry(
      (u, v) => {
        const p = superPoint(u * Math.PI * 2, W * 0.75 * v + 0.01, D * 0.75 * v + 0.01, 6);
        return new THREE.Vector3(p.x, 0, p.z);
      },
      { cols: 64, rows: 6, inside: new THREE.Vector3(0, 5, 0) },
    ),
  );
  const cord = solidMat(c, '#f1f0eb', 0.8);
  for (const s of [1, -1])
    addTube(c, [new THREE.Vector3(s * W * 0.6, H - 0.6, D * 1.2), new THREE.Vector3(s * W * 1.0, H * 0.62, D * 0.6), new THREE.Vector3(s * W * 1.0, 2.4, D * 0.4), new THREE.Vector3(s * W * 0.97, 0.7, 0.2)], 0.11, cord);
  addTube(c, [new THREE.Vector3(-W * 0.6, H - 0.6, D * 1.2), new THREE.Vector3(0, H - 0.2, D * 1.6), new THREE.Vector3(W * 0.6, H - 0.6, D * 1.2)], 0.11, cord);
  const anchors: Built['anchors'] = {};
  if (hasView(garment, 'front')) anchors.front = anchor(body, new THREE.Vector3(zoneCx(garment, 'front'), 9.2, 14), FRONT, undefined, 3);
  if (hasView(garment, 'back')) anchors.back = anchor(body, new THREE.Vector3(-zoneCx(garment, 'back'), 9.2, -14), BACK, undefined, 3);
  return { anchors, trims: [], armAngle: 14, mannequin: false };
}

/* ---------- footwear: one parametric last (heel at -z, toe at +z, a right shoe: lateral side is -x) ---------- */

interface ShoeLast {
  L: number;
  z: (t: number) => number;
  halfW: (t: number) => number;
  soleTop: (t: number) => number;
  lift: (t: number) => number;
}

function shoeLast(L: number, widths: number[][]): ShoeLast {
  const env = (t: number) =>
    t < 0.06 ? Math.sqrt(Math.max(0, 1 - ((0.06 - t) / 0.06) ** 2)) : t > 0.9 ? Math.sqrt(Math.max(0, 1 - ((t - 0.9) / 0.1) ** 2)) : 1;
  return {
    L,
    z: (t) => -L / 2 + t * L,
    halfW: (t) => keyframes(widths, Math.min(1, Math.max(0, t)))[0] * env(t),
    soleTop: (t) => keyframes([[0, 1.15], [0.6, 0.92], [1, 0.86]], Math.min(1, Math.max(0, t)))[0],
    lift: (t) => 0.5 * Math.pow(smoothstep(0.76, 1, t), 1.6) + 0.12 * Math.pow(smoothstep(0.08, 0, t), 2),
  };
}

/** Outsole + midsole for a last; returns the top height function. */
function addSole(c: Ctx, last: ShoeLast, thickness: (t: number) => number, sideColor: string, bottomColor: string, grow = 0.14) {
  // perimeter param: u 0..0.5 down the outer (+x) side heel→toe, 0.5..1 back up the inner side
  const rim = (u: number) => {
    const side = u < 0.5 ? 1 : -1;
    const tt = (u < 0.5 ? u * 2 : 2 - u * 2) * 1.03 - 0.015;
    const t = Math.min(1, Math.max(0, tt));
    const w = (last.halfW(Math.min(1, Math.max(0.0001, tt))) * 1.07 + grow) * (tt < 0 || tt > 1 ? 0 : 1);
    return { x: side * w, z: last.z(tt), t };
  };
  addPart(
    c,
    gridGeometry(
      (u, v) => {
        const r = rim(u);
        const round = 1 - 0.05 * (1 - Math.sin(Math.PI * Math.min(1, v)));
        return new THREE.Vector3(r.x * round, last.lift(r.t) + v * thickness(r.t), r.z);
      },
      { cols: 160, rows: 8, wrapU: true, inside: (u) => { const r = rim(u); return new THREE.Vector3(0, last.lift(r.t) + 0.4, r.z); } },
    ),
    FOAM,
    { color: sideColor, inner: false },
  );
  for (const [top, color] of [[false, bottomColor], [true, sideColor]] as const)
    addPart(
      c,
      gridGeometry(
        (u, v) => {
          const r = rim(u);
          return new THREE.Vector3(r.x * (1 - v), last.lift(r.t) + (top ? thickness(r.t) : 0), r.z);
        },
        { cols: 160, rows: 6, inside: new THREE.Vector3(0, top ? -5 : 5, 0) },
      ),
      FOAM,
      { color, inner: false },
    );
}

function buildSneaker(garment: GarmentId, c: Ctx, high: boolean): Built {
  const last = shoeLast(11.5, [[0, 1.4], [0.1, 1.62], [0.3, 1.66], [0.62, 2.02], [0.8, 1.98], [0.93, 1.62], [1, 1.3]]);
  const H = (t: number) =>
    keyframes(
      high
        ? [[0, 7.0], [0.12, 7.2], [0.22, 7.2], [0.27, 7.0], [0.3, 6.5], [0.4, 4.7], [0.5, 3.5], [0.65, 2.6], [0.85, 1.95], [1, 1.35]]
        : [[0, 3.6], [0.12, 3.9], [0.25, 4.0], [0.3, 3.85], [0.33, 3.65], [0.45, 3.15], [0.65, 2.5], [0.85, 1.95], [1, 1.35]],
      t,
    )[0];
  const collar = (t: number) => keyframes(high ? [[0, 6.4], [0.08, 6.3], [0.18, 6.0], [0.25, 6.25], [0.29, 6.55]] : [[0, 3.05], [0.08, 2.95], [0.2, 2.5], [0.27, 2.75], [0.31, 3.65]], t)[0];
  const tOpen = high ? 0.29 : 0.31;
  const base = (t: number) => last.lift(t) + last.soleTop(t);
  // the toe rounds over instead of ending in a flat face
  const height = (t: number) => H(t) * (t > 0.88 ? 0.42 + 0.58 * Math.sqrt(Math.max(0, 1 - ((t - 0.88) / 0.12) ** 2)) : 1);
  const wall = (phi: number, t: number) => {
    const s = Math.sin(phi);
    const sx = Math.sign(s) * Math.pow(Math.abs(s), 0.65);
    const sy = Math.pow(Math.abs(Math.cos(phi)), 0.5);
    return new THREE.Vector3(last.halfW(t) * sx * (1 - 0.08 * sy), base(t) + height(t) * sy, last.z(t));
  };
  // Each row: outer wall up the left side (u 0..A), across the top (A..1-A), down the right side.
  // In the collar opening the walls stop at the collar line, which therefore always lies on grid
  // columns u = A and 1 - A (a clean rim), and the middle becomes the padded lining dipping inside.
  const A = 0.3;
  const PHI_TOP = 0.5;
  const upperPt = (u: number, t: number) => {
    const f = t < tOpen ? smoothstep(tOpen, tOpen - 0.06, t) : 0;
    const rel = Math.min(1, Math.max(0, collar(t) / height(t)));
    const phiRim = Math.acos(Math.min(1, rel * rel));
    const phiW = PHI_TOP + (phiRim - PHI_TOP) * f;
    if (u < A) return wall(-Math.PI / 2 + (u / A) * (Math.PI / 2 - phiW), t);
    if (u > 1 - A) return wall(phiW + ((u - (1 - A)) / A) * (Math.PI / 2 - phiW), t);
    const s = (u - A) / (1 - 2 * A);
    const closed = wall(-phiW + 2 * phiW * s, t);
    if (f <= 0) return closed;
    const l = wall(-phiW, t);
    const r = wall(phiW, t);
    const depth = Math.max(0.3, l.y - base(t) - 0.35);
    const open = new THREE.Vector3(l.x + (r.x - l.x) * s, l.y - depth * Math.pow(Math.sin(Math.PI * s), 0.6), last.z(t));
    open.x *= 0.9;
    return closed.lerp(open, f);
  };
  const upper = addPart(c, gridGeometry((u, v) => upperPt(u, v), { cols: 96, rows: 160, inside: (_u, v) => new THREE.Vector3(0, base(v) + 0.3, last.z(v)) }));
  addSole(c, last, last.soleTop, '#f3f1ec', '#2b2b2e');

  // laces across the throat
  const laceMat = solidMat(c, '#f5f4ef', 0.75);
  const n = high ? 7 : 5;
  const t0 = high ? 0.31 : 0.345;
  const t1 = 0.6;
  for (let k = 0; k < n; k++) {
    const t = t0 + (k / (n - 1)) * (t1 - t0);
    const pts = Array.from({ length: 9 }, (_, i) => upperPt(0.5 + (i / 8 - 0.5) * 0.36, t).add(new THREE.Vector3(0, 0.1 + 0.06 * Math.sin((i / 8) * Math.PI), 0)));
    addTube(c, pts, 0.075, laceMat, 24);
  }
  // heel pull tab
  const tab = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.4, 0.22), fabricMaterial(c.fabric, shadeOf(c.color, 0.7), { clip: c.clip }));
  c.materials.push(tab.material as THREE.Material);
  tab.position.set(0, base(0) + collar(0) + 0.25, last.z(0) - 0.08);
  tab.rotation.x = 0.12;
  c.group.add(tab);

  // anchors from the 2D side view (heel x 52 → toe x 462, ground y 452, ~35.7 px/in)
  const anchors: Built['anchors'] = {};
  const sideAnchor = (view: ViewId, sign: 1 | -1) => {
    const z2 = getView(garment, view).zone;
    const cx = view === 'medial' ? GARMENT_W - (z2.x + z2.w / 2) : z2.x + z2.w / 2;
    const t = (cx - 52) / 410;
    const h = (452 - (z2.y + z2.h / 2)) / 35.7;
    anchors[view] = anchor(upper, new THREE.Vector3(sign * 14, h, last.z(t)), new THREE.Vector3(-sign, 0, 0), undefined, 2.2);
  };
  if (hasView(garment, 'lateral')) sideAnchor('lateral', -1);
  if (hasView(garment, 'medial')) sideAnchor('medial', 1);
  if (hasView(garment, 'tongue')) {
    const t = tOpen + 0.02;
    const p = upperPt(0.5, t);
    const tan = upperPt(0.5, t + 0.01).sub(upperPt(0.5, t - 0.01)).normalize();
    const normal = new THREE.Vector3(1, 0, 0).cross(tan).normalize();
    if (normal.y < 0) normal.negate();
    anchors.tongue = anchor(upper, p.clone().addScaledVector(normal, 10), normal.clone().negate(), tan.clone().negate(), 1.6);
  }
  if (hasView(garment, 'heel')) anchors.heel = anchor(upper, new THREE.Vector3(0, 2.5, last.z(0) - 14), BACK, undefined, 2);
  return { anchors, trims: [], armAngle: 14, mannequin: false };
}

function buildSlides(garment: GarmentId, c: Ctx): Built {
  const last = shoeLast(11.3, [[0, 1.55], [0.12, 1.75], [0.35, 1.75], [0.62, 2.1], [0.82, 2.1], [0.95, 1.75], [1, 1.5]]);
  const flat: ShoeLast = { ...last, lift: () => 0 };
  const thick = (t: number) => keyframes([[0, 1.25], [0.5, 1.0], [1, 0.85]], Math.min(1, Math.max(0, t)))[0];
  addSole(c, flat, thick, c.color, shadeOf(c.color, 0.55), 0.05);
  // contoured footbed top: raised rim, shallow dish
  const rimPt = (u: number) => {
    const side = u < 0.5 ? 1 : -1;
    const t = u < 0.5 ? u * 2 : 2 - u * 2;
    return { x: side * (flat.halfW(t) * 1.07 + 0.05), t };
  };
  const bed = addPart(
    c,
    gridGeometry(
      (u, v) => {
        const r = rimPt(u);
        return new THREE.Vector3(r.x * (1 - v), thick(r.t) + 0.18 * (1 - v) ** 2 - 0.05 * v, flat.z(r.t));
      },
      { cols: 160, rows: 12, inside: new THREE.Vector3(0, -5, 0) },
    ),
    c.fabric,
    { inner: false },
  );
  // arched strap over the forefoot
  const strap = addPart(
    c,
    gridGeometry(
      (u, v) => {
        const t = 0.47 + v * 0.33;
        const a = (u - 0.5) * Math.PI;
        const w = flat.halfW(t) * 1.05;
        const arch = 1.55 * (1 - 0.2 * ((v - 0.5) * 2) ** 2);
        return new THREE.Vector3(w * Math.sin(a), thick(t) + 0.1 + arch * Math.pow(Math.cos(a), 0.8), flat.z(t));
      },
      { cols: 48, rows: 24, inside: new THREE.Vector3(0, 0.5, flat.z(0.63)) },
    ),
    c.fabric,
    { color: shadeOf(c.color, 0.92) },
  );
  const anchors: Built['anchors'] = {};
  const up = new THREE.Vector3(0, 0, 1);
  if (hasView(garment, 'strap')) anchors.strap = anchor(strap, new THREE.Vector3(0, 16, flat.z(0.635)), new THREE.Vector3(0, -1, 0), up, 3);
  if (hasView(garment, 'footbed')) anchors.footbed = anchor(bed, new THREE.Vector3(0, 16, flat.z(0.28)), new THREE.Vector3(0, -1, 0), up, 1.5);
  return { anchors, trims: [], armAngle: 14, mannequin: false };
}

/* ---------- more headwear ---------- */

function buildBucket(garment: GarmentId, c: Ctx): Built {
  const C = new THREE.Vector3(0, 65.55, 0.25);
  const base = C.y - 0.95;
  const top = C.y + 4.05;
  const ringAt = (v: number, th: number) => {
    // tapers and rolls over into the top
    const k = 1 - 0.1 * v - 0.1 * Math.pow(v, 4);
    const p = superPoint(th, 3.9 * k, 4.4 * k, 2.2);
    return new THREE.Vector3(C.x + p.x, base + v * (top - 0.4 - base), C.z + p.z);
  };
  const crown = addPart(c, gridGeometry((u, v) => ringAt(v, u * Math.PI * 2), { cols: 96, rows: 24, wrapU: true, inside: C }));
  addPart(
    c,
    gridGeometry(
      (u, v) => {
        const r = ringAt(1, u * Math.PI * 2);
        const p = r.lerp(new THREE.Vector3(C.x, top - 0.4, C.z), v);
        p.y += 0.55 * Math.sin((v * Math.PI) / 2);
        return p;
      },
      { cols: 96, rows: 10, inside: new THREE.Vector3(C.x, top - 3, C.z) },
    ),
  );
  addPart(
    c,
    gridGeometry(
      (u, v) => {
        const p = superPoint(u * Math.PI * 2, 3.9 + 2.4 * v, 4.4 + 2.4 * v, 2.2);
        return new THREE.Vector3(C.x + p.x, base - 1.45 * Math.pow(v, 1.2), C.z + p.z);
      },
      { cols: 120, rows: 10, wrapU: true, inside: new THREE.Vector3(C.x, base - 4, C.z) },
    ),
  );
  const ringMat = solidMat(c, '#b6b9bd', 0.3, 0.85);
  for (const s of [1, -1]) {
    const p = ringAt(0.62, s * 0.95);
    const n = new THREE.Vector3(p.x - C.x, 0, p.z - C.z).normalize();
    const eye = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.05, 8, 20), ringMat);
    eye.position.copy(p).addScaledVector(n, 0.04);
    eye.lookAt(p.clone().add(n));
    c.group.add(eye);
  }
  const anchors: Built['anchors'] = {};
  const y = base + 0.45 + zoneSize(garment, 'front').h / 2;
  if (hasView(garment, 'front')) anchors.front = anchor(crown, new THREE.Vector3(0, y, 12), FRONT, undefined, 3);
  if (hasView(garment, 'back')) anchors.back = anchor(crown, new THREE.Vector3(0, y, -12), BACK, undefined, 3);
  return { anchors, trims: [], armAngle: 14, mannequin: true };
}

/* ================================================================================================
 * Entry
 * ============================================================================================== */

/** Builders for everything that isn't a parametric top or bottom. */
/* ================================================================================================
 * SETS
 * ============================================================================================== */

// Tracksuit = track jacket (top builder) over track pants (bottom builder) on one mannequin. The jacket
// is roomier than the pants' pelvis, so its hem hangs over the waistband without the two touching.
const TRACK_JACKET: TopSpec = {
  ease: 2.4, hemY: 31, fit: 0.3, flare: 0, drop: 0.4, neck: 'mock', frontDrop: 1.0, backDrop: 0.4, neckW: 3.1,
  sleeve: { kind: 'long', cuff: 1.75, fullness: 1.0 }, armAngle: 16, hemBand: 2.0, folds: 0.2, front: 'zip', pocket: 'split',
  zoneTop: { front: 4.6, back: 4 },
};
const TRACK_PANTS: BottomSpec = {
  ease: 1.3, legEndY: 4.4, legR: [[-2, 4.6], [3, 4.4], [14, 3.6], [22, 3.1], [26.5, 2.85], [28.8, 2.2]], cuff: 1.95,
  waistband: 'rib', drawcord: false, cargo: false, fly: false, folds: 0.2, stripes: true, backThighDrop: 2.5, crotch: 0.8,
};

function buildTracksuit(garment: GarmentId, c: Ctx): Built {
  const pants = buildBottom(garment, TRACK_PANTS, c, { front: null, back: 'pants-back' });
  const jacket = buildTop(garment, TRACK_JACKET, c);
  return { ...jacket, anchors: { ...pants.anchors, ...jacket.anchors }, trims: [...pants.trims, ...jacket.trims] };
}

const BUILDERS: Record<string, (garment: GarmentId, c: Ctx) => Omit<GarmentModel, 'group' | 'materials' | 'frame'>> = {
  tracksuit: buildTracksuit,
  dadhat: (g, c) => buildCap(g, c, CAPS.dad),
  snapback: (g, c) => buildCap(g, c, CAPS.snap),
  'bucket-hat': buildBucket,
  beanie: buildBeanie,
  tote: buildTote,
  backpack: buildBackpack,
  duffel: buildDuffel,
  beltbag: buildBeltBag,
  drawstring: buildDrawstring,
  'low-top': (g, c) => buildSneaker(g, c, false),
  'high-top': (g, c) => buildSneaker(g, c, true),
  slides: buildSlides,
  'soccer-socks': buildSocks,
};

export function hasGarmentModel(garment: GarmentId): boolean {
  return garment in TOPS || garment in BOTTOMS || garment in BUILDERS;
}

export function buildGarmentModel(garment: GarmentId, color: string, fabric: FabricDef, clip: THREE.Plane[]): GarmentModel | null {
  if (!hasGarmentModel(garment)) return null;
  const group = new THREE.Group();
  group.name = 'garment';
  const c: Ctx = { color, fabric, clip, group, materials: [] };
  const rest = garment in TOPS ? buildTop(garment, TOPS[garment], c) : garment in BOTTOMS ? buildBottom(garment, BOTTOMS[garment], c) : BUILDERS[garment](garment, c);
  group.updateMatrixWorld(true);
  const frame = new THREE.Box3().setFromObject(group);
  // Ignore views without an anchor (e.g. future views); they simply don't show in 3D.
  for (const v of garmentViews(garment)) if (!rest.anchors[v.id]) delete rest.anchors[v.id];
  return { group, materials: c.materials, frame, ...rest };
}

/* ================================================================================================
 * Trim painters (canvas in inches × ppi; origin top-left of the trim box)
 * ============================================================================================== */

function stitchLine(x: CanvasRenderingContext2D, ppi: number, ink: string, draw: () => void, width = 0.035) {
  x.save();
  x.strokeStyle = ink;
  x.lineWidth = width * ppi;
  x.setLineDash([0.12 * ppi, 0.07 * ppi]);
  x.beginPath();
  draw();
  x.stroke();
  x.restore();
}

function paintKangaroo(x: CanvasRenderingContext2D, ppi: number, ink: string, shade: string) {
  const W = 13 * ppi;
  const H = 7.6 * ppi;
  const path = () => {
    x.moveTo(3 * ppi, 0.15 * ppi);
    x.lineTo(W - 3 * ppi, 0.15 * ppi);
    x.quadraticCurveTo(W - 1.1 * ppi, 2.8 * ppi, W - 0.15 * ppi, 3.9 * ppi);
    x.lineTo(W - 0.15 * ppi, H - 0.15 * ppi);
    x.lineTo(0.15 * ppi, H - 0.15 * ppi);
    x.lineTo(0.15 * ppi, 3.9 * ppi);
    x.quadraticCurveTo(1.1 * ppi, 2.8 * ppi, 3 * ppi, 0.15 * ppi);
  };
  x.fillStyle = shade;
  x.beginPath();
  path();
  x.fill();
  stitchLine(x, ppi, ink, path);
  // pocket openings: a soft shadow along the curved edges
  for (const s of [0, 1]) {
    const g = x.createLinearGradient(s ? W : 0, 0, s ? W - 1.2 * ppi : 1.2 * ppi, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.28)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.save();
    x.beginPath();
    if (s) {
      x.moveTo(W - 3 * ppi, 0.15 * ppi);
      x.quadraticCurveTo(W - 1.1 * ppi, 2.8 * ppi, W - 0.15 * ppi, 3.9 * ppi);
      x.lineTo(W - 1.6 * ppi, 3.9 * ppi);
      x.quadraticCurveTo(W - 2.2 * ppi, 2.4 * ppi, W - 3.6 * ppi, 0.15 * ppi);
    } else {
      x.moveTo(3 * ppi, 0.15 * ppi);
      x.quadraticCurveTo(1.1 * ppi, 2.8 * ppi, 0.15 * ppi, 3.9 * ppi);
      x.lineTo(1.6 * ppi, 3.9 * ppi);
      x.quadraticCurveTo(2.2 * ppi, 2.4 * ppi, 3.6 * ppi, 0.15 * ppi);
    }
    x.fillStyle = g;
    x.fill();
    x.restore();
  }
}

function paintWelt(x: CanvasRenderingContext2D, ppi: number, ink: string, shade: string, side: number) {
  const W = 3.2 * ppi;
  const H = 6.4 * ppi;
  x.save();
  x.translate(W / 2, H / 2);
  x.rotate(side * -0.32);
  x.fillStyle = 'rgba(0,0,0,0.35)';
  x.fillRect(-0.06 * ppi, -2.9 * ppi, 0.12 * ppi, 5.8 * ppi);
  x.fillStyle = shade;
  x.fillRect(-0.32 * ppi, -2.9 * ppi, 0.26 * ppi, 5.8 * ppi);
  stitchLine(x, ppi, ink, () => x.rect(-0.38 * ppi, -2.95 * ppi, 0.76 * ppi, 5.9 * ppi));
  x.restore();
}

function paintFlapPocket(x: CanvasRenderingContext2D, ppi: number, ink: string, shade: string) {
  const W = 4.6 * ppi;
  const H = 5.2 * ppi;
  x.fillStyle = shade;
  x.fillRect(0.2 * ppi, 1.2 * ppi, W - 0.4 * ppi, H - 1.4 * ppi);
  stitchLine(x, ppi, ink, () => x.rect(0.3 * ppi, 1.3 * ppi, W - 0.6 * ppi, H - 1.6 * ppi));
  // flap with a shadow under it
  x.fillStyle = 'rgba(0,0,0,0.25)';
  x.fillRect(0.15 * ppi, 1.55 * ppi, W - 0.3 * ppi, 0.18 * ppi);
  x.fillStyle = shade;
  x.beginPath();
  x.moveTo(0.1 * ppi, 0.1 * ppi);
  x.lineTo(W - 0.1 * ppi, 0.1 * ppi);
  x.lineTo(W - 0.1 * ppi, 1.4 * ppi);
  x.lineTo(W / 2, 1.75 * ppi);
  x.lineTo(0.1 * ppi, 1.4 * ppi);
  x.closePath();
  x.fill();
  stitchLine(x, ppi, ink, () => {
    x.moveTo(0.22 * ppi, 0.22 * ppi);
    x.lineTo(W - 0.22 * ppi, 0.22 * ppi);
    x.lineTo(W - 0.22 * ppi, 1.32 * ppi);
    x.lineTo(W / 2, 1.62 * ppi);
    x.lineTo(0.22 * ppi, 1.32 * ppi);
    x.closePath();
  });
}

function paintZip(x: CanvasRenderingContext2D, ppi: number, ink: string) {
  const W = 0.9 * ppi;
  const H = x.canvas.height;
  x.fillStyle = 'rgba(0,0,0,0.35)';
  x.fillRect(W / 2 - 0.2 * ppi, 0, 0.4 * ppi, H);
  x.fillStyle = '#bdbdb8';
  for (let y = 0; y < H; y += 0.16 * ppi) {
    x.fillRect(W / 2 - 0.17 * ppi, y, 0.17 * ppi, 0.07 * ppi);
    x.fillRect(W / 2, y + 0.08 * ppi, 0.17 * ppi, 0.07 * ppi);
  }
  stitchLine(x, ppi, ink, () => {
    x.moveTo(0.1 * ppi, 0);
    x.lineTo(0.1 * ppi, H);
    x.moveTo(W - 0.1 * ppi, 0);
    x.lineTo(W - 0.1 * ppi, H);
  });
}

function paintPlacket(x: CanvasRenderingContext2D, ppi: number, ink: string, shade: string) {
  const W = 1.5 * ppi;
  const H = 6.4 * ppi;
  x.fillStyle = shade;
  x.fillRect(0.1 * ppi, 0, W - 0.2 * ppi, H - 0.1 * ppi);
  x.fillStyle = 'rgba(0,0,0,0.3)';
  x.fillRect(W / 2 - 0.02 * ppi, 0, 0.04 * ppi, H - 0.3 * ppi);
  stitchLine(x, ppi, ink, () => x.rect(0.14 * ppi, 0, W - 0.28 * ppi, H - 0.18 * ppi));
}

function paintFrontEdge(x: CanvasRenderingContext2D, ppi: number, ink: string) {
  const H = x.canvas.height;
  x.fillStyle = 'rgba(0,0,0,0.35)';
  x.fillRect(0.4 * ppi, 0, 0.05 * ppi, H);
  stitchLine(x, ppi, ink, () => {
    x.moveTo(0.62 * ppi, 0);
    x.lineTo(0.62 * ppi, H);
    x.moveTo(1.8 * ppi, 0);
    x.lineTo(1.8 * ppi, H);
  });
}

function paintFly(x: CanvasRenderingContext2D, ppi: number, ink: string) {
  stitchLine(x, ppi, ink, () => {
    x.moveTo(1.9 * ppi, 0);
    x.lineTo(1.9 * ppi, 5.3 * ppi);
    x.quadraticCurveTo(1.9 * ppi, 6.4 * ppi, 0.6 * ppi, 6.4 * ppi);
  });
  x.fillStyle = 'rgba(0,0,0,0.3)';
  x.fillRect(0.55 * ppi, 0, 0.05 * ppi, 6.4 * ppi);
}

function paintCargo(x: CanvasRenderingContext2D, ppi: number, ink: string, shade: string) {
  const W = 7 * ppi;
  const H = 8.4 * ppi;
  x.fillStyle = shade;
  x.fillRect(0.2 * ppi, 1.8 * ppi, W - 0.4 * ppi, H - 2 * ppi);
  // bellows pleat
  x.fillStyle = 'rgba(0,0,0,0.18)';
  x.fillRect(W / 2 - 0.9 * ppi, 2.1 * ppi, 0.08 * ppi, H - 2.5 * ppi);
  x.fillRect(W / 2 + 0.9 * ppi, 2.1 * ppi, 0.08 * ppi, H - 2.5 * ppi);
  stitchLine(x, ppi, ink, () => x.rect(0.32 * ppi, 1.9 * ppi, W - 0.64 * ppi, H - 2.2 * ppi));
  x.fillStyle = 'rgba(0,0,0,0.28)';
  x.fillRect(0.1 * ppi, 2.0 * ppi, W - 0.2 * ppi, 0.22 * ppi);
  x.fillStyle = shade;
  x.fillRect(0.1 * ppi, 0.1 * ppi, W - 0.2 * ppi, 1.95 * ppi);
  stitchLine(x, ppi, ink, () => x.rect(0.24 * ppi, 0.24 * ppi, W - 0.48 * ppi, 1.65 * ppi));
}

function paintPad(x: CanvasRenderingContext2D, ppi: number, ink: string, shade: string) {
  const W = 4.4 * ppi;
  const H = 5.2 * ppi;
  const r = 1.2 * ppi;
  const path = () => {
    x.beginPath();
    x.roundRect(0.15 * ppi, 0.15 * ppi, W - 0.3 * ppi, H - 0.3 * ppi, r);
  };
  path();
  x.fillStyle = shade.replace(/[\d.]+\)$/, (a) => `${Math.min(1, parseFloat(a) * 5)})`);
  x.fill();
  // quilted pad channels
  x.save();
  path();
  x.clip();
  x.strokeStyle = 'rgba(0,0,0,0.18)';
  x.lineWidth = 0.05 * ppi;
  for (let k = 1; k < 4; k++) {
    x.beginPath();
    x.moveTo(0, (H * k) / 4);
    x.lineTo(W, (H * k) / 4);
    x.stroke();
  }
  x.restore();
  stitchLine(x, ppi, ink, () => x.roundRect(0.3 * ppi, 0.3 * ppi, W - 0.6 * ppi, H - 0.6 * ppi, r * 0.85));
}

function paintStripe(x: CanvasRenderingContext2D, ppi: number, ink: string) {
  const light = ink.startsWith('rgba(255');
  x.fillStyle = light ? 'rgba(245,245,245,0.9)' : 'rgba(18,18,22,0.82)';
  x.fillRect(0.25 * ppi, 0, x.canvas.width - 0.5 * ppi, x.canvas.height);
  stitchLine(x, ppi, light ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)', () => {
    x.moveTo(0.3 * ppi, 0);
    x.lineTo(0.3 * ppi, x.canvas.height);
    x.moveTo(x.canvas.width - 0.3 * ppi, 0);
    x.lineTo(x.canvas.width - 0.3 * ppi, x.canvas.height);
  });
}
