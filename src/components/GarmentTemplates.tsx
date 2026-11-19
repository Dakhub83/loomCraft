import { memo } from 'react';
import type { GarmentId, TintMode, ViewId } from '../types';
import { isDark, tone } from '../utils/color';
import { GARMENT_H, GARMENT_W, getGarment, getView, type Panel, type VectorArt } from '../data/garments';
import { getFabric } from '../data/fabrics';
import { weaveHighlight, weaveOverlay } from '../utils/weave';

// Re-exported so existing imports keep working; the data lives in src/data/garments.ts.
export { GARMENT_H, GARMENT_W, getGarment, getZone, zonePpi } from '../data/garments';

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
  /** Thumbnail mode: skips the turbulence grain and blurred folds (much cheaper to paint). */
  lite?: boolean;
  /** Fabric id: lays that weave over the drawing at true scale (~20 studio px per inch). */
  fabric?: string;
}

/**
 * Renders any registered garment view. Vector blanks derive every shade from the single garment hex;
 * custom photo blanks are tinted with an SVG blend (multiply / overlay) masked to the photo's alpha.
 */
export const GarmentSVG = memo(function GarmentSVG(props: GarmentSVGProps) {
  const { garment, view, uid = 'lc', className, width = GARMENT_W, height = GARMENT_H } = props;
  const def = getGarment(garment);
  const v = getView(garment, view);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${GARMENT_W} ${GARMENT_H}`} width={width} height={height} className={className}>
      {v.art ? (
        <VectorGarment art={v.art} color={props.color} uid={uid} showShadow={props.showShadow ?? true} lite={!!props.lite} fabric={props.fabric} />
      ) : v.image ? (
        <PhotoGarment image={v.image} color={props.color} uid={uid} tint={def.custom?.tint ?? 'multiply'} />
      ) : null}
    </svg>
  );
});

/** Standalone preview of a photo blank (used by the custom garment editor before it's registered). */
export function PhotoGarmentSVG(p: { image: string; color: string; tint: TintMode; uid: string; className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${GARMENT_W} ${GARMENT_H}`} width="100%" height="100%" className={p.className}>
      <PhotoGarment image={p.image} color={p.color} uid={p.uid} tint={p.tint} />
    </svg>
  );
}

function PhotoGarment({ image, color, uid, tint }: { image: string; color: string; uid: string; tint: TintMode }) {
  const id = (k: string) => `${uid}-${k}`;
  return (
    <>
      <defs>
        {/* white wherever the photo is opaque → masks the tint layer to the garment's silhouette */}
        <filter id={id('alpha')}>
          <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0" />
        </filter>
        <mask id={id('mask')} maskUnits="userSpaceOnUse" x="0" y="0" width={GARMENT_W} height={GARMENT_H}>
          <image href={image} width={GARMENT_W} height={GARMENT_H} preserveAspectRatio="xMidYMid meet" filter={`url(#${id('alpha')})`} />
        </mask>
      </defs>
      <g style={{ isolation: 'isolate' }}>
        <image href={image} width={GARMENT_W} height={GARMENT_H} preserveAspectRatio="xMidYMid meet" />
        {tint !== 'none' && (
          <rect width={GARMENT_W} height={GARMENT_H} fill={color} mask={`url(#${id('mask')})`} style={{ mixBlendMode: tint }} />
        )}
      </g>
    </>
  );
}

function VectorGarment({ art, color, uid, showShadow, lite, fabric }: { art: VectorArt; color: string; uid: string; showShadow: boolean; lite: boolean; fabric?: string }) {
  const dark = isDark(color);
  const weave = !lite ? getFabric(fabric) : undefined;
  const tile = weave ? weave.look.tileIn * 20 : 0;
  const outline = dark ? tone(color, 0.26) : tone(color, -0.45);
  const stitch = dark ? tone(color, 0.42) : tone(color, -0.34);
  const ribLine = dark ? tone(color, 0.16) : tone(color, -0.22);
  const id = (k: string) => `${uid}-${k}`;
  const url = (k: string) => `url(#${id(k)})`;
  const silhouette = [...(art.behind ?? []), ...art.panels];

  const renderPanel = (p: Panel, i: number, key: string) => (
    <g key={`${key}${i}`}>
      <path d={p.d} fill={tone(color, p.tone ?? 0)} />
      {!p.flat && <path d={p.d} fill={url('h')} />}
      {!p.flat && <path d={p.d} fill={url('v')} />}
      <path d={p.d} fill="none" stroke={outline} strokeWidth={1.6} strokeLinejoin="round" />
    </g>
  );

  return (
    <>
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
        {!lite && (
          <filter id={id('noise')} x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={7} stitchTiles="stitch" result="n" />
            <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.4 0.95" result="a" />
            <feComposite in="a" in2="SourceGraphic" operator="in" />
          </filter>
        )}
        {!lite && (
          <filter id={id('blur')} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation={3.5} />
          </filter>
        )}
        {showShadow && (
          <filter id={id('shadow')} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation={12} />
          </filter>
        )}
        {weave && (
          <pattern id={id('weave')} patternUnits="userSpaceOnUse" width={tile} height={tile}>
            <image href={weaveOverlay(weave)} width={tile} height={tile} preserveAspectRatio="none" />
          </pattern>
        )}
        {weave && dark && (
          <pattern id={id('weave-hi')} patternUnits="userSpaceOnUse" width={tile} height={tile}>
            <image href={weaveHighlight(weave)} width={tile} height={tile} preserveAspectRatio="none" />
          </pattern>
        )}
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

      {art.behind?.map((p, i) => renderPanel(p, i, 'b'))}
      {art.panels.map((p, i) => renderPanel(p, i, 'p'))}

      {/* fabric grain: ONE turbulence pass clipped to the silhouette (much cheaper than one per panel) */}
      {!lite && (
        <rect width={GARMENT_W} height={GARMENT_H} fill="#000" filter={url('noise')} clipPath={url('clip')} opacity={dark ? 0.55 : 0.3} />
      )}

      {/* the chosen fabric's weave, at real scale */}
      {weave && <rect width={GARMENT_W} height={GARMENT_H} fill={url('weave')} clipPath={url('clip')} opacity={dark ? 0.55 : 0.4} />}
      {weave && dark && <rect width={GARMENT_W} height={GARMENT_H} fill={url('weave-hi')} clipPath={url('clip')} opacity={0.09} />}

      {/* soft fabric folds */}
      <g clipPath={url('clip')} filter={lite ? undefined : url('blur')} fill="none" strokeLinecap="round">
        {art.folds?.map((d, i) => (
          <path key={i} d={d} stroke="#000" strokeWidth={lite ? 3 : 7} opacity={dark ? (lite ? 0.25 : 0.4) : lite ? 0.08 : 0.14} />
        ))}
      </g>

      {/* knit ribbing: base band + perpendicular dash ribs; clip bands are texture only (knit crowns) */}
      {art.ribs?.map((r, i) =>
        r.clip ? (
          <path key={`r${i}`} d={r.d} fill="none" clipPath={url('clip')} stroke={ribLine} strokeWidth={r.w} strokeDasharray="1.1 2.6" opacity={0.4} />
        ) : (
          <g key={`r${i}`} fill="none">
            <path d={r.d} stroke={outline} strokeWidth={r.w + 2.6} />
            <path d={r.d} stroke={tone(color, -0.04 + (r.tone ?? 0))} strokeWidth={r.w} />
            <path d={r.d} stroke={ribLine} strokeWidth={r.w - 1} strokeDasharray="1.1 2.4" opacity={0.6} />
          </g>
        ),
      )}

      {art.seams?.map((d, i) => (
        <path key={`s${i}`} d={d} fill="none" stroke={outline} strokeWidth={1.4} />
      ))}

      {art.stitches?.map((d, i) => (
        <path key={`t${i}`} d={d} fill="none" stroke={stitch} strokeWidth={1.1} strokeDasharray="3.2 2.6" strokeLinecap="round" opacity={0.85} />
      ))}

      {art.cords?.map((c, i) => (
        <g key={`c${i}`} fill="none" strokeLinecap="round">
          <path d={c.d} stroke={outline} strokeWidth={c.w + 2} />
          <path d={c.d} stroke={tone(color, (dark ? 0.18 : -0.1) + (c.tone ?? 0))} strokeWidth={c.w} />
        </g>
      ))}

      {art.buttons?.map(([x, y, r], i) => (
        <g key={`k${i}`}>
          <circle cx={x} cy={y} r={r} fill={tone(color, dark ? 0.12 : -0.18)} stroke={outline} strokeWidth={1} />
          {r >= 4 && (
            <>
              <circle cx={x - r * 0.3} cy={y} r={r * 0.16} fill={outline} />
              <circle cx={x + r * 0.3} cy={y} r={r * 0.16} fill={outline} />
            </>
          )}
        </g>
      ))}

      {art.eyelets?.map(([x, y], i) => (
        <g key={`e${i}`}>
          <circle cx={x} cy={y} r={5} fill="#c9c9ce" stroke="#6f6f76" strokeWidth={1} />
          <circle cx={x} cy={y} r={2.2} fill="#1b1b1f" />
        </g>
      ))}
    </>
  );
}
