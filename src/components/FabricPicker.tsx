import { memo, useMemo, useState } from 'react';
import { ChevronDown, RotateCcw } from 'lucide-react';
import type { GarmentId } from '../types';
import { FABRICS, defaultFabricFor, fabricFor, suggestedFabrics, type FabricDef } from '../data/fabrics';
import { fabricSwatch } from '../utils/weave';

interface Props {
  garment: GarmentId;
  color: string;
  /** Explicit choice for this garment, if any. */
  fabricId: string | undefined;
  onFabric(id: string | null): void;
}

const weight = (f: FabricDef) => (f.gsm ? `${f.gsm} GSM` : f.weightNote ?? '');

/**
 * Fabric choice for the current garment: recommended fabrics first (as swatches rendered in the garment
 * color), the rest behind "More fabrics". The choice shows on the 2D drawing, exports, the 360° view
 * and the manufacturing spec.
 */
export const FabricPicker = memo(function FabricPicker({ garment, color, fabricId, onFabric }: Props) {
  const [more, setMore] = useState(false);
  const current = fabricFor(fabricId ? { [garment]: fabricId } : undefined, garment);
  const def = defaultFabricFor(garment);
  const suggested = useMemo(() => suggestedFabrics(garment), [garment]);
  const others = useMemo(() => FABRICS.filter((f) => !suggested.some((s) => s.id === f.id)), [suggested]);
  const showMore = more || others.some((f) => f.id === current.id);

  const pick = (f: FabricDef) => onFabric(f.id === def.id ? null : f.id);

  const tile = (f: FabricDef) => {
    const active = f.id === current.id;
    return (
      <button
        key={f.id}
        onClick={() => pick(f)}
        title={`${f.name} · ${weight(f)}\n${f.description}`}
        aria-pressed={active}
        className={`group flex flex-col items-center gap-1 rounded-lg p-1 text-center transition ${active ? 'bg-violet-500/15 ring-1 ring-violet-500/70' : 'hover:bg-white/[0.04]'}`}
      >
        <img src={fabricSwatch(f, color, 56)} alt="" className="h-11 w-full rounded-md border border-white/10 object-cover" />
        <span className={`w-full truncate text-[10.5px] leading-tight ${active ? 'text-violet-200' : 'text-zinc-400 group-hover:text-zinc-200'}`}>{f.short}</span>
      </button>
    );
  };

  return (
    <div>
      <div className="mb-3 flex items-start gap-2.5 rounded-lg bg-black/25 p-2">
        <img src={fabricSwatch(current, color, 72)} alt="" className="h-10 w-10 shrink-0 rounded-md border border-white/10" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-xs font-medium text-zinc-100">{current.name}</span>
            {current.id === def.id ? (
              <span className="shrink-0 rounded bg-zinc-800 px-1 text-[9.5px] text-zinc-400">default</span>
            ) : (
              <button onClick={() => onFabric(null)} className="shrink-0 text-zinc-500 hover:text-zinc-200" title={`Back to the default (${def.name})`}>
                <RotateCcw size={11} />
              </button>
            )}
          </div>
          <p className="text-[10.5px] leading-snug text-zinc-500">
            {weight(current)} · {current.composition}
          </p>
        </div>
      </div>

      <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Recommended</div>
      <div className="grid grid-cols-4 gap-1">{suggested.map(tile)}</div>

      <button onClick={() => setMore((m) => !m)} className="mt-2 flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200" aria-expanded={showMore}>
        <ChevronDown size={12} className={`transition ${showMore ? 'rotate-180' : ''}`} /> {showMore ? 'Fewer fabrics' : `More fabrics (${others.length})`}
      </button>
      {showMore && <div className="mt-1.5 grid grid-cols-4 gap-1">{others.map(tile)}</div>}
    </div>
  );
});
