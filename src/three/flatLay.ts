import * as THREE from 'three';
import { GARMENT_H, GARMENT_W, garmentShape } from '../data/garments';
import type { FabricDef } from '../data/fabrics';
import type { GarmentId } from '../types';
import { weaveNormal } from './fabricMaterials';

/* ================================================================================================
 * Flat-lay 3D: the garment's front and back flat drawings "inflated" into two curved surfaces (depth
 * from a distance-to-edge field), so the straight-on view matches the 2D mockup exactly. Used for
 * custom photo blanks (no 3D model) and as the "Flat-lay" mode of the 360° view.
 * ============================================================================================== */

/** Soft radial contact shadow on the floor, width × depth (local units). */
export function contactShadow(width: number, depth: number): THREE.Mesh {
  const sh = document.createElement('canvas');
  sh.width = sh.height = 128;
  const sx = sh.getContext('2d')!;
  const grad = sx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  sx.fillStyle = grad;
  sx.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sh), transparent: true, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(width, depth, 1);
  return shadow;
}

const U = 100; // studio px per world unit
const COLS = 200;
const ROWS = 224;
const SW = 250; // silhouette sampling resolution (half of the 500×560 studio space)
const SH = 280;

export interface Built {
  group: THREE.Group;
  /** World-space box the camera frames (inches). */
  frame: THREE.Box3;
  dispose(): void;
}

function silhouette(c: HTMLCanvasElement): Uint8Array {
  const s = document.createElement('canvas');
  s.width = SW;
  s.height = SH;
  const x = s.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(c, 0, 0, SW, SH);
  const d = x.getImageData(0, 0, SW, SH).data;
  const m = new Uint8Array(SW * SH);
  for (let k = 0; k < m.length; k++) m[k] = d[k * 4 + 3] > 40 ? 1 : 0;
  return m;
}

function cloneCanvas(c: HTMLCanvasElement): HTMLCanvasElement {
  const o = document.createElement('canvas');
  o.width = c.width;
  o.height = c.height;
  o.getContext('2d')!.drawImage(c, 0, 0);
  return o;
}

export function buildFlatLay(
  garment: GarmentId,
  tex: { front: { outside: HTMLCanvasElement; inside: HTMLCanvasElement }; back: { outside: HTMLCanvasElement; inside: HTMLCanvasElement } },
  clip: THREE.Plane,
  fabric: FabricDef,
): Built {
  // Where only one side has fabric (a cap's brim, a hood), let the other side borrow it, mirrored, so the
  // two surfaces share one silhouette and meet cleanly at the side seams.
  const fill = (dst: HTMLCanvasElement, src: HTMLCanvasElement) => {
    const x = dst.getContext('2d')!;
    x.save();
    x.globalCompositeOperation = 'destination-over';
    x.translate(dst.width, 0);
    x.scale(-1, 1);
    x.drawImage(src, 0, 0, dst.width, dst.height);
    x.restore();
  };
  const fo = cloneCanvas(tex.front.outside);
  const fi = cloneCanvas(tex.front.inside);
  fill(tex.front.outside, tex.back.outside);
  fill(tex.front.inside, tex.back.inside);
  fill(tex.back.outside, fo);
  fill(tex.back.inside, fi);
  // Union of both silhouettes; the back image is seen from behind, so it is mirrored in world space.
  const fm = silhouette(tex.front.outside);
  const bm = silhouette(tex.back.outside);
  const mask = new Uint8Array(SW * SH);
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) mask[y * SW + x] = fm[y * SW + x] | bm[y * SW + (SW - 1 - x)];
  // Grow every texture's alpha a few px past the measured silhouette (where depth is already zero), so
  // anti-aliased edge texels don't fail the alpha test and open a slit along the side seams.
  for (const c of [tex.front.outside, tex.front.inside, tex.back.outside, tex.back.inside]) {
    const x = c.getContext('2d')!;
    const copy = cloneCanvas(c);
    // only solid fabric spreads (the blank's soft drop shadow must not build up into a dark halo)
    const cx = copy.getContext('2d')!;
    const img = cx.getImageData(0, 0, copy.width, copy.height);
    for (let k = 3; k < img.data.length; k += 4) if (img.data[k] < 128) img.data[k] = 0;
    cx.putImageData(img, 0, 0);
    x.clearRect(0, 0, c.width, c.height);
    x.drawImage(copy, 0, 0);
    const r = Math.max(2, Math.round(c.width / 250));
    x.save();
    x.globalCompositeOperation = 'destination-over';
    for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]]) x.drawImage(copy, dx, dy);
    x.restore();
  }

  // horizontal runs per row
  const runs: Array<Array<[number, number]>> = [];
  const halves: number[] = [];
  let minY = SH;
  let maxY = 0;
  for (let y = 0; y < SH; y++) {
    const r: Array<[number, number]> = [];
    let s = -1;
    for (let x = 0; x <= SW; x++) {
      const on = x < SW && mask[y * SW + x] === 1;
      if (on && s < 0) s = x;
      if (!on && s >= 0) {
        if (x - s > 1) r.push([s, x - 1]);
        s = -1;
      }
    }
    runs.push(r);
    if (r.length) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      for (const [a, b] of r) halves.push((b - a + 1) / 2);
    }
  }
  const colTop = new Int32Array(SW).fill(-1);
  for (let x = 0; x < SW; x++)
    for (let y = 0; y < SH; y++)
      if (mask[y * SW + x]) {
        colTop[x] = y;
        break;
      }

  // Depth by "inflation": distance to the nearest silhouette edge, through a rounded profile that
  // flattens out at R. Sleeves, shoulders and legs round off by their own width, with no creases.
  const sorted = halves.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 50;
  const maxHalf = sorted[sorted.length - 1] ?? 50;
  const shape = garmentShape(garment);
  const factor = garment === 'tote' ? 0.14 : shape === 'bottom' ? 0.75 : shape === 'other' ? 0.8 : 0.5;
  const R = Math.max(4, factor * median);
  // Waistbands and bag mouths stay open: treat everything above the top edge as fabric for the distance.
  const openTop = shape === 'bottom' || garment === 'tote' || garment === 'soccer-socks';
  const solid = new Uint8Array(mask);
  if (openTop) for (let x = 0; x < SW; x++) for (let y = 0; y < colTop[x]; y++) solid[y * SW + x] = 1;

  // two-pass chamfer distance transform (3-4 metric), in sampling px
  const INF = 1e9;
  const dist = new Float32Array(SW * SH);
  for (let k = 0; k < dist.length; k++) dist[k] = solid[k] ? INF : 0;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= SW || y >= SH ? (openTop && y < 0 ? INF : 0) : dist[y * SW + x]);
  for (let y = 0; y < SH; y++)
    for (let x = 0; x < SW; x++) {
      const k = y * SW + x;
      if (!dist[k]) continue;
      dist[k] = Math.min(dist[k], at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4);
    }
  for (let y = SH - 1; y >= 0; y--)
    for (let x = SW - 1; x >= 0; x--) {
      const k = y * SW + x;
      if (!dist[k]) continue;
      dist[k] = Math.min(dist[k], at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4);
    }
  const field = new Float32Array(SW * SH);
  for (let k = 0; k < field.length; k++) {
    if (!mask[k]) continue;
    // zero on the outermost pixel so front and back meet at the seam; sine profile: rounded but not
    // so steep that the alpha-cut edge floats off the seam
    const d = Math.min(Math.max(0, dist[k] / 3 - 0.5), R);
    field[k] = R * Math.sin((Math.PI / 2) * (d / R));
  }
  // soften the chamfer's diamond artefacts (inside the garment only, so edges stay at zero)
  const blurred = new Float32Array(field);
  for (let pass = 0; pass < 2; pass++) {
    const src = pass ? new Float32Array(blurred) : field;
    for (let y = 1; y < SH - 1; y++)
      for (let x = 1; x < SW - 1; x++) {
        const k = y * SW + x;
        if (!mask[k]) continue;
        let s = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += src[k + dy * SW + dx];
        blurred[k] = dist[k] / 3 > 3 ? s / 9 : Math.min(src[k], s / 9);
      }
  }

  const depthAt = (x: number, y: number): number => {
    // bilinear, on pixel centres
    const fx = Math.min(SW - 1, Math.max(0, x - 0.5));
    const fy = Math.min(SH - 1, Math.max(0, y - 0.5));
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(SW - 1, x0 + 1);
    const y1 = Math.min(SH - 1, y0 + 1);
    const tx = fx - x0;
    const ty = fy - y0;
    const v = (xx: number, yy: number) => blurred[yy * SW + xx];
    return (v(x0, y0) * (1 - tx) + v(x1, y0) * tx) * (1 - ty) + (v(x0, y1) * (1 - tx) + v(x1, y1) * tx) * ty;
  };

  const verts = (COLS + 1) * (ROWS + 1);
  const pos = new Float32Array(verts * 3);
  const uvF = new Float32Array(verts * 2);
  const uvB = new Float32Array(verts * 2);
  let maxDepth = 0;
  for (let j = 0; j <= ROWS; j++) {
    for (let i = 0; i <= COLS; i++) {
      const k = j * (COLS + 1) + i;
      const x = (i / COLS) * SW;
      const y = (j / ROWS) * SH;
      const z = (depthAt(x, y) * (GARMENT_W / SW)) / U;
      maxDepth = Math.max(maxDepth, z);
      pos[k * 3] = ((i / COLS) * GARMENT_W - GARMENT_W / 2) / U;
      pos[k * 3 + 1] = (GARMENT_H / 2 - (j / ROWS) * GARMENT_H) / U;
      pos[k * 3 + 2] = z;
      uvF[k * 2] = i / COLS;
      uvF[k * 2 + 1] = 1 - j / ROWS;
      uvB[k * 2] = 1 - i / COLS;
      uvB[k * 2 + 1] = 1 - j / ROWS;
    }
  }
  const idxF: number[] = [];
  const idxB: number[] = [];
  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < COLS; i++) {
      const a = j * (COLS + 1) + i;
      const b = a + 1;
      const c = a + COLS + 1;
      const d = c + 1;
      idxF.push(a, c, b, b, c, d);
      idxB.push(a, b, c, b, d, c);
    }
  }
  const posB = pos.slice();
  for (let k = 2; k < posB.length; k += 3) posB[k] = -posB[k];

  const disposables: Array<{ dispose(): void }> = [];
  const texture = (c: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    disposables.push(t);
    return t;
  };
  const geometry = (p: Float32Array, uv: Float32Array, idx: number[]) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    disposables.push(g);
    return g;
  };
  // fabric look: the flat-lay spans GARMENT_W / 20 inches, so tile the weave at that scale
  const inches = GARMENT_W / 20;
  const material = (map: THREE.Texture, side: THREE.Side) => {
    const normal = weaveNormal(fabric, inches, inches * (GARMENT_H / GARMENT_W));
    const m = new THREE.MeshPhysicalMaterial({
      map,
      side,
      alphaTest: 0.5,
      roughness: fabric.look.roughness,
      metalness: 0,
      normalMap: normal,
      normalScale: new THREE.Vector2(fabric.look.normalStrength, fabric.look.normalStrength).multiplyScalar(0.8),
      sheen: fabric.look.sheen,
      sheenRoughness: fabric.look.sheenRoughness,
      sheenColor: new THREE.Color('#ffffff').multiplyScalar(0.6),
      clearcoat: fabric.look.clearcoat ?? 0,
      clippingPlanes: [clip],
    });
    disposables.push(m, normal);
    return m;
  };

  const group = new THREE.Group();
  const gF = geometry(pos, uvF, idxF);
  const gB = geometry(posB, uvB, idxB);
  group.add(new THREE.Mesh(gF, material(texture(tex.front.outside), THREE.FrontSide)));
  group.add(new THREE.Mesh(gF, material(texture(tex.front.inside), THREE.BackSide)));
  group.add(new THREE.Mesh(gB, material(texture(tex.back.outside), THREE.FrontSide)));
  group.add(new THREE.Mesh(gB, material(texture(tex.back.inside), THREE.BackSide)));

  const bottom = (GARMENT_H / 2 - ((maxY + 1) / SH) * GARMENT_H) / U;
  const shadow = contactShadow(((maxHalf * 2) / SW) * (GARMENT_W / U) * 0.95, Math.max(0.6, maxDepth * 3.2));
  shadow.position.y = bottom - 0.12;
  disposables.push(shadow.geometry, shadow.material as THREE.Material, (shadow.material as THREE.MeshBasicMaterial).map!);
  group.add(shadow);

  // work in inches like the 3D models: 1 unit here = 100 studio px = 5 in
  group.scale.setScalar(5);
  group.updateMatrixWorld(true);
  const frame = new THREE.Box3().setFromObject(group);
  return { group, frame, dispose: () => disposables.forEach((d) => d.dispose()) };
}
