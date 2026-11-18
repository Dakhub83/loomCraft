import { memo, useState } from 'react';
import { AlignCenterVertical, Loader2, Wand2 } from 'lucide-react';
import type { GarmentId } from '../../types';
import { LAYOUT_RECIPES, balanceView, recipeAvailability, runLayout, type LayoutContext, type LayoutRecipe } from '../../utils/autoLayout';

interface Props {
  garment: GarmentId;
  hasSelection: boolean;
  getContext(): LayoutContext;
  onInfo(msg: string): void;
  onError(msg: string): void;
}

const TEE = 'M14 6 C18 10 28 10 32 6 L42 10 L39 18 L35 17 L35 42 L11 42 L11 17 L7 18 L4 10 Z';
const SLEEVE = 'M12 8 C18 4 28 4 34 8 L31 42 L15 42 Z';

/** Tiny garment diagrams with the recipe's placement boxes. */
function RecipeGlyph({ recipe }: { recipe: LayoutRecipe }) {
  const views = [...new Set(recipe.glyph.map((g) => g.view))];
  return (
    <div className="flex shrink-0 gap-1">
      {views.map((v) => (
        <div key={v} className="flex flex-col items-center">
          <svg width="46" height="46" viewBox="0 0 46 46" aria-hidden>
            <path d={v === 'sleeve' ? SLEEVE : TEE} fill="#ffffff08" stroke="#71717a" strokeWidth="1.1" strokeLinejoin="round" />
            {recipe.glyph
              .filter((g) => g.view === v)
              .map((g, i) => (
                <rect key={i} x={4 + g.x * 0.38} y={2 + g.y * 0.42} width={g.w * 0.38} height={g.h * 0.42} rx="1" fill="#8b5cf6" opacity={0.9} />
              ))}
          </svg>
          <span className="text-[9px] uppercase tracking-wide text-zinc-500">{v}</span>
        </div>
      ))}
    </div>
  );
}

export const LayoutHelper = memo(function LayoutHelper({ garment, hasSelection, getContext, onInfo, onError }: Props) {
  const [busy, setBusy] = useState<string | null>(null);

  const apply = async (recipe: LayoutRecipe) => {
    setBusy(recipe.id);
    try {
      onInfo(await runLayout(recipe, getContext()));
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3 p-4">
      <p className="text-xs leading-relaxed text-zinc-400">
        One-click streetwear layouts with real inch proportions. Uses {hasSelection ? <strong className="text-violet-300">your selected layers</strong> : 'every layer on the current view'}, in layer order (top first) — select graphics to choose which go where. Artwork is copied to other views as needed, and every step can be undone.
      </p>

      {LAYOUT_RECIPES.map((r) => {
        const unavailable = recipeAvailability(r, garment);
        return (
          <div key={r.id} className={`rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 ${unavailable ? 'opacity-50' : ''}`}>
            <div className="flex gap-3">
              <RecipeGlyph recipe={r} />
              <div className="min-w-0 flex-1">
                <h4 className="text-[13px] font-semibold leading-snug text-zinc-100">{r.name}</h4>
                <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">{unavailable ?? r.description}</p>
              </div>
            </div>
            <button onClick={() => apply(r)} disabled={!!unavailable || !!busy} className="lc-btn-primary mt-2.5 h-8 w-full gap-1.5 text-xs">
              {busy === r.id ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
              Apply layout
            </button>
          </div>
        );
      })}

      <button
        onClick={() => {
          try {
            onInfo(balanceView(getContext()));
          } catch (e) {
            onError((e as Error).message);
          }
        }}
        disabled={!!busy}
        className="lc-btn h-9 w-full gap-2 text-xs"
      >
        <AlignCenterVertical size={14} /> Balance this view (center the artwork, 1″ from top)
      </button>
    </div>
  );
});
