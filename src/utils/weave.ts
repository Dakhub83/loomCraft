import type { FabricDef, WeaveKind } from '../data/fabrics';
import { isDark as isDarkHex } from './color';

/* ================================================================================================
 * Weave patterns, independent of Three.js: the 3D viewer builds normal maps from `weaveHeight`, and the
 * 2D studio uses `weaveOverlay` (a shading tile laid over the flat drawing) and `fabricSwatch` (lit
 * thumbnails for the fabric picker). All tiles are seamless.
 * ============================================================================================== */

const frac = (x: number) => x - Math.floor(x);
/** Tileable value noise over the unit square with `n` cells. */
const tnoise = (x: number, y: number, n: number, seed = 0) => tileNoise(x * n, y * n, n, seed);
export function tileNoise(x: number, y: number, period: number, seed: number): number {
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
export function weaveHeight(w: WeaveKind, x: number, y: number): number {
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
    case 'performance': {
      // birdseye knit: a fine grid of tiny diamond dimples
      const n = 9;
      const fx = frac(x * n + (Math.floor(y * n) % 2 ? 0.5 : 0)) - 0.5;
      const fy = frac(y * n) - 0.5;
      const d = Math.abs(fx) + Math.abs(fy);
      return Math.min(1, 0.35 + d * 1.6) + 0.05 * tnoise(x, y, 24, 10);
    }
    case 'leather': {
      // pebble grain: soft rounded cells of uneven size, with fine creases between them
      const cells = 0.5 + 0.5 * tnoise(x, y, 10, 21);
      const fine = 0.5 + 0.5 * tnoise(x, y, 26, 22);
      const pebble = Math.pow(cells * 0.6 + fine * 0.4, 1.6);
      return 0.35 + 0.5 * pebble + 0.06 * tnoise(x, y, 64, 23);
    }
    case 'suede':
      // short velvety nap: soft, fine, directionless noise
      return 0.5 + 0.22 * tnoise(x, y, 32, 31) + 0.18 * tnoise(x, y, 64, 32) + 0.1 * tnoise(x, y, 12, 33);
    case 'foam':
      // moulded foam skin: almost smooth, faint orange-peel
      return 0.55 + 0.12 * tnoise(x, y, 16, 41) + 0.08 * tnoise(x, y, 40, 42);
    case 'mesh': {
      const n = 4;
      const fx = frac(x * n + (Math.floor(y * n) % 2 ? 0.5 : 0));
      const fy = frac(y * n);
      const d = Math.hypot(fx - 0.5, fy - 0.5);
      return Math.min(1, d * 2.2);
    }
  }
}


const S = 64;
const overlayCanvases = new Map<string, HTMLCanvasElement>();
const overlayUrls = new Map<string, string>();
const highlightUrls = new Map<string, string>();
const swatchCache = new Map<string, string>();

function heightTile(w: WeaveKind, size: number): Float32Array {
  const H = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) H[y * size + x] = weaveHeight(w, x / size, y / size);
  return H;
}

/** Black shading tile: alpha = cavity depth (plus the holes of a mesh). Cached per fabric. */
function overlayCanvas(f: FabricDef): HTMLCanvasElement {
  const hit = overlayCanvases.get(f.id);
  if (hit) return hit;
  const H = heightTile(f.look.weave, S);
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d')!;
  const d = x.createImageData(S, S);
  const k = 0.35 + f.look.normalStrength * 0.45;
  for (let i = 0; i < S * S; i++) {
    const h = H[i];
    // light from the left: cavities and the far side of each bump read darker
    const dx = H[i % S === S - 1 ? i - S + 1 : i + 1] - h;
    const shade = Math.min(1, Math.max(0, (1 - h) * k + Math.max(0, dx) * 1.5));
    d.data[i * 4 + 3] = f.look.holes && h < 0.42 ? 200 : Math.round(shade * 255);
  }
  x.putImageData(d, 0, 0);
  overlayCanvases.set(f.id, c);
  return c;
}

/** The shading tile as a PNG data URL, laid over the garment drawing as an SVG pattern. */
export function weaveOverlay(f: FabricDef): string {
  let url = overlayUrls.get(f.id);
  if (!url) {
    url = overlayCanvas(f).toDataURL('image/png');
    overlayUrls.set(f.id, url);
  }
  return url;
}

/** White version (alpha = raised parts): makes the weave readable on dark garments. */
function highlightCanvas(f: FabricDef): HTMLCanvasElement {
  const src = overlayCanvas(f);
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d')!;
  const d = src.getContext('2d')!.getImageData(0, 0, S, S);
  for (let i = 0; i < S * S; i++) {
    const a = d.data[i * 4 + 3];
    d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = 255;
    d.data[i * 4 + 3] = f.look.holes && a === 200 ? 0 : 255 - a;
  }
  x.putImageData(d, 0, 0);
  return c;
}

export function weaveHighlight(f: FabricDef): string {
  let url = highlightUrls.get(f.id);
  if (!url) {
    url = highlightCanvas(f).toDataURL('image/png');
    highlightUrls.set(f.id, url);
  }
  return url;
}

/** A small lit swatch of the fabric in a color (for the fabric picker). */
export function fabricSwatch(f: FabricDef, hex: string, px = 48): string {
  const key = `${f.id}|${hex}|${px}`;
  const hit = swatchCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const x = c.getContext('2d')!;
  x.fillStyle = hex;
  x.fillRect(0, 0, px, px);
  const dark = isDarkHex(hex);
  const tile = overlayCanvas(f);
  const hi = dark ? highlightCanvas(f) : null;
  const n = 2; // tiles across, so the pattern reads at thumbnail size
  for (let ty = 0; ty < n; ty++)
    for (let tx = 0; tx < n; tx++) {
      x.globalAlpha = dark ? 0.5 : 1;
      x.drawImage(tile, (tx * px) / n, (ty * px) / n, px / n, px / n);
      if (hi) {
        x.globalAlpha = 0.28;
        x.drawImage(hi, (tx * px) / n, (ty * px) / n, px / n, px / n);
      }
    }
  x.globalAlpha = 1;
  // soft highlight → shade, like light falling on cloth
  const g = x.createLinearGradient(0, 0, px, px);
  g.addColorStop(0, `rgba(255,255,255,${0.12 + f.look.sheen * 0.12})`);
  g.addColorStop(0.55, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.22)');
  x.fillStyle = g;
  x.fillRect(0, 0, px, px);
  const url = c.toDataURL('image/png');
  swatchCache.set(key, url);
  return url;
}
