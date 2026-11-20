import { memo, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Shirt, Trash2 } from 'lucide-react';
import type { CustomGarmentRecord, GarmentCategory, GarmentId } from '../types';
import { CATEGORIES, getGarment, listGarments, type GarmentDef } from '../data/garments';
import { fabricFor, type FabricDef } from '../data/fabrics';
import { GARMENT_SWATCHES } from '../utils/color';
import { GarmentSVG } from './GarmentTemplates';
import { Section } from './Toolbar';

/* ---------- 3D thumbnails ----------
 * Rendered by the lazily loaded `three/thumbnails` module (Three.js stays out of the startup bundle).
 * Until a render arrives, and for custom photo blanks, the card shows the 2D drawing. */

type ThumbModule = typeof import('../three/thumbnails');
let thumbs: ThumbModule | null = null;
let thumbsLoading: Promise<ThumbModule | null> | null = null;
function loadThumbs(): Promise<ThumbModule | null> {
  thumbsLoading ??= import('../three/thumbnails')
    .then((m) => (thumbs = m))
    .catch(() => null);
  return thumbsLoading;
}

/** Colour dots on each card: a quick way to try a blank in the core colours. */
const DOT_COLORS = ['Optic White', 'Jet Black', 'Heather Grey', 'Navy', 'Clay'].map((n) => GARMENT_SWATCHES.find((s) => s.name === n)!);

function useGarmentThumb(id: GarmentId, color: string, fabric: FabricDef, delay: number): [string | null, () => void] {
  const [url, setUrl] = useState<string | null>(() => thumbs?.cachedThumb(id, color, fabric) ?? null);
  useEffect(() => {
    const ctrl = new AbortController();
    const cached = thumbs?.cachedThumb(id, color, fabric);
    if (cached) {
      setUrl(cached);
      return;
    }
    // Debounced, so dragging the colour picker renders once the colour settles.
    const timer = window.setTimeout(async () => {
      const mod = await loadThumbs();
      if (!mod || ctrl.signal.aborted || !mod.canThumb(id)) return;
      const next = await mod.garmentThumb(id, color, fabric, ctrl.signal);
      if (next && !ctrl.signal.aborted) setUrl(next);
    }, delay);
    return () => {
      ctrl.abort();
      window.clearTimeout(timer);
    };
  }, [id, color, fabric, delay]);
  // An evicted cache entry revokes its URL; fall back to the drawing until the next render.
  return [url, () => setUrl(null)];
}

interface Props {
  garment: GarmentId;
  color: string;
  /** Explicit fabric for the current garment (undefined = its default). Other cards use their default. */
  fabricId?: string;
  onColor(hex: string): void;
  /** Changes identity whenever custom blanks are added/edited/removed, so the list refreshes. */
  customGarments: CustomGarmentRecord[];
  onGarment(id: GarmentId): void;
  onAddCustom(): void;
  onEditCustom(id: GarmentId): void;
  onDeleteCustom(id: GarmentId): void;
}

function GarmentCard({
  g,
  selected,
  color,
  fabricId,
  onClick,
  onPick,
  actions,
}: {
  g: GarmentDef;
  selected: boolean;
  color: string;
  fabricId?: string;
  onClick(): void;
  /** Selects this garment in a colour (the card's colour dots). */
  onPick(hex: string): void;
  actions?: React.ReactNode;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const shown = preview ?? color;
  const fabric = useMemo(() => fabricFor(fabricId ? { [g.id]: fabricId } : undefined, g.id), [fabricId, g.id]);
  const [thumb, dropThumb] = useGarmentThumb(g.id, shown, fabric, preview ? 40 : 220);
  const dots = g.custom ? [] : DOT_COLORS;

  return (
    <div className="group relative" onMouseLeave={() => setPreview(null)}>
      <button
        onClick={onClick}
        title={`${g.name} — ${g.spec}`}
        className={`flex w-full flex-col items-center rounded-lg border p-1 pb-1.5 transition ${
          selected ? 'border-violet-500/70 bg-violet-500/[0.07]' : 'border-white/[0.07] bg-white/[0.02] hover:border-white/20'
        }`}
      >
        <span className="relative grid aspect-[20/21] w-full place-items-center overflow-hidden rounded-md bg-gradient-to-b from-[#f4f4f6] to-[#e4e4e9]">
          {thumb ? (
            <img src={thumb} alt="" draggable={false} onError={dropThumb} className="h-full w-full object-contain" />
          ) : (
            <GarmentSVG garment={g.id} view={g.views[0].id} color={shown} uid={`thumb-${g.id}`} width="88%" height="88%" showShadow={false} lite />
          )}
        </span>
        <span className="mt-1 w-full truncate text-center text-[10.5px] font-medium leading-tight text-zinc-300">{g.short}</span>
      </button>
      {dots.length > 0 && (
        <div
          className="pointer-events-none absolute inset-x-0 top-[calc(100%-38px)] flex justify-center gap-[3px] opacity-0 transition group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100"
          onMouseLeave={() => setPreview(null)}
        >
          {dots.map((d) => {
            const on = selected && color.toUpperCase() === d.hex.toUpperCase();
            return (
              <button
                key={d.hex}
                onClick={() => onPick(d.hex)}
                onMouseEnter={() => setPreview(d.hex)}
                onFocus={() => setPreview(d.hex)}
                onBlur={() => setPreview(null)}
                title={`${g.short} in ${d.name}`}
                aria-label={`${g.name} in ${d.name}`}
                className={`h-[11px] w-[11px] rounded-full border shadow-sm transition hover:scale-125 ${on ? 'border-violet-500 ring-2 ring-violet-500/60' : 'border-black/25'}`}
                style={{ background: d.hex }}
              />
            );
          })}
        </div>
      )}
      {actions && <div className="absolute right-1 top-1 hidden gap-0.5 group-hover:flex">{actions}</div>}
    </div>
  );
}

export const GarmentPicker = memo(function GarmentPicker({ garment, color, fabricId, onColor, customGarments, onGarment, onAddCustom, onEditCustom, onDeleteCustom }: Props) {
  const current = getGarment(garment);
  const [category, setCategory] = useState<GarmentCategory>(current.category);

  // Follow the selected garment when it changes from elsewhere (drafts, the AI assistant).
  useEffect(() => setCategory(getGarment(garment).category), [garment]);

  const groups = useMemo(() => {
    const items = listGarments().filter((g) => g.category === category);
    const map = new Map<string, GarmentDef[]>();
    for (const g of items) {
      const key = g.group ?? '';
      map.set(key, [...(map.get(key) ?? []), g]);
    }
    return [...map.entries()];
    // customGarments changes when the registry's custom entries change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, customGarments]);

  return (
    <Section title="Garment" icon={<Shirt size={14} />} right={<span className="max-w-[130px] truncate text-[11px] text-zinc-500">{current.name}</span>}>
      <div className="mb-3 flex flex-wrap gap-1">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategory(c.id)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
              category === c.id
                ? 'border-violet-500/70 bg-violet-500/15 text-violet-200'
                : 'border-white/[0.08] text-zinc-400 hover:border-white/20 hover:text-zinc-200'
            }`}
          >
            {c.label}
            {current.category === c.id && category !== c.id && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-violet-500 align-middle" />}
          </button>
        ))}
      </div>

      {groups.map(([group, items]) => (
        <div key={group || 'main'} className="mb-2 last:mb-0">
          {group && <p className="mb-1.5 mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">{group}</p>}
          <div className="grid grid-cols-3 gap-2">
            {items.map((g) => (
              <GarmentCard
                key={g.id}
                g={g}
                selected={garment === g.id}
                color={color}
                fabricId={garment === g.id ? fabricId : undefined}
                onClick={() => onGarment(g.id)}
                onPick={(hex) => {
                  onGarment(g.id);
                  onColor(hex);
                }}
                actions={
                  g.custom ? (
                    <>
                      <button onClick={() => onEditCustom(g.id)} title="Edit" className="grid h-5 w-5 place-items-center rounded bg-black/70 text-zinc-300 hover:text-white">
                        <Pencil size={10} />
                      </button>
                      <button
                        onClick={() => window.confirm(`Delete the custom garment “${g.name}”? Designs using it will switch to the Boxy Tee.`) && onDeleteCustom(g.id)}
                        title="Delete"
                        className="grid h-5 w-5 place-items-center rounded bg-black/70 text-zinc-300 hover:text-red-400"
                      >
                        <Trash2 size={10} />
                      </button>
                    </>
                  ) : undefined
                }
              />
            ))}
            {category === 'custom' && (
              <button
                onClick={onAddCustom}
                className="flex min-h-[112px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-white/15 text-zinc-400 transition hover:border-violet-500/60 hover:bg-violet-500/[0.06] hover:text-violet-200"
              >
                <Plus size={18} />
                <span className="px-1 text-center text-[10.5px] font-medium leading-tight">Add Custom Garment</span>
              </button>
            )}
          </div>
        </div>
      ))}

      {category === 'custom' && !groups.length && (
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={onAddCustom}
            className="flex min-h-[112px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-white/15 text-zinc-400 transition hover:border-violet-500/60 hover:bg-violet-500/[0.06] hover:text-violet-200"
          >
            <Plus size={18} />
            <span className="px-1 text-center text-[10.5px] font-medium leading-tight">Add Custom Garment</span>
          </button>
          <p className="col-span-2 self-center text-[11px] leading-snug text-zinc-500">Upload your own front/back flat-lay photos of any item and set its print area.</p>
        </div>
      )}
    </Section>
  );
});
