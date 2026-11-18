import { readPsd, type Color, type Layer } from 'ag-psd';
import type { PrintZone } from '../types';
import { zonePpi } from '../data/garments';
import { loadGoogleFont } from './fonts';

/* ================================================================================================
 * Photoshop import. Loaded lazily (ag-psd is ~100 kB) by PsdImportDialog. Parses a .psd into a layer
 * tree (masks applied, thumbnails made), then turns the chosen layers into Fabric JSON for one view:
 * pixel layers → images (opacity, visibility and blend mode kept, resampled to ~300 DPI at print
 * size), text layers → editable IText when the font exists on Google Fonts, otherwise the rendered
 * pixels. Layer effects (stroke, shadow…) are only kept on rasterized/merged output via the PSD's
 * pre-rendered pixels where Photoshop stored them.
 * ============================================================================================== */

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PsdText {
  text: string;
  family: string;
  /** PostScript name from the file, for display. */
  psName: string;
  bold: boolean;
  italic: boolean;
  sizePx: number;
  fill: string;
  tracking: number;
  align: 'left' | 'center' | 'right';
  underline: boolean;
  /** Warped, rotated, vertical or multi-style text can't be rebuilt faithfully. */
  editable: boolean;
}

export interface PsdNode {
  key: string;
  name: string;
  kind: 'group' | 'pixel' | 'text';
  hidden: boolean;
  opacity: number;
  blend: GlobalCompositeOperation;
  bounds: Rect;
  canvas?: HTMLCanvasElement;
  text?: PsdText;
  thumb?: string;
  /** Artboard frame of a top-level artboard group. */
  artboard?: Rect;
  /** Heuristic: a background/garment/mockup layer the user probably doesn't want printed. */
  likelyBackground: boolean;
  children?: PsdNode[];
}

export interface ParsedPsd {
  fileName: string;
  width: number;
  height: number;
  /** Pixels per inch from the file's resolution info, when present. */
  dpi: number | null;
  /** Top-most first, like the Photoshop layers panel. */
  nodes: PsdNode[];
}

const BLEND: Record<string, GlobalCompositeOperation> = {
  normal: 'source-over',
  'pass through': 'source-over',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
  'color dodge': 'color-dodge',
  'color burn': 'color-burn',
  'hard light': 'hard-light',
  'soft light': 'soft-light',
  difference: 'difference',
  exclusion: 'exclusion',
  hue: 'hue',
  saturation: 'saturation',
  color: 'color',
  luminosity: 'luminosity',
  'linear dodge': 'lighter',
};

const BACKGROUND_NAME = /\b(background|bg|backdrop|shirt|tee|t-shirt|hoodie|garment|blank|mock-?up|template|shadows?|highlights?|texture|wrinkles?|guides?|print area|safe area|bleed)\b/i;

function colorToHex(c: Color | undefined): string {
  if (!c) return '#000000';
  const rec = c as unknown as Record<string, number>;
  let r = 0;
  let g = 0;
  let b = 0;
  if ('r' in rec) [r, g, b] = [rec.r, rec.g, rec.b];
  else if ('fr' in rec) [r, g, b] = [rec.fr * 255, rec.fg * 255, rec.fb * 255];
  else if ('k' in rec && 'c' in rec) {
    // CMYK (0–255 in ag-psd): naive conversion
    const k = rec.k / 255;
    [r, g, b] = [255 * (1 - rec.c / 255) * (1 - k), 255 * (1 - rec.m / 255) * (1 - k), 255 * (1 - rec.y / 255) * (1 - k)];
  } else if ('k' in rec) r = g = b = 255 - rec.k;
  const h = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

/** "BebasNeue-Regular" → { family: "Bebas Neue", bold: false }; "Montserrat-BoldItalic" → bold + italic. */
export function familyFromPostScript(ps: string): { family: string; bold: boolean; italic: boolean } {
  const [base, style = ''] = ps.split('-');
  const family = base
    .replace(/(MT|PS|Std|Pro|LT)$/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim();
  return { family: family || ps, bold: /bold|black|heavy|semibold|extrabold/i.test(style), italic: /italic|oblique/i.test(style) };
}

function thumbnail(src: HTMLCanvasElement): string {
  const S = 40;
  const t = document.createElement('canvas');
  t.width = t.height = S;
  const x = t.getContext('2d')!;
  const s = Math.min(S / src.width, S / src.height);
  x.drawImage(src, (S - src.width * s) / 2, (S - src.height * s) / 2, src.width * s, src.height * s);
  return t.toDataURL('image/png');
}

/** Applies a (grayscale) layer mask to a copy of the layer's pixels. */
function withMask(layer: Layer, src: HTMLCanvasElement): HTMLCanvasElement {
  const m = layer.mask;
  if (!m?.canvas || m.disabled) return src;
  const out = document.createElement('canvas');
  out.width = src.width;
  out.height = src.height;
  const o = out.getContext('2d')!;
  // mask → alpha
  const mc = document.createElement('canvas');
  mc.width = src.width;
  mc.height = src.height;
  const mx = mc.getContext('2d')!;
  const def = (m.defaultColor ?? 0) / 255;
  mx.fillStyle = `rgba(0,0,0,${def})`;
  mx.fillRect(0, 0, mc.width, mc.height);
  const lum = document.createElement('canvas');
  lum.width = m.canvas.width;
  lum.height = m.canvas.height;
  const lx = lum.getContext('2d')!;
  lx.drawImage(m.canvas, 0, 0);
  const d = lx.getImageData(0, 0, lum.width, lum.height);
  for (let k = 0; k < d.data.length; k += 4) {
    d.data[k + 3] = d.data[k];
    d.data[k] = d.data[k + 1] = d.data[k + 2] = 0;
  }
  lx.putImageData(d, 0, 0);
  mx.clearRect((m.left ?? 0) - (layer.left ?? 0), (m.top ?? 0) - (layer.top ?? 0), lum.width, lum.height);
  mx.drawImage(lum, (m.left ?? 0) - (layer.left ?? 0), (m.top ?? 0) - (layer.top ?? 0));
  o.drawImage(src, 0, 0);
  o.globalCompositeOperation = 'destination-in';
  o.drawImage(mc, 0, 0);
  return out;
}

export async function parsePsd(file: File): Promise<ParsedPsd> {
  const buf = await file.arrayBuffer();
  let psd;
  try {
    psd = readPsd(buf, { skipThumbnail: true, skipCompositeImageData: true, skipLinkedFilesData: true });
  } catch (e) {
    throw new Error(`Couldn't read ${file.name}: ${(e as Error).message}. Save it from Photoshop as a regular .psd (not .psb) and try again.`);
  }
  const res = psd.imageResources?.resolutionInfo;
  const dpi = res ? (res.horizontalResolutionUnit === 'PPCM' ? res.horizontalResolution * 2.54 : res.horizontalResolution) : null;
  const docArea = psd.width * psd.height;
  let n = 0;

  const convert = (layer: Layer, depth: number): PsdNode | null => {
    const key = `l${n++}`;
    const name = layer.name || 'Layer';
    const hidden = !!layer.hidden;
    const opacity = layer.opacity ?? 1;
    const blend = BLEND[layer.blendMode ?? 'normal'] ?? 'source-over';
    if (layer.children) {
      const kids = layer.children.map((c) => convert(c, depth + 1)).filter((c): c is PsdNode => !!c);
      if (!kids.length) return null;
      const L = Math.min(...kids.map((k) => k.bounds.left));
      const T = Math.min(...kids.map((k) => k.bounds.top));
      const R = Math.max(...kids.map((k) => k.bounds.left + k.bounds.width));
      const B = Math.max(...kids.map((k) => k.bounds.top + k.bounds.height));
      const ab = layer.artboard?.rect;
      return {
        key,
        name,
        kind: 'group',
        hidden,
        opacity,
        blend,
        bounds: { left: L, top: T, width: R - L, height: B - T },
        artboard: depth === 0 && ab ? { left: ab.left, top: ab.top, width: ab.right - ab.left, height: ab.bottom - ab.top } : undefined,
        likelyBackground: kids.every((k) => k.likelyBackground),
        children: kids.reverse(),
      };
    }
    if (!layer.canvas || !layer.canvas.width || !layer.canvas.height) return null; // adjustment/fill layers without pixels
    const canvas = withMask(layer, layer.canvas);
    const bounds = { left: layer.left ?? 0, top: layer.top ?? 0, width: canvas.width, height: canvas.height };
    let text: PsdText | undefined;
    if (layer.text) {
      const t = layer.text;
      const st = t.style ?? {};
      const psName = st.font?.name ?? 'Inter';
      const { family, bold, italic } = familyFromPostScript(psName);
      const tf = t.transform ?? [1, 0, 0, 1, 0, 0];
      const scale = Math.hypot(tf[2], tf[3]) || 1;
      const runs = t.styleRuns ?? [];
      const mixed = runs.some(
        (r) => (r.style.font?.name && r.style.font.name !== psName) || (r.style.fillColor && colorToHex(r.style.fillColor) !== colorToHex(st.fillColor)),
      );
      const rotated = Math.abs(tf[1]) > 1e-3 || Math.abs(tf[2]) > 1e-3;
      const just = t.paragraphStyle?.justification;
      text = {
        text: t.text.replace(/\r/g, '\n'),
        family,
        psName,
        bold: bold || !!st.fauxBold,
        italic: italic || !!st.fauxItalic,
        sizePx: (st.fontSize ?? 24) * scale,
        fill: colorToHex(st.fillColor),
        tracking: st.tracking ?? 0,
        align: just === 'center' ? 'center' : just === 'right' ? 'right' : 'left',
        underline: !!st.underline,
        editable: !mixed && !rotated && (!t.warp || t.warp.style === 'none') && t.orientation !== 'vertical' && !!t.text.trim(),
      };
    }
    const coversDoc = bounds.width * bounds.height > docArea * 0.85;
    return {
      key,
      name,
      kind: text ? 'text' : 'pixel',
      hidden,
      opacity,
      blend,
      bounds,
      canvas,
      text,
      thumb: thumbnail(canvas),
      likelyBackground: BACKGROUND_NAME.test(name) || coversDoc,
    };
  };

  const nodes = (psd.children ?? []).map((c) => convert(c, 0)).filter((c): c is PsdNode => !!c).reverse();
  if (!nodes.length) throw new Error(`${file.name} has no layers with pixels to import.`);
  return { fileName: file.name, width: psd.width, height: psd.height, dpi, nodes };
}

/* ------------------------------------------------------------------ build */

export type FitMode = 'document' | 'artwork' | 'actual';

export interface LeafRef {
  node: PsdNode;
  /** Opacity × all ancestor opacities. */
  opacity: number;
  /** Hidden itself or inside a hidden group. */
  hidden: boolean;
  /** Frame of the top-level artboard this layer sits in, if any. */
  artboard?: Rect;
}

export interface BuiltView {
  objects: Array<Record<string, unknown>>;
  /** Text objects to fit into their Photoshop box after they're on the canvas (index into objects). */
  textFits: Array<{ index: number; widthIn: number; centerOffsetIn: number; topIn: number }>;
  rasterizedTexts: number;
}

const unionRect = (rs: Rect[]): Rect => {
  const L = Math.min(...rs.map((r) => r.left));
  const T = Math.min(...rs.map((r) => r.top));
  return { left: L, top: T, width: Math.max(...rs.map((r) => r.left + r.width)) - L, height: Math.max(...rs.map((r) => r.top + r.height)) - T };
};

/** Resample to the pixels the print actually needs (300 DPI at the placed size), never upscaling. */
function resample(src: HTMLCanvasElement, placedWIn: number, placedHIn: number): HTMLCanvasElement {
  const needW = Math.ceil(placedWIn * 300);
  const needH = Math.ceil(placedHIn * 300);
  if (src.width <= needW * 1.05 && src.height <= needH * 1.05) return src;
  const out = document.createElement('canvas');
  out.width = Math.max(1, needW);
  out.height = Math.max(1, needH);
  const x = out.getContext('2d')!;
  x.imageSmoothingQuality = 'high';
  x.drawImage(src, 0, 0, out.width, out.height);
  return out;
}

export async function buildView(
  psd: ParsedPsd,
  leaves: LeafRef[],
  zone: PrintZone,
  opts: { fit: FitMode; editableText: boolean; merge: boolean; mergedName: string },
): Promise<BuiltView> {
  const ppi = zonePpi(zone);
  const docRect: Rect = { left: 0, top: 0, width: psd.width, height: psd.height };
  const boards = new Set(leaves.map((l) => l.artboard));
  const frame = boards.size === 1 && [...boards][0] ? [...boards][0]! : docRect;
  const art = unionRect(leaves.map((l) => l.node.bounds));

  // document px → print-zone px
  let s: number;
  let ox: number;
  let oy: number;
  let ref: Rect;
  if (opts.fit === 'actual' && psd.dpi) {
    ref = frame;
    s = ppi / psd.dpi;
    ox = (zone.w - frame.width * s) / 2;
    oy = 0;
  } else {
    ref = opts.fit === 'artwork' ? art : frame;
    s = Math.min(zone.w / ref.width, zone.h / ref.height);
    ox = (zone.w - ref.width * s) / 2;
    oy = opts.fit === 'artwork' ? 0 : (zone.h - ref.height * s) / 2;
  }
  const map = (r: Rect): Rect => ({ left: ox + (r.left - ref.left) * s, top: oy + (r.top - ref.top) * s, width: r.width * s, height: r.height * s });

  const imageObj = (canvas: HTMLCanvasElement, r: Rect, extra: Record<string, unknown>) => {
    const z = map(r);
    const px = resample(canvas, z.width / ppi, z.height / ppi);
    return {
      type: 'Image',
      originX: 'left',
      originY: 'top',
      left: z.left,
      top: z.top,
      width: px.width,
      height: px.height,
      scaleX: z.width / px.width,
      scaleY: z.height / px.height,
      src: px.toDataURL('image/png'),
      crossOrigin: null,
      ...extra,
    };
  };

  if (opts.merge) {
    const box = unionRect(leaves.map((l) => l.node.bounds));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(box.width));
    c.height = Math.max(1, Math.round(box.height));
    const x = c.getContext('2d')!;
    for (const l of leaves.slice().reverse()) {
      // leaves are top-most first; paint bottom-up
      if (!l.node.canvas || l.hidden) continue;
      x.globalAlpha = l.opacity;
      x.globalCompositeOperation = l.node.blend;
      x.drawImage(l.node.canvas, l.node.bounds.left - box.left, l.node.bounds.top - box.top);
    }
    return { objects: [imageObj(c, box, { name: opts.mergedName })], textFits: [], rasterizedTexts: 0 };
  }

  const objects: Array<Record<string, unknown>> = [];
  const textFits: BuiltView['textFits'] = [];
  let rasterizedTexts = 0;
  for (const l of leaves.slice().reverse()) {
    const node = l.node;
    const common = { name: node.name.slice(0, 40), opacity: l.opacity, visible: !l.hidden, globalCompositeOperation: node.blend };
    const t = node.text;
    if (t && opts.editableText && t.editable && (await loadGoogleFont(t.family))) {
      const z = map(node.bounds);
      textFits.push({ index: objects.length, widthIn: z.width / ppi, centerOffsetIn: (z.left + z.width / 2 - zone.w / 2) / ppi, topIn: z.top / ppi });
      objects.push({
        type: 'IText',
        originX: 'left',
        originY: 'top',
        left: z.left,
        top: z.top,
        text: t.text,
        fontFamily: t.family,
        fontSize: Math.max(4, t.sizePx * s),
        fontWeight: t.bold ? 'bold' : 'normal',
        fontStyle: t.italic ? 'italic' : 'normal',
        fill: t.fill,
        charSpacing: t.tracking,
        textAlign: t.align,
        underline: t.underline,
        ...common,
      });
      continue;
    }
    if (t) rasterizedTexts++;
    if (node.canvas) objects.push(imageObj(node.canvas, node.bounds, common));
  }
  return { objects, textFits, rasterizedTexts };
}
