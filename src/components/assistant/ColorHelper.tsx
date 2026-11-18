import { memo, useMemo, type RefObject } from 'react';
import { AlertTriangle, Copy, Paintbrush } from 'lucide-react';
import type { DesignCanvasHandle } from '../DesignCanvas';
import { nearestPantone, normalizeHex } from '../../utils/color';
import { contrastRatio, contrastRating, describeColor, suggestInks, type InkSuggestion } from '../../utils/colorHarmony';

interface Props {
  garmentColor: string;
  canvas: RefObject<DesignCanvasHandle | null>;
  hasSelection: boolean;
  /** Changes whenever the current view's design changes, so the ink check refreshes. */
  designVersion: unknown;
  onInfo(msg: string): void;
  onError(msg: string): void;
}

const RATING_STYLE = {
  great: 'bg-emerald-500/15 text-emerald-300',
  good: 'bg-emerald-500/10 text-emerald-300',
  ok: 'bg-amber-500/10 text-amber-300',
  low: 'bg-red-500/15 text-red-300',
};

function Swatch({ ink, garment }: { ink: string; garment: string }) {
  return (
    <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg border border-white/10" style={{ background: garment }}>
      <span className="text-xl font-black leading-none" style={{ color: ink }}>
        Aa
      </span>
    </div>
  );
}

export const ColorHelper = memo(function ColorHelper({ garmentColor, canvas, hasSelection, designVersion, onInfo, onError }: Props) {
  const suggestions = useMemo(() => suggestInks(garmentColor), [garmentColor]);
  const currentInks = useMemo(
    () =>
      (canvas.current?.inkColors() ?? [])
        .map((c) => normalizeHex(c))
        .filter((c): c is string => !!c)
        .map((hex) => ({ hex, ratio: contrastRatio(hex, garmentColor) }))
        .sort((a, b) => a.ratio - b.ratio),
    // designVersion: recompute when the design changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canvas, garmentColor, designVersion],
  );
  const groups = useMemo(() => {
    const m = new Map<InkSuggestion['group'], InkSuggestion[]>();
    for (const s of suggestions) m.set(s.group, [...(m.get(s.group) ?? []), s]);
    return [...m.entries()];
  }, [suggestions]);

  const apply = (hex: string) => {
    const c = canvas.current;
    if (!c) return;
    const ids = hasSelection ? c.selectedIds() : null;
    const n = c.recolorLayers(ids, hex);
    if (n) onInfo(`Recolored ${n} layer${n > 1 ? 's' : ''} to ${hex}${hasSelection ? '' : ' (all text and vector layers on this view)'}`);
    else onError('Nothing to recolor — add text or a vector graphic first (photos can’t be recolored).');
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
        <span className="h-10 w-10 shrink-0 rounded-lg border border-white/15" style={{ background: garmentColor }} />
        <div className="min-w-0 text-xs">
          <p className="font-semibold text-zinc-100">
            {garmentColor.toUpperCase()} · <span className="capitalize">{describeColor(garmentColor)}</span>
          </p>
          <p className="text-zinc-500">≈ {nearestPantone(garmentColor).name.replace('PANTONE ', 'PMS ')} · ink pairings ranked by legibility</p>
        </div>
      </div>

      {currentInks.length > 0 && (
        <section>
          <h4 className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Inks in this view</h4>
          <div className="space-y-1">
            {currentInks.map((ink) => {
              const r = contrastRating(ink.ratio);
              return (
                <div key={ink.hex} className="flex items-center gap-2 text-xs">
                  <span className="h-4 w-4 rounded border border-white/15" style={{ background: ink.hex }} />
                  <span className="font-mono text-zinc-300">{ink.hex}</span>
                  <span className={`ml-auto rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${RATING_STYLE[r.tone]}`}>
                    {ink.ratio.toFixed(1)}:1 {r.label}
                  </span>
                </div>
              );
            })}
          </div>
          {currentInks.some((i) => i.ratio < 3) && (
            <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-red-300">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" /> Some inks are hard to read on this garment. Try one of the pairings below.
            </p>
          )}
        </section>
      )}

      {groups.map(([group, items]) => (
        <section key={group}>
          <h4 className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-zinc-500">{group}</h4>
          <div className="space-y-2">
            {items.map((s) => {
              const r = contrastRating(s.ratio);
              return (
                <div key={s.key} className="flex gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-2.5">
                  <Swatch ink={s.hex} garment={garmentColor} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[13px] font-semibold text-zinc-100">{s.name}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${RATING_STYLE[r.tone]}`}>
                        {s.ratio.toFixed(1)}:1
                      </span>
                      <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-violet-200">{s.technique}</span>
                    </div>
                    <p className="font-mono text-[10.5px] text-zinc-400">
                      {s.hex} · {s.pantone.replace('PANTONE ', 'PMS ')}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">{s.why}</p>
                    <div className="mt-1.5 flex gap-1.5">
                      <button onClick={() => apply(s.hex)} className="lc-btn h-7 gap-1 px-2 text-[11px]" title={hasSelection ? 'Recolor the selected layers' : 'Recolor every text and vector layer on this view'}>
                        <Paintbrush size={11} /> {hasSelection ? 'Apply to selection' : 'Apply to view'}
                      </button>
                      <button
                        onClick={() => {
                          void navigator.clipboard?.writeText(s.hex);
                          onInfo(`Copied ${s.hex}`);
                        }}
                        className="lc-btn h-7 w-7 p-0"
                        title="Copy hex"
                      >
                        <Copy size={11} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
      <p className="text-[10.5px] leading-relaxed text-zinc-600">
        Contrast is the WCAG luminance ratio between ink and fabric; 3:1 is the practical floor for print legibility. Pantone values are nearest on-screen approximations.
      </p>
    </div>
  );
});
