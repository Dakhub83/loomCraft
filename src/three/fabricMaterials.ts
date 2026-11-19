import * as THREE from 'three';
import type { FabricDef } from '../data/fabrics';
import { tileNoise, weaveHeight as height } from '../utils/weave';

/* ================================================================================================
 * Fabric looks: a procedural height field per weave → tangent-space normal map, a slub/heather color
 * map, and (for mesh) a hole alpha map. All tiles are seamless; materials are MeshPhysicalMaterial with
 * sheen, which gives cloth its soft rim light. Maps are cached per weave and shared.
 * ============================================================================================== */

const S = 256; // tile resolution

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
