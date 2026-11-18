import * as THREE from 'three';
import type { FabricDef, WeaveKind } from '../data/fabrics';

/* ================================================================================================
 * Fabric looks: a procedural height field per weave → tangent-space normal map, a slub/heather color
 * map, and (for mesh) a hole alpha map. All tiles are seamless; materials are MeshPhysicalMaterial with
 * sheen, which gives cloth its soft rim light. Maps are cached per weave and shared.
 * ============================================================================================== */

const S = 256; // tile resolution

const frac = (x: number) => x - Math.floor(x);
/** Tileable value noise over the unit square with `n` cells. */
const tnoise = (x: number, y: number, n: number, seed = 0) => tileNoise(x * n, y * n, n, seed);
function tileNoise(x: number, y: number, period: number, seed: number): number {
  const h = (i: number, j: number) => {
    const ii = ((i % period) + period) % period;
    const jj = ((j % period) + period) % period;
    const s = Math.sin(ii * 127.1 + jj * 311.7 + seed * 74.7) * 43758.5453;
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

/** Height in [0, 1] for a weave at tile coordinates (x, y) in [0, 1). */
function height(w: WeaveKind, x: number, y: number): number {
  switch (w) {
    case 'jersey':
    case 'terry': {
      // knit face: columns (wales) of V-shaped loops
      const wales = w === 'terry' ? 10 : 8;
      const courses = w === 'terry' ? 14 : 11;
      const fx = frac(x * wales);
      const fy = frac(y * courses);
      const lean = fx < 0.5 ? fx * 2 : (1 - fx) * 2; // 0 at wale edge, 1 at the centre
      const loop = Math.sin(Math.PI * frac(fy + (fx < 0.5 ? 0.18 : -0.18) * (1 - lean)));
      return 0.15 + 0.6 * lean * loop + 0.08 * tnoise(x, y, 16, 3);
    }
    case 'pique': {
      // honeycomb: raised cells with sunken borders
      const n = 7;
      const qx = x * n;
      const qy = y * n * 1.15;
      const row = Math.floor(qy);
      const fx = frac(qx + (row % 2 ? 0.5 : 0));
      const fy = frac(qy);
      const d = Math.hypot(fx - 0.5, (fy - 0.5) * 1.15);
      return Math.max(0, 1 - d * 2.1) + 0.06 * tnoise(x, y, 16, 5);
    }
    case 'fleece':
      return 0.5 + 0.3 * tnoise(x, y, 6, 1) + 0.18 * tnoise(x, y, 24, 2) + 0.1 * tnoise(x, y, 64, 9);
    case 'rib': {
      const ribs = 6;
      return 0.5 + 0.5 * Math.cos(Math.PI * 2 * x * ribs) + 0.05 * tnoise(x, y, 24, 4);
    }
    case 'nylon': {
      // ripstop grid, very fine
      const g = (t: number) => Math.max(0, 1 - Math.abs(frac(t * 4) - 0.5) * 30);
      return 0.4 + 0.3 * Math.max(g(x), g(y)) + 0.08 * tnoise(x, y, 32, 6);
    }
    case 'twill':
    case 'denim': {
      const lines = w === 'denim' ? 9 : 11;
      const t = 0.5 + 0.5 * Math.sin(Math.PI * 2 * (x + y) * lines);
      return t * 0.85 + 0.15 * tnoise(x, y, w === 'denim' ? 12 : 24, 7);
    }
    case 'canvas': {
      const n = 10;
      const a = Math.sin(Math.PI * 2 * x * n);
      const b = Math.sin(Math.PI * 2 * y * n);
      return 0.5 + 0.35 * a * b + 0.15 * Math.abs(a) * (Math.floor(y * n * 2) % 2 ? 1 : -1) * 0.5 + 0.08 * tnoise(x, y, 20, 8);
    }
    case 'mesh': {
      const n = 4;
      const fx = frac(x * n + (Math.floor(y * n) % 2 ? 0.5 : 0));
      const fy = frac(y * n);
      const d = Math.hypot(fx - 0.5, fy - 0.5);
      return Math.min(1, d * 2.2);
    }
  }
}

interface WeaveMaps {
  normal: THREE.Texture;
  color: THREE.Texture;
  alpha?: THREE.Texture;
}

const cache = new Map<string, WeaveMaps>();

function canvasTexture(c: HTMLCanvasElement, srgb: boolean): THREE.Texture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function weaveMaps(f: FabricDef): WeaveMaps {
  const key = `${f.look.weave}:${f.look.mottle}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const w = f.look.weave;
  const H = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) H[y * S + x] = height(w, x / S, y / S);

  // normal map (Sobel, wrapped)
  const nc = document.createElement('canvas');
  nc.width = nc.height = S;
  const nx = nc.getContext('2d')!;
  const nd = nx.createImageData(S, S);
  const at = (x: number, y: number) => H[((y + S) % S) * S + ((x + S) % S)];
  const strength = 3;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const k = (y * S + x) * 4;
      nd.data[k] = ((-dx / len) * 0.5 + 0.5) * 255;
      nd.data[k + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      nd.data[k + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      nd.data[k + 3] = 255;
    }
  nx.putImageData(nd, 0, 0);

  // color map: near-white with slub / heather variation, multiplied by the garment color
  const cc = document.createElement('canvas');
  cc.width = cc.height = S;
  const cx = cc.getContext('2d')!;
  const cd = cx.createImageData(S, S);
  const m = f.look.mottle;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const k = (y * S + x) * 4;
      let v = 1 - m * (0.5 + 0.5 * tileNoise((x / S) * 3, (y / S) * 18, 3, 11)) - m * 0.6 * (0.5 + 0.5 * tileNoise((x / S) * 32, (y / S) * 32, 32, 12));
      v -= 0.06 * (1 - H[y * S + x]) * (f.look.normalStrength > 0.5 ? 1 : 0.5); // cavities read slightly darker
      if (w === 'denim') {
        // white weft peeking through the indigo warp
        const weft = 0.5 + 0.5 * Math.sin(Math.PI * 2 * ((x - y) / S) * 9);
        v = v * (0.82 + 0.18 * weft) + 0.12 * weft;
      }
      const b = Math.max(0, Math.min(1, v)) * 255;
      cd.data[k] = cd.data[k + 1] = cd.data[k + 2] = b;
      cd.data[k + 3] = 255;
    }
  cx.putImageData(cd, 0, 0);

  let alpha: THREE.Texture | undefined;
  if (f.look.holes) {
    const ac = document.createElement('canvas');
    ac.width = ac.height = S;
    const ax = ac.getContext('2d')!;
    const ad = ax.createImageData(S, S);
    for (let k = 0; k < S * S; k++) {
      const v = H[k] < 0.42 ? 0 : 255;
      ad.data[k * 4] = ad.data[k * 4 + 1] = ad.data[k * 4 + 2] = v;
      ad.data[k * 4 + 3] = 255;
    }
    ax.putImageData(ad, 0, 0);
    alpha = canvasTexture(ac, false);
  }

  const maps = { normal: canvasTexture(nc, false), color: canvasTexture(cc, true), alpha };
  cache.set(key, maps);
  return maps;
}

export interface FabricMaterialOpts {
  side?: THREE.Side;
  /** Interior face: flatter, a touch darker (or lighter on very dark garments). */
  inside?: boolean;
  clip?: THREE.Plane[];
  /** Overrides the fabric's weave (e.g. rib trims on a jersey tee). */
  tileScale?: number;
}

/** A cloth material. The color maps tile per inch via UVs measured in inches. */
export function fabricMaterial(f: FabricDef, hex: string, o: FabricMaterialOpts = {}): THREE.MeshPhysicalMaterial {
  const maps = weaveMaps(f);
  const repeat = 1 / (f.look.tileIn * (o.tileScale ?? 1));
  const clone = (t: THREE.Texture) => {
    const c = t.clone();
    c.repeat.set(repeat, repeat);
    c.needsUpdate = true;
    return c;
  };
  const color = new THREE.Color(hex);
  if (o.inside) {
    const hsl = { h: 0, s: 0, l: 0 };
    color.getHSL(hsl);
    color.setHSL(hsl.h, hsl.s * 0.85, hsl.l < 0.12 ? hsl.l + 0.06 : hsl.l * 0.86);
  }
  const m = new THREE.MeshPhysicalMaterial({
    color,
    map: clone(maps.color),
    normalMap: clone(maps.normal),
    normalScale: new THREE.Vector2(f.look.normalStrength, f.look.normalStrength).multiplyScalar(o.inside ? 0.6 : 1),
    roughness: o.inside ? Math.min(1, f.look.roughness + 0.05) : f.look.roughness,
    metalness: 0,
    sheen: o.inside ? f.look.sheen * 0.5 : f.look.sheen,
    sheenRoughness: f.look.sheenRoughness,
    sheenColor: new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), 0.55),
    clearcoat: o.inside ? 0 : f.look.clearcoat ?? 0,
    clearcoatRoughness: 0.35,
    side: o.side ?? THREE.FrontSide,
    clippingPlanes: o.clip ?? [],
  });
  if (maps.alpha) {
    m.alphaMap = clone(maps.alpha);
    m.alphaTest = 0.5;
  }
  return m;
}

/** The weave's normal map tiled over a surface whose UVs run 0–1 across `wIn` × `hIn` inches. */
export function weaveNormal(f: FabricDef, wIn: number, hIn: number): THREE.Texture {
  const t = weaveMaps(f).normal.clone();
  t.repeat.set(wIn / f.look.tileIn, hIn / f.look.tileIn);
  t.needsUpdate = true;
  return t;
}

/** Disposes the textures a fabric material cloned (the cached sources stay). */
export function disposeFabricMaterial(m: THREE.MeshPhysicalMaterial) {
  m.map?.dispose();
  m.normalMap?.dispose();
  m.alphaMap?.dispose();
  m.dispose();
}
