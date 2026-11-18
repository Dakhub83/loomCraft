export type GarmentId = 'tee' | 'hoodie' | 'crewneck';
export type ViewId = 'front' | 'back' | 'sleeve';
export type PrintEffect = 'none' | 'screen' | 'puff' | 'vintage';

/** Serialized Fabric.js canvas (canvas.toObject()). */
export type CanvasJSON = { objects?: Array<Record<string, unknown>> } & Record<string, unknown>;

export type ViewDesigns = Record<ViewId, CanvasJSON | null>;
export type ViewEffects = Record<ViewId, PrintEffect>;

/** Printable area, in garment SVG units (1 unit = 1 screen px), plus its real-world size. */
export interface PrintZone {
  x: number;
  y: number;
  w: number;
  h: number;
  widthIn: number;
  heightIn: number;
  /** Human placement reference for the tech pack, e.g. "3 in below HPS". */
  placement: string;
}

export interface LayerInfo {
  id: string;
  name: string;
  kind: 'text' | 'image' | 'vector' | 'shape';
  visible: boolean;
  locked: boolean;
}

export interface SelectionInfo {
  id: string;
  name: string;
  kind: LayerInfo['kind'];
  multiple: boolean;
  opacity: number;
  widthIn: number;
  heightIn: number;
  angle: number;
  /** Effective print resolution for raster images at the current scale. */
  effectiveDpi?: number;
  text?: {
    fontFamily: string;
    fontSize: number;
    fill: string;
    charSpacing: number;
    fontWeight: string;
    fontStyle: string;
    textAlign: string;
    underline: boolean;
  };
}

export interface Draft {
  id: string;
  name: string;
  garment: GarmentId;
  color: string;
  designs: ViewDesigns;
  effects: ViewEffects;
  thumbnail?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Workspace {
  draftId: string | null;
  name: string;
  garment: GarmentId;
  color: string;
  designs: ViewDesigns;
  effects: ViewEffects;
}

export const VIEWS: ViewId[] = ['front', 'back', 'sleeve'];

export const emptyDesigns = (): ViewDesigns => ({ front: null, back: null, sleeve: null });
export const defaultEffects = (): ViewEffects => ({ front: 'none', back: 'none', sleeve: 'none' });

export const hasArtwork = (json: CanvasJSON | null) => !!json?.objects?.some((o) => o.visible !== false);
