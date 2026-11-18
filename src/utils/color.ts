export interface RGB {
  r: number;
  g: number;
  b: number;
}

export function normalizeHex(input: string): string | null {
  let h = input.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.split('').map((c) => c + c).join('');
  return /^[0-9a-f]{6}$/i.test(h) ? `#${h.toUpperCase()}` : null;
}

export function hexToRgb(hex: string): RGB {
  const h = (normalizeHex(hex) ?? '#000000').slice(1);
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

export function rgbToHex({ r, g, b }: RGB): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

/** Mix toward white (amt > 0) or black (amt < 0). amt in [-1, 1]. */
export function tone(hex: string, amt: number): string {
  const { r, g, b } = hexToRgb(hex);
  const t = amt >= 0 ? 255 : 0;
  const p = Math.abs(amt);
  return rgbToHex({ r: r + (t - r) * p, g: g + (t - g) * p, b: b + (t - b) * p });
}

/** Relative luminance (WCAG), 0..1. */
export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export const isDark = (hex: string) => luminance(hex) < 0.18;

/** Perceptually weighted RGB distance ("redmean"). */
export function colorDistance(a: RGB, b: RGB): number {
  const rm = (a.r + b.r) / 2;
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

/**
 * Approximate sRGB references for common Pantone® Solid Coated colors.
 * These are on-screen approximations for communicating intent; always confirm against a physical guide.
 */
const PANTONE: Array<[string, string]> = [
  ['Black C', '#2D2926'], ['Black 6 C', '#101820'], ['Black 7 C', '#3D3935'], ['426 C', '#25282A'],
  ['Cool Gray 1 C', '#D9D9D6'], ['Cool Gray 5 C', '#B1B3B3'], ['Cool Gray 9 C', '#75787B'], ['Cool Gray 11 C', '#53565A'],
  ['Warm Gray 1 C', '#D7D2CB'], ['Warm Gray 7 C', '#968C83'], ['Warm Gray 11 C', '#6E6259'],
  ['Warm Red C', '#F9423A'], ['485 C', '#DA291C'], ['186 C', '#C8102E'], ['199 C', '#D50032'], ['1795 C', '#D22630'],
  ['201 C', '#9D2235'], ['1817 C', '#643335'], ['021 C', '#FE5000'], ['151 C', '#FF8200'], ['1505 C', '#FF6900'],
  ['Yellow C', '#FEDD00'], ['109 C', '#FFD100'], ['116 C', '#FFCD00'], ['123 C', '#FFC72C'], ['1235 C', '#FFB81C'],
  ['7406 C', '#F1C400'], ['375 C', '#97D700'], ['802 C', '#44D62C'], ['354 C', '#00B140'], ['347 C', '#009A44'],
  ['356 C', '#007A33'], ['343 C', '#115740'], ['3435 C', '#154734'], ['Process Blue C', '#0085CA'], ['299 C', '#00A3E0'],
  ['2925 C', '#009CDE'], ['297 C', '#71C5E8'], ['277 C', '#ABCAE9'], ['300 C', '#005EB8'], ['293 C', '#003DA5'],
  ['286 C', '#0033A0'], ['Reflex Blue C', '#001489'], ['2767 C', '#13294B'], ['282 C', '#041E42'], ['289 C', '#0C2340'],
  ['7545 C', '#425563'], ['7546 C', '#253746'], ['2685 C', '#330072'], ['268 C', '#582C83'], ['2587 C', '#8246AF'],
  ['Purple C', '#BB29BB'], ['Rhodamine Red C', '#E10098'], ['213 C', '#E31C79'], ['219 C', '#DA1884'], ['189 C', '#F8A3BC'],
  ['7422 C', '#F4CDD4'], ['4625 C', '#4F2C1D'], ['469 C', '#693F23'], ['7531 C', '#7A6855'], ['7503 C', '#A89968'],
  ['468 C', '#DDCBA4'], ['7527 C', '#D6D2C4'],
];

export function nearestPantone(hex: string): { name: string; hex: string } {
  const target = hexToRgb(hex);
  // Pure/near white has no Solid Coated equivalent – call it out explicitly.
  if (luminance(hex) > 0.92) return { name: 'White (ink)', hex: '#FFFFFF' };
  let best = PANTONE[0];
  let bestD = Infinity;
  for (const entry of PANTONE) {
    const d = colorDistance(target, hexToRgb(entry[1]));
    if (d < bestD) {
      bestD = d;
      best = entry;
    }
  }
  return { name: `PANTONE ${best[0]}`, hex: best[1] };
}

/** Dominant opaque colors in a rendered canvas, most frequent first. */
export function extractPalette(canvas: HTMLCanvasElement, max = 6): string[] {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || canvas.width === 0 || canvas.height === 0) return [];
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const step = Math.max(1, Math.floor(Math.sqrt((canvas.width * canvas.height) / 40000))) * 4;
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += step) {
    if (data[i + 3] < 200) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.n++;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
    } else buckets.set(key, { n: 1, r, g, b });
  }
  const sorted = [...buckets.values()].sort((a, b) => b.n - a.n);
  const total = sorted.reduce((s, v) => s + v.n, 0);
  const picked: RGB[] = [];
  for (const b of sorted) {
    if (b.n / total < 0.004) break;
    const c = { r: b.r / b.n, g: b.g / b.n, b: b.b / b.n };
    if (picked.every((p) => colorDistance(p, c) > 60)) picked.push(c);
    if (picked.length >= max) break;
  }
  return picked.map(rgbToHex);
}

export const GARMENT_SWATCHES: Array<{ name: string; hex: string }> = [
  { name: 'Jet Black', hex: '#141416' },
  { name: 'Bone', hex: '#E9E2D3' },
  { name: 'Optic White', hex: '#F6F6F3' },
  { name: 'Heather Grey', hex: '#A7A9AC' },
  { name: 'Washed Charcoal', hex: '#45464B' },
  { name: 'Navy', hex: '#1E2A44' },
  { name: 'Forest', hex: '#2F4A3A' },
  { name: 'Olive', hex: '#6B6A45' },
  { name: 'Sand', hex: '#C9B48F' },
  { name: 'Clay', hex: '#A8573D' },
  { name: 'Burgundy', hex: '#5E1F2B' },
  { name: 'Cobalt', hex: '#2B55B8' },
];
