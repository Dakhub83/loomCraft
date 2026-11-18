import { GARMENT_SWATCHES, colorDistance, hexToRgb, isDark, luminance, nearestPantone, normalizeHex, rgbToHex } from './color';

/* ------------------------------------------------------------------ color math */

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Print-legibility rating. Garment prints are viewed at a distance, so 3:1 is the practical floor. */
export function contrastRating(ratio: number): { label: string; tone: 'great' | 'good' | 'ok' | 'low' } {
  if (ratio >= 7) return { label: 'Excellent', tone: 'great' };
  if (ratio >= 4.5) return { label: 'Strong', tone: 'good' };
  if (ratio >= 3) return { label: 'Readable', tone: 'ok' };
  return { label: 'Low', tone: 'low' };
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const { r, g, b } = hexToRgb(hex);
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  h *= 60;
  return { h, s, l };
}

export function hslToHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbToHex({ r: f(0) * 255, g: f(8) * 255, b: f(4) * 255 });
}

const hueGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/** Closest named garment swatch, or a plain description of the color. */
export function describeColor(hex: string): string {
  let best = GARMENT_SWATCHES[0];
  let bestD = Infinity;
  for (const sw of GARMENT_SWATCHES) {
    const d = colorDistance(hexToRgb(hex), hexToRgb(sw.hex));
    if (d < bestD) {
      bestD = d;
      best = sw;
    }
  }
  if (bestD < 90) return best.name.toLowerCase();
  const { l, s } = hexToHsl(hex);
  return `${l < 0.25 ? 'dark ' : l > 0.75 ? 'light ' : ''}${s < 0.15 ? 'neutral' : 'colored'} fabric`;
}

/* ------------------------------------------------------------------ ink library */

type Technique = 'Screen print' | 'Puff print' | 'Water-based / discharge' | 'Embroidery' | 'Tonal embroidery' | 'Metallic / foil' | 'DTG';

interface Ink {
  name: string;
  hex: string;
  /** Techniques this ink is commonly run with, best first. */
  techniques: Technique[];
}

/** Common streetwear production inks / thread colors (on-screen approximations). */
const INKS: Ink[] = [
  { name: 'Optic White', hex: '#F6F6F3', techniques: ['Screen print', 'Puff print', 'Embroidery'] },
  { name: 'Cream', hex: '#EDE3CC', techniques: ['Puff print', 'Screen print', 'Embroidery'] },
  { name: 'Bone', hex: '#D9CFB8', techniques: ['Water-based / discharge', 'Screen print'] },
  { name: 'Jet Black', hex: '#141416', techniques: ['Screen print', 'Embroidery'] },
  { name: 'Charcoal', hex: '#3A3B40', techniques: ['Screen print', 'Tonal embroidery'] },
  { name: 'Athletic Gold', hex: '#F2B33D', techniques: ['Screen print', 'Embroidery'] },
  { name: 'Safety Orange', hex: '#FF6A13', techniques: ['Screen print'] },
  { name: 'Varsity Red', hex: '#C8102E', techniques: ['Screen print', 'Embroidery'] },
  { name: 'Hot Pink', hex: '#FF4FA3', techniques: ['Screen print', 'Puff print'] },
  { name: 'Neon Lime', hex: '#C6F432', techniques: ['Screen print'] },
  { name: 'Kelly Green', hex: '#1F8A4C', techniques: ['Screen print', 'Embroidery'] },
  { name: 'Royal Blue', hex: '#1F4FB5', techniques: ['Screen print', 'Embroidery'] },
  { name: 'Baby Blue', hex: '#A9CBEA', techniques: ['Puff print', 'Screen print'] },
  { name: 'Lilac', hex: '#C9B6E4', techniques: ['Puff print', 'Screen print'] },
  { name: 'Navy', hex: '#1E2A44', techniques: ['Screen print', 'Embroidery'] },
  { name: 'Forest', hex: '#2F4A3A', techniques: ['Screen print', 'Embroidery'] },
  { name: 'Burgundy', hex: '#6D1F2F', techniques: ['Screen print', 'Embroidery'] },
  { name: 'Chrome Silver', hex: '#C0C3C7', techniques: ['Metallic / foil'] },
  { name: 'Metallic Gold', hex: '#C9A54B', techniques: ['Metallic / foil', 'Embroidery'] },
];

/* ------------------------------------------------------------------ suggestions */

export interface InkSuggestion {
  key: string;
  group: 'High contrast' | 'Tonal' | 'Accent' | 'Vintage';
  name: string;
  hex: string;
  pantone: string;
  ratio: number;
  technique: Technique;
  why: string;
}

/**
 * Ink pairings for a garment color, ranked by legibility (WCAG contrast) and color relationship:
 * the strongest-contrast inks, a tonal option, a complementary accent, and a faded vintage ink.
 */
export function suggestInks(garmentHex: string): InkSuggestion[] {
  const g = normalizeHex(garmentHex) ?? '#141416';
  const dark = isDark(g);
  const garmentHsl = hexToHsl(g);
  const fabric = describeColor(g);
  const out: InkSuggestion[] = [];
  const make = (group: InkSuggestion['group'], name: string, hex: string, technique: Technique, why: string): InkSuggestion => ({
    key: `${group}-${hex}`,
    group,
    name,
    hex,
    pantone: nearestPantone(hex).name,
    ratio: contrastRatio(hex, g),
    technique,
    why,
  });

  // 1 · highest contrast (skip near-duplicates of each other)
  const ranked = INKS.map((ink) => ({ ink, ratio: contrastRatio(ink.hex, g) }))
    .filter((x) => colorDistance(hexToRgb(x.ink.hex), hexToRgb(g)) > 80)
    .sort((a, b) => b.ratio - a.ratio);
  const picked: Ink[] = [];
  for (const { ink } of ranked) {
    if (picked.some((p) => colorDistance(hexToRgb(p.hex), hexToRgb(ink.hex)) < 60)) continue;
    picked.push(ink);
    if (picked.length === 3) break;
  }
  picked.forEach((ink, i) => {
    // Cream/light inks on dark fabric read best as puff; everything else as a clean screen print.
    const technique: Technique = dark && i === 0 && ink.techniques.includes('Puff print') ? 'Puff print' : ink.techniques[0];
    out.push(
      make(
        'High contrast',
        ink.name,
        ink.hex,
        technique,
        `${ink.name} ${technique.toLowerCase()} on ${fabric}${dark && technique !== 'Embroidery' ? ' — needs a white underbase for screen print' : ''}.`,
      ),
    );
  });

  // 2 · tonal: same hue, shifted lightness – quiet, premium
  const tonalL = dark ? Math.min(0.85, garmentHsl.l + 0.3) : Math.max(0.12, garmentHsl.l - 0.32);
  const tonal = hslToHex(garmentHsl.h, Math.min(1, garmentHsl.s * 0.9), tonalL);
  out.push(make('Tonal', 'Tonal shade', tonal, 'Tonal embroidery', `Same hue as the ${fabric}, ${dark ? 'lifted' : 'deepened'} for a subtle, premium tone-on-tone finish.`));

  // 3 · complementary accent: saturated ink closest to the opposite hue that still reads
  if (garmentHsl.s > 0.12) {
    const opposite = (garmentHsl.h + 180) % 360;
    const accent = INKS.filter((i) => hexToHsl(i.hex).s > 0.35 && contrastRatio(i.hex, g) >= 2.2).sort(
      (a, b) => hueGap(hexToHsl(a.hex).h, opposite) - hueGap(hexToHsl(b.hex).h, opposite),
    )[0];
    if (accent) out.push(make('Accent', accent.name, accent.hex, accent.techniques[0], `Complementary to the ${fabric}: a single accent ink (hits, outlines, small logos) that pops without clashing.`));
  } else {
    const accent = INKS.find((i) => i.name === (dark ? 'Safety Orange' : 'Varsity Red'))!;
    out.push(make('Accent', accent.name, accent.hex, 'Screen print', `Neutral fabric takes any accent — ${accent.name.toLowerCase()} is a classic single-hit pop.`));
  }

  // 4 · vintage: ink blended toward the fabric, as discharge / water-based prints wear in
  const base = dark ? '#EDE3CC' : '#2A2A2E';
  const a = hexToRgb(base);
  const b = hexToRgb(g);
  const mix = 0.28;
  const faded = rgbToHex({ r: a.r + (b.r - a.r) * mix, g: a.g + (b.g - a.g) * mix, b: a.b + (b.b - a.b) * mix });
  out.push(make('Vintage', dark ? 'Faded cream' : 'Washed charcoal', faded, 'Water-based / discharge', `Soft-hand ${dark ? 'discharge' : 'water-based'} ink that sinks into the ${fabric} for a worn-in, vintage look.`));

  return out;
}

/** Distinct ink colors in a serialized view (text + vector fills/strokes). Raster images are counted separately. */
export function inksInJSON(json: unknown): { inks: string[]; rasterImages: number } {
  const inks = new Set<string>();
  let rasterImages = 0;
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const o = node as Record<string, unknown>;
    if (o.visible === false) return;
    if (typeof o.type === 'string' && o.type.toLowerCase() === 'image') {
      rasterImages++;
      return;
    }
    if (Array.isArray(o.objects)) return o.objects.forEach(walk);
    for (const v of [o.fill, typeof o.strokeWidth === 'number' && o.strokeWidth > 0 ? o.stroke : null]) {
      const h = typeof v === 'string' ? normalizeHex(v) : null;
      if (h) inks.add(h);
    }
  };
  walk(json);
  return { inks: [...inks], rasterImages };
}
