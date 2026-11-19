import * as THREE from 'three';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';
import { BUMP_TERMS, bumpColumn, type Anatomy, type LimbShape, type Section } from './anatomy';
import { columnFactors, torsoColumns, torsoTheta } from './mannequinMesh';
import { ParametricSurface, angleDiff, smoothstep, superPoint } from './surface';
import { tiled } from './materials';

/* ================================================================================================
 * Garment overlay: a fitted tee or a hoodie generated from the same anatomy as the mannequin, offset
 * by real ease (never less than ~1 cm, so it can't z-fight with the body). Below the chest the cloth
 * hangs instead of following the waist, and it bridges hollows (cleavage, spine, under the glutes).
 * Artwork is projected with DecalGeometry at its true size.
 * ============================================================================================== */

export type GarmentKind = 'tee' | 'hoodie';

export interface LogoPlacement {
  side: 'front' | 'back';
  /** Print width in cm. */
  widthCm: number;
  /** Distance from the neckline to the top of the print, in cm. */
  belowCollarCm: number;
}

interface Fit {
  ease: number;
  hang: number;
  hemF: number;
  bandF: number;
  neckFront: number;
  neckBack: number;
}

const FITS: Record<GarmentKind, Fit> = {
  tee: { ease: 0.012, hang: 0.35, hemF: 0.503, bandF: 0, neckFront: 0.829, neckBack: 0.848 },
  hoodie: { ease: 0.028, hang: 0.8, hemF: 0.468, bandF: 0.5, neckFront: 0.824, neckBack: 0.85 },
};

const COLS = 128;
const BODY_ROWS = 150;

export class GarmentOverlay extends THREE.Group {
  kind: GarmentKind = 'tee';
  private readonly body = new ParametricSurface({ cols: COLS, rows: BODY_ROWS, wrapU: true, flip: true, uvScale: [1.0, 0.6] });
  private readonly hem = new ParametricSurface({ cols: COLS, rows: 10, wrapU: true, flip: true, uvScale: [1.0, 0.04] });
  private readonly collar = new ParametricSurface({ cols: COLS, rows: 6, wrapU: true, flip: true, uvScale: [0.45, 0.02] });
  private readonly sleeves = [0, 1].map(() => new ParametricSurface({ cols: 48, rows: 80, wrapU: true, poleStart: true, uvScale: [0.36, 0.5] }));
  private readonly cuffs = [0, 1].map(() => new ParametricSurface({ cols: 48, rows: 8, wrapU: true, uvScale: [0.2, 0.05] }));
  private readonly hood = new ParametricSurface({ cols: 96, rows: 44, uvScale: [0.6, 0.3] });
  private readonly pocket = new ParametricSurface({ cols: 40, rows: 18, flip: true, uvScale: [0.36, 0.13] });
  private cords: THREE.Mesh[] = [];

  readonly fabric: THREE.MeshPhysicalMaterial;
  readonly rib: THREE.MeshPhysicalMaterial;
  private readonly cordMat = new THREE.MeshPhysicalMaterial({ color: '#f2f2f2', roughness: 0.7, sheen: 0.6 });
  private readonly agletMat = new THREE.MeshPhysicalMaterial({ color: '#bfc3c8', metalness: 1, roughness: 0.3 });
  private readonly decalMat = new THREE.MeshPhysicalMaterial({
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    roughness: 0.6,
    sheen: 0.3,
    sheenRoughness: 0.6,
  });
  private decal: THREE.Mesh | null = null;
  private logo: { texture: THREE.Texture; aspect: number } | null = null;
  placement: LogoPlacement = { side: 'front', widthCm: 22, belowCollarCm: 9 };

  private readonly bodyMesh: THREE.Mesh;
  private readonly parts: Record<string, THREE.Mesh[]> = {};
  private readonly colsFabric = columnFactors(COLS, true, torsoTheta);
  private readonly superCols = torsoColumns(COLS);
  private anatomy: Anatomy | null = null;

  constructor() {
    super();
    this.name = 'garment-overlay';
    this.fabric = new THREE.MeshPhysicalMaterial({ roughness: 0.86, sheen: 0.7, sheenRoughness: 0.55, side: THREE.DoubleSide, bumpScale: 0.55 });
    this.rib = new THREE.MeshPhysicalMaterial({ roughness: 0.88, sheen: 1, sheenRoughness: 0.5, side: THREE.DoubleSide, bumpMap: tiled('rib', 0.032), bumpScale: 0.9 });
    const add = (key: string, list: ParametricSurface[], mat: THREE.Material) => {
      this.parts[key] = list.map((s) => {
        const m = new THREE.Mesh(s.geometry, mat);
        m.castShadow = true;
        m.receiveShadow = true;
        m.name = `garment-${key}`;
        this.add(m);
        return m;
      });
    };
    add('body', [this.body], this.fabric);
    add('hem', [this.hem], this.rib);
    add('collar', [this.collar], this.rib);
    add('sleeves', this.sleeves, this.fabric);
    add('cuffs', this.cuffs, this.rib);
    add('hood', [this.hood], this.fabric);
    add('pocket', [this.pocket], this.fabric);
    this.bodyMesh = this.parts.body[0];
    this.setColor('#2f4b8f');
    this.setKind('tee');
  }

  setKind(kind: GarmentKind) {
    this.kind = kind;
    const hoodie = kind === 'hoodie';
    this.parts.collar[0].visible = !hoodie;
    this.parts.hood[0].visible = hoodie;
    this.parts.pocket[0].visible = hoodie;
    this.parts.hem[0].material = hoodie ? this.rib : this.fabric;
    for (const m of this.parts.cuffs) m.material = hoodie ? this.rib : this.fabric;
    const old = this.fabric.bumpMap;
    this.fabric.bumpMap = hoodie ? tiled('fleece', 0.05) : tiled('knit', 0.03);
    this.fabric.bumpScale = hoodie ? 0.7 : 0.5;
    this.fabric.needsUpdate = true;
    old?.dispose();
    if (this.anatomy) this.update(this.anatomy);
  }

  setColor(hex: string) {
    const c = new THREE.Color(hex);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    const sheen = c.clone().lerp(new THREE.Color('#ffffff'), hsl.l < 0.35 ? 0.25 : 0.2);
    for (const m of [this.fabric, this.rib]) {
      m.color.copy(c);
      m.sheenColor.copy(sheen);
    }
    this.cordMat.color.copy(hsl.l > 0.75 ? c.clone().multiplyScalar(0.82) : new THREE.Color('#f2f2f2'));
  }

  /** Sets (or clears) the artwork. The texture is owned by the caller. */
  setLogo(texture: THREE.Texture | null, aspect = 1) {
    this.logo = texture ? { texture, aspect } : null;
    this.decalMat.map = texture;
    this.decalMat.needsUpdate = true;
    this.updateDecal();
  }

  setPlacement(p: LogoPlacement) {
    this.placement = p;
    this.updateDecal();
  }

  // --------------------------------------------------------------------------------- geometry

  private neckY(a: Anatomy, theta: number) {
    const fit = FITS[this.kind];
    const w = ((1 + Math.cos(theta)) / 2) ** 2;
    return a.H * (fit.neckBack - (fit.neckBack - fit.neckFront) * w);
  }

  private readonly sec: Section = { a: 0, b: 0, zc: 0, n: 2 };
  private readonly sp = { x: 0, z: 0, nx: 0, nz: 0 };
  private readonly row = new Float32Array(BUMP_TERMS);
  private readonly colTmp = new Float32Array(BUMP_TERMS);

  /**
   * A point on the cloth at angle θ and height y, `ease` metres off the body. `col` is a precomputed
   * column factor offset for the standard grid, or -1 to evaluate θ directly.
   */
  private shirtPoint(a: Anatomy, theta: number, y: number, ease: number, col: number, out: THREE.Vector3, normal?: THREE.Vector2) {
    const r = this.rowAt(a, y);
    const A = r[0] + ease;
    const B = r[1] + ease * 0.85;
    if (col >= 0) this.superCols.point(col, A, B, r[3], this.sp);
    else superPoint(theta, A, B, r[3], this.sp);
    const cf = col >= 0 ? this.colsFabric : bumpColumn(theta, true, this.colTmp);
    const off = col >= 0 ? col * BUMP_TERMS : 0;
    let bump = 0;
    for (let k = 0; k < BUMP_TERMS; k++) bump += cf[off + k] * r[4 + k];
    out.set(this.sp.x + this.sp.nx * bump, y, this.sp.z + r[2] + this.sp.nz * bump);
    normal?.set(this.sp.nx, this.sp.nz);
    return out;
  }

  // Per-height cloth values [A, B, zc, n, bump terms…] sampled every ~1 mm and interpolated: the
  // garment grids evaluate tens of thousands of points per morph frame, and the neckline makes y vary
  // per column, so caching by row alone isn't possible.
  private static readonly ROW = 4 + BUMP_TERMS;
  private rowTable = new Float64Array(0);
  private rowY0 = 0;
  private rowStep = 1;
  private rowCount = 0;
  private readonly rowOut = new Float64Array(4 + BUMP_TERMS);

  private exactRow(a: Anatomy, y: number, out: Float64Array, offset: number) {
    const fit = FITS[this.kind];
    const sec = a.section(y, this.sec);
    const chestY = a.f.chest * a.H;
    const hang = fit.hang * smoothstep(chestY, chestY - 0.07 * a.H, y);
    out[offset] = sec.a + Math.max(0, a.chestA * 0.97 - sec.a) * hang;
    out[offset + 1] = sec.b + Math.max(0, a.chestB - sec.b) * hang;
    out[offset + 2] = sec.zc;
    out[offset + 3] = sec.n;
    a.bumpRow(y, true, this.row);
    for (let k = 0; k < BUMP_TERMS; k++) out[offset + 4 + k] = this.row[k];
  }

  private buildRows(a: Anatomy, y0: number, y1: number) {
    const R = GarmentOverlay.ROW;
    const count = Math.max(2, Math.ceil((y1 - y0) / 0.001) + 1);
    if (this.rowTable.length < count * R) this.rowTable = new Float64Array(count * R);
    this.rowY0 = y0;
    this.rowStep = (y1 - y0) / (count - 1);
    this.rowCount = count;
    for (let i = 0; i < count; i++) this.exactRow(a, y0 + i * this.rowStep, this.rowTable, i * R);
  }

  private rowAt(a: Anatomy, y: number): Float64Array {
    const R = GarmentOverlay.ROW;
    const f = (y - this.rowY0) / this.rowStep;
    const out = this.rowOut;
    if (f < 0 || f > this.rowCount - 1 || this.rowCount === 0) {
      this.exactRow(a, y, out, 0);
      return out;
    }
    const i = Math.min(this.rowCount - 2, Math.floor(f));
    const t = f - i;
    const T = this.rowTable;
    const p = i * R;
    for (let k = 0; k < R; k++) out[k] = T[p + k] + (T[p + R + k] - T[p + k]) * t;
    return out;
  }

  /** Regenerates the garment around `a`. `withDecal: false` skips re-projecting the artwork (live morphs). */
  update(a: Anatomy, withDecal = true) {
    this.anatomy = a;
    const fit = FITS[this.kind];
    const e = fit.ease * a.s;
    const hoodie = this.kind === 'hoodie';
    const H = a.H;
    this.buildRows(a, fit.hemF * H - 0.01, Math.max(fit.neckBack, fit.neckFront) * H + 0.035 * a.s);

    // body: hem (or top of the rib band) up to the neckline
    const bodyBottom = (hoodie ? fit.bandF : fit.hemF) * H;
    this.body.update((u, v, out) => {
      const th = torsoTheta(u);
      const y = bodyBottom + v * (this.neckY(a, th) - bodyBottom);
      this.shirtPoint(a, th, y, e, Math.round(u * COLS), out);
    });

    // hem: rolled edge on the tee, a gathered rib band on the hoodie
    this.hem.update((u, v, out) => {
      const th = torsoTheta(u);
      if (hoodie) {
        const y = fit.hemF * H + v * (bodyBottom - fit.hemF * H);
        this.shirtPoint(a, th, y, e * (0.55 + 0.45 * v), Math.round(u * COLS), out);
      } else {
        const y = fit.hemF * H + v * 0.014 * a.s;
        this.shirtPoint(a, th, y, e + 0.0015 * Math.sin(v * Math.PI), Math.round(u * COLS), out);
      }
    });

    if (!hoodie) {
      this.collar.update((u, v, out) => {
        const th = torsoTheta(u);
        const y = this.neckY(a, th) + v * 0.02 * a.s;
        this.shirtPoint(a, th, y, e + (0.005 * a.s - e) * v, Math.round(u * COLS), out);
      });
    } else {
      this.updateHood(a, e);
      this.updatePocket(a, e);
    }
    this.updateCords(a, e);

    a.arms.forEach((arm, i) => this.updateSleeve(a, arm, i));
    if (withDecal) this.updateDecal();
  }

  private updateSleeve(a: Anatomy, arm: LimbShape, i: number) {
    const hoodie = this.kind === 'hoodie';
    const L1 = 0.188 * a.H;
    const e = (hoodie ? 0.02 : 0.011) * a.s;
    const R0 = a.deltoid;
    const start = arm.start;
    const end = hoodie ? arm.length - 0.075 * a.s : start + 0.42 * L1;
    const c = new THREE.Vector3();
    const t = new THREE.Vector3();
    const side = new THREE.Vector3();
    const front = new THREE.Vector3();
    const frame = (s: number) => {
      const v = Math.min(0.9995, Math.max(0.0005, s / arm.length));
      arm.curve.getPointAt(v, c);
      arm.curve.getTangentAt(v, t);
      const ref = Math.abs(t.z) > 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
      front.copy(ref).addScaledVector(t, -t.dot(ref)).normalize();
      side.crossVectors(front, t).normalize();
    };
    const radius = (s: number) => {
      const sh = arm.shape(s);
      const k = Math.min(1, s / start);
      const along = Math.max(0, (s - start) / Math.max(0.01, end - start));
      const loose = hoodie ? R0 + e - along * (R0 - 0.05 * a.s) : (R0 + e) * (1 - 0.18 * along);
      const rx = Math.max(sh.rx + e * k, s > start ? loose * 0.96 : 0);
      const rz = Math.max(sh.rz + e * k, s > start ? loose : 0);
      return { rx, rz, dz: sh.dz };
    };
    let lastV = -1;
    let r = { rx: 0, rz: 0, dz: 0 };
    let sNow = 0;
    this.sleeves[i].update((u, v, out) => {
      if (v !== lastV) {
        sNow = v * end;
        frame(sNow);
        r = radius(sNow);
        lastV = v;
      }
      const ph = u * Math.PI * 2;
      const bunch = hoodie ? 0.0035 * a.s * Math.sin(ph * 3 + sNow * 70) * smoothstep(end - 0.12 * a.s, end, sNow) : 0;
      out.copy(c).addScaledVector(side, Math.sin(ph) * (r.rx + bunch)).addScaledVector(front, Math.cos(ph) * (r.rz + bunch) + r.dz);
    });

    // tee: rolled sleeve hem; hoodie: rib cuff from the sleeve end to the wrist
    const s0 = hoodie ? end - 0.012 * a.s : end - 0.014 * a.s;
    const s1 = hoodie ? arm.length - 0.024 * a.s : end;
    lastV = -1;
    this.cuffs[i].update((u, v, out) => {
      if (v !== lastV) {
        sNow = s0 + v * (s1 - s0);
        frame(sNow);
        if (hoodie) {
          const sh = arm.shape(sNow);
          const k = Math.sin(v * Math.PI) * 0.0015 * a.s;
          r = { rx: sh.rx + 0.009 * a.s + k, rz: sh.rz + 0.009 * a.s + k, dz: sh.dz };
        } else {
          const re = radius(end);
          const k = 0.0016 * a.s * Math.sin(v * Math.PI);
          r = { rx: re.rx + k, rz: re.rz + k, dz: re.dz };
        }
        lastV = v;
      }
      const ph = u * Math.PI * 2;
      out.copy(c).addScaledVector(side, Math.sin(ph) * r.rx).addScaledVector(front, Math.cos(ph) * r.rz + r.dz);
    });
  }

  private updateHood(a: Anatomy, e: number) {
    const th0 = 0.42;
    const span = Math.PI * 2 - th0 * 2;
    const n = new THREE.Vector2();
    const curves = new Map<number, THREE.SplineCurve>();
    const anchors = new Map<number, [THREE.Vector3, THREE.Vector2]>();
    const q = new THREE.Vector2();
    this.hood.update((u, v, out) => {
      const th = th0 + u * span;
      const key = Math.round(u * 96);
      let anchor = anchors.get(key);
      if (!anchor) {
        anchor = [this.shirtPoint(a, th, this.neckY(a, th), e, -1, new THREE.Vector3(), n).clone(), n.clone()];
        anchors.set(key, anchor);
      }
      let curve = curves.get(key);
      if (!curve) {
        const k = Math.min(1, Math.abs(angleDiff(th, Math.PI)) / (Math.PI - th0));
        // a hood folded down: a soft roll around the back of the neck that lies on the upper back
        const hgt = (0.05 - 0.032 * k ** 1.2) * a.s;
        const thick = (0.06 - 0.042 * k) * a.s;
        const drop = 0.13 * (1 - k) ** 0.9 * a.s;
        curve = new THREE.SplineCurve([
          new THREE.Vector2(0, 0),
          new THREE.Vector2(0.004 * a.s, hgt * 0.5),
          new THREE.Vector2(thick * 0.3, hgt),
          new THREE.Vector2(thick * 0.78, hgt * 0.92),
          new THREE.Vector2(thick * 1.05, hgt * 0.45),
          new THREE.Vector2(thick * 1.18, -0.2 * drop),
          new THREE.Vector2(thick * 1.25, -drop),
        ]);
        curves.set(key, curve);
      }
      const [p, nn] = anchor;
      curve.getPoint(v, q);
      out.set(p.x + nn.x * (q.x + 0.002), p.y + q.y, p.z + nn.y * (q.x + 0.002));
    });
  }

  private updatePocket(a: Anatomy, e: number) {
    const y0 = 0.528 * a.H;
    const y1 = 0.6 * a.H;
    this.pocket.update((u, v, out) => {
      const span = 0.62 - 0.2 * v;
      const th = (u - 0.5) * 2 * span;
      const y = y0 + v * (y1 - y0);
      const puff = 0.006 * a.s + 0.004 * a.s * Math.sin(u * Math.PI) * Math.sin(v * Math.PI);
      this.shirtPoint(a, th, y, e + puff, -1, out);
    });
  }

  private updateCords(a: Anatomy, e: number) {
    for (const m of this.cords) {
      m.geometry.dispose();
      this.remove(m);
    }
    this.cords = [];
    if (this.kind !== 'hoodie') return;
    for (const side of [1, -1]) {
      const th = side * 0.5;
      const p0 = this.shirtPoint(a, th, this.neckY(a, th) + 0.008 * a.s, e + 0.014 * a.s, -1, new THREE.Vector3());
      const pts = [
        p0,
        p0.clone().add(new THREE.Vector3(-side * 0.002, -0.06 * a.s, 0.01 * a.s)),
        p0.clone().add(new THREE.Vector3(-side * 0.004, -0.15 * a.s, 0.016 * a.s)),
        p0.clone().add(new THREE.Vector3(-side * 0.005, -0.215 * a.s, 0.014 * a.s)),
      ];
      const curve = new THREE.CatmullRomCurve3(pts);
      const cord = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.0034 * a.s, 10), this.cordMat);
      cord.castShadow = true;
      const aglet = new THREE.Mesh(new THREE.CylinderGeometry(0.0042 * a.s, 0.0042 * a.s, 0.024 * a.s, 14), this.agletMat);
      const end = curve.getPoint(1);
      const tan = curve.getTangent(1);
      aglet.position.copy(end).addScaledVector(tan, 0.012 * a.s);
      aglet.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
      aglet.castShadow = true;
      for (const m of [cord, aglet]) {
        this.add(m);
        this.cords.push(m);
      }
    }
  }

  /** Re-projects the artwork onto the garment body. */
  updateDecal() {
    if (this.decal) {
      this.decal.geometry.dispose();
      this.remove(this.decal);
      this.decal = null;
    }
    const a = this.anatomy;
    if (!this.logo || !a || !this.visible) return;
    const back = this.placement.side === 'back';
    const th = back ? Math.PI : 0;
    const w = this.placement.widthCm / 100;
    const h = w / this.logo.aspect;
    const y = this.neckY(a, th) - this.placement.belowCollarCm / 100 - h / 2;
    const fit = FITS[this.kind];
    const local = this.shirtPoint(a, th, y, fit.ease * a.s, -1, new THREE.Vector3());
    this.updateWorldMatrix(true, true);
    const world = this.localToWorld(local.clone());

    // Project only onto the grid cells around the print: DecalGeometry clips every triangle it is given
    // in JS, and the whole shirt is ~38k triangles. The window shares the shirt's attributes (it is never
    // rendered or disposed, so the shared GPU buffers are untouched).
    const bottom = (this.kind === 'hoodie' ? fit.bandF : fit.hemF) * a.H;
    const neck = this.neckY(a, th);
    const vOf = (yy: number) => (yy - bottom) / (neck - bottom);
    const margin = 0.03 * a.s;
    const j0 = Math.max(0, Math.floor(vOf(y - h / 2 - margin) * BODY_ROWS));
    const j1 = Math.min(BODY_ROWS, Math.ceil(vOf(y + h / 2 + margin) * BODY_ROWS));
    const centre = back ? 0 : COLS / 2;
    const span = Math.ceil(((w / 2 + margin) / (0.85 * Math.min(a.chestB, a.waistB))) / (Math.PI * 2) * COLS) + 2;
    const index: number[] = [];
    const W = COLS + 1;
    for (let j = j0; j < j1; j++)
      for (let di = -Math.min(span, COLS / 2); di < Math.min(span, COLS / 2); di++) {
        const i = (((centre + di) % COLS) + COLS) % COLS;
        const p = j * W + i;
        index.push(p, p + 1, p + W, p + 1, p + W + 1, p + W);
      }
    const windowGeo = new THREE.BufferGeometry();
    windowGeo.setAttribute('position', this.body.geometry.attributes.position);
    windowGeo.setAttribute('normal', this.body.geometry.attributes.normal);
    windowGeo.setIndex(index);
    const windowMesh = new THREE.Mesh(windowGeo);
    windowMesh.matrixWorld.copy(this.bodyMesh.matrixWorld);
    const geom = new DecalGeometry(windowMesh, world, new THREE.Euler(0, back ? Math.PI : 0, 0), new THREE.Vector3(w, h, 0.12 * a.s));
    geom.applyMatrix4(this.matrixWorld.clone().invert());
    this.decal = new THREE.Mesh(geom, this.decalMat);
    this.decal.name = 'garment-logo';
    this.decal.receiveShadow = true;
    this.add(this.decal);
  }

  dispose() {
    for (const s of [this.body, this.hem, this.collar, this.hood, this.pocket, ...this.sleeves, ...this.cuffs]) s.dispose();
    for (const m of this.cords) m.geometry.dispose();
    this.decal?.geometry.dispose();
    this.fabric.bumpMap?.dispose();
    this.rib.bumpMap?.dispose();
    for (const m of [this.fabric, this.rib, this.cordMat, this.agletMat, this.decalMat]) m.dispose();
  }
}
