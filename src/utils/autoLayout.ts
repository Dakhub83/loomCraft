import type { DesignCanvasHandle, PlacementBox } from '../components/DesignCanvas';
import { getGarment, getZone, hasView } from '../data/garments';
import type { GarmentId, PrintZone, ViewId } from '../types';

/* ================================================================================================
 * Auto-layout recipes: proven streetwear placements expressed as inch boxes relative to each view's
 * print area. A recipe takes the graphics on the current view (the selection, or every unlocked
 * layer, in layer order) and places them – copying a graphic to other views where the layout needs
 * it. Everything goes through the normal canvas API, so each view's undo history records the change.
 * ============================================================================================== */

export interface LayoutContext {
  canvas(): DesignCanvasHandle | null;
  state(): { garment: GarmentId; view: ViewId };
  /** Resolves once the new view's canvas has loaded. */
  setView(v: ViewId): Promise<void>;
}

interface Step {
  view: ViewId;
  /** Index into the source graphics (wraps around when there are fewer graphics). */
  graphic: number;
  box(z: PrintZone): PlacementBox;
}

export interface LayoutRecipe {
  id: string;
  name: string;
  description: string;
  /** Views the garment must have. */
  needs: ViewId[];
  /** Built from the number of graphics available. */
  steps(count: number, garment: GarmentId): Step[];
  /** Mini diagram: boxes in a 0–100 tee space per view. */
  glyph: Array<{ view: 'front' | 'back' | 'sleeve'; x: number; y: number; w: number; h: number }>;
}

/* ---------- inch boxes ---------- */

const leftChest = (z: PrintZone): PlacementBox => {
  const w = Math.min(3.5, z.widthIn * 0.35);
  return { cx: z.widthIn / 2 + Math.min(3.25, z.widthIn / 2 - w / 2 - 0.25), top: Math.min(0.5, z.heightIn * 0.05), maxW: w, maxH: Math.min(3.5, z.heightIn) };
};
const centerLogo = (z: PrintZone, size = 4): PlacementBox => ({
  cx: z.widthIn / 2,
  top: Math.min(1, z.heightIn * 0.08),
  maxW: Math.min(size, z.widthIn),
  maxH: Math.min(size, z.heightIn * 0.9),
});
const oversizedBack = (z: PrintZone): PlacementBox => ({ cx: z.widthIn / 2, top: Math.min(1, z.heightIn * 0.06), maxW: z.widthIn, maxH: z.heightIn * 0.92 });
const sleeveHit = (z: PrintZone): PlacementBox => ({
  cx: z.widthIn / 2,
  top: Math.min(1, z.heightIn * 0.08),
  maxW: z.widthIn * 0.9,
  maxH: Math.min(z.heightIn * 0.85, Math.max(3, z.widthIn * 1.2)),
});
const neckHit = (z: PrintZone): PlacementBox => ({ cx: z.widthIn / 2, top: 0.25, maxW: Math.min(3, z.widthIn * 0.3), maxH: Math.min(1.25, z.heightIn * 0.12) });
const belowNeckHit = (z: PrintZone): PlacementBox => ({ cx: z.widthIn / 2, top: 2.25, maxW: z.widthIn, maxH: Math.max(1, z.heightIn - 2.75) });

/* ---------- recipes ---------- */

export const LAYOUT_RECIPES: LayoutRecipe[] = [
  {
    id: 'left-chest-back',
    name: 'Minimal Left Chest + Oversized Back',
    description: '3.5″ left-chest hit on the front, full-width statement on the back. Uses your first graphic for the chest and the second (or the same) for the back.',
    needs: ['front', 'back'],
    steps: (n) => [
      { view: 'front', graphic: 0, box: leftChest },
      { view: 'back', graphic: n > 1 ? 1 : 0, box: oversizedBack },
    ],
    glyph: [
      { view: 'front', x: 58, y: 30, w: 12, h: 12 },
      { view: 'back', x: 28, y: 26, w: 44, h: 52 },
    ],
  },
  {
    id: 'center-stack',
    name: 'Center Stacked Editorial',
    description: 'Every graphic stacked down the center chest: a large hero, then smaller supporting lines with even 0.4″ spacing.',
    needs: ['front'],
    steps: (n) => Array.from({ length: Math.max(1, n) }, (_, i) => ({ view: 'front', graphic: i, box: centerLogo })),
    glyph: [
      { view: 'front', x: 30, y: 26, w: 40, h: 20 },
      { view: 'front', x: 38, y: 50, w: 24, h: 8 },
      { view: 'front', x: 38, y: 62, w: 24, h: 8 },
    ],
  },
  {
    id: 'sleeve-chest',
    name: 'Sleeve Hit + Chest Logo',
    description: '4″ center-chest logo on the front with a matching hit down the sleeve.',
    needs: ['front', 'sleeve'],
    steps: (n) => [
      { view: 'front', graphic: 0, box: (z) => centerLogo(z, 4) },
      { view: 'sleeve', graphic: n > 1 ? 1 : 0, box: sleeveHit },
    ],
    glyph: [
      { view: 'front', x: 40, y: 28, w: 20, h: 16 },
      { view: 'sleeve', x: 42, y: 22, w: 16, h: 30 },
    ],
  },
  {
    id: 'neck-hit-back',
    name: 'Neck Hit + Big Back',
    description: 'Small 3″ hit under the back collar, with the main graphic filling the back below it.',
    needs: ['back'],
    steps: (n) => [
      { view: 'back', graphic: n > 1 ? 1 : 0, box: neckHit },
      { view: 'back', graphic: 0, box: belowNeckHit },
    ],
    glyph: [
      { view: 'back', x: 42, y: 18, w: 16, h: 6 },
      { view: 'back', x: 28, y: 30, w: 44, h: 46 },
    ],
  },
];

export function recipeAvailability(recipe: LayoutRecipe, garment: GarmentId): string | null {
  const missing = recipe.needs.filter((v) => !hasView(garment, v));
  return missing.length ? `The ${getGarment(garment).name} has no ${missing.join(' / ')} view` : null;
}

const STACK_GAP_IN = 0.4;

/** Runs a recipe. Returns a short summary for a toast. Throws with a user-facing message on failure. */
export async function runLayout(recipe: LayoutRecipe, ctx: LayoutContext): Promise<string> {
  const unavailable = recipeAvailability(recipe, ctx.state().garment);
  if (unavailable) throw new Error(unavailable);
  const canvas = ctx.canvas();
  if (!canvas) throw new Error('The canvas is still loading.');

  const sourceView = ctx.state().view;
  const selected = canvas.selectedIds();
  const ids = selected.length ? selected : canvas.describeLayers().filter((l) => l.visible && !l.locked).map((l) => l.id);
  if (!ids.length) throw new Error('Add or upload a graphic on this view first, then choose a layout.');

  const garment = ctx.state().garment;
  const copies = canvas.exportLayers(ids);
  const steps = recipe.steps(ids.length, garment).map((s) => ({ ...s, graphic: s.graphic % ids.length }));
  const views = [...new Set(steps.map((s) => s.view))].sort((a, b) => (a === sourceView ? -1 : b === sourceView ? 1 : 0));

  for (const view of views) {
    if (view !== ctx.state().view) await ctx.setView(view);
    const c = ctx.canvas();
    if (!c) throw new Error('The canvas is still loading.');
    const zone = getZone(garment, view);
    const usedOriginals = new Set<number>();
    let cursorIn: number | null = null; // vertical stacking for multi-step views

    for (const step of steps.filter((s) => s.view === view)) {
      // The source view moves its own graphics; other views (or a second use) get copies.
      let layerId: string;
      if (view === sourceView && !usedOriginals.has(step.graphic)) {
        layerId = ids[step.graphic];
        usedOriginals.add(step.graphic);
      } else {
        [layerId] = await c.importLayers([copies[step.graphic]]);
      }
      const box = step.box(zone);
      if (recipe.id === 'center-stack') {
        const hero = cursorIn == null;
        const top: number = cursorIn ?? box.top;
        const remaining = zone.heightIn - top;
        const stackBox: PlacementBox = {
          cx: zone.widthIn / 2,
          top,
          maxW: hero ? Math.min(10, zone.widthIn) : Math.min(6, zone.widthIn * 0.6),
          maxH: Math.max(0.5, hero ? zone.heightIn * 0.5 : Math.min(zone.heightIn * 0.2, remaining)),
        };
        c.placeLayers([layerId], stackBox);
        const placed = c.describeLayers().find((l) => l.id === layerId);
        cursorIn = top + (placed?.heightIn ?? 0) + STACK_GAP_IN;
      } else {
        c.placeLayers([layerId], box);
      }
    }
  }

  const finalView = views.includes('front') ? 'front' : views[0];
  if (ctx.state().view !== finalView) await ctx.setView(finalView);
  ctx.canvas()?.selectLayers([]);
  return `${recipe.name} applied to ${views.length > 1 ? views.join(' + ') : `the ${views[0]} view`}`;
}

/** Centers all unlocked layers on the current view as a group, 1″ below the top of the print area. */
export function balanceView(ctx: LayoutContext): string {
  const c = ctx.canvas();
  if (!c) throw new Error('The canvas is still loading.');
  const layers = c.describeLayers().filter((l) => l.visible && !l.locked);
  if (!layers.length) throw new Error('Nothing to balance on this view yet.');
  const z = getZone(ctx.state().garment, ctx.state().view);
  const width = Math.max(...layers.map((l) => l.centerOffsetIn + l.widthIn / 2)) - Math.min(...layers.map((l) => l.centerOffsetIn - l.widthIn / 2));
  const top = Math.min(...layers.map((l) => l.topIn));
  const bottom = Math.max(...layers.map((l) => l.topIn + l.heightIn));
  // Keep the current size unless it overflows the print area.
  const box: PlacementBox = { cx: z.widthIn / 2, top: Math.min(1, z.heightIn * 0.08), maxW: Math.min(width, z.widthIn), maxH: Math.min(bottom - top, z.heightIn * 0.92) };
  c.placeLayers(layers.map((l) => l.id), box);
  return 'Centered and balanced the artwork on this view';
}
