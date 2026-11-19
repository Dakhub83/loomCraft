import * as THREE from 'three';

/* ================================================================================================
 * Procedural, tileable canvas textures and the studio material presets. Surfaces carry UVs in
 * metres, so `texture.repeat = 1 / tileSizeInMetres` puts every pattern at real-world scale.
 * ============================================================================================== */

export type SurfaceId = 'clay' | 'fiberglass' | 'graphite' | 'linen';

export const SURFACES: Array<{ id: SurfaceId; label: string; swatch: string; note: string }> = [
  { id: 'clay', label: 'Matte Sculpted Clay', swatch: '#b9ab9b', note: 'Soft matte, fine sculpting grain' },
  { id: 'fiberglass', label: 'Satin Studio Fiberglass', swatch: '#efeae2', note: 'Off-white satin lacquer' },
  { id: 'graphite', label: 'Dark Graphite Carbon', swatch: '#2b2d31', note: 'Carbon weave under a gloss coat' },
  { id: 'linen', label: "Warm Tailor's Linen", swatch: '#cbb48f', note: 'Pinnable linen cover, walnut cap' },
];

/** Deterministic hash noise. */
function hash(x: number, y: number, seed: number) {
  const h = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return h - Math.floor(h);
}

/** Tileable value noise on an integer lattice of `period` cells. */
function valueNoise(x: number, y: number, period: number, seed: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = (a: number, b: number) => hash(((a % period) + period) % period, ((b % period) + period) % period, seed);
  const a = w(xi, yi);
  const b = w(xi + 1, yi);
  const c = w(xi, yi + 1);
  const d = w(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function canvasTexture(size: number, paint: (img: ImageData) => void, color = false): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  paint(img);
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}

function grey(img: ImageData, fn: (x: number, y: number) => number) {
  const S = img.width;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const v = Math.round(Math.min(1, Math.max(0, fn(x / S, y / S))) * 255);
      const k = (y * S + x) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = v;
      img.data[k + 3] = 255;
    }
}

const fbm = (x: number, y: number, period: number, seed: number) =>
  valueNoise(x * period, y * period, period, seed) * 0.55 +
  valueNoise(x * period * 2, y * period * 2, period * 2, seed + 1) * 0.28 +
  valueNoise(x * period * 4, y * period * 4, period * 4, seed + 2) * 0.17;

export type PatternId = 'grain' | 'linen' | 'carbon' | 'knit' | 'fleece' | 'rib' | 'brushed' | 'wood';

const cache = new Map<PatternId, THREE.CanvasTexture>();

/** Shared pattern textures (height maps unless noted). Owned by the module; see `disposePatterns`. */
export function pattern(id: PatternId): THREE.CanvasTexture {
  const hit = cache.get(id);
  if (hit) return hit;
  let t: THREE.CanvasTexture;
  switch (id) {
    case 'grain':
      t = canvasTexture(256, (img) => grey(img, (x, y) => 0.5 + (fbm(x, y, 16, 3) - 0.5) * 0.9));
      break;
    case 'linen':
      t = canvasTexture(256, (img) =>
        grey(img, (x, y) => {
          const warp = 0.5 + 0.5 * Math.sin(x * Math.PI * 2 * 24 + valueNoise(x * 8, y * 64, 8, 5) * 1.5);
          const weft = 0.5 + 0.5 * Math.sin(y * Math.PI * 2 * 24 + valueNoise(x * 64, y * 8, 64, 6) * 1.5);
          const over = (Math.floor(x * 24) + Math.floor(y * 24)) % 2 ? warp : weft;
          const slub = valueNoise(x * 4, y * 32, 4, 7) * 0.35;
          return 0.25 + over * 0.55 + slub;
        }),
      );
      break;
    case 'carbon':
      t = canvasTexture(256, (img) =>
        grey(img, (x, y) => {
          const n = 8;
          const cx = (x * n) % 1;
          const cy = (y * n) % 1;
          const horiz = (Math.floor(x * n) + Math.floor(y * n)) % 2 === 0;
          const tow = horiz ? Math.sin(cy * Math.PI) : Math.sin(cx * Math.PI);
          const fib = horiz ? 0.5 + 0.5 * Math.sin(cy * Math.PI * 2 * 9) : 0.5 + 0.5 * Math.sin(cx * Math.PI * 2 * 9);
          return 0.2 + tow * 0.6 + fib * 0.12;
        }),
      );
      break;
    case 'knit':
      t = canvasTexture(256, (img) =>
        grey(img, (x, y) => {
          const cols = 32;
          const rows = 24;
          const cx = (x * cols) % 1;
          const cy = (y * rows + (Math.floor(x * cols) % 2) * 0.5) % 1;
          const v = Math.abs(cx - 0.5) * 2;
          const leg = Math.exp(-((cx - 0.5 - (cy - 0.5) * 0.6) ** 2) / 0.03) + Math.exp(-((cx - 0.5 + (cy - 0.5) * 0.6) ** 2) / 0.03);
          return 0.15 + Math.min(1, leg) * 0.7 * (1 - v * 0.3) + valueNoise(x * 32, y * 32, 32, 9) * 0.1;
        }),
      );
      break;
    case 'fleece':
      t = canvasTexture(256, (img) => grey(img, (x, y) => 0.45 + (fbm(x, y, 32, 11) - 0.5) * 0.9 + (hash(Math.floor(x * 256), Math.floor(y * 256), 12) - 0.5) * 0.12));
      break;
    case 'rib':
      t = canvasTexture(128, (img) => grey(img, (x) => 0.5 + 0.5 * Math.cos(x * Math.PI * 2 * 8)));
      break;
    case 'brushed':
      t = canvasTexture(512, (img) =>
        grey(img, (x, y) => {
          const line = hash(Math.floor(y * 512), 0, 21);
          const streak = valueNoise(x * 6, y * 512, 6, 22);
          return 0.3 + line * 0.25 + streak * 0.25;
        }),
      );
      break;
    case 'wood':
      t = canvasTexture(
        512,
        (img) => {
          const S = img.width;
          for (let y = 0; y < S; y++)
            for (let x = 0; x < S; x++) {
              const u = x / S;
              const v = y / S;
              const ring = 0.5 + 0.5 * Math.sin((u * 18 + fbm(u, v, 4, 31) * 2.4) * Math.PI * 2);
              const fine = valueNoise(u * 128, v * 8, 128, 32) * 0.25;
              const k = (y * S + x) * 4;
              const dark = ring * 0.55 + fine;
              img.data[k] = 92 - dark * 38;
              img.data[k + 1] = 60 - dark * 26;
              img.data[k + 2] = 40 - dark * 18;
              img.data[k + 3] = 255;
            }
        },
        true,
      );
      break;
  }
  cache.set(id, t);
  return t;
}

/** A texture view of a shared pattern with its own tiling (repeat in tiles per metre). */
export function tiled(id: PatternId, tileMetres: number): THREE.Texture {
  const t = pattern(id).clone();
  t.repeat.set(1 / tileMetres, 1 / tileMetres);
  t.needsUpdate = true;
  return t;
}

export function disposePatterns() {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}

/** The mannequin body material for a surface preset. */
export function mannequinMaterial(id: SurfaceId): THREE.MeshPhysicalMaterial {
  switch (id) {
    case 'clay':
      return new THREE.MeshPhysicalMaterial({
        name: 'clay',
        color: '#b9ab9b',
        roughness: 0.9,
        sheen: 0.25,
        sheenRoughness: 0.8,
        sheenColor: new THREE.Color('#fff4e8'),
        bumpMap: tiled('grain', 0.06),
        bumpScale: 0.6,
      });
    case 'fiberglass':
      return new THREE.MeshPhysicalMaterial({
        name: 'fiberglass',
        color: '#efeae2',
        roughness: 0.42,
        clearcoat: 0.55,
        clearcoatRoughness: 0.28,
        sheen: 0.05,
        bumpMap: tiled('grain', 0.25),
        bumpScale: 0.08,
      });
    case 'graphite':
      return new THREE.MeshPhysicalMaterial({
        name: 'graphite',
        color: '#2b2d31',
        roughness: 0.5,
        metalness: 0.2,
        clearcoat: 1,
        clearcoatRoughness: 0.12,
        bumpMap: tiled('carbon', 0.024),
        bumpScale: 0.9,
      });
    case 'linen':
      return new THREE.MeshPhysicalMaterial({
        name: 'linen',
        color: '#cbb48f',
        roughness: 0.95,
        sheen: 0.6,
        sheenRoughness: 0.5,
        sheenColor: new THREE.Color('#fff1d6'),
        bumpMap: tiled('linen', 0.012),
        bumpScale: 0.9,
      });
  }
}

/** Brushed steel for the stand: circular brushing via anisotropy along the lathe's u direction. */
export function brushedMetal(): THREE.MeshPhysicalMaterial {
  const rough = tiled('brushed', 1);
  rough.repeat.set(1, 1);
  return new THREE.MeshPhysicalMaterial({
    name: 'brushed-steel',
    color: '#a9adb4',
    metalness: 1,
    roughness: 0.4,
    roughnessMap: rough,
    anisotropy: 0.75,
    clearcoat: 0.15,
    clearcoatRoughness: 0.3,
  });
}

export function walnut(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ name: 'walnut', map: tiled('wood', 0.12), roughness: 0.55, clearcoat: 0.6, clearcoatRoughness: 0.35 });
}

/** Soft radial falloff used as a contact shadow under the stand. */
export function contactShadowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.28)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A neutral sample graphic, so placement can be judged before uploading artwork. */
export function sampleLogoCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 512, 512);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 22;
  ctx.beginPath();
  ctx.arc(256, 256, 200, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 120px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('LOGO', 256, 236);
  ctx.font = '600 44px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.fillText('PLACEMENT', 256, 330);
  return c;
}
