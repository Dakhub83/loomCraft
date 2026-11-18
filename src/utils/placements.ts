import type { PrintZone, ViewId } from '../types';

export type PlacementId = 'left-chest' | 'center-chest' | 'full-back';

export interface PlacementPreset {
  id: PlacementId;
  name: string;
  view: ViewId;
  hint: string;
  /** Target box in inches, relative to the print zone (top-left origin). */
  box(zone: PrintZone): { cx: number; top: number; maxW: number; maxH: number };
}

/**
 * Industry-typical placements. The artwork is scaled to fit the box (up or down), then
 * horizontally centered on `cx` with its top edge at `top`.
 */
export const PLACEMENTS: PlacementPreset[] = [
  {
    id: 'left-chest',
    name: 'Left Chest',
    view: 'front',
    hint: '3.5″ max · wearer’s left',
    box: (z) => {
      const w = Math.min(3.5, z.widthIn * 0.35);
      // Wearer's left chest appears on the viewer's right.
      const cx = z.widthIn / 2 + Math.min(3.25, z.widthIn / 2 - w / 2 - 0.25);
      return { cx, top: 0.5, maxW: w, maxH: Math.min(3.5, z.heightIn - 0.5) };
    },
  },
  {
    id: 'center-chest',
    name: 'Center Chest',
    view: 'front',
    hint: '10″ wide · 1″ below top',
    box: (z) => ({
      cx: z.widthIn / 2,
      top: Math.min(1, z.heightIn * 0.08),
      maxW: Math.min(10, z.widthIn),
      maxH: Math.min(10, z.heightIn - Math.min(1, z.heightIn * 0.08)),
    }),
  },
  {
    id: 'full-back',
    name: 'Full Back',
    view: 'back',
    hint: 'Max print area',
    box: (z) => ({ cx: z.widthIn / 2, top: 0.5, maxW: z.widthIn, maxH: z.heightIn - 0.5 }),
  },
];

export const getPlacement = (id: PlacementId) => PLACEMENTS.find((p) => p.id === id)!;

/** Preset applied to new uploads on each view (sleeve uploads just fit the zone). */
export const defaultPlacementFor = (view: ViewId): PlacementPreset | null =>
  view === 'front' ? getPlacement('center-chest') : view === 'back' ? getPlacement('full-back') : null;
