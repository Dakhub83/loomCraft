import type { CustomGarmentRecord, GarmentCategory, GarmentId, PrintZone, TintMode, ViewId } from '../types';

/* ================================================================================================
 * LoomCraft garment registry.
 *
 * Each garment declares its category, its own views (any ids – front, back, sleeve, left-leg, …),
 * a print zone per view in the 500 × 560 garment space with its real size in inches, starting
 * size-spec points, and (for vector blanks) flat-lay artwork as data. The UI, canvas, exports,
 * PDF tech pack, size charts and AI assistant all read from here – add a garment by adding data.
 *
 * Artwork vocabulary (rendered by GarmentSVG, every color derived from the garment hex):
 *   panels   fabric pieces – filled, volume-shaded, outlined (drawn in order)
 *   behind   pieces under the panels (garment interiors, hoods)
 *   ribs     knit bands: a stroke whose dashes become perpendicular ribs; clip:true = texture only
 *   seams / stitches / folds / cords / eyelets (metal) / buttons (fabric-toned)
 * ============================================================================================== */

export const GARMENT_W = 500;
export const GARMENT_H = 560;

export interface Panel {
  d: string;
  /** Lighten (+) / darken (-) relative to the garment color. */
  tone?: number;
  /** Skip volume shading (used for interiors / openings). */
  flat?: boolean;
}
export interface Band {
  d: string;
  w: number;
  tone?: number;
  /** Texture-only ribs clipped to the silhouette (knit crowns). */
  clip?: boolean;
}
export interface VectorArt {
  behind?: Panel[];
  panels: Panel[];
  ribs?: Band[];
  seams?: string[];
  stitches?: string[];
  folds?: string[];
  cords?: Band[];
  eyelets?: Array<[number, number]>;
  buttons?: Array<[number, number, number]>;
}

export interface GarmentView {
  id: ViewId;
  label: string;
  /** Vector flat-lay (built-ins). */
  art?: VectorArt;
  /** Photo flat-lay data URL (custom garments). */
  image?: string;
  zone: PrintZone;
}

export interface MeasureLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** [code, name, how to measure, base value (in), grade per size (in), ± tolerance (in), diagram line key?] */
export type PomSeed = [code: string, name: string, how: string, base: number, grade: number, tol: number, diagram?: string];

export interface GarmentDef {
  id: GarmentId;
  name: string;
  short: string;
  category: GarmentCategory;
  /** Optional sub-heading inside a category tab (e.g. "Fleece" under Tops). */
  group?: string;
  spec: string;
  views: GarmentView[];
  /** `ladder`: the sizes grade steps are counted on, when not the apparel ladder (e.g. US shoe sizes). */
  sizeChart: { sizes?: string[]; base?: string; ladder?: string[]; points: PomSeed[] };
  /** Measurement diagram lines on the first view (optional). */
  measureLines?: Record<string, MeasureLine>;
  /** Present for user-uploaded blanks. */
  custom?: { tint: TintMode };
}

export const CATEGORIES: Array<{ id: GarmentCategory; label: string }> = [
  { id: 'tops', label: 'Tops' },
  { id: 'bottoms', label: 'Bottoms' },
  { id: 'outerwear', label: 'Outerwear' },
  { id: 'soccer', label: 'Soccer' },
  { id: 'bags', label: 'Bags' },
  { id: 'footwear', label: 'Footwear' },
  { id: 'accessories', label: 'Headwear' },
  { id: 'custom', label: 'Custom' },
];

const zone = (x: number, y: number, w: number, h: number, widthIn: number, heightIn: number, placement: string): PrintZone => ({
  x, y, w, h, widthIn, heightIn, placement,
});

/* ------------------------------------------------------------------------- shared sleeve views */

const LONG_SLEEVE_ART: VectorArt = {
  panels: [{ d: 'M140,62 C196,22 304,22 360,62 L332,468 L168,468 Z' }],
  ribs: [{ d: 'M170,490 L330,490', w: 44 }],
  stitches: ['M148,74 C202,38 298,38 352,74', 'M170,462 L330,462'],
  folds: ['M200,140 Q212,300 196,450', 'M300,140 Q288,300 304,450', 'M180,300 Q250,316 320,300'],
};
const LONG_SLEEVE_VIEW: GarmentView = {
  id: 'sleeve',
  label: 'Sleeve',
  art: LONG_SLEEVE_ART,
  zone: zone(215, 110, 70, 300, 3.5, 15, 'Left sleeve, centered, ~2 in below shoulder seam'),
};
const SHORT_SLEEVE_ART: VectorArt = {
  panels: [{ d: 'M90,170 C150,92 350,92 410,170 L446,420 Q250,436 54,420 Z' }],
  stitches: ['M100,176 C158,104 342,104 400,176', 'M58,402 Q250,418 442,402', 'M57,409 Q250,425 443,409'],
  folds: ['M170,200 Q190,300 176,390', 'M330,200 Q312,300 326,390'],
};
const SHORT_SLEEVE_VIEW: GarmentView = {
  id: 'sleeve',
  label: 'Sleeve',
  art: SHORT_SLEEVE_ART,
  zone: zone(160, 190, 180, 180, 4.5, 4.5, 'Left sleeve, centered, ~1.5 in above hem'),
};

/* ------------------------------------------------------------------------- TOPS */

const TEE_SLEEVES: Panel[] = [
  { d: 'M96,66 L18,190 L64,224 L100,206 Q88,140 96,66 Z' },
  { d: 'M404,66 L482,190 L436,224 L400,206 Q412,140 404,66 Z' },
];
const TEE_BODY_BELOW = 'L404,66 Q412,140 400,206 L404,528 Q250,538 96,528 L100,206 Q88,140 96,66 Z';
const TEE_STITCH = [
  'M103,68 Q95,140 107,206', 'M397,68 Q405,140 393,206', 'M25,178 L71,212', 'M475,178 L429,212',
  'M98,514 Q250,524 402,514', 'M98,519 Q250,529 402,519',
];
const TEE_FOLDS = ['M150,250 Q162,330 146,430', 'M352,256 Q340,340 356,436', 'M420,100 Q446,150 452,196', 'M80,100 Q54,150 48,196', 'M210,470 Q250,490 296,472'];

const TEE: GarmentDef = {
  id: 'tee',
  name: 'Boxy Tee',
  short: 'Boxy Tee',
  category: 'tops',
  spec: '240 GSM combed cotton jersey · boxy fit · dropped shoulder',
  views: [
    {
      id: 'front',
      label: 'Front',
      art: {
        behind: [{ d: 'M188,40 C220,54 280,54 312,40 C290,84 210,84 188,40 Z', tone: -0.38, flat: true }],
        panels: [...TEE_SLEEVES, { d: `M188,40 C210,84 290,84 312,40 ${TEE_BODY_BELOW}` }],
        ribs: [{ d: 'M190,41.5 C220,53 280,53 310,41.5', w: 5, tone: -0.2 }, { d: 'M189,43 C211,88 289,88 311,43', w: 11 }],
        stitches: ['M186,49 C210,99 290,99 314,49', ...TEE_STITCH],
        folds: TEE_FOLDS,
      },
      zone: zone(130, 112, 240, 300, 12, 15, 'Center chest, ~3 in below HPS'),
    },
    {
      id: 'back',
      label: 'Back',
      art: {
        panels: [...TEE_SLEEVES, { d: `M188,40 C215,52 285,52 312,40 ${TEE_BODY_BELOW}` }],
        ribs: [{ d: 'M189,43 C216,57 284,57 311,43', w: 8 }],
        stitches: ['M186,50 C214,66 286,66 314,50', ...TEE_STITCH],
        folds: TEE_FOLDS,
      },
      zone: zone(130, 90, 240, 320, 12, 16, 'Center back, ~2.5 in below collar seam'),
    },
    SHORT_SLEEVE_VIEW,
  ],
  sizeChart: {
    points: [
      ['A', 'Chest width', '1" below armhole, side to side', 23.5, 1, 0.5, 'chest'],
      ['B', 'Body length', 'From HPS straight down to hem', 29, 0.75, 0.5, 'length'],
      ['C', 'Shoulder width', 'Drop-shoulder seam to seam', 23, 1, 0.375, 'shoulder'],
      ['D', 'Sleeve length', 'Shoulder seam to sleeve hem', 8.5, 0.25, 0.25, 'sleeve'],
      ['E', 'Sleeve opening', 'Straight across sleeve hem', 7.75, 0.375, 0.25, 'opening'],
      ['F', 'Bottom width', 'Straight across hem', 23.5, 1, 0.5, 'hem'],
      ['G', 'Neck width', 'Seam to seam at HPS', 7.5, 0.25, 0.25, 'neck'],
      ['H', 'Front neck drop', 'HPS line to front neck seam', 3.75, 0.125, 0.125, 'drop'],
      ['I', 'Collar rib height', 'Rib edge to seam', 1, 0, 0.125, 'rib'],
    ],
  },
  measureLines: {
    chest: { x1: 101, y1: 228, x2: 400, y2: 228 },
    length: { x1: 188, y1: 40, x2: 188, y2: 531 },
    shoulder: { x1: 96, y1: 56, x2: 404, y2: 56 },
    sleeve: { x1: 404, y1: 66, x2: 459, y2: 207 },
    opening: { x1: 490, y1: 197, x2: 444, y2: 231 },
    hem: { x1: 96, y1: 548, x2: 404, y2: 548 },
    neck: { x1: 188, y1: 28, x2: 312, y2: 28 },
    drop: { x1: 250, y1: 40, x2: 250, y2: 73 },
    rib: { x1: 280, y1: 72, x2: 280, y2: 84 },
  },
};

const LS_SLEEVES: Panel[] = [
  { d: 'M108,74 L58,132 Q38,290 36,452 L86,456 Q92,330 106,236 Q98,170 108,74 Z' },
  { d: 'M392,74 L442,132 Q462,290 464,452 L414,456 Q408,330 394,236 Q402,170 392,74 Z' },
];
const LS_BELOW = 'L392,74 Q402,170 394,236 L398,528 Q250,536 102,528 L106,236 Q98,170 108,74 Z';
const LS_COMMON = {
  ribs: [{ d: 'M86,474 L36,470', w: 36 }, { d: 'M414,474 L464,470', w: 36 }],
  stitches: ['M114,78 Q104,170 112,236', 'M386,78 Q396,170 388,236', 'M104,514 Q250,522 396,514', 'M104,519 Q250,527 396,519'],
  folds: ['M66,200 Q50,320 56,430', 'M434,200 Q450,320 444,430', 'M150,260 Q160,350 150,440', 'M350,260 Q340,350 350,440'],
};

const LONGSLEEVE: GarmentDef = {
  id: 'longsleeve',
  name: 'Long-Sleeve Tee',
  short: 'Long Sleeve',
  category: 'tops',
  spec: '220 GSM cotton jersey · regular fit · rib cuffs',
  views: [
    {
      id: 'front',
      label: 'Front',
      art: {
        behind: [{ d: 'M192,44 C220,56 280,56 308,44 C286,88 214,88 192,44 Z', tone: -0.38, flat: true }],
        panels: [...LS_SLEEVES, { d: `M192,44 C214,88 286,88 308,44 ${LS_BELOW}` }],
        ribs: [{ d: 'M194,45.5 C220,56 280,56 306,45.5', w: 5, tone: -0.2 }, { d: 'M193,47 C214,92 286,92 307,47', w: 10 }, ...LS_COMMON.ribs],
        stitches: ['M190,53 C212,102 288,102 310,53', ...LS_COMMON.stitches],
        folds: LS_COMMON.folds,
      },
      zone: zone(140, 110, 220, 280, 11, 14, 'Center chest, ~3 in below HPS'),
    },
    {
      id: 'back',
      label: 'Back',
      art: {
        panels: [...LS_SLEEVES, { d: `M192,44 C218,56 282,56 308,44 ${LS_BELOW}` }],
        ribs: [{ d: 'M193,47 C219,60 281,60 307,47', w: 8 }, ...LS_COMMON.ribs],
        stitches: ['M190,54 C217,69 283,69 310,54', ...LS_COMMON.stitches],
        folds: LS_COMMON.folds,
      },
      zone: zone(130, 90, 240, 320, 12, 16, 'Center back, ~2.5 in below collar seam'),
    },
    LONG_SLEEVE_VIEW,
  ],
  sizeChart: {
    points: [
      ['A', 'Chest width', '1" below armhole, side to side', 22.5, 1, 0.5],
      ['B', 'Body length', 'From HPS to hem', 29, 0.75, 0.5],
      ['C', 'Shoulder width', 'Seam to seam', 20, 0.75, 0.375],
      ['D', 'Sleeve length', 'Shoulder seam to cuff edge', 25, 0.5, 0.375],
      ['E', 'Bicep width', '1" below armhole', 9, 0.375, 0.25],
      ['F', 'Cuff opening', 'Straight across cuff', 4, 0.125, 0.125],
      ['G', 'Neck width', 'Seam to seam at HPS', 7.25, 0.25, 0.25],
      ['H', 'Front neck drop', 'HPS line to front neck seam', 3.75, 0.125, 0.125],
    ],
  },
};

const POLO_SLEEVES: Panel[] = [
  { d: 'M110,72 L40,180 L84,214 L112,196 Q100,140 110,72 Z' },
  { d: 'M390,72 L460,180 L416,214 L388,196 Q400,140 390,72 Z' },
];
const POLO_BELOW = 'L390,72 Q400,140 388,196 L392,528 Q250,536 108,528 L112,196 Q100,140 110,72 Z';
const POLO_COMMON = {
  ribs: [{ d: 'M45,174 L89,207', w: 12 }, { d: 'M455,174 L411,207', w: 12 }],
  stitches: ['M116,76 Q106,140 118,196', 'M384,76 Q394,140 382,196', 'M110,512 Q250,520 390,512', 'M114,504 L114,528', 'M386,504 L386,528'],
  folds: ['M150,250 Q162,340 148,440', 'M350,256 Q338,340 352,440', 'M410,100 Q436,140 444,180', 'M90,100 Q64,140 56,180'],
};

const POLO: GarmentDef = {
  id: 'polo',
  name: 'Polo Shirt',
  short: 'Polo',
  category: 'tops',
  spec: '220 GSM piqué · rib collar & armbands · 3-button placket',
  views: [
    {
      id: 'front',
      label: 'Front',
      art: {
        behind: [{ d: 'M188,52 C210,30 290,30 312,52 L304,58 C284,42 216,42 196,58 Z', tone: -0.06 }],
        panels: [
          ...POLO_SLEEVES,
          { d: `M196,50 L250,96 L304,50 ${POLO_BELOW}` },
          { d: 'M238,96 L262,96 L262,196 L238,196 Z', tone: 0.02 },
          { d: 'M196,52 C212,46 236,44 250,96 L246,104 L208,116 C200,96 194,72 196,52 Z', tone: -0.02 },
          { d: 'M304,52 C288,46 264,44 250,96 L254,104 L292,116 C300,96 306,72 304,52 Z', tone: -0.02 },
        ],
        ribs: POLO_COMMON.ribs,
        stitches: [...POLO_COMMON.stitches, 'M242,104 L242,192 L258,192 L258,104', 'M202,60 C204,84 206,100 210,110', 'M298,60 C296,84 294,100 290,110'],
        buttons: [[250, 124, 4.5], [250, 152, 4.5], [250, 180, 4.5]],
        folds: POLO_COMMON.folds,
      },
      zone: zone(150, 210, 200, 240, 10, 12, 'Center front, below placket'),
    },
    {
      id: 'back',
      label: 'Back',
      art: {
        panels: [...POLO_SLEEVES, { d: `M196,50 C220,62 280,62 304,50 ${POLO_BELOW}` }, { d: 'M190,48 C214,36 286,36 310,48 L310,60 C286,50 214,50 190,60 Z', tone: -0.04 }],
        ribs: POLO_COMMON.ribs,
        stitches: [...POLO_COMMON.stitches, 'M192,64 C216,56 284,56 308,64'],
        folds: POLO_COMMON.folds,
      },
      zone: zone(130, 90, 240, 320, 12, 16, 'Center back, ~2.5 in below collar'),
    },
    SHORT_SLEEVE_VIEW,
  ],
  sizeChart: {
    points: [
      ['A', 'Chest width', '1" below armhole, side to side', 22, 1, 0.5],
      ['B', 'Body length', 'From HPS to hem', 29, 0.75, 0.5],
      ['C', 'Shoulder width', 'Seam to seam', 19, 0.75, 0.375],
      ['D', 'Sleeve length', 'Shoulder seam to armband edge', 9, 0.25, 0.25],
      ['E', 'Sleeve opening', 'Across armband', 7, 0.375, 0.25],
      ['F', 'Collar length', 'Point to point, laid flat', 16, 0.5, 0.25],
      ['G', 'Placket length', 'Top to bottom of placket', 7, 0, 0.125],
      ['H', 'Collar point', 'Collar point length', 2.75, 0, 0.125],
    ],
  },
};

const TANK: GarmentDef = {
  id: 'tank',
  name: 'Tank Top / Singlet',
  short: 'Tank',
  category: 'tops',
  spec: '180 GSM cotton jersey · bound neck & armholes',
  views: [
    {
      id: 'front',
      label: 'Front',
      art: {
        behind: [{ d: 'M176,40 C204,58 296,58 324,40 C300,96 200,96 176,40 Z', tone: -0.38, flat: true }],
        panels: [{ d: 'M176,40 C200,96 300,96 324,40 L352,40 Q350,130 392,196 L398,528 Q250,536 102,528 L108,196 Q150,130 148,40 Z' }],
        ribs: [
          { d: 'M178,41.5 C204,56 296,56 322,41.5', w: 4, tone: -0.2 },
          { d: 'M177,43 C201,99 299,99 323,43', w: 8 },
          { d: 'M148,42 Q150,130 108,196', w: 8 },
          { d: 'M352,42 Q350,130 392,196', w: 8 },
        ],
        stitches: ['M182,50 C205,108 295,108 318,50', 'M158,44 Q160,134 116,200', 'M342,44 Q340,134 384,200', 'M104,514 Q250,522 396,514', 'M104,519 Q250,527 396,519'],
        folds: ['M150,260 Q162,350 148,450', 'M350,260 Q338,350 352,450', 'M210,470 Q250,490 290,472'],
      },
      zone: zone(140, 120, 220, 280, 11, 14, 'Center chest, below neckline'),
    },
    {
      id: 'back',
      label: 'Back',
      art: {
        panels: [{ d: 'M176,40 C204,58 296,58 324,40 L352,40 Q350,130 392,196 L398,528 Q250,536 102,528 L108,196 Q150,130 148,40 Z' }],
        ribs: [{ d: 'M177,43 C204,62 296,62 323,43', w: 8 }, { d: 'M148,42 Q150,130 108,196', w: 8 }, { d: 'M352,42 Q350,130 392,196', w: 8 }],
        stitches: ['M180,51 C206,70 294,70 320,51', 'M158,44 Q160,134 116,200', 'M342,44 Q340,134 384,200', 'M104,514 Q250,522 396,514', 'M104,519 Q250,527 396,519'],
        folds: ['M150,260 Q162,350 148,450', 'M350,260 Q338,350 352,450'],
      },
      zone: zone(140, 80, 220, 300, 11, 15, 'Center back, ~2 in below neckline'),
    },
  ],
  sizeChart: {
    points: [
      ['A', 'Chest width', '1" below armhole, side to side', 21, 1, 0.5],
      ['B', 'Body length', 'From HPS to hem', 28.5, 0.75, 0.5],
      ['C', 'Strap width', 'Across shoulder strap', 1.75, 0, 0.125],
      ['D', 'Armhole depth', 'Shoulder to underarm, straight', 10, 0.5, 0.25],
      ['E', 'Front neck drop', 'HPS line to front neck', 6, 0.25, 0.125],
      ['F', 'Bottom width', 'Straight across hem', 21, 1, 0.5],
    ],
  },
};

const CROP: GarmentDef = {
  id: 'crop',
  name: 'Crop Top',
  short: 'Crop',
  category: 'tops',
  spec: '220 GSM cotton jersey · boxy cropped fit · dropped shoulder',
  views: [
    {
      id: 'front',
      label: 'Front',
      art: {
        behind: [{ d: 'M188,60 C220,74 280,74 312,60 C290,104 210,104 188,60 Z', tone: -0.38, flat: true }],
        panels: [
          { d: 'M96,86 L22,206 L66,238 L100,226 Q88,160 96,86 Z' },
          { d: 'M404,86 L478,206 L434,238 L400,226 Q412,160 404,86 Z' },
          { d: 'M188,60 C210,104 290,104 312,60 L404,86 Q412,160 400,226 L404,400 Q250,408 96,400 L100,226 Q88,160 96,86 Z' },
        ],
        ribs: [{ d: 'M190,61.5 C220,73 280,73 310,61.5', w: 5, tone: -0.2 }, { d: 'M189,63 C211,108 289,108 311,63', w: 10 }],
        stitches: ['M186,69 C210,118 290,118 314,69', 'M103,88 Q95,160 107,226', 'M397,88 Q405,160 393,226', 'M29,194 L73,226', 'M471,194 L427,226', 'M98,388 Q250,396 402,388'],
        folds: ['M150,260 Q160,320 150,380', 'M350,260 Q340,320 350,380', 'M420,120 Q446,170 452,214', 'M80,120 Q54,170 48,214'],
      },
      zone: zone(140, 130, 220, 220, 11, 11, 'Center chest, ~3 in below HPS'),
    },
    {
      id: 'back',
      label: 'Back',
      art: {
        panels: [
          { d: 'M96,86 L22,206 L66,238 L100,226 Q88,160 96,86 Z' },
          { d: 'M404,86 L478,206 L434,238 L400,226 Q412,160 404,86 Z' },
          { d: 'M188,60 C215,72 285,72 312,60 L404,86 Q412,160 400,226 L404,400 Q250,408 96,400 L100,226 Q88,160 96,86 Z' },
        ],
        ribs: [{ d: 'M189,63 C216,77 284,77 311,63', w: 8 }],
        stitches: ['M186,70 C214,86 286,86 314,70', 'M103,88 Q95,160 107,226', 'M397,88 Q405,160 393,226', 'M98,388 Q250,396 402,388'],
        folds: ['M150,260 Q160,320 150,380', 'M350,260 Q340,320 350,380'],
      },
      zone: zone(140, 110, 220, 240, 11, 12, 'Center back, ~2.5 in below collar'),
    },
    SHORT_SLEEVE_VIEW,
  ],
  sizeChart: {
    points: [
      ['A', 'Chest width', '1" below armhole, side to side', 23, 1, 0.5],
      ['B', 'Body length', 'From HPS to hem', 20, 0.5, 0.375],
      ['C', 'Shoulder width', 'Drop-shoulder seam to seam', 22, 1, 0.375],
      ['D', 'Sleeve length', 'Shoulder seam to sleeve hem', 8, 0.25, 0.25],
      ['E', 'Sleeve opening', 'Straight across sleeve hem', 7.5, 0.375, 0.25],
      ['F', 'Bottom width', 'Straight across hem', 23, 1, 0.5],
    ],
  },
};

/* ------------------------------------------------------------------------- FLEECE */

const HOODIE_SLEEVES: Panel[] = [
  { d: 'M100,112 L48,172 Q30,300 26,440 L80,444 Q86,330 102,232 Q92,180 100,112 Z' },
  { d: 'M400,112 L452,172 Q470,300 474,440 L420,444 Q414,330 398,232 Q408,180 400,112 Z' },
];
const HOODIE_BODY = 'M168,104 L332,104 L400,112 Q408,180 398,232 L398,472 L102,472 L102,232 Q92,180 100,112 Z';
const HOODIE_RIBS: Band[] = [{ d: 'M102,496 L398,496', w: 48 }, { d: 'M80,464 L27,460', w: 40 }, { d: 'M420,464 L473,460', w: 40 }];
const HOODIE_STITCH = ['M107,114 Q99,180 109,232', 'M393,114 Q401,180 391,232', 'M104,477 L396,477'];
const HOODIE_FOLDS = ['M440,210 Q456,320 448,420', 'M60,210 Q44,320 52,420', 'M405,300 Q430,312 456,300', 'M95,300 Q70,312 44,300'];
const HOOD_BEHIND: Panel[] = [
  { d: 'M168,104 C156,34 200,8 250,8 C300,8 344,34 332,104 Z', tone: -0.06 },
  { d: 'M196,98 C192,50 218,30 250,30 C282,30 308,50 304,98 C290,124 270,142 250,152 C230,142 210,124 196,98 Z', tone: -0.42, flat: true },
];
const HOOD_RIMS: Panel[] = [
  { d: 'M168,104 C164,62 192,32 226,24 C206,42 194,68 196,98 C212,126 236,148 266,162 L248,174 C212,158 180,136 168,104 Z' },
  { d: 'M332,104 C336,62 308,32 274,24 C294,42 306,68 304,98 C288,126 264,148 234,162 L252,174 C288,158 320,136 332,104 Z' },
];
const HOOD_CORDS: Band[] = [
  { d: 'M222,142 Q214,220 224,296', w: 4.5 },
  { d: 'M278,142 Q286,220 276,296', w: 4.5 },
  { d: 'M224,296 L225,314', w: 6.5, tone: -0.3 },
  { d: 'M276,296 L275,314', w: 6.5, tone: -0.3 },
];
const HOOD_RIM_STITCH = ['M175,104 C172,68 196,40 220,32', 'M325,104 C328,68 304,40 280,32'];
const HOODIE_BACK_ART: VectorArt = {
  panels: [
    ...HOODIE_SLEEVES,
    { d: HOODIE_BODY },
    { d: 'M168,104 C150,24 210,4 250,4 C290,4 350,24 332,104 C322,168 292,198 250,204 C208,198 178,168 168,104 Z' },
  ],
  ribs: HOODIE_RIBS,
  seams: ['M250,6 L250,203'],
  stitches: [...HOODIE_STITCH, 'M244,9 L244,200', 'M256,9 L256,200'],
  folds: [...HOODIE_FOLDS, 'M170,260 Q160,350 172,440', 'M330,260 Q340,350 328,440', 'M200,60 Q220,120 210,170'],
};
const HOODIE_BACK_VIEW: GarmentView = {
  id: 'back',
  label: 'Back',
  art: HOODIE_BACK_ART,
  zone: zone(130, 222, 240, 230, 12, 11.5, 'Center back, ~2 in below hood seam'),
};
const HOODIE_SEEDS: PomSeed[] = [
  ['A', 'Chest width', '1" below armhole, side to side', 25, 1, 0.5, 'chest'],
  ['B', 'Body length', 'From HPS to bottom of waistband', 27, 0.75, 0.5, 'length'],
  ['C', 'Shoulder width', 'Drop-shoulder seam to seam', 24, 1, 0.375, 'shoulder'],
  ['D', 'Sleeve length', 'Shoulder seam to cuff edge', 23, 0.5, 0.375, 'sleeve'],
  ['E', 'Bicep width', '1" below armhole, perpendicular to sleeve', 10.5, 0.375, 0.25, 'bicep'],
  ['F', 'Cuff width (relaxed)', 'Straight across cuff', 4, 0.125, 0.125, 'cuff'],
  ['G', 'Cuff height', 'Cuff seam to edge', 3, 0, 0.125, 'cuffH'],
  ['H', 'Waistband width (relaxed)', 'Straight across waistband', 21, 1, 0.5, 'waist'],
  ['I', 'Waistband height', 'Waistband seam to edge', 3, 0, 0.125, 'waistH'],
  ['J', 'Hood height', 'Neck seam to top of hood', 14, 0.25, 0.25, 'hoodH'],
  ['K', 'Hood width', 'Hood laid flat, edge to back seam', 11, 0.25, 0.25, 'hoodW'],
  ['L', 'Pouch width (top)', 'Across top of kangaroo pocket', 13, 0.5, 0.25, 'pouch'],
];
const HOODIE_LINES: Record<string, MeasureLine> = {
  chest: { x1: 103, y1: 250, x2: 397, y2: 250 },
  length: { x1: 150, y1: 108, x2: 150, y2: 520 },
  shoulder: { x1: 100, y1: 118, x2: 400, y2: 118 },
  sleeve: { x1: 400, y1: 112, x2: 447, y2: 482 },
  bicep: { x1: 399, y1: 240, x2: 462, y2: 232 },
  cuff: { x1: 420, y1: 464, x2: 473, y2: 460 },
  cuffH: { x1: 482, y1: 440, x2: 484, y2: 482 },
  waist: { x1: 102, y1: 532, x2: 398, y2: 532 },
  waistH: { x1: 88, y1: 472, x2: 88, y2: 520 },
  hoodH: { x1: 352, y1: 10, x2: 352, y2: 104 },
  hoodW: { x1: 160, y1: 56, x2: 340, y2: 56 },
  pouch: { x1: 172, y1: 344, x2: 328, y2: 344 },
};

const HOODIE: GarmentDef = {
  id: 'hoodie',
  name: 'Pullover Hoodie',
  short: 'Hoodie',
  category: 'tops',
  group: 'Fleece',
  spec: '450 GSM brushed fleece · boxy cropped fit · double-layer hood',
  views: [
    {
      id: 'front',
      label: 'Front',
      art: {
        behind: HOOD_BEHIND,
        panels: [...HOODIE_SLEEVES, { d: HOODIE_BODY }, { d: 'M172,352 L328,352 L372,470 L128,470 Z', tone: 0.02 }, ...HOOD_RIMS],
        ribs: HOODIE_RIBS,
        stitches: [...HOODIE_STITCH, 'M176,358 L324,358', 'M178,355 L135,467', 'M322,355 L365,467', ...HOOD_RIM_STITCH],
        folds: [...HOODIE_FOLDS, 'M150,250 Q160,310 150,340', 'M350,250 Q340,310 352,340', 'M200,420 Q250,440 300,420'],
        cords: HOOD_CORDS,
        eyelets: [[222, 140], [278, 140]],
      },
      zone: zone(140, 176, 220, 170, 11, 8.5, 'Center chest above pouch, ~4 in below neck seam'),
    },
    HOODIE_BACK_VIEW,
    LONG_SLEEVE_VIEW,
  ],
  sizeChart: { points: HOODIE_SEEDS },
  measureLines: HOODIE_LINES,
};

const ZIPHOODIE: GarmentDef = {
  id: 'ziphoodie',
  name: 'Zip-Up Hoodie',
  short: 'Zip Hoodie',
  category: 'tops',
  group: 'Fleece',
  spec: '420 GSM brushed fleece · full-length metal zip · split pockets',
  views: [
    {
      id: 'front',
      label: 'Front',
      art: {
        behind: HOOD_BEHIND,
        panels: [
          ...HOODIE_SLEEVES,
          { d: HOODIE_BODY },
          { d: 'M128,470 L152,360 L242,360 L242,470 Z', tone: 0.02 },
          { d: 'M372,470 L348,360 L258,360 L258,470 Z', tone: 0.02 },
          ...HOOD_RIMS,
        ],
        ribs: [...HOODIE_RIBS, { d: 'M250,160 L250,520', w: 7, tone: -0.28 }],
        stitches: [...HOODIE_STITCH, 'M156,366 L238,366', 'M262,366 L344,366', 'M155,364 L133,462', 'M345,364 L367,462', 'M243,160 L243,470', 'M257,160 L257,470', ...HOOD_RIM_STITCH],
        folds: [...HOODIE_FOLDS, 'M150,250 Q160,310 150,340', 'M350,250 Q340,310 352,340'],
        cords: HOOD_CORDS,
        eyelets: [[222, 140], [278, 140], [250, 168]],
      },
      zone: zone(285, 185, 80, 80, 4, 4, "Wearer's left chest, beside zipper"),
    },
    HOODIE_BACK_VIEW,
    LONG_SLEEVE_VIEW,
  ],
  sizeChart: {
    points: [...HOODIE_SEEDS.slice(0, 11), ['L', 'Zipper length', 'Neck seam to hem, along zip', 24, 0.5, 0.25]],
  },
  measureLines: HOODIE_LINES,
};

const CREW_SLEEVES: Panel[] = [
  { d: 'M108,78 L54,140 Q34,290 32,440 L84,444 Q90,330 104,238 Q96,170 108,78 Z' },
  { d: 'M392,78 L446,140 Q466,290 468,440 L416,444 Q410,330 396,238 Q404,170 392,78 Z' },
];
const CREW_BELOW = 'L392,78 Q404,170 396,238 L398,476 L102,476 L104,238 Q96,170 108,78 Z';
const CREW_RIBS: Band[] = [{ d: 'M102,498 L398,498', w: 44 }, { d: 'M84,464 L32,460', w: 40 }, { d: 'M416,464 L468,460', w: 40 }];
const CREW_STITCH = ['M114,82 Q103,170 111,238', 'M386,82 Q397,170 389,238', 'M104,481 L396,481'];
const CREW_FOLDS = ['M436,200 Q452,320 446,420', 'M64,200 Q48,320 54,420', 'M150,250 Q162,340 150,420', 'M350,250 Q338,340 350,420', 'M410,300 Q432,312 458,300', 'M90,300 Q68,312 42,300'];

const CREWNECK: GarmentDef = {
  id: 'crewneck',
  name: 'Crewneck Sweatshirt',
  short: 'Crewneck',
  category: 'tops',
  group: 'Fleece',
  spec: '380 GSM loopback terry · relaxed fit · V-stitch insert',
  views: [
    {
      id: 'front',
      label: 'Front',
      art: {
        behind: [{ d: 'M195,52 C222,64 278,64 305,52 C285,92 215,92 195,52 Z', tone: -0.38, flat: true }],
        panels: [...CREW_SLEEVES, { d: `M195,52 C215,92 285,92 305,52 ${CREW_BELOW}` }],
        ribs: [{ d: 'M197,53.5 C222,64 278,64 303,53.5', w: 5, tone: -0.2 }, { d: 'M196,55 C216,96 284,96 304,55', w: 12 }, ...CREW_RIBS],
        stitches: ['M193,60 C214,108 286,108 307,60', 'M238,100 L250,122 L262,100', ...CREW_STITCH],
        folds: CREW_FOLDS,
      },
      zone: zone(140, 118, 220, 260, 11, 13, 'Center chest, ~3 in below HPS'),
    },
    {
      id: 'back',
      label: 'Back',
      art: {
        panels: [...CREW_SLEEVES, { d: `M195,52 C222,64 278,64 305,52 ${CREW_BELOW}` }],
        ribs: [{ d: 'M196,54.5 C222,67 278,67 304,54.5', w: 8 }, ...CREW_RIBS],
        stitches: ['M194,60 C222,74 278,74 306,60', ...CREW_STITCH],
        folds: CREW_FOLDS,
      },
      zone: zone(130, 96, 240, 300, 12, 15, 'Center back, ~2.5 in below collar seam'),
    },
    LONG_SLEEVE_VIEW,
  ],
  sizeChart: {
    points: [
      ['A', 'Chest width', '1" below armhole, side to side', 24, 1, 0.5, 'chest'],
      ['B', 'Body length', 'From HPS to bottom of waistband', 27.5, 0.75, 0.5, 'length'],
      ['C', 'Shoulder width', 'Seam to seam', 22, 0.75, 0.375, 'shoulder'],
      ['D', 'Sleeve length', 'Shoulder seam to cuff edge', 24, 0.5, 0.375, 'sleeve'],
      ['E', 'Bicep width', '1" below armhole, perpendicular to sleeve', 10, 0.375, 0.25, 'bicep'],
      ['F', 'Cuff width (relaxed)', 'Straight across cuff', 4, 0.125, 0.125, 'cuff'],
      ['G', 'Cuff height', 'Cuff seam to edge', 2.75, 0, 0.125, 'cuffH'],
      ['H', 'Waistband width (relaxed)', 'Straight across waistband', 20.5, 1, 0.5, 'waist'],
      ['I', 'Waistband height', 'Waistband seam to edge', 2.75, 0, 0.125, 'waistH'],
      ['J', 'Neck width', 'Seam to seam at HPS', 7.75, 0.25, 0.25, 'neck'],
      ['K', 'Front neck drop', 'HPS line to front neck seam', 3.25, 0.125, 0.125, 'drop'],
      ['L', 'Collar rib height', 'Rib edge to seam', 1, 0, 0.125, 'rib'],
    ],
  },
  measureLines: {
    chest: { x1: 105, y1: 256, x2: 396, y2: 256 },
    length: { x1: 160, y1: 62, x2: 160, y2: 520 },
    shoulder: { x1: 108, y1: 66, x2: 392, y2: 66 },
    sleeve: { x1: 392, y1: 78, x2: 442, y2: 484 },
    bicep: { x1: 397, y1: 245, x2: 458, y2: 236 },
    cuff: { x1: 416, y1: 464, x2: 468, y2: 460 },
    cuffH: { x1: 477, y1: 440, x2: 479, y2: 482 },
    waist: { x1: 102, y1: 532, x2: 398, y2: 532 },
    waistH: { x1: 88, y1: 476, x2: 88, y2: 520 },
    neck: { x1: 195, y1: 40, x2: 305, y2: 40 },
    drop: { x1: 250, y1: 52, x2: 250, y2: 82 },
    rib: { x1: 280, y1: 82, x2: 280, y2: 95 },
  },
};

/* ------------------------------------------------------------------------- BOTTOMS */

const JOGGER_BODY = 'M142,40 L358,40 Q366,110 370,180 Q366,330 352,470 L286,470 Q272,330 258,232 Q250,224 242,232 Q228,330 214,470 L148,470 Q134,330 130,180 Q134,110 142,40 Z';
const JOGGER_COMMON = {
  ribs: [{ d: 'M142,58 L358,58', w: 36 }, { d: 'M150,488 L212,488', w: 36 }, { d: 'M288,488 L350,488', w: 36 }],
  seams: ['M250,76 L250,228'],
  folds: ['M170,320 Q192,334 214,326', 'M286,326 Q308,334 330,320', 'M160,420 Q180,440 168,466', 'M340,420 Q320,440 332,466', 'M180,240 Q186,330 178,420', 'M320,240 Q314,330 322,420'],
};
const JOGGER_FRONT_ART: VectorArt = {
  panels: [{ d: JOGGER_BODY }],
  ribs: JOGGER_COMMON.ribs,
  seams: JOGGER_COMMON.seams,
  stitches: ['M140,82 L170,150', 'M360,82 L330,150', 'M143,79 L357,79'],
  folds: JOGGER_COMMON.folds,
  cords: [{ d: 'M242,66 Q236,96 240,124', w: 3.5 }, { d: 'M258,66 Q264,96 260,124', w: 3.5 }, { d: 'M240,124 L241,136', w: 5.5, tone: -0.3 }, { d: 'M260,124 L259,136', w: 5.5, tone: -0.3 }],
  eyelets: [[242, 62], [258, 62]],
};
const JOGGER_BACK_ART: VectorArt = {
  panels: [{ d: JOGGER_BODY }],
  ribs: JOGGER_COMMON.ribs,
  seams: JOGGER_COMMON.seams,
  stitches: ['M143,79 L357,79', 'M166,150 L222,150', 'M278,150 L334,150'],
  folds: JOGGER_COMMON.folds,
};

const JOGGERS: GarmentDef = {
  id: 'joggers',
  name: 'Sweatpants / Joggers',
  short: 'Joggers',
  category: 'bottoms',
  spec: '380 GSM fleece · elastic waist with drawcord · rib cuffs',
  views: [
    { id: 'front', label: 'Front', art: JOGGER_FRONT_ART, zone: zone(268, 96, 70, 70, 3.5, 3.5, "Wearer's left hip, below waistband") },
    { id: 'back', label: 'Back', art: JOGGER_BACK_ART, zone: zone(150, 84, 200, 60, 10, 3, 'Back, below waistband') },
    { id: 'left-leg', label: 'Left Leg', art: JOGGER_FRONT_ART, zone: zone(286, 236, 63, 220, 4, 14, "Front of wearer's left leg, ~2 in below crotch") },
    { id: 'right-leg', label: 'Right Leg', art: JOGGER_FRONT_ART, zone: zone(151, 236, 63, 220, 4, 14, "Front of wearer's right leg, ~2 in below crotch") },
  ],
  sizeChart: {
    points: [
      ['A', 'Waist (relaxed)', 'Across top of waistband, relaxed', 14, 1, 0.5],
      ['B', 'Waist (stretched)', 'Across waistband, fully stretched', 18, 1, 0.5],
      ['C', 'Hip', '7" below waist seam, across', 21.5, 1, 0.5],
      ['D', 'Front rise', 'Waist seam to crotch seam, front', 12, 0.25, 0.25],
      ['E', 'Back rise', 'Waist seam to crotch seam, back', 15.5, 0.25, 0.25],
      ['F', 'Inseam', 'Crotch seam to cuff edge', 29, 0.25, 0.5],
      ['G', 'Thigh', '1" below crotch, across leg', 12.5, 0.5, 0.25],
      ['H', 'Knee', 'Midway down inseam, across leg', 9.5, 0.375, 0.25],
      ['I', 'Leg opening', 'Across cuff, relaxed', 4.25, 0.125, 0.125],
      ['J', 'Cuff height', 'Cuff seam to edge', 3, 0, 0.125],
    ],
  },
};

const SHORTS_BODY = 'M142,60 L358,60 Q368,130 376,240 L384,380 L268,388 L256,282 Q250,274 244,282 L232,388 L116,380 L124,240 Q132,130 142,60 Z';
const SHORTS_COMMON = {
  ribs: [{ d: 'M142,78 L358,78', w: 36 }],
  seams: ['M250,96 L250,278'],
  stitches: ['M143,99 L357,99', 'M118,366 L232,373', 'M268,373 L382,366', 'M119,372 L232,379', 'M268,379 L381,372'],
  folds: ['M160,300 Q170,340 160,374', 'M340,300 Q330,340 340,374', 'M200,290 Q214,320 222,340'],
};
const SHORTS_FRONT_ART: VectorArt = {
  panels: [{ d: SHORTS_BODY }],
  ribs: SHORTS_COMMON.ribs,
  seams: SHORTS_COMMON.seams,
  stitches: [...SHORTS_COMMON.stitches, 'M140,104 L166,174', 'M360,104 L334,174'],
  folds: SHORTS_COMMON.folds,
  cords: [{ d: 'M242,86 Q236,116 240,142', w: 3.5 }, { d: 'M258,86 Q264,116 260,142', w: 3.5 }],
  eyelets: [[242, 82], [258, 82]],
};

const SHORTS: GarmentDef = {
  id: 'shorts',
  name: 'Mesh / Sweat Shorts',
  short: 'Shorts',
  category: 'bottoms',
  spec: '330 GSM fleece or athletic mesh · 7" inseam · elastic waist',
  views: [
    { id: 'left-leg', label: 'Left Leg', art: SHORTS_FRONT_ART, zone: zone(282, 270, 80, 80, 4, 4, "Wearer's left leg, lower front") },
    { id: 'right-leg', label: 'Right Leg', art: SHORTS_FRONT_ART, zone: zone(138, 270, 80, 80, 4, 4, "Wearer's right leg, lower front") },
    {
      id: 'back',
      label: 'Back',
      art: { panels: [{ d: SHORTS_BODY }], ribs: SHORTS_COMMON.ribs, seams: SHORTS_COMMON.seams, stitches: SHORTS_COMMON.stitches, folds: SHORTS_COMMON.folds },
      zone: zone(150, 104, 200, 60, 10, 3, 'Back, below waistband'),
    },
  ],
  sizeChart: {
    points: [
      ['A', 'Waist (relaxed)', 'Across top of waistband, relaxed', 14, 1, 0.5],
      ['B', 'Hip', '7" below waist seam, across', 22, 1, 0.5],
      ['C', 'Front rise', 'Waist seam to crotch seam, front', 12, 0.25, 0.25],
      ['D', 'Back rise', 'Waist seam to crotch seam, back', 15.5, 0.25, 0.25],
      ['E', 'Inseam', 'Crotch seam to hem', 7, 0, 0.25],
      ['F', 'Thigh', '1" below crotch, across leg', 13.5, 0.5, 0.25],
      ['G', 'Leg opening', 'Across hem', 13, 0.5, 0.25],
    ],
  },
};

const CARGO_BODY = 'M146,40 L354,40 Q364,110 372,190 L386,520 L268,522 L256,238 Q250,230 244,238 L232,522 L114,520 L128,190 Q136,110 146,40 Z';
const CARGO_COMMON_PANELS: Panel[] = [
  { d: CARGO_BODY },
  { d: 'M146,40 L354,40 L355,62 L145,62 Z', tone: -0.03 },
  { d: 'M158,36 L166,36 L166,66 L158,66 Z', tone: -0.04 },
  { d: 'M213,36 L221,36 L221,66 L213,66 Z', tone: -0.04 },
  { d: 'M279,36 L287,36 L287,66 L279,66 Z', tone: -0.04 },
  { d: 'M334,36 L342,36 L342,66 L334,66 Z', tone: -0.04 },
];
const CARGO_FOLDS = ['M170,420 Q190,432 210,424', 'M290,424 Q310,432 330,420', 'M210,250 Q214,330 206,410', 'M290,250 Q286,330 294,410'];
const CARGO_FRONT_ART: VectorArt = {
  panels: [
    ...CARGO_COMMON_PANELS,
    { d: 'M126,300 L180,300 L180,400 L122,400 Z', tone: 0.02 },
    { d: 'M124,286 L184,286 L184,316 L122,316 Z', tone: -0.04 },
    { d: 'M374,300 L320,300 L320,400 L378,400 Z', tone: 0.02 },
    { d: 'M376,286 L316,286 L316,316 L378,316 Z', tone: -0.04 },
  ],
  seams: ['M250,62 L250,232'],
  stitches: [
    'M147,45 L353,45', 'M147,58 L353,58', 'M262,62 L262,186 Q262,204 250,210', 'M148,70 Q190,80 196,140', 'M352,70 Q310,80 304,140',
    'M126,306 L176,306', 'M374,306 L324,306', 'M116,506 L230,507', 'M270,507 L384,506',
  ],
  folds: CARGO_FOLDS,
  buttons: [[250, 52, 5], [154, 310, 4], [346, 310, 4]],
};

const CARGO: GarmentDef = {
  id: 'cargo',
  name: 'Cargo Pants',
  short: 'Cargo',
  category: 'bottoms',
  spec: '10 oz cotton twill · relaxed straight leg · flap cargo pockets',
  views: [
    { id: 'front', label: 'Front', art: CARGO_FRONT_ART, zone: zone(268, 84, 70, 70, 3.5, 3.5, "Wearer's left hip, below waistband") },
    {
      id: 'back',
      label: 'Back',
      art: {
        panels: [...CARGO_COMMON_PANELS, { d: 'M162,96 L226,96 L224,170 L164,170 Z', tone: 0.02 }, { d: 'M338,96 L274,96 L276,170 L336,170 Z', tone: 0.02 }],
        seams: ['M250,62 L250,232'],
        stitches: ['M147,45 L353,45', 'M147,58 L353,58', 'M166,102 L222,102', 'M334,102 L278,102', 'M116,506 L230,507', 'M270,507 L384,506'],
        folds: CARGO_FOLDS,
      },
      zone: zone(160, 190, 64, 160, 4, 10, "Back of wearer's left thigh"),
    },
    { id: 'left-leg', label: 'Left Leg', art: CARGO_FRONT_ART, zone: zone(258, 240, 56, 224, 3.5, 14, "Front of wearer's left leg, inside the cargo pocket") },
    { id: 'right-leg', label: 'Right Leg', art: CARGO_FRONT_ART, zone: zone(186, 240, 56, 224, 3.5, 14, "Front of wearer's right leg, inside the cargo pocket") },
  ],
  sizeChart: {
    points: [
      ['A', 'Waist', 'Across top of waistband, buttoned', 16, 1, 0.5],
      ['B', 'Hip', '7" below waist seam, across', 22, 1, 0.5],
      ['C', 'Front rise', 'Waist seam to crotch seam, front', 12.5, 0.25, 0.25],
      ['D', 'Back rise', 'Waist seam to crotch seam, back', 16, 0.25, 0.25],
      ['E', 'Inseam', 'Crotch seam to hem', 30, 0, 0.5],
      ['F', 'Thigh', '1" below crotch, across leg', 13.5, 0.5, 0.25],
      ['G', 'Knee', 'Midway down inseam, across leg', 11, 0.375, 0.25],
      ['H', 'Leg opening', 'Across hem', 10, 0.25, 0.25],
      ['I', 'Cargo pocket width', 'Across cargo pocket', 7, 0, 0.125],
    ],
  },
};

/* ------------------------------------------------------------------------- OUTERWEAR */

const JACKET_SLEEVES: Panel[] = [
  { d: 'M112,84 L60,140 Q42,300 40,470 L92,474 Q96,340 108,246 Q100,180 112,84 Z' },
  { d: 'M388,84 L440,140 Q458,300 460,470 L408,474 Q404,340 392,246 Q400,180 388,84 Z' },
];
const JACKET_BELOW = 'L388,84 Q400,180 392,246 L396,520 L104,520 L108,246 Q100,180 112,84 Z';
const POINT_COLLAR: Panel[] = [
  { d: 'M194,60 C210,52 230,56 250,94 L246,100 L200,122 C190,100 186,78 194,60 Z', tone: -0.02 },
  { d: 'M306,60 C290,52 270,56 250,94 L254,100 L300,122 C310,100 314,78 306,60 Z', tone: -0.02 },
];
const JACKET_FOLDS = ['M66,200 Q50,320 56,440', 'M434,200 Q450,320 444,440', 'M160,280 Q170,380 160,480', 'M340,280 Q330,380 340,480', 'M86,320 Q66,330 48,320', 'M414,320 Q434,330 452,320'];

const COACH: GarmentDef = {
  id: 'coach',
  name: 'Coach Jacket',
  short: 'Coach',
  category: 'outerwear',
  spec: 'Water-resistant nylon shell · snap front · drawcord hem',
  views: [
    {
      id: 'front',
      label: 'Front',
      art: {
        behind: [{ d: 'M184,62 C208,34 292,34 316,62 L306,68 C286,48 214,48 194,68 Z', tone: -0.06 }],
        panels: [...JACKET_SLEEVES, { d: `M196,56 L250,92 L304,56 ${JACKET_BELOW}` }, ...POINT_COLLAR],
        ribs: [{ d: 'M92,486 L40,482', w: 26, tone: -0.04 }, { d: 'M408,486 L460,482', w: 26, tone: -0.04 }],
        seams: ['M250,96 L250,520'],
        stitches: ['M118,88 Q106,180 114,246', 'M382,88 Q394,180 386,246', 'M106,506 L394,506', 'M244,100 L244,518'],
        folds: JACKET_FOLDS,
        cords: [{ d: 'M118,512 Q110,532 116,548', w: 3.5 }, { d: 'M382,512 Q390,532 384,548', w: 3.5 }],
        eyelets: [[250, 140], [250, 200], [250, 260], [250, 320], [250, 380], [250, 440]],
      },
      zone: zone(270, 140, 80, 80, 4, 4, "Wearer's left chest"),
    },
    {
      id: 'back',
      label: 'Back',
      art: {
        panels: [...JACKET_SLEEVES, { d: `M196,56 C220,66 280,66 304,56 ${JACKET_BELOW}` }, { d: 'M188,56 C212,38 288,38 312,56 L312,72 C288,56 212,56 188,72 Z', tone: -0.05 }],
        ribs: [{ d: 'M92,486 L40,482', w: 26, tone: -0.04 }, { d: 'M408,486 L460,482', w: 26, tone: -0.04 }],
        stitches: ['M118,88 Q106,180 114,246', 'M382,88 Q394,180 386,246', 'M106,506 L394,506'],
        folds: JACKET_FOLDS,
      },
      zone: zone(130, 110, 240, 300, 12, 15, 'Center back, ~3 in below collar'),
    },
    LONG_SLEEVE_VIEW,
  ],
  sizeChart: {
    points: [
      ['A', 'Chest width', '1" below armhole, side to side', 24, 1, 0.5],
      ['B', 'Body length', 'Center back, collar seam to hem', 28, 0.75, 0.5],
      ['C', 'Shoulder width', 'Seam to seam', 20, 0.75, 0.375],
      ['D', 'Sleeve length', 'Shoulder seam to cuff edge', 25, 0.5, 0.375],
      ['E', 'Cuff width (relaxed)', 'Across elastic cuff', 4.25, 0.125, 0.125],
      ['F', 'Collar width', 'Collar height at center back', 3, 0, 0.125],
      ['G', 'Bottom width', 'Across hem, relaxed', 23.5, 1, 0.5],
    ],
  },
};

const WORK_FRONT_PANELS: Panel[] = [
  { d: 'M110,84 L58,140 Q42,300 42,476 L96,480 Q98,340 108,246 Q100,180 110,84 Z' },
  { d: 'M390,84 L442,140 Q458,300 458,476 L404,480 Q402,340 392,246 Q400,180 390,84 Z' },
  { d: 'M42,476 L96,480 L95,508 L42,504 Z', tone: -0.03 },
  { d: 'M458,476 L404,480 L405,508 L458,504 Z', tone: -0.03 },
];
const WORK_BELOW = 'L390,84 Q400,180 392,246 L394,494 L106,494 L108,246 Q100,180 110,84 Z';

const WORK: GarmentDef = {
  id: 'work',
  name: 'Denim / Work Jacket',
  short: 'Work Jacket',
  category: 'outerwear',
  spec: '12 oz denim or duck canvas · button front · chest flap pockets',
  views: [
    {
      id: 'front',
      label: 'Front',
      art: {
        behind: [{ d: 'M184,62 C208,34 292,34 316,62 L306,68 C286,48 214,48 194,68 Z', tone: -0.06 }],
        panels: [
          ...WORK_FRONT_PANELS,
          { d: `M196,56 L250,92 L304,56 ${WORK_BELOW}` },
          { d: 'M106,494 L394,494 L394,522 L106,522 Z', tone: -0.02 },
          { d: 'M152,200 L220,200 L220,250 L152,250 Z', tone: 0.02 },
          { d: 'M348,200 L280,200 L280,250 L348,250 Z', tone: 0.02 },
          { d: 'M150,176 L222,176 L222,200 L186,212 L150,200 Z', tone: -0.03 },
          { d: 'M350,176 L278,176 L278,200 L314,212 L350,200 Z', tone: -0.03 },
          ...POINT_COLLAR,
        ],
        seams: ['M250,96 L250,522'],
        stitches: [
          'M110,150 Q180,160 244,150', 'M110,156 Q180,166 244,156', 'M256,150 Q320,160 390,150', 'M256,156 Q320,166 390,156',
          'M186,250 L186,494', 'M192,250 L192,494', 'M314,250 L314,494', 'M308,250 L308,494',
          'M107,498 L393,498', 'M107,518 L393,518', 'M156,204 L156,246 L216,246 L216,204', 'M344,204 L344,246 L284,246 L284,204',
          'M116,88 Q104,180 114,246', 'M384,88 Q396,180 386,246',
        ],
        folds: JACKET_FOLDS,
        eyelets: [[262, 130], [262, 190], [262, 250], [262, 310], [262, 370], [262, 430], [250, 508], [186, 204], [314, 204], [69, 492], [431, 492]],
      },
      zone: zone(278, 262, 70, 70, 3.5, 3.5, "Wearer's left chest panel, below pocket"),
    },
    {
      id: 'back',
      label: 'Back',
      art: {
        panels: [
          ...WORK_FRONT_PANELS,
          { d: `M196,56 C220,66 280,66 304,56 ${WORK_BELOW}` },
          { d: 'M106,494 L394,494 L394,522 L106,522 Z', tone: -0.02 },
          { d: 'M188,56 C212,38 288,38 312,56 L312,72 C288,56 212,56 188,72 Z', tone: -0.05 },
        ],
        stitches: ['M110,150 L390,150', 'M110,156 L390,156', 'M107,498 L393,498', 'M107,518 L393,518', 'M116,88 Q104,180 114,246', 'M384,88 Q396,180 386,246'],
        folds: JACKET_FOLDS,
      },
      zone: zone(130, 176, 240, 260, 12, 13, 'Center back, below yoke seam'),
    },
    LONG_SLEEVE_VIEW,
  ],
  sizeChart: {
    points: [
      ['A', 'Chest width', '1" below armhole, side to side', 23.5, 1, 0.5],
      ['B', 'Body length', 'Center back, collar seam to hem', 25.5, 0.5, 0.5],
      ['C', 'Shoulder width', 'Seam to seam', 19.5, 0.75, 0.375],
      ['D', 'Sleeve length', 'Shoulder seam to cuff edge', 24.5, 0.5, 0.375],
      ['E', 'Cuff width', 'Across cuff, buttoned', 4.5, 0.125, 0.125],
      ['F', 'Waistband height', 'Seam to edge', 2, 0, 0.125],
      ['G', 'Chest pocket width', 'Across pocket', 4.5, 0, 0.125],
    ],
  },
};

/* ------------------------------------------------------------------------- ACCESSORIES */

const TOTE_ART: VectorArt = {
  panels: [{ d: 'M110,196 L390,196 L392,524 L108,524 Z' }],
  cords: [{ d: 'M170,200 C164,64 236,64 230,200', w: 18, tone: -0.05 }, { d: 'M270,200 C264,64 336,64 330,200', w: 18, tone: -0.05 }],
  stitches: [
    'M112,214 L388,214', 'M110,510 L390,510',
    'M161,200 L179,200 L179,232 L161,232 Z M161,200 L179,232 M179,200 L161,232',
    'M221,200 L239,200 L239,232 L221,232 Z M221,200 L239,232 M239,200 L221,232',
    'M261,200 L279,200 L279,232 L261,232 Z M261,200 L279,232 M279,200 L261,232',
    'M321,200 L339,200 L339,232 L321,232 Z M321,200 L339,232 M339,200 L321,232',
  ],
  folds: ['M150,300 Q160,400 150,500', 'M350,300 Q340,400 350,500', 'M200,520 Q250,500 300,520'],
};

const TOTE: GarmentDef = {
  id: 'tote',
  name: 'Tote Bag',
  short: 'Tote',
  category: 'bags',
  group: 'Totes & sacks',
  spec: '12 oz natural canvas · 15 × 16 in · reinforced handles',
  views: [
    { id: 'front', label: 'Front', art: TOTE_ART, zone: zone(140, 250, 220, 240, 11, 12, 'Centered on bag body') },
    { id: 'back', label: 'Back', art: TOTE_ART, zone: zone(140, 250, 220, 240, 11, 12, 'Centered on bag body') },
  ],
  sizeChart: {
    sizes: ['OS'],
    base: 'OS',
    points: [
      ['A', 'Width', 'Across bag body', 15, 0, 0.25],
      ['B', 'Height', 'Top edge to bottom seam', 16, 0, 0.25],
      ['C', 'Handle length', 'Full handle, end to end', 24, 0, 0.5],
      ['D', 'Handle width', 'Across webbing', 1, 0, 0.0625],
      ['E', 'Handle drop', 'Top edge to top of handle', 10, 0, 0.5],
    ],
  },
};

const HAT_STITCH_BRIM = ['M130,334 C176,320 324,320 370,334', 'M138,346 C182,334 318,334 362,346', 'M150,358 C190,348 310,348 350,358', 'M166,370 C200,362 300,362 334,370'];

const DADHAT: GarmentDef = {
  id: 'dadhat',
  name: 'Dad Hat',
  short: 'Dad Hat',
  category: 'accessories',
  group: 'Caps',
  spec: 'Washed cotton twill · unstructured 6-panel · strap back',
  views: [
    {
      id: 'front',
      label: 'Crown',
      art: {
        panels: [
          { d: 'M110,330 C110,176 176,112 250,112 C324,112 390,176 390,330 Z' },
          // Brim seen head-on: narrower than the crown, curving down toward the viewer.
          { d: 'M118,326 C170,308 330,308 382,326 C378,372 320,396 250,398 C180,396 122,372 118,326 Z', tone: -0.04 },
        ],
        seams: ['M250,114 L250,326', 'M247,114 Q168,176 150,326', 'M253,114 Q332,176 350,326'],
        stitches: ['M243,120 L243,322', 'M257,120 L257,322', ...HAT_STITCH_BRIM],
        folds: ['M180,150 Q200,230 190,320', 'M320,150 Q300,230 310,320'],
        buttons: [[250, 113, 8], [176, 206, 3.5], [324, 206, 3.5]],
      },
      zone: zone(170, 196, 160, 80, 4.5, 2.25, 'Front panels, centered above brim'),
    },
    {
      id: 'back',
      label: 'Back',
      art: {
        panels: [
          { d: 'M110,346 C110,192 176,128 250,128 C324,128 390,192 390,346 Z' },
          { d: 'M196,346 C196,292 304,292 304,346 Z', tone: -0.42, flat: true },
          { d: 'M186,320 L314,320 L314,338 L186,338 Z', tone: -0.06 },
        ],
        seams: ['M250,130 L250,292', 'M247,130 Q168,192 150,344', 'M253,130 Q332,192 350,344'],
        stitches: ['M196,324 L310,324', 'M196,334 L310,334'],
        folds: ['M180,170 Q200,240 190,330', 'M320,170 Q300,240 310,330'],
        eyelets: [[292, 329]],
      },
      zone: zone(190, 236, 120, 50, 2.5, 1.04, 'Back, above strap opening'),
    },
  ],
  sizeChart: {
    sizes: ['OS'],
    base: 'OS',
    points: [
      ['A', 'Head circumference', 'Inside sweatband, strap at middle', 23, 0, 0.25],
      ['B', 'Crown height', 'Brim seam to top button', 3.5, 0, 0.125],
      ['C', 'Brim length', 'Front seam to brim edge', 2.75, 0, 0.125],
      ['D', 'Brim width', 'Side to side across brim', 7, 0, 0.125],
    ],
  },
};

const BEANIE: GarmentDef = {
  id: 'beanie',
  name: 'Cuffed Beanie',
  short: 'Beanie',
  category: 'accessories',
  group: 'Hats',
  spec: 'Acrylic 1×1 rib knit · fold-over cuff',
  views: [
    {
      id: 'front',
      label: 'Cuff',
      art: {
        panels: [{ d: 'M130,370 C128,236 176,168 250,168 C324,168 372,236 370,370 Z' }],
        ribs: [{ d: 'M128,270 L372,270', w: 210, clip: true }, { d: 'M122,416 L378,416', w: 96 }],
        folds: ['M250,170 Q232,214 216,280', 'M250,170 Q268,214 284,280', 'M172,250 Q168,310 174,362', 'M328,250 Q332,310 326,362'],
      },
      zone: zone(190, 382, 120, 70, 3.5, 2.04, 'Cuff front, centered'),
    },
  ],
  sizeChart: {
    sizes: ['OS'],
    base: 'OS',
    points: [
      ['A', 'Width (relaxed)', 'Across cuff, laid flat', 9, 0, 0.25],
      ['B', 'Height (cuffed)', 'Cuff fold to crown top', 8.5, 0, 0.25],
      ['C', 'Cuff height', 'Fold to edge', 3, 0, 0.125],
      ['D', 'Total length', 'Uncuffed, edge to crown top', 12, 0, 0.25],
    ],
  },
};

/* ------------------------------------------------------------------------- SOCCER */

const JERSEY_SLEEVES: Panel[] = [
  { d: 'M112,64 L36,178 L80,214 L110,192 Q100,130 112,64 Z' },
  { d: 'M388,64 L464,178 L420,214 L390,192 Q400,130 388,64 Z' },
];
const JERSEY_BELOW = 'L388,64 Q400,130 390,192 L394,522 Q250,534 106,522 L110,192 Q100,130 112,64 Z';
/** Contrast side panels (ventilated mesh on real kits). */
const JERSEY_SIDES: Panel[] = [
  { d: 'M110,192 L134,200 Q142,360 136,524 L106,522 Z', tone: -0.07 },
  { d: 'M390,192 L366,200 Q358,360 364,524 L394,522 Z', tone: -0.07 },
];
const JERSEY_COMMON = {
  ribs: [{ d: 'M40,182 L82,215', w: 7 }, { d: 'M460,182 L418,215', w: 7 }],
  stitches: ['M118,68 Q108,130 117,192', 'M382,68 Q392,130 383,192', 'M134,206 Q142,360 137,516', 'M366,206 Q358,360 363,516', 'M108,508 Q250,520 392,508'],
  folds: ['M170,250 Q180,330 168,430', 'M330,256 Q320,340 334,436', 'M410,96 Q436,140 444,182', 'M90,96 Q64,140 56,182'],
};

const SOCCER_JERSEY: GarmentDef = {
  id: 'soccer-jersey',
  name: 'Soccer Jersey',
  short: 'Jersey',
  category: 'soccer',
  group: 'Match kit',
  spec: '140 GSM performance polyester · athletic fit · V-neck · mesh side panels',
  views: [
    {
      id: 'front',
      label: 'Front',
      art: {
        behind: [{ d: 'M200,40 C224,50 276,50 300,40 L250,112 Z', tone: -0.38, flat: true }],
        panels: [...JERSEY_SLEEVES, { d: `M200,40 L250,108 L300,40 ${JERSEY_BELOW}` }, ...JERSEY_SIDES],
        ribs: [{ d: 'M202,42 L250,104 L298,42', w: 9 }, ...JERSEY_COMMON.ribs],
        stitches: ['M196,50 L250,120 L304,50', ...JERSEY_COMMON.stitches],
        folds: JERSEY_COMMON.folds,
      },
      zone: zone(140, 120, 220, 260, 11, 13, 'Crest on left chest, sponsor across centre chest, ~3 in below HPS'),
    },
    {
      id: 'back',
      label: 'Back',
      art: {
        panels: [...JERSEY_SLEEVES, { d: `M200,40 C222,52 278,52 300,40 ${JERSEY_BELOW}` }, ...JERSEY_SIDES],
        ribs: [{ d: 'M201,42 C223,55 277,55 299,42', w: 8 }, ...JERSEY_COMMON.ribs],
        stitches: ['M197,50 C220,64 280,64 303,50', ...JERSEY_COMMON.stitches],
        folds: JERSEY_COMMON.folds,
      },
      zone: zone(140, 92, 220, 300, 11, 15, 'Player name ~2.5 in below collar, number (8-10 in) below'),
    },
    { ...SHORT_SLEEVE_VIEW, zone: zone(160, 190, 180, 180, 4.5, 4.5, 'League / competition badge, centred on sleeve') },
  ],
  sizeChart: {
    points: [
      ['A', 'Chest width', '1" below armhole, side to side', 21, 1, 0.5],
      ['B', 'Body length', 'From HPS to hem', 28.5, 0.75, 0.5],
      ['C', 'Shoulder width', 'Seam to seam', 17.5, 0.625, 0.375],
      ['D', 'Sleeve length', 'Shoulder seam to sleeve hem', 8, 0.25, 0.25],
      ['E', 'Sleeve opening', 'Straight across sleeve hem', 6.75, 0.25, 0.25],
      ['F', 'Bottom width', 'Straight across hem', 20.5, 1, 0.5],
      ['G', 'Neck width', 'Seam to seam at HPS', 7, 0.25, 0.25],
      ['H', 'V-neck drop', 'HPS line to bottom of V', 4.25, 0.125, 0.125],
    ],
  },
};

const GK_PADS: Panel[] = [
  { d: 'M46,266 Q70,258 96,266 L94,318 Q70,326 44,318 Z', tone: -0.1 },
  { d: 'M454,266 Q430,258 404,266 L406,318 Q430,326 456,318 Z', tone: -0.1 },
];
const GK_PAD_STITCH = ['M50,270 Q70,263 92,270 L90,314 Q70,321 48,314 Z', 'M450,270 Q430,263 408,270 L410,314 Q430,321 452,314 Z'];

const GK_JERSEY: GarmentDef = {
  id: 'gk-jersey',
  name: 'Goalkeeper Jersey',
  short: 'GK Jersey',
  category: 'soccer',
  group: 'Match kit',
  spec: '160 GSM performance polyester · long sleeve · padded elbows · crew neck',
  views: [
    {
      id: 'front',
      label: 'Front',
      art: {
        behind: [{ d: 'M192,44 C220,56 280,56 308,44 C286,88 214,88 192,44 Z', tone: -0.38, flat: true }],
        panels: [...LS_SLEEVES, { d: `M192,44 C214,88 286,88 308,44 ${LS_BELOW}` }, ...GK_PADS],
        ribs: [{ d: 'M194,45.5 C220,56 280,56 306,45.5', w: 5, tone: -0.2 }, { d: 'M193,47 C214,92 286,92 307,47', w: 10 }, ...LS_COMMON.ribs],
        stitches: ['M190,53 C212,102 288,102 310,53', ...LS_COMMON.stitches, ...GK_PAD_STITCH],
        folds: LS_COMMON.folds,
      },
      zone: zone(140, 120, 220, 260, 11, 13, 'Crest on left chest, sponsor across centre chest'),
    },
    {
      id: 'back',
      label: 'Back',
      art: {
        panels: [...LS_SLEEVES, { d: `M192,44 C218,56 282,56 308,44 ${LS_BELOW}` }, ...GK_PADS],
        ribs: [{ d: 'M193,47 C219,60 281,60 307,47', w: 8 }, ...LS_COMMON.ribs],
        stitches: ['M190,54 C217,69 283,69 310,54', ...LS_COMMON.stitches, ...GK_PAD_STITCH],
        folds: LS_COMMON.folds,
      },
      zone: zone(140, 92, 220, 300, 11, 15, 'Player name ~2.5 in below collar, number (8-10 in) below'),
    },
    LONG_SLEEVE_VIEW,
  ],
  sizeChart: {
    points: [
      ['A', 'Chest width', '1" below armhole, side to side', 21.5, 1, 0.5],
      ['B', 'Body length', 'From HPS to hem', 29, 0.75, 0.5],
      ['C', 'Shoulder width', 'Seam to seam', 18, 0.625, 0.375],
      ['D', 'Sleeve length', 'Shoulder seam to cuff edge', 25, 0.5, 0.375],
      ['E', 'Elbow pad', 'Pad width', 5, 0, 0.25],
      ['F', 'Cuff opening', 'Straight across cuff', 3.75, 0.125, 0.125],
      ['G', 'Neck width', 'Seam to seam at HPS', 7, 0.25, 0.25],
    ],
  },
};

const TRAINING_TOP: GarmentDef = {
  id: 'training-top',
  name: 'Training Quarter-Zip',
  short: 'Training Top',
  category: 'soccer',
  group: 'Training',
  spec: '180 GSM performance polyester · slim fit · quarter-zip mock neck',
  views: [
    {
      id: 'front',
      label: 'Front',
      art: {
        panels: [...LS_SLEEVES, { d: `M194,48 Q250,60 306,48 ${LS_BELOW}` }, { d: 'M194,24 L306,24 L306,50 Q250,62 194,50 Z', tone: -0.03 }],
        ribs: LS_COMMON.ribs,
        seams: ['M250,24 L250,168'],
        stitches: ['M244,27 L244,168', 'M256,27 L256,168', 'M196,30 L304,30', ...LS_COMMON.stitches],
        folds: LS_COMMON.folds,
        buttons: [[250, 40, 4.5]],
      },
      zone: zone(270, 116, 80, 80, 4, 4, "Club crest on wearer's left chest"),
    },
    {
      id: 'back',
      label: 'Back',
      art: {
        panels: [...LS_SLEEVES, { d: `M194,48 Q250,58 306,48 ${LS_BELOW}` }, { d: 'M194,24 L306,24 L306,50 Q250,58 194,50 Z', tone: -0.03 }],
        ribs: LS_COMMON.ribs,
        stitches: ['M196,30 L304,30', ...LS_COMMON.stitches],
        folds: LS_COMMON.folds,
      },
      zone: zone(140, 100, 220, 260, 11, 13, 'Centre back, ~3 in below collar (initials / squad number)'),
    },
    LONG_SLEEVE_VIEW,
  ],
  sizeChart: {
    points: [
      ['A', 'Chest width', '1" below armhole, side to side', 21, 1, 0.5],
      ['B', 'Body length', 'From HPS to hem', 28, 0.75, 0.5],
      ['C', 'Shoulder width', 'Seam to seam', 17.5, 0.625, 0.375],
      ['D', 'Sleeve length', 'Shoulder seam to cuff edge', 25.5, 0.5, 0.375],
      ['E', 'Collar height', 'Stand collar, at centre back', 2.5, 0, 0.125],
      ['F', 'Zip length', 'Top of collar to zip end', 8, 0, 0.25],
    ],
  },
};

const SOCCER_SHORTS_BODY = 'M140,70 L360,70 Q372,140 382,240 L390,362 L268,370 L256,274 Q250,266 244,274 L232,370 L110,362 L118,240 Q128,140 140,70 Z';
const SOCCER_SHORTS_BACK: VectorArt = {
  panels: [
    { d: SOCCER_SHORTS_BODY },
    { d: 'M140,70 L156,70 Q146,200 134,363 L110,362 L118,240 Q128,140 140,70 Z', tone: -0.12 },
    { d: 'M360,70 L344,70 Q354,200 366,363 L390,362 L382,240 Q372,140 360,70 Z', tone: -0.12 },
  ],
  ribs: [{ d: 'M140,86 L360,86', w: 32 }],
  seams: ['M250,102 L250,268'],
  stitches: ['M113,348 L232,356', 'M268,356 L387,348', 'M141,104 L359,104'],
  folds: ['M168,300 Q178,334 168,358', 'M332,300 Q322,334 332,358', 'M206,288 Q218,316 226,336'],
};
const SOCCER_SHORTS_FRONT: VectorArt = {
  ...SOCCER_SHORTS_BACK,
  cords: [{ d: 'M242,94 Q236,124 240,150', w: 3.5 }, { d: 'M258,94 Q264,124 260,150', w: 3.5 }],
  eyelets: [[242, 90], [258, 90]],
};

const SOCCER_SHORTS: GarmentDef = {
  id: 'soccer-shorts',
  name: 'Soccer Shorts',
  short: 'Shorts',
  category: 'soccer',
  group: 'Match kit',
  spec: '140 GSM performance polyester · 6" inseam · elastic waist with drawcord · contrast side panels',
  views: [
    { id: 'left-leg', label: 'Left Leg', art: SOCCER_SHORTS_FRONT, zone: zone(282, 254, 76, 76, 3.8, 3.8, "Player number, wearer's left leg front") },
    { id: 'right-leg', label: 'Right Leg', art: SOCCER_SHORTS_FRONT, zone: zone(142, 254, 76, 76, 3.8, 3.8, "Club crest, wearer's right leg front") },
    { id: 'back', label: 'Back', art: SOCCER_SHORTS_BACK, zone: zone(150, 112, 200, 60, 10, 3, 'Back, below waistband') },
  ],
  sizeChart: {
    points: [
      ['A', 'Waist (relaxed)', 'Across top of waistband, relaxed', 14, 1, 0.5],
      ['B', 'Hip', '6" below waist seam, across', 23, 1, 0.5],
      ['C', 'Front rise', 'Waist seam to crotch seam, front', 11.5, 0.25, 0.25],
      ['D', 'Back rise', 'Waist seam to crotch seam, back', 15, 0.25, 0.25],
      ['E', 'Inseam', 'Crotch seam to hem', 6, 0, 0.25],
      ['F', 'Leg opening', 'Across hem', 13.5, 0.5, 0.25],
    ],
  },
};

const SOCKS: GarmentDef = {
  id: 'soccer-socks',
  name: 'Soccer Socks',
  short: 'Socks',
  category: 'soccer',
  group: 'Match kit',
  spec: 'Nylon / polyester / elastane rib · knee-high · cushioned foot · cuff stripes',
  views: [
    {
      id: 'front',
      label: 'Calf',
      art: {
        panels: [
          { d: 'M184,36 L316,36 L314,350 Q314,402 352,424 L422,446 Q462,460 458,496 Q454,528 414,528 L240,528 Q186,528 186,470 Z' },
          { d: 'M185,96 L315,96 L315,110 L185,110 Z', tone: -0.25 },
          { d: 'M185,118 L315,118 L315,126 L185,126 Z', tone: -0.25 },
          { d: 'M412,446 Q462,460 458,496 Q454,528 414,528 Q432,488 412,446 Z', tone: -0.06 },
          { d: 'M186,440 Q186,528 240,528 L262,528 Q206,510 204,440 Z', tone: -0.06 },
        ],
        ribs: [{ d: 'M184,60 L316,60', w: 44 }, { d: 'M190,140 L310,140', w: 300, clip: true }],
        stitches: ['M420,452 Q438,490 418,524'],
        folds: ['M220,200 Q226,280 218,340', 'M280,180 Q276,260 284,330', 'M300,380 Q320,400 340,410'],
      },
      zone: zone(198, 140, 104, 160, 3.2, 4.9, 'Calf, below the cuff stripes'),
    },
  ],
  sizeChart: {
    sizes: ['S', 'M', 'L', 'XL'],
    base: 'M',
    points: [
      ['A', 'Foot length', 'Heel to toe, relaxed', 10, 0.5, 0.25],
      ['B', 'Leg length', 'Heel to top of cuff', 15, 0.5, 0.25],
      ['C', 'Cuff height', 'Fold to edge', 2.5, 0, 0.125],
      ['D', 'Calf width', 'Relaxed, across calf', 3.75, 0.25, 0.25],
    ],
  },
};

/* Underlayer: compression base layers worn under the kit. */
const BL_SLEEVES: Panel[] = [
  { d: 'M124,68 L86,106 Q62,280 60,462 L96,464 Q106,320 128,200 Q110,140 124,68 Z' },
  { d: 'M376,68 L414,106 Q438,280 440,462 L404,464 Q394,320 372,200 Q390,140 376,68 Z' },
];
const BL_BELOW = 'L376,68 Q390,140 372,200 Q358,330 366,524 Q250,534 134,524 Q142,330 128,200 Q110,140 124,68 Z';
/** Contoured side panels joined with flatlock seams. */
const BL_SIDES: Panel[] = [
  { d: 'M128,200 L146,206 Q156,330 150,525 L134,524 Q142,330 128,200 Z', tone: -0.06 },
  { d: 'M372,200 L354,206 Q344,330 350,525 L366,524 Q358,330 372,200 Z', tone: -0.06 },
];
const BL_COMMON = {
  ribs: [{ d: 'M96,474 L60,472', w: 22 }, { d: 'M404,474 L440,472', w: 22 }],
  stitches: [
    'M127,74 Q114,140 131,200', 'M373,74 Q386,140 369,200',
    'M146,208 Q156,330 150,518', 'M354,208 Q344,330 350,518',
    'M136,514 Q250,524 364,514',
    'M100,220 Q86,330 92,456', 'M400,220 Q414,330 408,456',
  ],
  folds: ['M72,170 Q64,240 70,300', 'M428,170 Q436,240 430,300'],
};

const BASE_LAYER: GarmentDef = {
  id: 'base-layer',
  name: 'Base Layer Top',
  short: 'Base Layer',
  category: 'soccer',
  group: 'Underlayer',
  spec: '220 GSM polyester / elastane compression knit · long sleeve · crew neck · flatlock seams',
  views: [
    {
      id: 'front',
      label: 'Front',
      art: {
        behind: [{ d: 'M200,44 C222,54 278,54 300,44 C282,82 218,82 200,44 Z', tone: -0.38, flat: true }],
        panels: [...BL_SLEEVES, { d: `M200,44 C218,82 282,82 300,44 ${BL_BELOW}` }, ...BL_SIDES],
        ribs: [{ d: 'M202,46 C220,80 280,80 298,46', w: 7 }, ...BL_COMMON.ribs],
        stitches: ['M198,52 C218,92 282,92 302,52', ...BL_COMMON.stitches],
        folds: BL_COMMON.folds,
      },
      zone: zone(268, 112, 70, 70, 3.5, 3.5, "Small logo on wearer's left chest"),
    },
    {
      id: 'back',
      label: 'Back',
      art: {
        panels: [...BL_SLEEVES, { d: `M200,44 C222,54 278,54 300,44 ${BL_BELOW}` }, ...BL_SIDES],
        ribs: [{ d: 'M201,46 C222,57 278,57 299,46', w: 7 }, ...BL_COMMON.ribs],
        stitches: ['M198,53 C221,66 279,66 302,53', ...BL_COMMON.stitches],
        folds: BL_COMMON.folds,
      },
      zone: zone(190, 76, 120, 60, 6, 3, 'Upper back, ~2 in below collar (brand mark or initials)'),
    },
    { ...LONG_SLEEVE_VIEW, zone: zone(215, 110, 70, 240, 3.5, 12, 'Left sleeve, centred, ~2 in below shoulder seam') },
  ],
  sizeChart: {
    points: [
      ['A', 'Chest width', '1" below armhole, relaxed (stretches ~30%)', 17.5, 1, 0.5],
      ['B', 'Body length', 'From HPS to hem', 27.5, 0.75, 0.5],
      ['C', 'Shoulder width', 'Seam to seam', 16, 0.5, 0.375],
      ['D', 'Sleeve length', 'Shoulder seam to cuff edge', 25, 0.5, 0.375],
      ['E', 'Cuff opening', 'Straight across cuff, relaxed', 3, 0.125, 0.125],
      ['F', 'Neck width', 'Seam to seam at HPS', 6.75, 0.25, 0.25],
    ],
  },
};

const COMP_SHORTS_BODY = 'M150,70 L350,70 Q360,150 370,250 L378,400 L264,408 L256,290 Q250,282 244,290 L236,408 L122,400 L130,250 Q140,150 150,70 Z';
const COMP_SHORTS_BACK: VectorArt = {
  panels: [
    { d: COMP_SHORTS_BODY },
    { d: 'M150,70 L166,70 Q154,240 152,403 L122,400 L130,250 Q140,150 150,70 Z', tone: -0.06 },
    { d: 'M350,70 L334,70 Q346,240 348,403 L378,400 L370,250 Q360,150 350,70 Z', tone: -0.06 },
  ],
  ribs: [{ d: 'M150,86 L350,86', w: 32 }, { d: 'M124,394 L235,402', w: 11, tone: -0.12 }, { d: 'M265,402 L376,394', w: 11, tone: -0.12 }],
  seams: ['M250,102 L250,284'],
  stitches: ['M166,104 Q154,240 152,386', 'M334,104 Q346,240 348,386', 'M151,104 L349,104', 'M246,104 L246,282', 'M254,104 L254,282'],
  folds: ['M200,330 Q212,352 222,370', 'M300,330 Q288,352 278,370'],
};

const COMP_SHORTS: GarmentDef = {
  id: 'compression-shorts',
  name: 'Compression Shorts',
  short: 'Comp. Shorts',
  category: 'soccer',
  group: 'Underlayer',
  spec: '220 GSM polyester / elastane compression knit · 8" inseam · silicone leg grippers',
  views: [
    { id: 'front', label: 'Front', art: COMP_SHORTS_BACK, zone: zone(200, 110, 100, 50, 5, 2.5, 'Centre front, just below the waistband') },
    { id: 'left-leg', label: 'Left Leg', art: COMP_SHORTS_BACK, zone: zone(282, 300, 64, 64, 3.2, 3.2, "Wearer's left thigh, ~2 in above the hem") },
    { id: 'back', label: 'Back', art: COMP_SHORTS_BACK, zone: zone(175, 112, 150, 50, 7.5, 2.5, 'Back, below waistband') },
  ],
  sizeChart: {
    points: [
      ['A', 'Waist (relaxed)', 'Across top of waistband, relaxed', 12.5, 1, 0.5],
      ['B', 'Hip', '6" below waist seam, relaxed', 17, 1, 0.5],
      ['C', 'Front rise', 'Waist seam to crotch seam, front', 10, 0.25, 0.25],
      ['D', 'Back rise', 'Waist seam to crotch seam, back', 13.5, 0.25, 0.25],
      ['E', 'Inseam', 'Crotch seam to hem', 8, 0, 0.25],
      ['F', 'Leg opening', 'Across hem, relaxed', 8.5, 0.375, 0.25],
    ],
  },
};

/* ------------------------------------------------------------------------- shared helpers */

/** Mirrors artwork left ↔ right (x → 500 − x). Paths must use absolute "x,y" coordinates only. */
const mirrorD = (d: string) => d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x: string, y: string) => `${+(GARMENT_W - Number(x)).toFixed(2)},${y}`);
function mirrorArt(a: VectorArt): VectorArt {
  const p = (list?: Panel[]) => list?.map((x) => ({ ...x, d: mirrorD(x.d) }));
  const b = (list?: Band[]) => list?.map((x) => ({ ...x, d: mirrorD(x.d) }));
  return {
    behind: p(a.behind),
    panels: p(a.panels)!,
    ribs: b(a.ribs),
    seams: a.seams?.map(mirrorD),
    stitches: a.stitches?.map(mirrorD),
    folds: a.folds?.map(mirrorD),
    cords: b(a.cords),
    eyelets: a.eyelets?.map(([x, y]) => [GARMENT_W - x, y] as [number, number]),
    buttons: a.buttons?.map(([x, y, r]) => [GARMENT_W - x, y, r] as [number, number, number]),
  };
}
const mirrorZone = (z: PrintZone, placement: string): PrintZone => ({ ...z, x: GARMENT_W - z.x - z.w, placement });

/** US men's shoe sizes in half steps: grade rules count one step per half size. */
const SHOE_LADDER = ['US 5', 'US 5.5', 'US 6', 'US 6.5', 'US 7', 'US 7.5', 'US 8', 'US 8.5', 'US 9', 'US 9.5', 'US 10', 'US 10.5', 'US 11', 'US 11.5', 'US 12', 'US 12.5', 'US 13', 'US 13.5', 'US 14'];
const SHOE_SIZES = ['US 7', 'US 8', 'US 9', 'US 10', 'US 11', 'US 12'];

/* ------------------------------------------------------------------------- BAGS */

const BACKPACK_BODY = 'M116,120 C116,80 150,64 196,62 L304,62 C350,64 384,80 384,120 L390,500 C390,520 376,528 356,528 L144,528 C124,528 110,520 110,500 Z';
const BACKPACK_FRONT: VectorArt = {
  behind: [
    { d: 'M150,98 C146,60 176,50 198,70 L192,100 Z', tone: -0.14 },
    { d: 'M350,98 C354,60 324,50 302,70 L308,100 Z', tone: -0.14 },
  ],
  panels: [
    { d: BACKPACK_BODY },
    { d: 'M111,470 L389,470 L390,500 C390,520 376,528 356,528 L144,528 C124,528 110,520 110,500 Z', tone: -0.12 },
    { d: 'M150,296 L350,296 C362,296 368,304 368,316 L372,456 C372,470 362,476 350,476 L150,476 C138,476 128,470 128,456 L132,316 C132,304 138,296 150,296 Z', tone: -0.05 },
  ],
  ribs: [
    { d: 'M122,138 C180,106 320,106 378,138', w: 6, tone: -0.2 },
    { d: 'M146,314 L354,314', w: 5, tone: -0.2 },
  ],
  cords: [
    { d: 'M222,66 C222,28 278,28 278,66', w: 12, tone: -0.1 },
    { d: 'M372,136 L380,162', w: 4, tone: -0.3 },
    { d: 'M346,316 L350,340', w: 4, tone: -0.3 },
  ],
  stitches: [
    'M124,124 C124,88 154,72 198,70 L302,70 C346,72 376,88 376,124 L382,462',
    'M154,304 L346,304 C356,304 360,310 360,318 L364,454 C364,464 358,468 348,468 L152,468 C142,468 136,464 136,454 L140,318 C140,310 144,304 154,304 Z',
    'M112,478 L388,478',
  ],
  folds: ['M140,200 C150,260 146,300 138,330', 'M362,200 C352,260 356,300 364,330'],
};
const BACKPACK_BACK: VectorArt = {
  panels: [
    { d: BACKPACK_BODY },
    { d: 'M140,110 C140,90 160,84 180,84 L320,84 C340,84 360,90 360,110 L364,440 C364,456 352,462 336,462 L164,462 C148,462 136,456 136,440 Z', tone: -0.06 },
    { d: 'M168,86 C150,180 150,320 176,456 L210,456 C186,320 186,180 202,86 Z', tone: -0.14 },
    { d: 'M332,86 C350,180 350,320 324,456 L290,456 C314,320 314,180 298,86 Z', tone: -0.14 },
    { d: 'M190,250 L310,250 L310,264 L190,264 Z', tone: -0.2 },
    { d: 'M172,430 L212,430 L212,446 L172,446 Z', tone: -0.3 },
    { d: 'M288,430 L328,430 L328,446 L288,446 Z', tone: -0.3 },
  ],
  cords: [{ d: 'M222,66 C222,28 278,28 278,66', w: 12, tone: -0.1 }],
  stitches: ['M250,120 L250,240', 'M250,276 L250,440', 'M212,190 L288,190', 'M214,340 L286,340'],
};
const BACKPACK_SIDE: VectorArt = {
  panels: [
    { d: 'M196,96 C196,72 214,62 236,62 L264,62 C286,62 304,72 304,96 L310,504 C310,520 300,528 284,528 L216,528 C200,528 190,520 190,504 Z' },
    { d: 'M192,330 L308,330 L310,504 C310,520 300,528 284,528 L216,528 C200,528 190,520 190,504 Z', tone: -0.06 },
    { d: 'M304,110 C322,200 324,330 312,470 L298,470 C306,330 304,200 296,110 Z', tone: -0.14 },
    { d: 'M196,250 L304,250 L304,264 L196,264 Z', tone: -0.18 },
  ],
  ribs: [{ d: 'M192,342 L308,342', w: 9 }],
  stitches: ['M200,104 L206,500', 'M296,104 L300,320'],
};

const BACKPACK: GarmentDef = {
  id: 'backpack',
  name: 'Backpack',
  short: 'Backpack',
  category: 'bags',
  group: 'Packs',
  spec: '600D recycled polyester · 25 L · padded laptop sleeve · zip front pocket',
  views: [
    { id: 'front', label: 'Front', art: BACKPACK_FRONT, zone: zone(160, 160, 180, 110, 7.8, 4.8, 'Main front panel, above the pocket') },
    { id: 'pocket', label: 'Pocket', art: BACKPACK_FRONT, zone: zone(160, 330, 180, 120, 7.8, 5.2, 'Front pocket, centred') },
    { id: 'side', label: 'Side', art: BACKPACK_SIDE, zone: zone(214, 120, 72, 110, 3.1, 4.8, 'Side panel, above the compression strap') },
    { id: 'back', label: 'Back', art: BACKPACK_BACK, zone: zone(212, 110, 76, 60, 3.3, 2.6, 'Top of the back panel, between the straps') },
  ],
  sizeChart: {
    sizes: ['OS'],
    base: 'OS',
    points: [
      ['A', 'Height', 'Base to top seam, excluding handle', 18, 0, 0.25],
      ['B', 'Width', 'Across the front panel at its widest', 12, 0, 0.25],
      ['C', 'Depth', 'Front to back at the base', 6, 0, 0.25],
      ['D', 'Front pocket height', 'Pocket zip to pocket base', 8, 0, 0.25],
      ['E', 'Laptop sleeve', 'Inside height × width (fits 15″)', 15.5, 0, 0.25],
      ['F', 'Shoulder strap length', 'Fully extended, top seam to buckle', 34, 0, 0.5],
    ],
  },
};

const DUFFEL_BODY = 'M62,206 C62,166 92,146 132,146 L368,146 C408,146 438,166 438,206 L444,424 C444,446 428,456 406,456 L94,456 C72,456 56,446 56,424 Z';
const DUFFEL_SIDE: VectorArt = {
  panels: [
    { d: DUFFEL_BODY },
    { d: 'M57,410 L443,410 L444,424 C444,446 428,456 406,456 L94,456 C72,456 56,446 56,424 Z', tone: -0.12 },
    { d: 'M128,148 L154,148 L152,456 L124,456 Z', tone: -0.1 },
    { d: 'M346,148 L372,148 L376,456 L348,456 Z', tone: -0.1 },
  ],
  ribs: [{ d: 'M90,160 C180,140 320,140 410,160', w: 6, tone: -0.2 }],
  cords: [{ d: 'M141,150 C141,64 359,64 359,150', w: 16, tone: -0.1 }],
  eyelets: [[76, 200], [424, 200]],
  stitches: [
    'M66,214 C66,176 94,158 132,156 L368,156 C406,158 434,176 434,214',
    'M58,418 L442,418',
    'M132,160 L130,450', 'M148,160 L147,450', 'M352,160 L353,450', 'M368,160 L370,450',
  ],
  folds: ['M90,260 C100,320 98,360 90,400', 'M410,260 C400,320 402,360 410,400'],
};
const DUFFEL_END: VectorArt = {
  panels: [
    { d: 'M150,190 C150,152 176,132 214,132 L286,132 C324,132 350,152 350,190 L352,412 C352,440 334,456 306,456 L194,456 C166,456 148,440 148,412 Z' },
    { d: 'M149,412 L351,412 C352,440 334,456 306,456 L194,456 C166,456 148,440 148,412 Z', tone: -0.12 },
  ],
  ribs: [{ d: 'M172,250 L328,250', w: 5, tone: -0.2 }],
  cords: [{ d: 'M318,252 L322,276', w: 4, tone: -0.3 }],
  eyelets: [[250, 150]],
  stitches: ['M158,194 C158,160 182,142 216,142 L284,142 C318,142 342,160 342,194 L344,404', 'M150,420 L350,420'],
};

const DUFFEL: GarmentDef = {
  id: 'duffel',
  name: 'Duffel Bag',
  short: 'Duffel',
  category: 'bags',
  group: 'Packs',
  spec: '600D recycled polyester · 40 L · wrap handles · detachable shoulder strap',
  views: [
    { id: 'front', label: 'Front', art: DUFFEL_SIDE, zone: zone(170, 200, 160, 160, 9, 9, 'Long side panel, centred between the handles') },
    { id: 'back', label: 'Back', art: DUFFEL_SIDE, zone: zone(170, 200, 160, 160, 9, 9, 'Long side panel, centred between the handles') },
    { id: 'end', label: 'End', art: DUFFEL_END, zone: zone(184, 280, 132, 110, 6.5, 5.4, 'End panel, below the pocket zip') },
  ],
  sizeChart: {
    sizes: ['OS'],
    base: 'OS',
    points: [
      ['A', 'Length', 'End to end along the base', 22, 0, 0.25],
      ['B', 'Height', 'Base to top zip', 11, 0, 0.25],
      ['C', 'Width', 'Across the end panel', 11, 0, 0.25],
      ['D', 'Handle drop', 'Top of bag to top of handle', 6, 0, 0.25],
      ['E', 'Shoulder strap length', 'Fully extended, clip to clip', 52, 0, 0.5],
    ],
  },
};

const BELTBAG: GarmentDef = {
  id: 'beltbag',
  name: 'Belt Bag',
  short: 'Belt Bag',
  category: 'bags',
  group: 'Packs',
  spec: 'Nylon ripstop · adjustable 1.5″ webbing strap · zip front pocket',
  views: [
    {
      id: 'front',
      label: 'Front',
      art: {
        behind: [
          { d: 'M24,288 L120,272 L124,300 L28,318 Z', tone: -0.12 },
          { d: 'M476,288 L380,272 L376,300 L472,318 Z', tone: -0.12 },
        ],
        panels: [
          { d: 'M112,262 C150,226 350,226 388,262 C404,300 396,348 368,368 C300,394 200,394 132,368 C104,348 96,300 112,262 Z' },
          { d: 'M126,318 C200,334 300,334 374,318 C372,340 362,356 350,364 C290,384 210,384 150,364 C138,356 128,340 126,318 Z', tone: -0.05 },
          { d: 'M44,290 L70,286 L74,314 L48,318 Z', tone: -0.35 },
        ],
        ribs: [
          { d: 'M120,264 C170,236 330,236 380,264', w: 5, tone: -0.2 },
          { d: 'M130,320 C200,336 300,336 370,320', w: 4, tone: -0.2 },
        ],
        cords: [{ d: 'M362,256 L372,278', w: 4, tone: -0.3 }],
        stitches: ['M120,268 C160,240 340,240 380,268', 'M136,362 C204,386 296,386 364,362'],
      },
      zone: zone(182, 270, 136, 44, 5.5, 1.8, 'Upper front panel, between the zips'),
    },
  ],
  sizeChart: {
    sizes: ['OS'],
    base: 'OS',
    points: [
      ['A', 'Width', 'End to end across the body', 13, 0, 0.25],
      ['B', 'Height', 'Base to top zip at centre', 5.5, 0, 0.125],
      ['C', 'Depth', 'Front to back at centre', 2.5, 0, 0.125],
      ['D', 'Strap length', 'Fully extended, buckle to buckle', 44, 0, 0.5],
    ],
  },
};

const DRAWSTRING_ART: VectorArt = {
  panels: [
    { d: 'M118,124 L382,124 L386,516 L114,516 Z' },
    { d: 'M118,124 L382,124 L382,160 L118,160 Z', tone: -0.07 },
    { d: 'M114,488 L144,516 L114,516 Z', tone: -0.2 },
    { d: 'M386,488 L356,516 L386,516 Z', tone: -0.2 },
  ],
  cords: [
    { d: 'M150,142 C98,240 96,400 120,506', w: 6, tone: 0.5 },
    { d: 'M350,142 C402,240 404,400 380,506', w: 6, tone: 0.5 },
    { d: 'M150,142 C200,104 300,104 350,142', w: 6, tone: 0.5 },
  ],
  eyelets: [[122, 500], [378, 500]],
  stitches: ['M118,166 L382,166'],
  folds: ['M180,200 C196,300 190,400 176,480', 'M320,200 C304,300 310,400 324,480'],
};

const DRAWSTRING: GarmentDef = {
  id: 'drawstring',
  name: 'Drawstring Bag',
  short: 'Gym Sack',
  category: 'bags',
  group: 'Totes & sacks',
  spec: '210D polyester · 14 × 18 in · cord drawstring with reinforced corners',
  views: [
    { id: 'front', label: 'Front', art: DRAWSTRING_ART, zone: zone(158, 206, 184, 220, 10, 12, 'Centred below the drawstring channel') },
    { id: 'back', label: 'Back', art: DRAWSTRING_ART, zone: zone(158, 206, 184, 220, 10, 12, 'Centred below the drawstring channel') },
  ],
  sizeChart: {
    sizes: ['OS'],
    base: 'OS',
    points: [
      ['A', 'Width', 'Across the bag', 14, 0, 0.25],
      ['B', 'Height', 'Base to top of channel', 18, 0, 0.25],
      ['C', 'Channel height', 'Drawstring channel, top fold', 1.75, 0, 0.125],
      ['D', 'Cord length', 'Each cord, end to end', 60, 0, 1],
    ],
  },
};

/* ------------------------------------------------------------------------- FOOTWEAR */

/** Lateral (outside) view of a right shoe, toe to the right; ground at y 452, ~35.7 px per inch. */
function sneakerSide(high: boolean): VectorArt {
  const upper = high
    ? 'M60,398 C52,330 54,250 64,184 C94,174 132,172 164,178 L176,186 C220,240 280,284 340,316 C392,334 440,354 458,382 C462,390 460,396 452,398 Z'
    : 'M58,398 C50,352 52,318 68,300 C96,294 128,300 158,310 C172,296 184,276 196,258 L226,252 C262,270 300,294 340,316 C392,334 440,354 458,382 C462,390 460,396 452,398 Z';
  const laces = high
    ? [[196, 197, 186, 211], [221, 217, 211, 231], [245, 236, 235, 250], [269, 256, 259, 270], [293, 275, 283, 289], [318, 295, 308, 309]]
    : [[213, 265, 224, 283], [239, 275, 246, 292], [265, 286, 268, 302], [291, 296, 289, 312], [317, 307, 311, 321]];
  return {
    behind: high
      ? [{ d: 'M160,180 C162,152 180,146 196,154 L190,186 Z', tone: -0.04 }]
      : [
          { d: 'M192,262 C194,236 210,228 226,236 L236,258 Z', tone: -0.04 },
          { d: 'M66,302 C100,292 140,298 160,310 L150,316 C120,306 92,302 70,308 Z', tone: -0.45, flat: true },
        ],
    panels: [
      { d: upper },
      high
        ? { d: 'M60,398 C54,350 54,300 58,262 C80,262 100,266 112,272 C116,320 118,360 128,398 Z', tone: -0.07 }
        : { d: 'M58,398 C50,352 52,318 68,300 C82,298 96,300 108,304 C112,336 116,368 126,398 Z', tone: -0.07 },
      { d: 'M352,320 C398,336 442,356 458,382 C462,390 460,396 452,398 L384,398 C388,370 374,342 352,320 Z', tone: -0.05 },
      high
        ? { d: 'M166,180 L180,184 C222,238 282,282 342,314 L332,328 C272,296 214,252 170,198 Z', tone: -0.09 }
        : { d: 'M196,258 L226,252 C262,270 300,294 340,316 L330,330 C292,308 254,286 210,276 Z', tone: -0.09 },
      ...(high ? [{ d: 'M64,184 C94,174 132,172 164,178 L166,196 C134,190 96,192 66,202 Z', tone: -0.12 }] : []),
      { d: 'M60,386 C150,384 300,382 456,386 L454,398 L58,398 Z', tone: -0.04 },
      { d: 'M50,396 L458,396 C470,402 470,426 460,432 L60,434 C46,428 44,404 50,396 Z', tone: 0.9 },
      { d: 'M60,434 L460,432 C464,444 456,452 442,452 L72,452 C60,452 54,444 60,434 Z', tone: -0.55 },
      high
        ? { d: 'M56,214 C52,198 58,184 70,182 L76,196 C68,198 62,204 60,216 Z', tone: -0.14 }
        : { d: 'M54,316 C50,300 58,286 70,286 L76,300 C68,302 62,308 60,318 Z', tone: -0.14 },
    ],
    cords: laces.map(([x1, y1, x2, y2]) => ({ d: `M${x1},${y1} L${x2},${y2}`, w: 5, tone: 0.55 })),
    eyelets: laces.map(([, , x2, y2]) => [x2, y2] as [number, number]),
    stitches: [
      'M64,392 C150,390 300,388 452,392',
      high ? 'M114,276 C118,320 122,360 132,394' : 'M112,306 C116,338 120,368 130,394',
      'M356,326 C380,346 390,372 388,394',
      high ? 'M172,204 C216,256 274,298 328,334' : 'M212,282 C252,292 290,312 326,334',
      'M56,414 L462,414',
    ],
    folds: ['M330,330 C340,340 350,352 354,364', 'M300,320 C312,330 320,342 324,352'],
  };
}

/** Top view (toe at the bottom): tongue and lacing. */
const SNEAKER_TOP: VectorArt = {
  panels: [
    { d: 'M250,48 C318,48 346,92 348,150 C352,232 362,322 356,402 C350,478 310,532 250,532 C190,532 150,478 144,402 C138,322 148,232 152,150 C154,92 182,48 250,48 Z', tone: 0.9 },
    { d: 'M250,56 C312,56 336,96 338,150 C342,230 352,320 346,400 C340,470 304,522 250,522 C196,522 160,470 154,400 C148,320 158,230 162,150 C164,96 188,56 250,56 Z' },
    { d: 'M200,92 C204,70 296,70 300,92 C304,120 298,140 290,150 L210,150 C202,140 196,120 200,92 Z', tone: -0.5, flat: true },
    { d: 'M214,104 C216,84 284,84 286,104 L292,300 C270,308 230,308 208,300 Z', tone: -0.03 },
    { d: 'M196,150 L214,150 L206,320 L186,326 Z', tone: -0.09 },
    { d: 'M304,150 L286,150 L294,320 L314,326 Z', tone: -0.09 },
    { d: 'M168,420 C200,400 300,400 332,420 C330,480 300,520 250,520 C200,520 170,480 168,420 Z', tone: -0.05 },
  ],
  cords: [170, 200, 230, 260, 290].map((y, i) => ({ d: `M${200 - i * 2},${y} L${300 + i * 2},${y}`, w: 6, tone: 0.55 })),
  eyelets: [170, 200, 230, 260, 290].flatMap((y, i) => [[200 - i * 2, y], [300 + i * 2, y]] as Array<[number, number]>),
  stitches: ['M174,426 C204,408 296,408 326,426'],
};

function sneakerHeel(high: boolean): VectorArt {
  const top = high ? 70 : 128;
  return {
    panels: [
      { d: `M168,${top + 42} C168,${top + 12} 200,${top} 250,${top} C300,${top} 332,${top + 12} 332,${top + 42} L344,424 L156,424 Z` },
      { d: `M172,${top + 40} C176,${top + 20} 324,${top + 20} 328,${top + 40} C320,${top + 52} 180,${top + 52} 172,${top + 40} Z`, tone: -0.45, flat: true },
      { d: 'M160,300 C200,286 300,286 340,300 L344,424 L156,424 Z', tone: -0.07 },
      { d: `M228,${top} C228,${top - 12} 272,${top - 12} 272,${top} L270,${top + 82} L230,${top + 82} Z`, tone: -0.14 },
      { d: 'M146,420 L354,420 L360,452 C360,466 344,470 326,470 L174,470 C156,470 140,466 140,452 Z', tone: 0.9 },
      { d: 'M140,456 L360,456 C360,470 342,478 322,478 L178,478 C158,478 140,470 140,456 Z', tone: -0.55 },
    ],
    stitches: ['M164,304 C204,292 296,292 336,304', `M234,${top + 4} L234,${top + 78}`, `M266,${top + 4} L266,${top + 78}`],
  };
}

function sneaker(id: string, name: string, short: string, high: boolean, spec: string): GarmentDef {
  const side = sneakerSide(high);
  const lateralZone = high ? zone(124, 262, 150, 100, 4.2, 2.8, 'Lateral quarter panel, below the ankle collar') : zone(132, 330, 170, 52, 4.75, 1.45, 'Lateral quarter panel, between the heel counter and the laces');
  return {
    id,
    name,
    short,
    category: 'footwear',
    group: 'Sneakers',
    spec,
    views: [
      { id: 'lateral', label: 'Outside', art: side, zone: lateralZone },
      { id: 'medial', label: 'Inside', art: mirrorArt(side), zone: mirrorZone(lateralZone, lateralZone.placement.replace('Lateral', 'Medial')) },
      { id: 'tongue', label: 'Tongue', art: SNEAKER_TOP, zone: zone(222, 106, 56, 52, 1.5, 1.4, 'Tongue, above the first lace') },
      { id: 'heel', label: 'Heel', art: sneakerHeel(high), zone: zone(200, 316, 100, 64, 1.9, 1.2, 'Heel counter, centred') },
    ],
    sizeChart: {
      sizes: SHOE_SIZES,
      base: 'US 9',
      ladder: SHOE_LADDER,
      points: [
        ['A', 'Outsole length', 'Heel to toe along the outsole', 11.75, 0.1667, 0.125],
        ['B', 'Outsole width', 'Across the ball of the foot', 4.25, 0.03, 0.0625],
        ['C', 'Collar height', 'Insole to top of the collar at the heel', high ? 6.5 : 3.25, 0.03, 0.125],
        ['D', 'Midsole height', 'Midsole at the heel', 1.25, 0, 0.0625],
        ['E', 'Toe spring', 'Ground to toe tip', 0.6, 0, 0.0625],
        ['F', 'Lace length', 'End to end', high ? 63 : 47, 0.25, 1],
      ],
    },
  };
}

const LOWTOP = sneaker('low-top', 'Low-Top Sneaker', 'Low-Top', false, 'Leather or canvas upper · padded collar · vulcanised rubber cupsole');
const HIGHTOP = sneaker('high-top', 'High-Top Sneaker', 'High-Top', true, 'Leather or canvas upper · padded ankle collar · rubber cupsole');

const SLIDE_BED = 'M250,40 C326,40 356,104 354,190 C352,280 346,360 350,440 C354,508 312,530 250,530 C188,530 146,508 150,440 C154,360 148,280 146,190 C144,104 174,40 250,40 Z';
const SLIDE_RIDGE = 'M250,64 C312,64 334,118 332,190 C330,280 326,360 330,438 C332,494 300,508 250,508 C200,508 168,494 170,438 C174,360 170,280 168,190 C166,118 188,64 250,64 Z';
const SLIDES: GarmentDef = {
  id: 'slides',
  name: 'Slides',
  short: 'Slides',
  category: 'footwear',
  group: 'Sandals',
  spec: 'Moulded EVA footbed · one-piece strap · textured outsole',
  views: [
    {
      id: 'strap',
      label: 'Strap',
      art: {
        panels: [{ d: SLIDE_BED }, { d: 'M132,150 C196,126 304,126 368,150 L372,312 C304,292 196,292 128,312 Z', tone: -0.1 }],
        stitches: [SLIDE_RIDGE],
        folds: ['M160,160 C170,220 170,260 162,300', 'M340,160 C330,220 330,260 338,300'],
      },
      zone: zone(152, 176, 196, 98, 4, 2, 'Strap, centred'),
    },
    {
      id: 'footbed',
      label: 'Footbed',
      art: { panels: [{ d: SLIDE_BED }, { d: SLIDE_RIDGE, tone: -0.05 }], stitches: ['M190,150 C220,140 280,140 310,150', 'M188,170 C220,160 280,160 312,170'] },
      zone: zone(198, 340, 104, 104, 2.1, 2.1, 'Footbed heel (debossed or printed)'),
    },
  ],
  sizeChart: {
    sizes: SHOE_SIZES,
    base: 'US 9',
    ladder: SHOE_LADDER,
    points: [
      ['A', 'Footbed length', 'Heel to toe', 11.25, 0.1667, 0.125],
      ['B', 'Footbed width', 'Across the forefoot', 4.3, 0.03, 0.0625],
      ['C', 'Strap width', 'Front to back at the centre', 2.75, 0.03, 0.0625],
      ['D', 'Footbed thickness', 'At the heel', 1.25, 0, 0.0625],
    ],
  },
};

/* ------------------------------------------------------------------------- HEADWEAR (more) */

const SNAPBACK: GarmentDef = {
  id: 'snapback',
  name: 'Snapback Cap',
  short: 'Snapback',
  category: 'accessories',
  group: 'Caps',
  spec: 'Structured 6-panel · flat brim · adjustable snap closure',
  views: [
    {
      id: 'front',
      label: 'Front',
      art: {
        panels: [
          { d: 'M108,334 C106,190 168,108 250,108 C332,108 394,190 392,334 Z' },
          { d: 'M96,330 C150,316 350,316 404,330 C404,350 380,362 250,364 C120,362 96,350 96,330 Z', tone: -0.06 },
        ],
        seams: ['M250,110 L250,330', 'M247,110 Q170,170 150,330', 'M253,110 Q330,170 350,330'],
        stitches: ['M110,340 C160,330 340,330 390,340', 'M120,350 C170,342 330,342 380,350', 'M243,116 L243,326', 'M257,116 L257,326'],
        folds: ['M178,150 Q196,230 188,320', 'M322,150 Q304,230 312,320'],
        buttons: [[250, 109, 8], [176, 200, 3.5], [324, 200, 3.5]],
      },
      zone: zone(160, 170, 180, 100, 5, 2.8, 'Structured front panels, centred'),
    },
    {
      id: 'back',
      label: 'Back',
      art: {
        panels: [
          { d: 'M110,346 C110,190 176,124 250,124 C324,124 390,190 390,346 Z' },
          { d: 'M190,346 C190,284 310,284 310,346 Z', tone: -0.42, flat: true },
          { d: 'M180,318 L320,318 L320,336 L180,336 Z', tone: -0.1 },
        ],
        seams: ['M250,126 L250,286', 'M247,126 Q168,190 150,344', 'M253,126 Q332,190 350,344'],
        buttons: [[200, 327, 4], [224, 327, 4], [248, 327, 4], [272, 327, 4], [296, 327, 4]],
      },
      zone: zone(190, 214, 120, 50, 3.3, 1.4, 'Back, above the snap closure'),
    },
  ],
  sizeChart: {
    sizes: ['OS'],
    base: 'OS',
    points: [
      ['A', 'Head circumference', 'Inside sweatband, snap at middle setting', 23, 0, 0.25],
      ['B', 'Crown height', 'Brim seam to top button (structured)', 4.25, 0, 0.125],
      ['C', 'Brim length', 'Front seam to brim edge', 3, 0, 0.125],
      ['D', 'Brim width', 'Side to side across the brim', 8.25, 0, 0.125],
    ],
  },
};

const BUCKET_ART: VectorArt = {
  panels: [
    { d: 'M152,320 C150,210 184,166 250,166 C316,166 350,210 348,320 Z' },
    { d: 'M150,314 L350,314 C376,350 402,380 420,404 C360,428 140,428 80,404 C98,380 124,350 150,314 Z', tone: -0.04 },
  ],
  seams: ['M166,226 C206,212 294,212 334,226', 'M152,300 L348,300'],
  stitches: ['M138,346 C200,352 300,352 362,346', 'M118,370 C190,380 310,380 382,370', 'M98,394 C180,406 320,406 402,394'],
  eyelets: [[178, 250], [322, 250]],
  folds: ['M190,180 C200,230 196,280 186,310', 'M310,180 C300,230 304,280 314,310'],
};

const BUCKET: GarmentDef = {
  id: 'bucket-hat',
  name: 'Bucket Hat',
  short: 'Bucket',
  category: 'accessories',
  group: 'Hats',
  spec: 'Cotton twill · stitched downward brim · vent eyelets',
  views: [
    { id: 'front', label: 'Front', art: BUCKET_ART, zone: zone(182, 224, 136, 70, 3.8, 2, 'Crown front, centred') },
    { id: 'back', label: 'Back', art: BUCKET_ART, zone: zone(182, 224, 136, 70, 3.8, 2, 'Crown back, centred') },
  ],
  sizeChart: {
    sizes: ['S', 'M', 'L', 'XL'],
    base: 'M',
    points: [
      ['A', 'Head circumference', 'Inside the band', 22.75, 0.5, 0.25],
      ['B', 'Crown height', 'Band seam to top', 3.25, 0, 0.125],
      ['C', 'Brim width', 'Band seam to brim edge', 2.25, 0, 0.125],
    ],
  },
};

/* ------------------------------------------------------------------------- registry */

export const BUILT_IN_GARMENTS: GarmentDef[] = [
  TEE, LONGSLEEVE, POLO, TANK, CROP,
  HOODIE, ZIPHOODIE, CREWNECK,
  JOGGERS, SHORTS, CARGO,
  COACH, WORK,
  SOCCER_JERSEY, GK_JERSEY, TRAINING_TOP, SOCCER_SHORTS, SOCKS, BASE_LAYER, COMP_SHORTS,
  BACKPACK, DUFFEL, BELTBAG, TOTE, DRAWSTRING,
  LOWTOP, HIGHTOP, SLIDES,
  DADHAT, SNAPBACK, BUCKET, BEANIE,
];

const CUSTOM_SIZE_SEED: PomSeed[] = [
  ['A', 'Width', 'Side to side at widest point, laid flat', 20, 1, 0.5],
  ['B', 'Length', 'Top to bottom, laid flat', 28, 0.75, 0.5],
];

export function customToDef(r: CustomGarmentRecord): GarmentDef {
  return {
    id: r.id,
    name: r.name,
    short: r.name,
    category: 'custom',
    spec: 'Custom blank · uploaded flat-lay',
    views: r.views.map((v) => ({ id: v.id, label: v.label, image: v.image, zone: v.zone })),
    sizeChart: { points: CUSTOM_SIZE_SEED },
    custom: { tint: r.tint },
  };
}

/* Runtime registry: built-ins plus the user's custom blanks (registered from IndexedDB at startup). */
const registry = new Map<GarmentId, GarmentDef>(BUILT_IN_GARMENTS.map((g) => [g.id, g]));
let customIds: GarmentId[] = [];

export function setCustomGarments(records: CustomGarmentRecord[]) {
  for (const id of customIds) registry.delete(id);
  customIds = records.map((r) => r.id);
  for (const r of records) registry.set(r.id, customToDef(r));
}

export const DEFAULT_GARMENT: GarmentId = 'tee';
export const hasGarment = (id: GarmentId) => registry.has(id);
export const getGarment = (id: GarmentId): GarmentDef => registry.get(id) ?? TEE;
export const listGarments = (): GarmentDef[] => [...registry.values()];
export const garmentsIn = (category: GarmentCategory) => listGarments().filter((g) => g.category === category);

export const garmentViews = (id: GarmentId): GarmentView[] => getGarment(id).views;
export const hasView = (id: GarmentId, view: ViewId) => getGarment(id).views.some((v) => v.id === view);
export const getView = (id: GarmentId, view: ViewId): GarmentView => {
  const g = getGarment(id);
  return g.views.find((v) => v.id === view) ?? g.views[0];
};
export const viewLabel = (id: GarmentId, view: ViewId) => getView(id, view).label;
export const getZone = (id: GarmentId, view: ViewId): PrintZone => getView(id, view).zone;
export const zonePpi = (z: PrintZone): number => z.w / z.widthIn;

/** Body shape, for code that needs to know whether a garment is worn on the torso or the legs. */
export type GarmentShape = 'top' | 'bottom' | 'other';
const SHAPE_OVERRIDE: Record<string, GarmentShape> = { 'soccer-shorts': 'bottom', 'compression-shorts': 'bottom', 'soccer-socks': 'other' };
export function garmentShape(id: GarmentId): GarmentShape {
  const o = SHAPE_OVERRIDE[id];
  if (o) return o;
  const c = getGarment(id).category;
  return c === 'tops' || c === 'outerwear' || c === 'soccer' ? 'top' : c === 'bottoms' ? 'bottom' : 'other';
}
