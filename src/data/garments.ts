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
  sizeChart: { sizes?: string[]; base?: string; points: PomSeed[] };
  /** Measurement diagram lines on the first view (optional). */
  measureLines?: Record<string, MeasureLine>;
  /** Present for user-uploaded blanks. */
  custom?: { tint: TintMode };
}

export const CATEGORIES: Array<{ id: GarmentCategory; label: string }> = [
  { id: 'tops', label: 'Tops' },
  { id: 'bottoms', label: 'Bottoms' },
  { id: 'outerwear', label: 'Outerwear' },
  { id: 'accessories', label: 'Accessories' },
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
  category: 'accessories',
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

/* ------------------------------------------------------------------------- registry */

export const BUILT_IN_GARMENTS: GarmentDef[] = [
  TEE, LONGSLEEVE, POLO, TANK, CROP,
  HOODIE, ZIPHOODIE, CREWNECK,
  JOGGERS, SHORTS, CARGO,
  COACH, WORK,
  TOTE, DADHAT, BEANIE,
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
