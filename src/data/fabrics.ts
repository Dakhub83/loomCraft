import type { GarmentId } from '../types';
import { getGarment } from './garments';

/* ================================================================================================
 * Fabric library. Pure data (no Three.js): the 3D viewer turns `look` into procedural weave maps and
 * a sheen material; the manufacturing-spec generator uses the weight / composition / fiber fields when
 * a fabric is chosen explicitly for a garment.
 * ============================================================================================== */

export type WeaveKind = 'jersey' | 'pique' | 'fleece' | 'terry' | 'rib' | 'nylon' | 'twill' | 'denim' | 'canvas' | 'mesh' | 'performance';

export interface FabricLook {
  weave: WeaveKind;
  /** Size of one texture tile in inches. */
  tileIn: number;
  roughness: number;
  /** Soft velvet-like rim light typical of cloth (0–1). */
  sheen: number;
  sheenRoughness: number;
  normalStrength: number;
  /** Slub / heather variation in the base color (0–0.2). */
  mottle: number;
  /** Small specular coat for coated synthetics. */
  clearcoat?: number;
  /** Perforated knit: holes cut with the alpha test. */
  holes?: boolean;
}

export interface FabricDef {
  id: string;
  name: string;
  short: string;
  gsm: number;
  weightNote?: string;
  composition: string;
  fiber: 'cotton' | 'cotton-blend' | 'nylon' | 'acrylic' | 'canvas' | 'polyester';
  care: string;
  description: string;
  look: FabricLook;
}

const COTTON_CARE = 'Machine wash cold inside out · tumble dry low · do not iron print · do not dry clean';

export const FABRICS: FabricDef[] = [
  {
    id: 'jersey',
    name: 'Cotton jersey',
    short: 'Jersey',
    gsm: 220,
    composition: '100% combed ring-spun cotton, single jersey (30/1)',
    fiber: 'cotton',
    care: COTTON_CARE,
    description: 'Smooth knit face with a soft matte drape: the classic tee.',
    look: { weave: 'jersey', tileIn: 0.5, roughness: 0.92, sheen: 0.35, sheenRoughness: 0.6, normalStrength: 0.35, mottle: 0.03 },
  },
  {
    id: 'heavy-jersey',
    name: 'Heavyweight jersey',
    short: 'Heavy jersey',
    gsm: 280,
    composition: '100% cotton, open-end heavyweight jersey (20/1)',
    fiber: 'cotton',
    care: COTTON_CARE,
    description: 'Dense, structured streetwear tee knit with a dry hand.',
    look: { weave: 'jersey', tileIn: 0.6, roughness: 0.95, sheen: 0.3, sheenRoughness: 0.7, normalStrength: 0.5, mottle: 0.05 },
  },
  {
    id: 'pique',
    name: 'Cotton piqué',
    short: 'Piqué',
    gsm: 220,
    composition: '100% combed cotton piqué',
    fiber: 'cotton',
    care: COTTON_CARE,
    description: 'Textured honeycomb knit used for polos.',
    look: { weave: 'pique', tileIn: 0.5, roughness: 0.9, sheen: 0.3, sheenRoughness: 0.6, normalStrength: 0.8, mottle: 0.02 },
  },
  {
    id: 'fleece',
    name: 'Brushed fleece',
    short: 'Fleece',
    gsm: 420,
    composition: '80% cotton / 20% polyester brushed fleece',
    fiber: 'cotton-blend',
    care: COTTON_CARE,
    description: 'Soft, lofty face with a fuzzy sheen: hoodies and joggers.',
    look: { weave: 'fleece', tileIn: 1.2, roughness: 1, sheen: 0.8, sheenRoughness: 0.45, normalStrength: 0.3, mottle: 0.06 },
  },
  {
    id: 'terry',
    name: 'French terry',
    short: 'Terry',
    gsm: 400,
    composition: '100% cotton French terry (loopback)',
    fiber: 'cotton',
    care: COTTON_CARE,
    description: 'Flat knit face, loops inside: crewnecks and lighter fleece.',
    look: { weave: 'terry', tileIn: 0.6, roughness: 0.95, sheen: 0.45, sheenRoughness: 0.55, normalStrength: 0.45, mottle: 0.04 },
  },
  {
    id: 'rib',
    name: '1×1 rib knit',
    short: 'Rib knit',
    gsm: 0,
    weightNote: '1×1 rib knit, 12-gauge',
    composition: '100% acrylic (or merino/acrylic blend)',
    fiber: 'acrylic',
    care: 'Hand wash cold · lay flat to dry',
    description: 'Stretchy vertical ribs: beanies, cuffs and collars.',
    look: { weave: 'rib', tileIn: 0.5, roughness: 0.95, sheen: 0.5, sheenRoughness: 0.5, normalStrength: 1, mottle: 0.04 },
  },
  {
    id: 'nylon',
    name: 'Nylon taslan',
    short: 'Nylon',
    gsm: 110,
    weightNote: '70D nylon taslan shell',
    composition: '100% nylon taslan with water-repellent finish',
    fiber: 'nylon',
    care: 'Machine wash cold, gentle · hang dry · do not iron · do not dry clean',
    description: 'Smooth, slightly glossy shell: coach jackets and windbreakers.',
    look: { weave: 'nylon', tileIn: 0.25, roughness: 0.42, sheen: 0.15, sheenRoughness: 0.3, normalStrength: 0.25, mottle: 0.01, clearcoat: 0.25 },
  },
  {
    id: 'twill',
    name: 'Cotton twill',
    short: 'Twill',
    gsm: 270,
    weightNote: 'Washed cotton twill',
    composition: '100% cotton twill, garment-washed',
    fiber: 'cotton',
    care: COTTON_CARE,
    description: 'Diagonal weave: caps, chinos and cargo pants.',
    look: { weave: 'twill', tileIn: 0.35, roughness: 0.85, sheen: 0.2, sheenRoughness: 0.6, normalStrength: 0.7, mottle: 0.05 },
  },
  {
    id: 'denim',
    name: 'Rigid denim',
    short: 'Denim',
    gsm: 400,
    weightNote: '12 oz/yd² rigid denim',
    composition: '100% cotton 3×1 right-hand twill denim',
    fiber: 'cotton',
    care: 'Machine wash cold inside out · hang dry · expect fading',
    description: 'Heavy diagonal twill with slubby, faded yarn.',
    look: { weave: 'denim', tileIn: 0.4, roughness: 0.88, sheen: 0.15, sheenRoughness: 0.7, normalStrength: 0.9, mottle: 0.16 },
  },
  {
    id: 'canvas',
    name: 'Duck canvas',
    short: 'Canvas',
    gsm: 400,
    weightNote: '12 oz/yd² duck canvas',
    composition: '100% cotton duck canvas',
    fiber: 'canvas',
    care: 'Spot clean or hand wash cold · line dry',
    description: 'Tight plain weave, stiff and durable: totes and work jackets.',
    look: { weave: 'canvas', tileIn: 0.3, roughness: 0.9, sheen: 0.12, sheenRoughness: 0.7, normalStrength: 0.8, mottle: 0.07 },
  },
  {
    id: 'performance',
    name: 'Performance polyester',
    short: 'Performance',
    gsm: 140,
    composition: '100% recycled polyester birdseye interlock, moisture-wicking finish',
    fiber: 'polyester',
    care: 'Machine wash cold · do not tumble dry · do not iron prints · no fabric softener',
    description: 'Light, quick-dry sports knit with a fine birdseye face: kits and training wear.',
    look: { weave: 'performance', tileIn: 0.3, roughness: 0.62, sheen: 0.3, sheenRoughness: 0.35, normalStrength: 0.45, mottle: 0.01, clearcoat: 0.06 },
  },
  {
    id: 'compression',
    name: 'Compression knit',
    short: 'Compression',
    gsm: 220,
    composition: '78% recycled polyester / 22% elastane, 4-way stretch warp knit',
    fiber: 'polyester',
    care: 'Machine wash cold · do not tumble dry · do not iron · no fabric softener',
    description: 'Smooth, high-stretch knit with a slight sheen: base layers and compression shorts.',
    look: { weave: 'jersey', tileIn: 0.22, roughness: 0.66, sheen: 0.4, sheenRoughness: 0.35, normalStrength: 0.2, mottle: 0.005 },
  },
  {
    id: 'mesh',
    name: 'Athletic mesh',
    short: 'Mesh',
    gsm: 150,
    composition: '100% polyester athletic mesh',
    fiber: 'polyester',
    care: 'Machine wash cold · tumble dry low · do not iron',
    description: 'Open, breathable knit with small holes: shorts and jerseys.',
    look: { weave: 'mesh', tileIn: 0.35, roughness: 0.6, sheen: 0.25, sheenRoughness: 0.4, normalStrength: 0.6, mottle: 0, holes: true },
  },
];

const BY_ID = new Map(FABRICS.map((f) => [f.id, f]));
export const getFabric = (id: string | undefined): FabricDef | undefined => (id ? BY_ID.get(id) : undefined);

const GARMENT_DEFAULT: Record<string, string> = {
  tee: 'heavy-jersey',
  longsleeve: 'jersey',
  polo: 'pique',
  tank: 'jersey',
  crop: 'jersey',
  hoodie: 'fleece',
  ziphoodie: 'fleece',
  crewneck: 'terry',
  joggers: 'fleece',
  shorts: 'terry',
  cargo: 'twill',
  coach: 'nylon',
  work: 'canvas',
  tote: 'canvas',
  dadhat: 'twill',
  beanie: 'rib',
  'soccer-jersey': 'performance',
  'gk-jersey': 'performance',
  'training-top': 'performance',
  'soccer-shorts': 'performance',
  'soccer-socks': 'rib',
  'base-layer': 'compression',
  'compression-shorts': 'compression',
};

/** Fabrics that suit a garment, its default first. The picker shows these before the rest. */
const SUGGEST: Record<string, string[]> = {
  tops: ['jersey', 'heavy-jersey', 'pique', 'performance', 'terry', 'fleece'],
  bottoms: ['fleece', 'terry', 'twill', 'denim', 'performance', 'mesh'],
  outerwear: ['nylon', 'canvas', 'denim', 'fleece', 'twill'],
  soccer: ['performance', 'mesh', 'pique', 'jersey', 'compression'],
  accessories: ['canvas', 'twill', 'denim', 'rib', 'nylon'],
};
const SUGGEST_BY_ID: Record<string, string[]> = {
  'soccer-socks': ['rib', 'performance'],
  'base-layer': ['compression', 'performance', 'jersey'],
  'compression-shorts': ['compression', 'performance'],
  hoodie: ['fleece', 'terry', 'heavy-jersey'],
  ziphoodie: ['fleece', 'terry', 'heavy-jersey'],
  crewneck: ['terry', 'fleece', 'heavy-jersey'],
  beanie: ['rib'],
};

export function suggestedFabrics(garment: GarmentId): FabricDef[] {
  const ids = [defaultFabricFor(garment).id, ...(SUGGEST_BY_ID[garment] ?? SUGGEST[getGarment(garment).category] ?? [])];
  return [...new Set(ids)].map((id) => BY_ID.get(id)).filter((f): f is FabricDef => !!f);
}

/** The fabric a garment is made of by default (before the user picks one). */
export function defaultFabricFor(garment: GarmentId): FabricDef {
  const id = GARMENT_DEFAULT[garment];
  if (id) return BY_ID.get(id)!;
  const cat = getGarment(garment).category;
  return BY_ID.get(cat === 'outerwear' ? 'nylon' : cat === 'accessories' ? 'canvas' : cat === 'soccer' ? 'performance' : 'jersey')!;
}

/** The fabric in use: an explicit choice for this garment, else its default. */
export const fabricFor = (fabrics: Partial<Record<GarmentId, string>> | undefined, garment: GarmentId): FabricDef =>
  getFabric(fabrics?.[garment]) ?? defaultFabricFor(garment);
