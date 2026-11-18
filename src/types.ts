/** Built-in ids ('tee', 'joggers', …) or `custom-…` for user-uploaded blanks. See src/data/garments.ts. */
export type GarmentId = string;
/** Per-garment view id ('front', 'back', 'sleeve', 'left-leg', …). Each garment declares its own views. */
export type ViewId = string;
export type GarmentCategory = 'tops' | 'bottoms' | 'outerwear' | 'accessories' | 'custom';
export type PrintEffect = 'none' | 'screen' | 'puff' | 'vintage';

/** Serialized Fabric.js canvas (canvas.toObject()). */
export type CanvasJSON = { objects?: Array<Record<string, unknown>> } & Record<string, unknown>;

/** Keyed by view id. Views a garment doesn't have are kept (so switching back restores them) but ignored. */
export type ViewDesigns = Partial<Record<ViewId, CanvasJSON | null>>;
export type ViewEffects = Partial<Record<ViewId, PrintEffect>>;

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

export type SizeUnit = 'in' | 'cm';

/** One point of measure (POM). Values are always stored in inches; `unit` only affects display. */
export interface MeasurePoint {
  id: string;
  code: string;
  name: string;
  how: string;
  /** Grade increment per size step (inches). */
  grade: number;
  /** ± tolerance (inches). */
  tolerance: number;
  values: Record<string, number>;
  /** Key into the measurement diagram lines, when this POM has one. */
  diagram?: string;
}

export interface SizeChart {
  sizes: string[];
  baseSize: string;
  unit: SizeUnit;
  points: MeasurePoint[];
  includeInTechPack: boolean;
}

export type SizeCharts = Partial<Record<GarmentId, SizeChart>>;

/** Factory-facing fabric & print spec for one garment (all fields are editable free text). */
export interface ManufacturingSpec {
  fabricWeight: string;
  composition: string;
  construction: string;
  trims: string;
  printNotes: string;
  care: string;
  /** Print methods the spec was generated for, e.g. { front: 'puff' }, to flag when it's stale. */
  basedOn: Record<string, PrintEffect>;
  generatedAt: number;
}

export type ManufacturingSpecs = Partial<Record<GarmentId, ManufacturingSpec>>;

export interface Draft {
  id: string;
  name: string;
  garment: GarmentId;
  color: string;
  designs: ViewDesigns;
  effects: ViewEffects;
  sizeCharts?: SizeCharts;
  mfgSpecs?: ManufacturingSpecs;
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
  sizeCharts?: SizeCharts;
  mfgSpecs?: ManufacturingSpecs;
}

export const emptyDesigns = (): ViewDesigns => ({});
export const defaultEffects = (): ViewEffects => ({});
export const effectFor = (effects: ViewEffects, view: ViewId): PrintEffect => effects[view] ?? 'none';

export const hasArtwork = (json: CanvasJSON | null | undefined) => !!json?.objects?.some((o) => o.visible !== false);

/** How a custom (photo) blank is recolored: multiply suits white/light blanks, overlay keeps highlights. */
export type TintMode = 'multiply' | 'overlay' | 'none';

/** A user-uploaded blank, persisted in IndexedDB. */
export interface CustomGarmentRecord {
  id: string;
  name: string;
  tint: TintMode;
  views: Array<{ id: ViewId; label: string; image: string; zone: PrintZone }>;
  createdAt: number;
}
