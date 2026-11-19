import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticCanvas, type FabricObject } from 'fabric';
import { jsPDF } from 'jspdf';
import { GarmentSVG } from '../components/GarmentTemplates';
import { GARMENT_H, GARMENT_W, garmentShape, getGarment, getView, getZone, garmentViews, viewLabel, zonePpi } from '../data/garments';
import type { CanvasJSON, FabricChoices, GarmentId, ManufacturingSpecs, PrintEffect, PrintZone, SizeChart, SizeCharts, ViewDesigns, ViewEffects, ViewId } from '../types';
import { chartToCSV, defaultSizeChart, formatMeasure, measureOverlayMarkup, validateChart } from './sizeCharts';
import { effectFor, hasArtwork } from '../types';
import { extractPalette, hexToRgb, isDark, nearestPantone, normalizeHex } from './color';
import { fabricFor } from '../data/fabrics';
import { ensureFonts } from './fonts';
import { effectName, ensureFilterInDocument } from './printEffects';
import { objectKind, objectName } from './fabricHelpers';

export interface StudioSnapshot {
  name: string;
  draftId: string | null;
  garment: GarmentId;
  color: string;
  view: ViewId;
  designs: ViewDesigns;
  effects: ViewEffects;
  sizeCharts?: SizeCharts;
  mfgSpecs?: ManufacturingSpecs;
  fabrics?: FabricChoices;
}

const PRINT_DPI = 300;

/* ------------------------------------------------------------------ helpers */

export const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'loomcraft-design';

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const canvasToBlob = (c: HTMLCanvasElement, type = 'image/png', quality?: number) =>
  new Promise<Blob>((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas export failed (image may be too large).'))), type, quality),
  );

export { hasArtwork };

/* --------------------------------------------------------- garment raster */

export function garmentMarkup(garment: GarmentId, view: ViewId, color: string, uid = 'lcx', fabric?: string): string {
  return renderToStaticMarkup(createElement(GarmentSVG, { garment, view, color, uid, fabric }));
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  await img.decode();
  return img;
}

/**
 * Draws a garment view into a 2D context. Vector blanks are rasterized from their SVG; custom photo
 * blanks are fitted (contain), tinted with the canvas `multiply`/`overlay` composite op and then
 * masked back to the photo's alpha – the same result as the studio's CSS blend preview.
 */
export async function drawGarment(ctx: CanvasRenderingContext2D, garment: GarmentId, view: ViewId, color: string, w: number, h: number, fabric?: string) {
  const v = getView(garment, view);
  if (v.art) {
    ctx.drawImage(await svgToImage(garmentMarkup(garment, view, color, `lcx-${view}`, fabric)), 0, 0, w, h);
    return;
  }
  if (!v.image) return;
  const img = await loadImage(v.image);
  const s = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * s;
  const dh = img.naturalHeight * s;
  const dx = (w - dw) / 2;
  const dy = (h - dh) / 2;
  const tint = getGarment(garment).custom?.tint ?? 'multiply';
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const o = off.getContext('2d')!;
  o.drawImage(img, dx, dy, dw, dh);
  if (tint !== 'none') {
    o.globalCompositeOperation = tint;
    o.fillStyle = color;
    o.fillRect(0, 0, w, h);
    o.globalCompositeOperation = 'destination-in';
    o.drawImage(img, dx, dy, dw, dh);
  }
  ctx.drawImage(off, 0, 0);
}

async function svgToImage(markup: string): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/* --------------------------------------------------------- artwork render */

export interface ArtBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface LayerReport {
  name: string;
  kind: string;
  widthIn: number;
  heightIn: number;
  detail: string;
}

interface RenderedArt {
  canvas: HTMLCanvasElement;
  bounds: ArtBounds | null;
  layers: LayerReport[];
}

/** Renders a serialized view onto an offscreen Fabric canvas at `multiplier` × print-zone size. */
export async function renderArtwork(
  json: CanvasJSON,
  zone: PrintZone,
  multiplier: number,
  cropToArt = false,
): Promise<RenderedArt> {
  await ensureFonts(json);
  const el = document.createElement('canvas');
  const sc = new StaticCanvas(el, {
    width: zone.w,
    height: zone.h,
    enableRetinaScaling: false,
    renderOnAddRemove: false,
  });
  try {
    await sc.loadFromJSON(json);
    sc.backgroundColor = '';
    const ppi = zonePpi(zone);
    const visible = sc.getObjects().filter((o) => o.visible !== false);

    let bounds: ArtBounds | null = null;
    for (const o of visible) {
      const r = o.getBoundingRect();
      const l = Math.max(0, r.left);
      const t = Math.max(0, r.top);
      const rr = Math.min(zone.w, r.left + r.width);
      const bb = Math.min(zone.h, r.top + r.height);
      if (rr <= l || bb <= t) continue;
      if (!bounds) bounds = { left: l, top: t, width: rr - l, height: bb - t };
      else {
        const L = Math.min(bounds.left, l);
        const T = Math.min(bounds.top, t);
        bounds = {
          left: L,
          top: T,
          width: Math.max(bounds.left + bounds.width, rr) - L,
          height: Math.max(bounds.top + bounds.height, bb) - T,
        };
      }
    }

    const layers: LayerReport[] = visible
      .slice()
      .reverse()
      .map((o: FabricObject) => {
        const kind = objectKind(o);
        let detail = '';
        if (kind === 'text') {
          const t = o as unknown as { fontFamily: string; fontSize: number; charSpacing: number; fill: unknown };
          const fill = typeof t.fill === 'string' ? normalizeHex(t.fill) ?? t.fill : '';
          detail = `${t.fontFamily} · ${Math.round(t.fontSize * o.scaleY)}px · tracking ${t.charSpacing} · ${fill}`;
        } else if (kind === 'image') {
          const dpi = Math.round(ppi / Math.max(o.scaleX, o.scaleY));
          detail = `${dpi} DPI effective${dpi < 150 ? ' — LOW RES' : ''}`;
        } else detail = 'Vector';
        return {
          name: objectName(o),
          kind,
          widthIn: o.getScaledWidth() / ppi,
          heightIn: o.getScaledHeight() / ppi,
          detail,
        };
      });

    const canvas = sc.toCanvasElement(multiplier, cropToArt && bounds ? bounds : undefined);
    return { canvas, bounds, layers };
  } finally {
    sc.dispose();
  }
}

/* --------------------------------------------------------- mockup compose */

export async function composeMockup(opts: {
  garment: GarmentId;
  view: ViewId;
  color: string;
  json: CanvasJSON | null | undefined;
  effect: PrintEffect;
  scale: number;
  watermark?: boolean;
  /** Fabric id (weave drawn on the garment). */
  fabric?: string;
}): Promise<HTMLCanvasElement> {
  const { garment, view, color, json, effect, scale } = opts;
  const out = document.createElement('canvas');
  out.width = Math.round(GARMENT_W * scale);
  out.height = Math.round(GARMENT_H * scale);
  const ctx = out.getContext('2d')!;

  const bg = ctx.createRadialGradient(out.width / 2, out.height * 0.42, 0, out.width / 2, out.height / 2, out.width * 0.8);
  bg.addColorStop(0, '#F4F3F0');
  bg.addColorStop(1, '#D9D8D3');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, out.width, out.height);

  await drawGarment(ctx, garment, view, color, out.width, out.height, opts.fabric);

  if (json && hasArtwork(json)) {
    const zone = getZone(garment, view);
    const art = await renderArtwork(json, zone, scale);
    const filter = ensureFilterInDocument(effect, scale);
    ctx.save();
    if (filter) ctx.filter = filter;
    ctx.drawImage(art.canvas, zone.x * scale, zone.y * scale);
    ctx.restore();
  }

  if (opts.watermark) {
    ctx.save();
    ctx.font = `600 ${Math.round(11 * scale)}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(20,20,24,0.45)';
    ctx.textAlign = 'right';
    ctx.fillText('LoomCraft', out.width - 14 * scale, out.height - 12 * scale);
    ctx.restore();
  }
  return out;
}

/* --------------------------------------------------------- 360° turntable textures */

export interface TurntableSide {
  /** Garment + artwork on a transparent background, as seen from outside. */
  outside: HTMLCanvasElement;
  /** Interior fabric: darker shade, faint print bleed-through, neck label on the back. */
  inside: HTMLCanvasElement;
}

/**
 * Textures for the 3D viewer. The front surface is the `front` view (or the first non-back view) plus
 * the artwork of every view drawn on the same blank (e.g. jogger legs); the back surface is the `back`
 * view, or a blank copy of the front when the garment has no back view.
 */
export async function buildTurntableTextures(
  s: Pick<StudioSnapshot, 'garment' | 'color' | 'designs' | 'effects' | 'fabrics'>,
  scale = 2,
): Promise<{ front: TurntableSide; back: TurntableSide }> {
  const views = garmentViews(s.garment);
  const frontView = views.find((v) => v.id === 'front') ?? views.find((v) => v.id !== 'back') ?? views[0];
  const backView = views.find((v) => v.id === 'back');
  const sameBlank = (a: (typeof views)[number], b: (typeof views)[number]) => (!!a.art && a.art === b.art) || (!!a.image && a.image === b.image);
  const frontArt = views.filter((v) => v.id !== 'back' && sameBlank(v, frontView));
  const labelled = garmentShape(s.garment) === 'top';

  const side = async (base: (typeof views)[number], artViews: typeof views, neckLabel: boolean): Promise<TurntableSide> => {
    const W = Math.round(GARMENT_W * scale);
    const H = Math.round(GARMENT_H * scale);
    const mk = () => {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      return [c, c.getContext('2d')!] as const;
    };

    const [garmentC, g] = mk();
    await drawGarment(g, s.garment, base.id, s.color, W, H, fabricFor(s.fabrics, s.garment).id);

    const [artC, a] = mk();
    for (const v of artViews) {
      const json = s.designs[v.id];
      if (!json || !hasArtwork(json)) continue;
      const art = await renderArtwork(json, v.zone, scale);
      const filter = ensureFilterInDocument(effectFor(s.effects, v.id), scale);
      a.save();
      if (filter) a.filter = filter;
      a.drawImage(art.canvas, v.zone.x * scale, v.zone.y * scale);
      a.restore();
    }
    a.globalCompositeOperation = 'destination-in';
    a.drawImage(garmentC, 0, 0);

    const [outside, o] = mk();
    o.drawImage(garmentC, 0, 0);
    o.drawImage(artC, 0, 0);

    const [inside, i] = mk();
    i.drawImage(garmentC, 0, 0);
    i.globalCompositeOperation = 'source-atop';
    // The reverse of the fabric reads flatter: a little darker on light blanks, a little lighter (unbrushed
    // grey-ish back) on dark ones, so the interior stays readable either way.
    i.fillStyle = isDark(s.color) ? 'rgba(255,255,255,0.13)' : 'rgba(8,8,12,0.22)';
    i.fillRect(0, 0, W, H);
    // jersey/fleece back: fine diagonal knit lines
    i.strokeStyle = 'rgba(255,255,255,0.05)';
    i.lineWidth = Math.max(1, scale * 0.6);
    i.beginPath();
    for (let d = -H; d < W; d += 4 * scale) {
      i.moveTo(d, 0);
      i.lineTo(d + H, H);
    }
    i.stroke();
    // ink bleed-through (mirrored automatically: the inside is the back face of the same UVs)
    i.globalAlpha = 0.16;
    i.drawImage(artC, 0, 0);
    i.globalAlpha = 1;
    i.globalCompositeOperation = 'source-over';

    if (neckLabel) {
      // find the collar at the centre column
      const col = g.getImageData(Math.round(W / 2), 0, 1, H).data;
      let top = -1;
      for (let y = 0; y < H; y++) if (col[y * 4 + 3] > 40) { top = y; break; }
      if (top >= 0) {
        const lw = 46 * scale;
        const lh = 26 * scale;
        const ly = top + 24 * scale;
        i.save();
        i.translate(W / 2, ly);
        i.scale(-1, 1); // seen from inside the garment, so draw it mirrored
        i.shadowColor = 'rgba(0,0,0,0.35)';
        i.shadowBlur = 3 * scale;
        i.fillStyle = '#EFEBE3';
        i.fillRect(-lw / 2, 0, lw, lh);
        i.shadowColor = 'transparent';
        i.strokeStyle = 'rgba(0,0,0,0.25)';
        i.setLineDash([2 * scale, 1.5 * scale]);
        i.lineWidth = 0.7 * scale;
        i.beginPath();
        i.moveTo(-lw / 2 + 2 * scale, 2.5 * scale);
        i.lineTo(lw / 2 - 2 * scale, 2.5 * scale);
        i.stroke();
        i.setLineDash([]);
        i.fillStyle = '#7c3aed';
        i.textAlign = 'center';
        i.font = `700 ${7 * scale}px Inter, system-ui, sans-serif`;
        i.fillText('LOOMCRAFT', 0, 12 * scale);
        i.fillStyle = '#3f3f46';
        i.font = `600 ${6 * scale}px Inter, system-ui, sans-serif`;
        i.fillText('M · 100% COTTON', 0, 20.5 * scale);
        i.restore();
      }
    }
    return { outside, inside };
  };

  const front = await side(frontView, frontArt, false);
  const back = backView ? await side(backView, [backView], labelled) : await side(frontView, [], labelled);
  return { front, back };
}

/**
 * Artwork of every view at `pxPerIn`, print effect applied, covering the whole print zone (transparent
 * outside the art). The 3D viewer projects each one onto its zone at true size.
 */
export async function buildPrintTextures(
  s: Pick<StudioSnapshot, 'garment' | 'designs' | 'effects'>,
  pxPerIn = 48,
): Promise<Partial<Record<ViewId, HTMLCanvasElement>>> {
  const out: Partial<Record<ViewId, HTMLCanvasElement>> = {};
  for (const v of garmentViews(s.garment)) {
    const json = s.designs[v.id];
    if (!json || !hasArtwork(json)) continue;
    const m = pxPerIn / zonePpi(v.zone);
    const art = await renderArtwork(json, v.zone, m);
    const c = document.createElement('canvas');
    c.width = Math.round(v.zone.w * m);
    c.height = Math.round(v.zone.h * m);
    const x = c.getContext('2d')!;
    const filter = ensureFilterInDocument(effectFor(s.effects, v.id), m);
    if (filter) x.filter = filter;
    x.drawImage(art.canvas, 0, 0, c.width, c.height);
    // Filters (grain, bevel) may leave faint pixels outside the artwork; keep only the artwork's own alpha.
    x.filter = 'none';
    x.globalCompositeOperation = 'destination-in';
    x.drawImage(art.canvas, 0, 0, c.width, c.height);
    out[v.id] = c;
  }
  return out;
}

export async function exportMockupPNG(s: StudioSnapshot): Promise<void> {
  const canvas = await composeMockup({
    garment: s.garment,
    view: s.view,
    color: s.color,
    json: s.designs[s.view],
    effect: effectFor(s.effects, s.view),
    scale: MOCKUP_SCALE,
    watermark: true,
    fabric: fabricFor(s.fabrics, s.garment).id,
  });
  downloadBlob(await canvasToBlob(canvas), `${slugify(s.name)}-${s.view}-mockup.png`);
}

/** Small JPEG preview for the draft manager. */
export async function makeThumbnail(s: Omit<StudioSnapshot, 'view' | 'name' | 'draftId'>): Promise<string> {
  const views = garmentViews(s.garment).map((v) => v.id);
  const view = views.find((v) => hasArtwork(s.designs[v])) ?? views[0];
  const c = await composeMockup({
    garment: s.garment,
    view,
    color: s.color,
    json: s.designs[view],
    effect: effectFor(s.effects, view),
    scale: 0.4,
    fabric: fabricFor(s.fabrics, s.garment).id,
  });
  return c.toDataURL('image/jpeg', 0.75);
}

/* --------------------------------------------------------- 300 DPI PNG */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Inserts a pHYs chunk so the PNG opens at the right physical size (e.g. 300 DPI) in RIP / design software. */
async function withPngDpi(blob: Blob, dpi: number): Promise<Blob> {
  const src = new Uint8Array(await blob.arrayBuffer());
  const ihdrEnd = 8 + 25; // signature + IHDR chunk
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  view.setUint32(8, ppm);
  view.setUint32(12, ppm);
  chunk[16] = 1; // unit: metre
  view.setUint32(17, crc32(chunk.subarray(4, 17)));
  return new Blob([src.subarray(0, ihdrEnd), chunk, src.subarray(ihdrEnd)], { type: 'image/png' });
}

/* --------------------------------------------------------- production package */

interface ViewReport {
  view: ViewId;
  zone: PrintZone;
  effect: PrintEffect;
  boundsIn: { w: number; h: number; top: number; centerOffset: number };
  pixel: { w: number; h: number };
  filename: string;
  layers: LayerReport[];
  palette: Array<{ hex: string; pantone: string }>;
  mockup: string;
}

const MOCKUP_SCALE = 4; // 2000 × 2240 px

/** Resize a canvas to a JPEG data URL (for embedding mockups in the PDF without re-rendering). */
function downscaleToJpeg(src: HTMLCanvasElement, width: number, quality = 0.9): string {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = Math.round((src.height / src.width) * width);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}

/** Garment front + measurement lines, rasterized for the PDF size-spec page. */
async function renderSpecDiagram(garment: GarmentId, color: string, chart: SizeChart): Promise<string> {
  const c = document.createElement('canvas');
  c.width = GARMENT_W * 2;
  c.height = GARMENT_H * 2;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f6f6f4';
  ctx.fillRect(0, 0, c.width, c.height);
  await drawGarment(ctx, garment, garmentViews(garment)[0].id, color, c.width, c.height);
  const lines = measureOverlayMarkup(garment, chart.points, { color: '#7c3aed' });
  if (lines) {
    const overlay = await svgToImage(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GARMENT_W} ${GARMENT_H}" width="${GARMENT_W}" height="${GARMENT_H}">${lines}</svg>`,
    );
    ctx.drawImage(overlay, 0, 0, c.width, c.height);
  }
  return c.toDataURL('image/jpeg', 0.9);
}

/** Yield to the event loop so progress text can paint between heavy render steps. */
const breathe = () => new Promise((r) => setTimeout(r, 0));

/**
 * Builds the production pack and downloads it as one ZIP:
 *   mockups/   Front + Back (+ Sleeve when it has artwork) high-res PNG mockups
 *   print/     300 DPI transparent PNGs, cropped to the artwork, with DPI metadata
 *   *-tech-pack.pdf  1-page LoomCraft tech pack
 */
export async function exportProductionZip(
  s: StudioSnapshot,
  onProgress?: (msg: string) => void,
): Promise<{ filename: string; files: string[] }> {
  const allViews = garmentViews(s.garment).map((v) => v.id);
  const artViews = allViews.filter((v) => hasArtwork(s.designs[v]));
  if (!artViews.length) throw new Error('Add artwork to at least one view before exporting a production pack.');

  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const slug = slugify(s.name);
  const reports: ViewReport[] = [];
  const files: string[] = [];
  // Front and back always (when the garment has them), plus every other view that carries artwork.
  const mockupViews = allViews.filter((v) => v === 'front' || v === 'back' || artViews.includes(v));
  if (!mockupViews.length) mockupViews.push(allViews[0]);
  const mockupCanvases = new Map<ViewId, HTMLCanvasElement>();

  for (const view of mockupViews) {
    onProgress?.(`Rendering ${view} mockup…`);
    await breathe();
    const canvas = await composeMockup({
      garment: s.garment,
      view,
      color: s.color,
      json: s.designs[view],
      effect: effectFor(s.effects, view),
      scale: MOCKUP_SCALE,
      watermark: true,
      fabric: fabricFor(s.fabrics, s.garment).id,
    });
    mockupCanvases.set(view, canvas);
    const name = `mockups/${slug}-${view}-mockup.png`;
    zip.file(name, await canvasToBlob(canvas));
    files.push(name);
  }

  for (const view of artViews) {
    onProgress?.(`Rendering ${view} artwork at ${PRINT_DPI} DPI…`);
    await breathe();
    const json = s.designs[view]!;
    const zone = getZone(s.garment, view);
    const ppi = zonePpi(zone);

    const print = await renderArtwork(json, zone, PRINT_DPI / ppi, true);
    if (!print.bounds) continue;
    const filename = `${slug}-${view}-print-${PRINT_DPI}dpi.png`;
    zip.file(`print/${filename}`, await withPngDpi(await canvasToBlob(print.canvas), PRINT_DPI));
    files.push(`print/${filename}`);

    const preview = await renderArtwork(json, zone, 1, true);
    const palette = extractPalette(preview.canvas).map((hex) => ({ hex, pantone: nearestPantone(hex).name }));
    const b = print.bounds;
    reports.push({
      view,
      zone,
      effect: effectFor(s.effects, view),
      boundsIn: {
        w: b.width / ppi,
        h: b.height / ppi,
        top: b.top / ppi,
        centerOffset: (b.left + b.width / 2 - zone.w / 2) / ppi,
      },
      pixel: { w: print.canvas.width, h: print.canvas.height },
      filename,
      layers: preview.layers,
      palette,
      mockup: downscaleToJpeg(mockupCanvases.get(view)!, 800),
    });
  }

  const chart = s.sizeCharts?.[s.garment] ?? defaultSizeChart(s.garment);
  const csvName = `specs/${slug}-size-chart.csv`;
  zip.file(csvName, chartToCSV(chart, getGarment(s.garment).name, s.mfgSpecs?.[s.garment]), { compression: 'DEFLATE' });
  files.push(csvName);

  onProgress?.('Building tech pack PDF…');
  await breathe();
  const spec = chart.includeInTechPack ? { chart, diagram: await renderSpecDiagram(s.garment, s.color, chart) } : null;
  const pdfName = `${slug}-tech-pack.pdf`;
  zip.file(pdfName, buildTechPack(s, reports, spec).output('blob'), { compression: 'DEFLATE' });
  files.push(pdfName);

  onProgress?.('Zipping…');
  // PNGs are already compressed – STORE them for speed; the PDF above opts into DEFLATE.
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  const zipName = `${slug}-production-pack.zip`;
  downloadBlob(blob, zipName);
  return { filename: zipName, files };
}

/* --------------------------------------------------------- tech pack PDF */

const INK: [number, number, number] = [24, 24, 28];
const MUTED: [number, number, number] = [110, 110, 118];
const ACCENT: [number, number, number] = [124, 58, 237];
/** Lighter violet for text on the dark header band. */
const ACCENT_LIGHT: [number, number, number] = [167, 139, 250];
const LINE: [number, number, number] = [222, 222, 226];

const fmt = (n: number) => n.toFixed(2);

function buildTechPack(s: StudioSnapshot, reports: ViewReport[], spec: { chart: SizeChart; diagram: string } | null): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  // jsPDF's built-in Helvetica only covers a limited charset – normalize typographic symbols to ASCII.
  const ascii = (t: string) =>
    t
      .replace(/·/g, '/')
      .replace(/•/g, '-')
      .replace(/\s?°\s?/g, ' deg ')
      .replace(/²/g, '2')
      .replace(/µ/g, 'u')
      .replace(/½/g, '1/2')
      .replace(/¾/g, '3/4')
      .replace(/¼/g, '1/4')
      .replace(/⚠/g, '(!)')
      .replace(/→/g, '->')
      .replace(/×/g, 'x')
      .replace(/[–—]/g, '-')
      .replace(/…/g, '...')
      .replace(/[″“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/≈/g, '~')
      .replace(/[^ -~]/g, '');
  const rawText = doc.text.bind(doc) as (...args: unknown[]) => jsPDF;
  (doc as unknown as { text: unknown }).text = (t: string | string[], ...rest: unknown[]) =>
    rawText(Array.isArray(t) ? t.map(ascii) : ascii(t), ...rest);
  const W = 612;
  const M = 36;
  const garment = getGarment(s.garment);
  const now = new Date();
  const dateStr = now.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  const styleNo = s.draftId ? `LC-${s.draftId.slice(-6).toUpperCase()}` : 'LC-UNSAVED';

  const setText = (rgb: [number, number, number]) => doc.setTextColor(rgb[0], rgb[1], rgb[2]);
  const label = (txt: string, x: number, y: number) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    setText(MUTED);
    doc.text(txt.toUpperCase(), x, y, { charSpace: 0.8 });
  };
  const swatch = (hex: string, x: number, y: number, size: number) => {
    const { r, g, b } = hexToRgb(hex);
    doc.setFillColor(r, g, b);
    doc.setDrawColor(190, 190, 196);
    doc.setLineWidth(0.5);
    doc.roundedRect(x, y, size, size, 2, 2, 'FD');
  };

  const mfg = s.mfgSpecs?.[s.garment];
  const mfgPage = mfg ? 2 : 0;
  const sizePage = spec ? (mfg ? 3 : 2) : 0;
  const pageCount = 1 + (mfg ? 1 : 0) + (spec ? 1 : 0);

  const drawHeader = (title: string) => {
    doc.setFillColor(20, 20, 24);
    doc.rect(0, 0, W, 66, 'F');
    doc.setFillColor(38, 38, 45);
    doc.roundedRect(M, 17, 32, 32, 7, 7, 'F');
    doc.setLineCap('round');
    doc.setLineWidth(3);
    doc.setDrawColor(221, 214, 254);
    doc.line(M + 6, M - 8, M + 26, M - 8);
    doc.line(M + 6, M + 4, M + 26, M + 4);
    doc.setDrawColor(ACCENT_LIGHT[0], ACCENT_LIGHT[1], ACCENT_LIGHT[2]);
    doc.line(M + 11, 23, M + 11, 43);
    doc.line(M + 21, 23, M + 21, 43);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(21);
    doc.setTextColor(255, 255, 255);
    doc.text('Loom', M + 42, 41);
    setText(ACCENT_LIGHT);
    doc.text('Craft', M + 42 + doc.getTextWidth('Loom'), 41);
    doc.setFontSize(10);
    doc.text(title, W - M, 33, { align: 'right', charSpace: 1.5 });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(170, 170, 178);
    doc.text(`${styleNo}  ·  ${dateStr}`, W - M, 46, { align: 'right' });
  };

  const drawFooter = (page: number) => {
    const ft = 742;
    doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    doc.setLineWidth(0.75);
    doc.line(M, ft, W - M, ft);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    setText(INK);
    doc.text('Generated by ', M, ft + 16);
    setText(ACCENT);
    doc.text('LoomCraft', M + doc.getTextWidth('Generated by '), ft + 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setText(MUTED);
    doc.text(`${styleNo}  ·  ${now.toLocaleString()}  ·  Page ${page} of ${pageCount}`, W - M, ft + 16, { align: 'right' });
  };

  drawHeader('TECH PACK');

  /* style info */
  let y = 92;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  setText(INK);
  doc.text(s.name || 'Untitled design', M, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setText(MUTED);
  const chosen = s.fabrics?.[s.garment] ? fabricFor(s.fabrics, s.garment) : null;
  const fabricLine = mfg
    ? `${mfg.fabricWeight} · ${mfg.composition}`
    : chosen
      ? `${chosen.name}${chosen.gsm ? ` ${chosen.gsm} GSM` : ''} · ${chosen.composition}`
      : garment.spec;
  doc.text(`${garment.name}  —  ${fabricLine}`.split('\n')[0].slice(0, 120), M, y + 14);

  const bodyPantone = nearestPantone(s.color);
  swatch(s.color, W - M - 150, y - 16, 26);
  label('Body color', W - M - 116, y - 8);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  setText(INK);
  doc.text(`${normalizeHex(s.color)}  ·  ${bodyPantone.name}`, W - M - 116, y + 4);

  y += 30;
  doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
  doc.setLineWidth(0.75);
  doc.line(M, y, W - M, y);
  y += 14;

  /* left column: mockups */
  const colL = M;
  const colLW = 236;
  const primary = reports.find((r) => r.view === s.view) ?? reports[0];
  const imgH = colLW * (GARMENT_H / GARMENT_W);
  doc.addImage(primary.mockup, 'JPEG', colL, y, colLW, imgH);
  doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
  doc.rect(colL, y, colLW, imgH);
  label(`${viewLabel(s.garment, primary.view)} view`, colL + 6, y + imgH - 6);

  const others = reports.filter((r) => r !== primary);
  // Up to 3 thumbnails in a single row (garments like joggers have 4 views).
  const shownOthers = others.slice(0, 3);
  const thumbCols = Math.max(2, shownOthers.length);
  const thumbW = (colLW - 8 * (thumbCols - 1)) / thumbCols;
  shownOthers.forEach((r, i) => {
    const tx = colL + i * (thumbW + 8);
    const ty = y + imgH + 8;
    const th = thumbW * (GARMENT_H / GARMENT_W);
    doc.addImage(r.mockup, 'JPEG', tx, ty, thumbW, th);
    doc.rect(tx, ty, thumbW, th);
    label(viewLabel(s.garment, r.view), tx + 5, ty + th - 5);
  });

  /* right column: placements */
  const colR = colL + colLW + 22;
  const colRW = W - M - colR;
  let ry = y + 4;
  label('Print placements', colR, ry);
  ry += 12;

  for (const r of reports) {
    const blockTop = ry;
    ry += 14;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    setText(INK);
    doc.text(viewLabel(s.garment, r.view).toUpperCase(), colR + 8, ry);
    setText(ACCENT);
    doc.text(effectName(r.effect), colR + colRW - 8, ry, { align: 'right' });

    const rows: Array<[string, string]> = [
      ['Print size', `${fmt(r.boundsIn.w)} × ${fmt(r.boundsIn.h)} in  (W × H)`],
      ['Placement', r.zone.placement],
      [
        'Position',
        `${fmt(r.boundsIn.top)} in from top of print area · ${
          Math.abs(r.boundsIn.centerOffset) < 0.05
            ? 'centered'
            : `${fmt(Math.abs(r.boundsIn.centerOffset))} in ${r.boundsIn.centerOffset < 0 ? 'left' : 'right'} of center`
        }`,
      ],
      ['Max area', `${r.zone.widthIn} × ${r.zone.heightIn} in`],
      ['Art file', r.filename],
      ['Resolution', `${r.pixel.w} × ${r.pixel.h} px @ ${PRINT_DPI} DPI (transparent PNG)`],
    ];
    doc.setFontSize(8);
    for (const [k, v] of rows) {
      ry += 11.5;
      doc.setFont('helvetica', 'bold');
      setText(MUTED);
      doc.text(k, colR + 8, ry);
      doc.setFont('helvetica', 'normal');
      setText(INK);
      const lines = doc.splitTextToSize(v, colRW - 70) as string[];
      doc.text(lines[0] + (lines.length > 1 ? '…' : ''), colR + 62, ry);
    }

    ry += 10;
    const sw = 11;
    r.palette.slice(0, 6).forEach((c, i) => {
      const cx = colR + 8 + (i % 2) * ((colRW - 16) / 2);
      const cy = ry + Math.floor(i / 2) * 15;
      swatch(c.hex, cx, cy, sw);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.2);
      setText(INK);
      doc.text(`${c.hex}  ${c.pantone.replace('PANTONE ', 'PMS ')}`, cx + sw + 5, cy + 8);
    });
    ry += Math.ceil(Math.min(6, r.palette.length) / 2) * 15 + 4;

    doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    doc.roundedRect(colR, blockTop, colRW, ry - blockTop, 4, 4, 'S');
    ry += 8;
  }

  /* layer breakdown */
  const leftBottom = y + imgH + (others.length ? 8 + thumbW * (GARMENT_H / GARMENT_W) : 0);
  let ty = Math.max(leftBottom, ry) + 22;
  label('Layer breakdown', M, ty);
  ty += 8;
  doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
  doc.line(M, ty, W - M, ty);
  const cols = [M, M + 52, M + 212, M + 266, M + 346];
  const head = ['View', 'Layer', 'Type', 'Size (in)', 'Details'];
  ty += 11;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  setText(MUTED);
  head.forEach((h, i) => doc.text(h, cols[i], ty));

  const allRows = reports.flatMap((r) => r.layers.map((l) => ({ view: r.view, ...l })));
  const footerTop = 742;
  const maxRows = Math.max(0, Math.floor((footerTop - 40 - ty) / 11));
  doc.setFont('helvetica', 'normal');
  setText(INK);
  allRows.slice(0, maxRows).forEach((l) => {
    ty += 11;
    doc.text(viewLabel(s.garment, l.view), cols[0], ty);
    doc.text((doc.splitTextToSize(l.name, 150) as string[])[0], cols[1], ty);
    doc.text(l.kind, cols[2], ty);
    doc.text(`${fmt(l.widthIn)} × ${fmt(l.heightIn)}`, cols[3], ty);
    doc.text((doc.splitTextToSize(l.detail, W - M - cols[4]) as string[])[0], cols[4], ty);
  });
  if (allRows.length > maxRows) {
    ty += 11;
    setText(MUTED);
    doc.text(`+ ${allRows.length - maxRows} more layers`, cols[1], ty);
  }

  /* notes */
  doc.setFontSize(7);
  setText(MUTED);
  const note =
    'Notes: Print sizes are measured from the artwork bounding box. Pantone references are nearest on-screen ' +
    'approximations — confirm against a physical guide and approve a strike-off before bulk production.';
  doc.text(doc.splitTextToSize(note, W - 2 * M) as string[], M, footerTop - 14);

  drawFooter(1);

  /* ---------------- manufacturing spec page ---------------- */
  if (mfg) {
    doc.addPage('letter', 'portrait');
    drawHeader('MFG SPEC');
    let my = 92;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    setText(INK);
    doc.text('Manufacturing Specification', M, my);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    setText(MUTED);
    doc.text(`${garment.name}  -  garment color ${normalizeHex(s.color)} / ${nearestPantone(s.color).name}`, M, my + 14);
    my += 30;
    doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    doc.line(M, my, W - M, my);
    my += 16;

    const colW = (W - 2 * M - 24) / 2;
    const block = (title: string, body: string, x: number, y0: number, width: number, maxY: number): number => {
      label(title, x, y0);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      setText(INK);
      let yy = y0 + 12;
      for (const para of body.split('\n')) {
        const wrapped = doc.splitTextToSize(para || ' ', width) as string[];
        for (const ln of wrapped) {
          if (yy > maxY) return yy;
          doc.text(ln, x, yy);
          yy += 11;
        }
      }
      return yy + 10;
    };

    const footerLimit = 742 - 20;
    // left column: fabric, construction, trims, care
    doc.setFillColor(246, 244, 252);
    doc.roundedRect(M, my - 4, colW, 58, 4, 4, 'F');
    label('Fabric weight', M + 10, my + 10);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    setText(INK);
    doc.text((doc.splitTextToSize(mfg.fabricWeight, colW - 20) as string[])[0], M + 10, my + 24);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    setText(MUTED);
    doc.text((doc.splitTextToSize(mfg.composition, colW - 20) as string[]).slice(0, 2), M + 10, my + 37);
    let ly = my + 72;
    ly = block('Construction', mfg.construction, M, ly, colW, footerLimit);
    ly = block('Trims & labels', mfg.trims, M, ly, colW, footerLimit);
    block('Care', mfg.care, M, ly, colW, footerLimit);

    // right column: factory print notes
    block('Factory print notes', mfg.printNotes, M + colW + 24, my + 6, colW, footerLimit);
    drawFooter(mfgPage);
  }

  /* ---------------- page 2: size specification ---------------- */
  if (spec) {
    const { chart, diagram } = spec;
    const unitName = chart.unit === 'in' ? 'inches' : 'cm';
    doc.addPage('letter', 'portrait');
    drawHeader('SIZE SPEC');

    let sy = 92;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    setText(INK);
    doc.text('Size Specification', M, sy);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    setText(MUTED);
    doc.text(`${garment.name}  -  base size ${chart.baseSize}  -  ${unitName}, garment laid flat`, M, sy + 14);
    sy += 30;
    doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    doc.line(M, sy, W - M, sy);
    sy += 12;

    // diagram + legend
    const dW = 190;
    const dH = dW * (GARMENT_H / GARMENT_W);
    doc.addImage(diagram, 'JPEG', M, sy, dW, dH);
    doc.rect(M, sy, dW, dH);
    const lx = M + dW + 18;
    let ly = sy + 6;
    label('Points of measure', lx, ly);
    ly += 6;
    const legendW = W - M - lx;
    for (const p of chart.points) {
      if (ly > sy + dH - 6) break;
      ly += 13.5;
      doc.setFillColor(ACCENT[0], ACCENT[1], ACCENT[2]);
      doc.circle(lx + 5, ly - 3, 5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(p.code.length > 1 ? 5.5 : 6.5);
      doc.setTextColor(255, 255, 255);
      doc.text(p.code, lx + 5, ly - 0.8, { align: 'center' });
      doc.setFontSize(8);
      setText(INK);
      doc.text(p.name, lx + 15, ly);
      doc.setFont('helvetica', 'normal');
      setText(MUTED);
      const nameW = doc.getTextWidth(p.name);
      if (p.how) doc.text((doc.splitTextToSize(`- ${p.how}`, legendW - 20 - nameW - 4) as string[])[0], lx + 15 + nameW + 4, ly);
    }
    sy += dH + 18;

    // graded table
    const codeW = 26;
    const nameColW = 150;
    const tolW = 40;
    const colW = (W - 2 * M - codeW - nameColW - tolW) / chart.sizes.length;
    const rowH = 16;
    const cols = { code: M, name: M + codeW, tol: M + codeW + nameColW };
    const sizeX = (i: number) => cols.tol + tolW + i * colW;
    const baseIdx = chart.sizes.indexOf(chart.baseSize);
    const maxRows = Math.floor((742 - 40 - sy - rowH) / rowH);
    const shownRows = Math.min(maxRows, chart.points.length);

    doc.setFillColor(242, 242, 245);
    doc.rect(M, sy, W - 2 * M, rowH, 'F');
    for (let r = 1; r <= shownRows; r += 2) {
      doc.setFillColor(250, 250, 251);
      doc.rect(M, sy + rowH * (r + 1), W - 2 * M, rowH, 'F');
    }
    if (baseIdx >= 0) {
      doc.setFillColor(237, 233, 254);
      doc.rect(sizeX(baseIdx), sy, colW, rowH * (shownRows + 1), 'F');
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    setText(MUTED);
    doc.text('CODE', cols.code + 4, sy + 10.5);
    doc.text('POINT OF MEASURE', cols.name, sy + 10.5);
    doc.text('TOL +/-', cols.tol + tolW - 4, sy + 10.5, { align: 'right' });
    chart.sizes.forEach((sz, i) => {
      if (i === baseIdx) setText(ACCENT);
      else setText(MUTED);
      doc.text(sz, sizeX(i) + colW - 5, sy + 10.5, { align: 'right' });
    });

    const issues = validateChart(chart);
    chart.points.slice(0, shownRows).forEach((p, r) => {
      const ry = sy + rowH * (r + 1);
      doc.setDrawColor(235, 235, 238);
      doc.line(M, ry + rowH, W - M, ry + rowH);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      setText(ACCENT);
      doc.text(p.code, cols.code + 4, ry + 11);
      setText(INK);
      doc.setFont('helvetica', 'normal');
      doc.text((doc.splitTextToSize(p.name, nameColW - 6) as string[])[0], cols.name, ry + 11);
      setText(MUTED);
      doc.text(formatMeasure(p.tolerance, chart.unit), cols.tol + tolW - 4, ry + 11, { align: 'right' });
      chart.sizes.forEach((sz, i) => {
        const v = p.values[sz];
        const bad = issues.some((x) => x.pointId === p.id && x.size === sz && x.kind !== 'off-grade');
        doc.setFont('helvetica', i === baseIdx ? 'bold' : 'normal');
        if (bad) doc.setTextColor(200, 40, 40);
        else setText(INK);
        doc.text(v == null ? '-' : formatMeasure(v, chart.unit), sizeX(i) + colW - 5, ry + 11, { align: 'right' });
      });
    });
    let ny = sy + rowH * (shownRows + 1) + 16;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    setText(MUTED);
    if (chart.points.length > shownRows) {
      doc.text(`+ ${chart.points.length - shownRows} more measurements in the CSV`, M, ny);
      ny += 10;
    }
    const specNote =
      `All measurements in ${unitName}, taken flat. Tolerances apply to every size. ` +
      (issues.some((i) => i.kind !== 'off-grade') ? 'Values in red break the grade progression and need review. ' : '') +
      'Approve a fit sample in the base size before grading production.';
    doc.text(doc.splitTextToSize(specNote, W - 2 * M) as string[], M, ny);
    drawFooter(sizePage);
  }

  return doc;
}

