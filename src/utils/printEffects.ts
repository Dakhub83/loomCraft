import type { PrintEffect } from '../types';

export const PRINT_EFFECTS: Array<{ id: PrintEffect; name: string; blurb: string }> = [
  { id: 'none', name: 'Digital (DTG)', blurb: 'Clean, full-color direct-to-garment look' },
  { id: 'screen', name: 'Screen Print', blurb: 'Plastisol ink with subtle mesh grain' },
  { id: 'puff', name: 'Puff Print', blurb: 'Raised, rounded ink with soft highlights' },
  { id: 'vintage', name: 'Vintage Distressed', blurb: 'Cracked, faded, worn-in ink' },
];

export const effectName = (e: PrintEffect) => PRINT_EFFECTS.find((p) => p.id === e)?.name ?? e;

export const filterId = (effect: PrintEffect, scale = 1) => `lc-fx-${effect}-${String(scale).replace('.', '_')}`;

/**
 * SVG filter markup for a print effect. `scale` keeps grain size and bevel depth constant when the
 * artwork is rendered at a higher resolution (exports), so preview and export look the same.
 */
export function filterMarkup(effect: PrintEffect, scale = 1): string {
  const id = filterId(effect, scale);
  const f = (n: number) => +(n / scale).toFixed(4);
  const s = (n: number) => +(n * scale).toFixed(3);
  const region = `id="${id}" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB"`;

  switch (effect) {
    case 'screen':
      return `<filter ${region}>
        <feTurbulence type="fractalNoise" baseFrequency="${f(1.1)}" numOctaves="2" seed="4" result="noise"/>
        <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -0.7 1.25" result="grain"/>
        <feComposite in="SourceGraphic" in2="grain" operator="in" result="ink"/>
        <feColorMatrix in="ink" type="saturate" values="1.08" result="sat"/>
        <feComponentTransfer in="sat"><feFuncA type="linear" slope="0.96"/></feComponentTransfer>
      </filter>`;
    case 'puff':
      return `<filter ${region}>
        <feGaussianBlur in="SourceAlpha" stdDeviation="${s(2.2)}" result="blur"/>
        <feSpecularLighting in="blur" surfaceScale="4" specularConstant="0.75" specularExponent="18" lighting-color="#ffffff" result="spec">
          <feDistantLight azimuth="225" elevation="45"/>
        </feSpecularLighting>
        <feComposite in="spec" in2="SourceAlpha" operator="in" result="specIn"/>
        <feColorMatrix in="SourceGraphic" type="saturate" values="0.85" result="matte"/>
        <feComposite in="matte" in2="specIn" operator="arithmetic" k1="0" k2="1" k3="0.55" k4="0" result="lit"/>
        <feOffset in="blur" dx="${s(1.5)}" dy="${s(2.5)}" result="off"/>
        <feColorMatrix in="off" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.55 0" result="shadow"/>
        <feMerge><feMergeNode in="shadow"/><feMergeNode in="lit"/></feMerge>
      </filter>`;
    case 'vintage':
      return `<filter ${region}>
        <feTurbulence type="fractalNoise" baseFrequency="${f(0.55)}" numOctaves="4" seed="11" result="noise"/>
        <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -7 4.3" result="cracks"/>
        <feComposite in="SourceGraphic" in2="cracks" operator="in" result="worn"/>
        <feColorMatrix in="worn" type="saturate" values="0.7" result="faded"/>
        <feComponentTransfer in="faded">
          <feFuncR type="linear" slope="0.9" intercept="0.05"/>
          <feFuncG type="linear" slope="0.9" intercept="0.04"/>
          <feFuncB type="linear" slope="0.88" intercept="0.03"/>
          <feFuncA type="linear" slope="0.86"/>
        </feComponentTransfer>
      </filter>`;
    default:
      return '';
  }
}

/** Ensures an export-scaled filter exists in the document (canvas `ctx.filter` can reference it). */
export function ensureFilterInDocument(effect: PrintEffect, scale: number): string | null {
  if (effect === 'none') return null;
  const id = filterId(effect, scale);
  if (!document.getElementById(id)) {
    let host = document.getElementById('lc-fx-export-host') as SVGSVGElement | null;
    if (!host) {
      host = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      host.id = 'lc-fx-export-host';
      host.setAttribute('width', '0');
      host.setAttribute('height', '0');
      host.style.position = 'absolute';
      host.style.pointerEvents = 'none';
      document.body.appendChild(host);
    }
    host.insertAdjacentHTML('beforeend', filterMarkup(effect, scale));
  }
  return `url(#${id})`;
}
