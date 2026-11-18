import { memo } from 'react';
import type { GarmentId, PrintZone, ViewId } from '../types';
import { isDark, tone } from '../utils/color';

/* ------------------------------------------------------------------------------------------------
 * Garment templates are data: each view is a stack of panels (filled + shaded fabric), rib bands
 * (rendered with a dashed stroke to fake knit ribbing), seams, stitch lines and soft fold shadows.
 * Every color is derived from the single garment hex, so any color "just works".
 * Coordinate space: 500 × 560 (1 unit = 1 screen px in the studio).
 * ---------------------------------------------------------------------------------------------- */

export const GARMENT_W = 500;
export const GARMENT_H = 560;

interface Panel {
  d: string;
  /** Lighten (+) / darken (-) relative to the garment color. */
  tone?: number;
  /** Skip volume shading (used for garment interiors). */
  flat?: boolean;
}
interface Band {
  d: string;
  w: number;
  tone?: number;
}

interface ViewSpec {
  behind?: Panel[];
  panels: Panel[];
  ribs?: Band[];
  seams?: string[];
  stitches?: string[];
  folds?: string[];
  cords?: Band[];
  eyelets?: Array<[number, number]>;
  zone: PrintZone;
}

export interface GarmentDef {
  id: GarmentId;
  name: string;
  short: string;
  spec: string;
  views: Record<ViewId, ViewSpec>;
}

/* ---------- shared pieces ---------- */

const LONG_SLEEVE_VIEW: ViewSpec = {
  panels: [{ d: 'M140,62 C196,22 304,22 360,62 L332,468 L168,468 Z' }],
  ribs: [{ d: 'M170,490 L330,490', w: 44 }],
  stitches: ['M148,74 C202,38 298,38 352,74', 'M170,462 L330,462'],
  folds: ['M200,140 Q212,300 196,450', 'M300,140 Q288,300 304,450', 'M180,300 Q250,316 320,300'],
  zone: {
    x: 215, y: 110, w: 70, h: 300, widthIn: 3.5, heightIn: 15,
    placement: 'Left sleeve, centered, ~2 in below shoulder seam',
  },
};

/* ---------- Oversized Drop-Shoulder Tee ---------- */

const TEE_SLEEVES: Panel[] = [
  { d: 'M96,66 L18,190 L64,224 L100,206 Q88,140 96,66 Z' },
  { d: 'M404,66 L482,190 L436,224 L400,206 Q412,140 404,66 Z' },
];
const TEE_BODY_BELOW = 'L404,66 Q412,140 400,206 L404,528 Q250,538 96,528 L100,206 Q88,140 96,66 Z';
const TEE_COMMON_STITCH = [
  'M103,68 Q95,140 107,206',
  'M397,68 Q405,140 393,206',
  'M25,178 L71,212',
  'M475,178 L429,212',
  'M98,514 Q250,524 402,514',
  'M98,519 Q250,529 402,519',
];
const TEE_FOLDS = [
  'M150,250 Q162,330 146,430',
  'M352,256 Q340,340 356,436',
  'M420,100 Q446,150 452,196',
  'M80,100 Q54,150 48,196',
  'M210,470 Q250,490 296,472',
];

const TEE: GarmentDef = {
  id: 'tee',
  name: 'Oversized Drop-Shoulder Tee',
  short: 'Tee',
  spec: '240 GSM combed cotton jersey · boxy fit · dropped shoulder',
  views: {
    front: {
      behind: [{ d: 'M188,40 C220,54 280,54 312,40 C290,84 210,84 188,40 Z', tone: -0.38, flat: true }],
      panels: [...TEE_SLEEVES, { d: `M188,40 C210,84 290,84 312,40 ${TEE_BODY_BELOW}` }],
      ribs: [
        { d: 'M190,41.5 C220,53 280,53 310,41.5', w: 5, tone: -0.2 },
        { d: 'M189,43 C211,88 289,88 311,43', w: 11 },
      ],
      stitches: ['M186,49 C210,99 290,99 314,49', ...TEE_COMMON_STITCH],
      folds: TEE_FOLDS,
      zone: {
        x: 130, y: 112, w: 240, h: 300, widthIn: 12, heightIn: 15,
        placement: 'Center chest, ~3 in below HPS',
      },
    },
    back: {
      panels: [...TEE_SLEEVES, { d: `M188,40 C215,52 285,52 312,40 ${TEE_BODY_BELOW}` }],
      ribs: [{ d: 'M189,43 C216,57 284,57 311,43', w: 8 }],
      stitches: ['M186,50 C214,66 286,66 314,50', ...TEE_COMMON_STITCH],
      folds: TEE_FOLDS,
      zone: {
        x: 130, y: 90, w: 240, h: 320, widthIn: 12, heightIn: 16,
        placement: 'Center back, ~2.5 in below collar seam',
      },
    },
    sleeve: {
      panels: [{ d: 'M90,170 C150,92 350,92 410,170 L446,420 Q250,436 54,420 Z' }],
      stitches: ['M100,176 C158,104 342,104 400,176', 'M58,402 Q250,418 442,402', 'M57,409 Q250,425 443,409'],
      folds: ['M170,200 Q190,300 176,390', 'M330,200 Q312,300 326,390'],
      zone: {
        x: 160, y: 190, w: 180, h: 180, widthIn: 4.5, heightIn: 4.5,
        placement: 'Left sleeve, centered, ~1.5 in above hem',
      },
    },
  },
};

/* ---------- Heavyweight Boxy Hoodie ---------- */

const HOODIE_SLEEVES: Panel[] = [
  { d: 'M100,112 L48,172 Q30,300 26,440 L80,444 Q86,330 102,232 Q92,180 100,112 Z' },
  { d: 'M400,112 L452,172 Q470,300 474,440 L420,444 Q414,330 398,232 Q408,180 400,112 Z' },
];
const HOODIE_BODY = 'M168,104 L332,104 L400,112 Q408,180 398,232 L398,472 L102,472 L102,232 Q92,180 100,112 Z';
const HOODIE_RIBS: Band[] = [
  { d: 'M102,496 L398,496', w: 48 },
  { d: 'M80,464 L27,460', w: 40 },
  { d: 'M420,464 L473,460', w: 40 },
];
const HOODIE_STITCH = ['M107,114 Q99,180 109,232', 'M393,114 Q401,180 391,232', 'M104,477 L396,477'];
const HOODIE_FOLDS = [
  'M440,210 Q456,320 448,420',
  'M60,210 Q44,320 52,420',
  'M405,300 Q430,312 456,300',
  'M95,300 Q70,312 44,300',
];

const HOODIE: GarmentDef = {
  id: 'hoodie',
  name: 'Heavyweight Boxy Hoodie',
  short: 'Hoodie',
  spec: '450 GSM brushed fleece · boxy cropped fit · double-layer hood',
  views: {
    front: {
      behind: [
        { d: 'M168,104 C156,34 200,8 250,8 C300,8 344,34 332,104 Z', tone: -0.06 },
        {
          d: 'M196,98 C192,50 218,30 250,30 C282,30 308,50 304,98 C290,124 270,142 250,152 C230,142 210,124 196,98 Z',
          tone: -0.42,
          flat: true,
        },
      ],
      panels: [
        ...HOODIE_SLEEVES,
        { d: HOODIE_BODY },
        { d: 'M172,352 L328,352 L372,470 L128,470 Z', tone: 0.02 },
        { d: 'M168,104 C164,62 192,32 226,24 C206,42 194,68 196,98 C212,126 236,148 266,162 L248,174 C212,158 180,136 168,104 Z' },
        { d: 'M332,104 C336,62 308,32 274,24 C294,42 306,68 304,98 C288,126 264,148 234,162 L252,174 C288,158 320,136 332,104 Z' },
      ],
      ribs: HOODIE_RIBS,
      stitches: [
        ...HOODIE_STITCH,
        'M176,358 L324,358',
        'M178,355 L135,467',
        'M322,355 L365,467',
        'M175,104 C172,68 196,40 220,32',
        'M325,104 C328,68 304,40 280,32',
      ],
      folds: [...HOODIE_FOLDS, 'M150,250 Q160,310 150,340', 'M350,250 Q340,310 352,340', 'M200,420 Q250,440 300,420'],
      cords: [
        { d: 'M222,142 Q214,220 224,296', w: 4.5 },
        { d: 'M278,142 Q286,220 276,296', w: 4.5 },
        { d: 'M224,296 L225,314', w: 6.5, tone: -0.3 },
        { d: 'M276,296 L275,314', w: 6.5, tone: -0.3 },
      ],
      eyelets: [[222, 140], [278, 140]],
      zone: {
        x: 140, y: 176, w: 220, h: 170, widthIn: 11, heightIn: 8.5,
        placement: 'Center chest above pouch, ~4 in below neck seam',
      },
    },
    back: {
      panels: [
        ...HOODIE_SLEEVES,
        { d: HOODIE_BODY },
        { d: 'M168,104 C150,24 210,4 250,4 C290,4 350,24 332,104 C322,168 292,198 250,204 C208,198 178,168 168,104 Z' },
      ],
      ribs: HOODIE_RIBS,
      seams: ['M250,6 L250,203'],
      stitches: [...HOODIE_STITCH, 'M244,9 L244,200', 'M256,9 L256,200'],
      folds: [...HOODIE_FOLDS, 'M170,260 Q160,350 172,440', 'M330,260 Q340,350 328,440', 'M200,60 Q220,120 210,170'],
      zone: {
        x: 130, y: 222, w: 240, h: 230, widthIn: 12, heightIn: 11.5,
        placement: 'Center back, ~2 in below hood seam',
      },
    },
    sleeve: LONG_SLEEVE_VIEW,
  },
};

/* ---------- Relaxed Crewneck ---------- */

const CREW_SLEEVES: Panel[] = [
  { d: 'M108,78 L54,140 Q34,290 32,440 L84,444 Q90,330 104,238 Q96,170 108,78 Z' },
  { d: 'M392,78 L446,140 Q466,290 468,440 L416,444 Q410,330 396,238 Q404,170 392,78 Z' },
];
const CREW_BELOW = 'L392,78 Q404,170 396,238 L398,476 L102,476 L104,238 Q96,170 108,78 Z';
const CREW_RIBS: Band[] = [
  { d: 'M102,498 L398,498', w: 44 },
  { d: 'M84,464 L32,460', w: 40 },
  { d: 'M416,464 L468,460', w: 40 },
];
const CREW_STITCH = ['M114,82 Q103,170 111,238', 'M386,82 Q397,170 389,238', 'M104,481 L396,481'];
const CREW_FOLDS = [
  'M436,200 Q452,320 446,420',
  'M64,200 Q48,320 54,420',
  'M150,250 Q162,340 150,420',
  'M350,250 Q338,340 350,420',
  'M410,300 Q432,312 458,300',
  'M90,300 Q68,312 42,300',
];

const CREWNECK: GarmentDef = {
  id: 'crewneck',
  name: 'Relaxed Crewneck',
  short: 'Crewneck',
  spec: '380 GSM loopback terry · relaxed fit · V-stitch insert',
  views: {
    front: {
      behind: [{ d: 'M195,52 C222,64 278,64 305,52 C285,92 215,92 195,52 Z', tone: -0.38, flat: true }],
      panels: [...CREW_SLEEVES, { d: `M195,52 C215,92 285,92 305,52 ${CREW_BELOW}` }],
      ribs: [{ d: 'M197,53.5 C222,64 278,64 303,53.5', w: 5, tone: -0.2 }, { d: 'M196,55 C216,96 284,96 304,55', w: 12 }, ...CREW_RIBS],
      stitches: ['M193,60 C214,108 286,108 307,60', 'M238,100 L250,122 L262,100', ...CREW_STITCH],
      folds: CREW_FOLDS,
      zone: {
        x: 140, y: 118, w: 220, h: 260, widthIn: 11, heightIn: 13,
        placement: 'Center chest, ~3 in below HPS',
      },
    },
    back: {
      panels: [...CREW_SLEEVES, { d: `M195,52 C222,64 278,64 305,52 ${CREW_BELOW}` }],
      ribs: [{ d: 'M196,54.5 C222,67 278,67 304,54.5', w: 8 }, ...CREW_RIBS],
      stitches: ['M194,60 C222,74 278,74 306,60', ...CREW_STITCH],
      folds: CREW_FOLDS,
      zone: {
        x: 130, y: 96, w: 240, h: 300, widthIn: 12, heightIn: 15,
        placement: 'Center back, ~2.5 in below collar seam',
      },
    },
    sleeve: LONG_SLEEVE_VIEW,
  },
};

export const GARMENTS: Record<GarmentId, GarmentDef> = { tee: TEE, hoodie: HOODIE, crewneck: CREWNECK };
export const GARMENT_LIST: GarmentDef[] = [TEE, HOODIE, CREWNECK];

export const getZone = (garment: GarmentId, view: ViewId): PrintZone => GARMENTS[garment].views[view].zone;
export const zonePpi = (zone: PrintZone): number => zone.w / zone.widthIn;

/* ---------- renderer ---------- */

interface GarmentSVGProps {
  garment: GarmentId;
  view: ViewId;
  color: string;
  /** Prefix for <defs> ids – must be unique per SVG on the page. */
  uid?: string;
  className?: string;
  width?: number | string;
  height?: number | string;
  showShadow?: boolean;
}

export const GarmentSVG = memo(function GarmentSVG({
  garment,
  view,
  color,
  uid = 'lc',
  className,
  width = GARMENT_W,
  height = GARMENT_H,
  showShadow = true,
}: GarmentSVGProps) {
  const spec = GARMENTS[garment].views[view];
  const dark = isDark(color);
  const outline = dark ? tone(color, 0.26) : tone(color, -0.45);
  const stitch = dark ? tone(color, 0.42) : tone(color, -0.34);
  const ribLine = dark ? tone(color, 0.16) : tone(color, -0.22);
  const id = (k: string) => `${uid}-${k}`;
  const url = (k: string) => `url(#${id(k)})`;
  const silhouette = [...(spec.behind ?? []), ...spec.panels];

  const renderPanel = (p: Panel, i: number, key: string) => (
    <g key={`${key}${i}`}>
      <path d={p.d} fill={tone(color, p.tone ?? 0)} />
      {!p.flat && <path d={p.d} fill={url('h')} />}
      {!p.flat && <path d={p.d} fill={url('v')} />}
      <path d={p.d} fill="none" stroke={outline} strokeWidth={1.6} strokeLinejoin="round" />
    </g>
  );

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${GARMENT_W} ${GARMENT_H}`}
      width={width}
      height={height}
      className={className}
    >
      <defs>
        <linearGradient id={id('v')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity={0.1} />
          <stop offset="0.35" stopColor="#fff" stopOpacity={0} />
          <stop offset="0.7" stopColor="#000" stopOpacity={0} />
          <stop offset="1" stopColor="#000" stopOpacity={0.2} />
        </linearGradient>
        <linearGradient id={id('h')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity={0.26} />
          <stop offset="0.16" stopColor="#000" stopOpacity={0.04} />
          <stop offset="0.5" stopColor="#fff" stopOpacity={0.07} />
          <stop offset="0.84" stopColor="#000" stopOpacity={0.04} />
          <stop offset="1" stopColor="#000" stopOpacity={0.26} />
        </linearGradient>
        <filter id={id('noise')} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={7} stitchTiles="stitch" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.4 0.95" result="a" />
          <feComposite in="a" in2="SourceGraphic" operator="in" />
        </filter>
        <filter id={id('blur')} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation={3.5} />
        </filter>
        <filter id={id('shadow')} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation={12} />
        </filter>
        <clipPath id={id('clip')}>
          {silhouette.map((p, i) => (
            <path key={i} d={p.d} />
          ))}
        </clipPath>
      </defs>

      {showShadow && (
        <g filter={url('shadow')} opacity={0.45} transform="translate(0 12)">
          {silhouette.map((p, i) => (
            <path key={i} d={p.d} fill="#000" />
          ))}
        </g>
      )}

      {spec.behind?.map((p, i) => renderPanel(p, i, 'b'))}
      {spec.panels.map((p, i) => renderPanel(p, i, 'p'))}

      {/* fabric grain: ONE turbulence pass clipped to the silhouette (much cheaper than one per panel) */}
      <rect
        width={GARMENT_W}
        height={GARMENT_H}
        fill="#000"
        filter={url('noise')}
        clipPath={url('clip')}
        opacity={dark ? 0.55 : 0.3}
      />

      {/* soft fabric folds */}
      <g clipPath={url('clip')} filter={url('blur')} fill="none" strokeLinecap="round">
        {spec.folds?.map((d, i) => (
          <path key={i} d={d} stroke="#000" strokeWidth={7} opacity={dark ? 0.4 : 0.14} />
        ))}
      </g>

      {/* knit ribbing: base band + perpendicular dash ribs */}
      {spec.ribs?.map((r, i) => (
        <g key={`r${i}`} fill="none">
          <path d={r.d} stroke={outline} strokeWidth={r.w + 2.6} />
          <path d={r.d} stroke={tone(color, -0.04 + (r.tone ?? 0))} strokeWidth={r.w} />
          <path d={r.d} stroke={ribLine} strokeWidth={r.w - 1} strokeDasharray="1.1 2.4" opacity={0.6} />
        </g>
      ))}

      {spec.seams?.map((d, i) => (
        <path key={`s${i}`} d={d} fill="none" stroke={outline} strokeWidth={1.4} />
      ))}

      {spec.stitches?.map((d, i) => (
        <path
          key={`t${i}`}
          d={d}
          fill="none"
          stroke={stitch}
          strokeWidth={1.1}
          strokeDasharray="3.2 2.6"
          strokeLinecap="round"
          opacity={0.85}
        />
      ))}

      {spec.cords?.map((c, i) => (
        <g key={`c${i}`} fill="none" strokeLinecap="round">
          <path d={c.d} stroke={outline} strokeWidth={c.w + 2} />
          <path d={c.d} stroke={tone(color, (dark ? 0.18 : -0.1) + (c.tone ?? 0))} strokeWidth={c.w} />
        </g>
      ))}

      {spec.eyelets?.map(([x, y], i) => (
        <g key={`e${i}`}>
          <circle cx={x} cy={y} r={5} fill="#c9c9ce" stroke="#6f6f76" strokeWidth={1} />
          <circle cx={x} cy={y} r={2.2} fill="#1b1b1f" />
        </g>
      ))}
    </svg>
  );
});
