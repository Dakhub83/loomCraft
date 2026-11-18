import { memo } from 'react';
import { AlertTriangle, FileText, RefreshCw, Ruler, Trash2 } from 'lucide-react';
import type { GarmentId, ManufacturingSpec, ViewDesigns, ViewEffects } from '../../types';
import { getGarment } from '../../data/garments';
import { generateSpec, specIsStale } from '../../utils/manufacturingSpecs';

interface Props {
  garment: GarmentId;
  color: string;
  designs: ViewDesigns;
  effects: ViewEffects;
  spec: ManufacturingSpec | undefined;
  onChange(spec: ManufacturingSpec | null): void;
  onOpenSizeChart(): void;
  onInfo(msg: string): void;
}

type TextField = 'fabricWeight' | 'composition' | 'construction' | 'trims' | 'printNotes' | 'care';
const FIELDS: Array<{ key: TextField; label: string; rows?: number }> = [
  { key: 'fabricWeight', label: 'Fabric weight' },
  { key: 'composition', label: 'Fabric composition' },
  { key: 'construction', label: 'Construction', rows: 4 },
  { key: 'trims', label: 'Trims & labels', rows: 3 },
  { key: 'printNotes', label: 'Factory print notes', rows: 10 },
  { key: 'care', label: 'Care instructions', rows: 2 },
];

export const SpecHelper = memo(function SpecHelper({ garment, color, designs, effects, spec, onChange, onOpenSizeChart, onInfo }: Props) {
  const g = getGarment(garment);
  const stale = spec ? specIsStale(spec, garment, designs, effects) : false;

  const generate = () => {
    onChange(generateSpec(garment, color, designs, effects));
    onInfo(`${spec ? 'Regenerated' : 'Generated'} the manufacturing spec for the ${g.name}`);
  };

  return (
    <div className="space-y-3 p-4">
      <p className="text-xs leading-relaxed text-zinc-400">
        Recommended fabric, weight, construction and factory print notes for the <strong className="text-zinc-200">{g.name}</strong>, based on the print method set on each view. Everything is
        editable, and it appears in the Size Chart and on its own page of the PDF tech pack.
      </p>

      <button onClick={generate} className="lc-btn-primary h-9 w-full gap-2 text-xs">
        <RefreshCw size={14} /> {spec ? 'Regenerate from current design' : 'Generate manufacturing spec'}
      </button>

      {stale && (
        <p className="flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-200">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" /> Print methods or artwork views changed since this spec was generated. Regenerate to update the print notes (your edits to other fields will be replaced).
        </p>
      )}

      {spec ? (
        <>
          {FIELDS.map((f) => (
            <label key={f.key} className="block text-[10.5px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
              {f.label}
              {f.rows ? (
                <textarea
                  value={spec[f.key]}
                  rows={f.rows}
                  onChange={(e) => onChange({ ...spec, [f.key]: e.target.value })}
                  className="lc-input mt-1 w-full resize-y font-sans text-xs font-normal normal-case leading-relaxed tracking-normal"
                />
              ) : (
                <input value={spec[f.key]} onChange={(e) => onChange({ ...spec, [f.key]: e.target.value })} className="lc-input mt-1 w-full text-xs font-normal normal-case tracking-normal" />
              )}
            </label>
          ))}
          <div className="flex gap-2 pt-1">
            <button onClick={onOpenSizeChart} className="lc-btn h-8 flex-1 gap-1.5 text-xs">
              <Ruler size={13} /> Open Size Chart
            </button>
            <button
              onClick={() => window.confirm('Remove the manufacturing spec for this garment?') && onChange(null)}
              className="lc-btn h-8 w-8 p-0 hover:text-red-400"
              title="Remove spec"
            >
              <Trash2 size={13} />
            </button>
          </div>
          <p className="flex items-center gap-1.5 text-[10.5px] text-zinc-600">
            <FileText size={11} /> Included in the PDF tech pack as a “Manufacturing Spec” page.
          </p>
        </>
      ) : (
        <p className="rounded-lg border border-dashed border-white/10 px-3 py-6 text-center text-xs text-zinc-500">No spec yet for this garment. Generate one to start from LoomCraft’s recommendations.</p>
      )}
    </div>
  );
});
