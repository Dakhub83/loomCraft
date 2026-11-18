import { memo, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Shirt, Trash2 } from 'lucide-react';
import type { CustomGarmentRecord, GarmentCategory, GarmentId } from '../types';
import { CATEGORIES, getGarment, listGarments, type GarmentDef } from '../data/garments';
import { GarmentSVG } from './GarmentTemplates';
import { Section } from './Toolbar';

interface Props {
  garment: GarmentId;
  color: string;
  /** Changes identity whenever custom blanks are added/edited/removed, so the list refreshes. */
  customGarments: CustomGarmentRecord[];
  onGarment(id: GarmentId): void;
  onAddCustom(): void;
  onEditCustom(id: GarmentId): void;
  onDeleteCustom(id: GarmentId): void;
}

function GarmentCard({ g, selected, color, onClick, actions }: { g: GarmentDef; selected: boolean; color: string; onClick(): void; actions?: React.ReactNode }) {
  return (
    <div className="group relative">
      <button
        onClick={onClick}
        title={`${g.name} — ${g.spec}`}
        className={`flex w-full flex-col items-center rounded-lg border p-1.5 pb-2 transition ${
          selected ? 'border-violet-500/70 bg-violet-500/[0.07]' : 'border-white/[0.07] bg-white/[0.02] hover:border-white/20'
        }`}
      >
        <GarmentSVG garment={g.id} view={g.views[0].id} color={color} uid={`thumb-${g.id}`} width="100%" height={64} showShadow={false} lite />
        <span className="mt-1 w-full truncate text-center text-[10.5px] font-medium leading-tight text-zinc-300">{g.short}</span>
      </button>
      {actions && <div className="absolute right-1 top-1 hidden gap-0.5 group-hover:flex">{actions}</div>}
    </div>
  );
}

export const GarmentPicker = memo(function GarmentPicker({ garment, color, customGarments, onGarment, onAddCustom, onEditCustom, onDeleteCustom }: Props) {
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
                onClick={() => onGarment(g.id)}
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
                className="flex min-h-[94px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-white/15 text-zinc-400 transition hover:border-violet-500/60 hover:bg-violet-500/[0.06] hover:text-violet-200"
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
            className="flex min-h-[94px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-white/15 text-zinc-400 transition hover:border-violet-500/60 hover:bg-violet-500/[0.06] hover:text-violet-200"
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
