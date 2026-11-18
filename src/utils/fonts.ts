export const CURATED_FONTS = [
  'Inter',
  'Bebas Neue',
  'Anton',
  'Oswald',
  'Archivo Black',
  'Space Grotesk',
  'Playfair Display',
  'DM Serif Display',
  'Permanent Marker',
  'Pacifico',
  'Lobster',
  'Caveat',
  'Righteous',
  'Bungee',
  'Monoton',
  'Rubik Mono One',
  'UnifrakturMaguntia',
  'Press Start 2P',
];

const loaded = new Map<string, Promise<boolean>>();

const cssUrl = (family: string, weights?: string) =>
  `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}${
    weights ? `:ital,wght@${weights}` : ''
  }&display=swap`;

async function fetchCss(family: string): Promise<string | null> {
  // Ask for regular/bold + italics first; Google returns 400 if a family lacks those axes, so fall back.
  for (const url of [cssUrl(family, '0,400;0,700;1,400;1,700'), cssUrl(family, '0,400;0,700'), cssUrl(family)]) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.text();
    } catch {
      /* network error – try next */
    }
  }
  return null;
}

/** Loads a Google Font by family name. Resolves true when it's usable in canvas rendering. */
export function loadGoogleFont(family: string): Promise<boolean> {
  const name = family.trim();
  if (!name) return Promise.resolve(false);
  const cached = loaded.get(name);
  if (cached) return cached;

  const p = (async () => {
    const css = await fetchCss(name);
    if (!css) return false;
    const style = document.createElement('style');
    style.dataset.font = name;
    style.textContent = css;
    document.head.appendChild(style);
    try {
      await Promise.all([document.fonts.load(`400 48px "${name}"`), document.fonts.load(`700 48px "${name}"`)]);
    } catch {
      /* ignore */
    }
    return document.fonts.check(`48px "${name}"`);
  })();

  loaded.set(name, p);
  p.then((ok) => {
    if (!ok) loaded.delete(name);
  });
  return p;
}

/** Collect every fontFamily used in a serialized canvas (incl. nested groups). */
export function fontsInJSON(json: unknown): string[] {
  const out = new Set<string>();
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const rec = node as Record<string, unknown>;
    if (typeof rec.fontFamily === 'string') out.add(rec.fontFamily.replace(/["']/g, '').split(',')[0].trim());
    if (Array.isArray(rec.objects)) rec.objects.forEach(walk);
  };
  walk(json);
  return [...out];
}

export async function ensureFonts(json: unknown): Promise<void> {
  await Promise.all(fontsInJSON(json).map((f) => loadGoogleFont(f)));
}
