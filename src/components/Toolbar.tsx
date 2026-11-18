import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Crosshair,
  ImagePlus,
  Italic,
  Plus,
  Shirt,
  Sparkles,
  Type,
  Underline,
  Upload,
} from 'lucide-react';
import type { GarmentId, PrintEffect, SelectionInfo, ViewId } from '../types';
import { VIEWS } from '../types';
import { GARMENT_LIST, GarmentSVG, getZone } from './GarmentTemplates';
import type { DesignCanvasHandle, TextStyle } from './DesignCanvas';
import { GARMENT_SWATCHES, nearestPantone, normalizeHex } from '../utils/color';
import { CURATED_FONTS, loadGoogleFont } from '../utils/fonts';
import { PRINT_EFFECTS } from '../utils/printEffects';
import { PLACEMENTS, defaultPlacementFor, type PlacementPreset } from '../utils/placements';

interface Props {
  garment: GarmentId;
  onGarment(g: GarmentId): void;
  color: string;
  onColor(hex: string): void;
  view: ViewId;
  onView(v: ViewId): void;
  viewsWithArt: Record<ViewId, boolean>;
  effect: PrintEffect;
  onEffect(e: PrintEffect): void;
  selection: SelectionInfo | null;
  canvas: RefObject<DesignCanvasHandle | null>;
  onPlacement(p: PlacementPreset): void;
  autoPlace: boolean;
  onAutoPlace(v: boolean): void;
  onError(msg: string): void;
  onInfo(msg: string): void;
}

export function Section({ title, icon, children, right }: { title: string; icon: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="border-b border-white/[0.06] px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
          <span className="text-violet-400/90">{icon}</span>
          {title}
        </h3>
        {right}
      </div>
      {children}
    </section>
  );
}

const VIEW_LABEL: Record<ViewId, string> = { front: 'Front', back: 'Back', sleeve: 'Sleeve' };

const DEFAULT_TEXT: TextStyle = {
  fontFamily: 'Bebas Neue',
  fontSize: 48,
  fill: '#FFFFFF',
  charSpacing: 80,
  fontWeight: 'normal',
  fontStyle: 'normal',
  textAlign: 'center',
  underline: false,
};

export function Toolbar(p: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [hexDraft, setHexDraft] = useState(p.color);
  const [textValue, setTextValue] = useState('LOOMCRAFT');
  const [style, setStyle] = useState<TextStyle>(DEFAULT_TEXT);
  const [customFont, setCustomFont] = useState('');
  const [fontLoading, setFontLoading] = useState(false);
  const [extraFonts, setExtraFonts] = useState<string[]>([]);

  useEffect(() => setHexDraft(p.color), [p.color]);

  // Preload the curated list so the font picker previews correctly.
  useEffect(() => {
    CURATED_FONTS.forEach((f) => void loadGoogleFont(f));
  }, []);

  // When a text layer is selected, the controls edit it directly.
  const selText = p.selection?.text;
  useEffect(() => {
    if (selText) setStyle({ ...selText, fill: normalizeHex(selText.fill) ?? selText.fill });
  }, [selText?.fontFamily, selText?.fontSize, selText?.fill, selText?.charSpacing, selText?.fontWeight, selText?.fontStyle, selText?.textAlign, selText?.underline]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyStyle = (patch: Partial<TextStyle>) => {
    setStyle((s) => ({ ...s, ...patch }));
    if (selText) void p.canvas.current?.updateText(patch);
  };

  const handleFiles = async (files: FileList | File[] | null) => {
    if (!files?.length) return;
    setUploading(true);
    let added = 0;
    for (const file of Array.from(files)) {
      if (!/^image\/(png|svg\+xml|jpeg|webp)$/.test(file.type) && !/\.(png|svg|jpe?g|webp)$/i.test(file.name)) {
        p.onError(`${file.name}: only PNG, SVG, JPG or WebP files are supported.`);
        continue;
      }
      try {
        await p.canvas.current?.addImageFile(file, p.autoPlace ? defaultPlacementFor(p.view) : null);
        added++;
      } catch (e) {
        p.onError(`${file.name}: ${(e as Error).message}`);
      }
    }
    setUploading(false);
    if (added) p.onInfo(`Added ${added} graphic${added > 1 ? 's' : ''} to the ${VIEW_LABEL[p.view].toLowerCase()} view`);
    if (fileRef.current) fileRef.current.value = '';
  };

  const loadCustomFont = async () => {
    const name = customFont.trim();
    if (!name) return;
    setFontLoading(true);
    const ok = await loadGoogleFont(name);
    setFontLoading(false);
    if (!ok) return p.onError(`"${name}" wasn't found on Google Fonts. Use the exact family name, e.g. "Bowlby One".`);
    setExtraFonts((f) => (f.includes(name) || CURATED_FONTS.includes(name) ? f : [...f, name]));
    setCustomFont('');
    applyStyle({ fontFamily: name });
  };

  const zone = getZone(p.garment, p.view);
  const fonts = [...CURATED_FONTS, ...extraFonts];
  if (!fonts.includes(style.fontFamily)) fonts.push(style.fontFamily);
  const pantone = nearestPantone(p.color);

  return (
    <aside className="lc-scroll flex w-[300px] shrink-0 flex-col overflow-y-auto border-r border-white/[0.06] bg-[#111114]">
      {/* Garment */}
      <Section title="Garment" icon={<Shirt size={14} />}>
        <div className="grid grid-cols-3 gap-2">
          {GARMENT_LIST.map((g) => (
            <button
              key={g.id}
              onClick={() => p.onGarment(g.id)}
              title={g.name}
              className={`group flex flex-col items-center rounded-lg border p-1.5 pb-2 transition ${
                p.garment === g.id
                  ? 'border-violet-500/70 bg-violet-500/[0.07]'
                  : 'border-white/[0.07] bg-white/[0.02] hover:border-white/20'
              }`}
            >
              <GarmentSVG garment={g.id} view="front" color={p.color} uid={`thumb-${g.id}`} width="100%" height={70} showShadow={false} />
              <span className="mt-1 text-[11px] font-medium text-zinc-300">{g.short}</span>
            </button>
          ))}
        </div>
      </Section>

      {/* Color */}
      <Section title="Garment color" icon={<span className="block h-3 w-3 rounded-full border border-white/30" style={{ background: p.color }} />}>
        <div className="grid grid-cols-6 gap-1.5">
          {GARMENT_SWATCHES.map((s) => (
            <button
              key={s.hex}
              title={`${s.name} ${s.hex}`}
              onClick={() => p.onColor(s.hex)}
              className={`aspect-square rounded-md border transition ${
                p.color.toUpperCase() === s.hex ? 'border-violet-500 ring-2 ring-violet-500/40' : 'border-white/15 hover:scale-105'
              }`}
              style={{ background: s.hex }}
            />
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <label className="relative h-9 w-9 shrink-0 cursor-pointer overflow-hidden rounded-md border border-white/15" style={{ background: p.color }}>
            <input type="color" value={p.color} onChange={(e) => p.onColor(e.target.value.toUpperCase())} className="absolute inset-0 cursor-pointer opacity-0" />
          </label>
          <input
            value={hexDraft}
            onChange={(e) => {
              setHexDraft(e.target.value);
              const n = normalizeHex(e.target.value);
              if (n) p.onColor(n);
            }}
            onBlur={() => setHexDraft(p.color)}
            spellCheck={false}
            className="lc-input w-24 font-mono uppercase"
          />
          <span className="truncate text-[11px] text-zinc-500" title="Nearest Pantone (approximate)">
            ≈ {pantone.name.replace('PANTONE ', 'PMS ')}
          </span>
        </div>
      </Section>

      {/* View */}
      <Section title="View" icon={<Sparkles size={14} />}>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-black/30 p-1">
          {VIEWS.map((v) => (
            <button
              key={v}
              onClick={() => p.onView(v)}
              className={`relative rounded-md py-1.5 text-xs font-medium transition ${
                p.view === v ? 'bg-zinc-700/80 text-white shadow' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {VIEW_LABEL[v]}
              {p.viewsWithArt[v] && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-violet-500" />}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-zinc-500">
          Print area {zone.widthIn} × {zone.heightIn} in · each view keeps its own artwork
        </p>
      </Section>

      {/* Graphics */}
      <Section title="Graphics" icon={<ImagePlus size={14} />}>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".png,.svg,.jpg,.jpeg,.webp,image/png,image/svg+xml,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <button
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFiles(e.dataTransfer.files);
          }}
          className={`flex w-full flex-col items-center gap-1.5 rounded-lg border border-dashed px-3 py-5 text-center transition ${
            dragOver ? 'border-violet-500 bg-violet-500/10' : 'border-white/15 hover:border-white/30 hover:bg-white/[0.02]'
          }`}
        >
          <Upload size={18} className={uploading ? 'animate-pulse text-violet-400' : 'text-zinc-400'} />
          <span className="text-xs font-medium text-zinc-200">{uploading ? 'Adding…' : 'Upload PNG / SVG'}</span>
          <span className="text-[11px] text-zinc-500">Multiple files · drag & drop · vectors stay vector</span>
        </button>
      </Section>

      {/* Placement presets */}
      <Section title="Placement" icon={<Crosshair size={14} />}>
        <div className="grid grid-cols-3 gap-1.5">
          {PLACEMENTS.map((pl) => (
            <button
              key={pl.id}
              onClick={() => p.onPlacement(pl)}
              title={`${pl.name} (${pl.view}) – ${pl.hint}. Applies to the selection, or all layers when nothing is selected.`}
              className="flex flex-col items-center gap-1 rounded-lg border border-white/[0.07] bg-white/[0.02] px-1 py-2 transition hover:border-violet-500/50 hover:bg-violet-500/[0.06]"
            >
              <PlacementGlyph id={pl.id} />
              <span className="text-[11px] font-medium leading-tight text-zinc-200">{pl.name}</span>
            </button>
          ))}
        </div>
        <label className="mt-2.5 flex cursor-pointer items-center gap-2 text-[11px] text-zinc-400">
          <input type="checkbox" checked={p.autoPlace} onChange={(e) => p.onAutoPlace(e.target.checked)} className="accent-violet-500" />
          Auto-place uploads (front → Center Chest, back → Full Back)
        </label>
      </Section>

      {/* Typography */}
      <Section
        title={selText ? 'Edit text' : 'Typography'}
        icon={<Type size={14} />}
        right={selText ? <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-violet-300">SELECTED</span> : null}
      >
        {!selText && (
          <div className="mb-2 flex gap-2">
            <input
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && p.canvas.current?.addText(textValue, style)}
              placeholder="Your text"
              className="lc-input min-w-0 flex-1"
            />
            <button onClick={() => p.canvas.current?.addText(textValue, style)} className="lc-btn-primary px-3" title="Add text">
              <Plus size={16} />
            </button>
          </div>
        )}
        {selText && <p className="mb-2 text-[11px] text-zinc-500">Double-click the text on the garment to edit its words.</p>}

        <select
          value={style.fontFamily}
          onChange={(e) => applyStyle({ fontFamily: e.target.value })}
          className="lc-input w-full"
          style={{ fontFamily: `"${style.fontFamily}"` }}
        >
          {fonts.map((f) => (
            <option key={f} value={f} style={{ fontFamily: `"${f}"` }}>
              {f}
            </option>
          ))}
        </select>

        <div className="mt-2 flex gap-2">
          <input
            value={customFont}
            onChange={(e) => setCustomFont(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadCustomFont()}
            placeholder="Any Google Font name…"
            className="lc-input min-w-0 flex-1 text-xs"
          />
          <button onClick={loadCustomFont} disabled={fontLoading} className="lc-btn px-2.5 text-xs">
            {fontLoading ? '…' : 'Load'}
          </button>
        </div>

        <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-2">
          <label className="text-[11px] text-zinc-400">
            Size
            <input
              type="number"
              min={6}
              max={400}
              value={style.fontSize}
              onChange={(e) => applyStyle({ fontSize: Math.max(6, Number(e.target.value) || 6) })}
              className="lc-input mt-1 w-full"
            />
          </label>
          <label className="text-[11px] text-zinc-400">
            Color
            <span className="mt-1 flex items-center gap-1.5">
              <span className="relative block h-[34px] w-[34px] overflow-hidden rounded-md border border-white/15" style={{ background: style.fill }}>
                <input
                  type="color"
                  value={normalizeHex(style.fill) ?? '#ffffff'}
                  onChange={(e) => applyStyle({ fill: e.target.value.toUpperCase() })}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
              </span>
            </span>
          </label>
        </div>

        <label className="mt-3 block text-[11px] text-zinc-400">
          <span className="flex justify-between">
            Letter spacing <span className="font-mono text-zinc-300">{style.charSpacing}</span>
          </span>
          <input
            type="range"
            min={-200}
            max={1200}
            step={10}
            value={style.charSpacing}
            onChange={(e) => applyStyle({ charSpacing: Number(e.target.value) })}
            className="lc-range mt-1 w-full"
          />
        </label>

        <div className="mt-3 flex gap-1">
          <ToggleBtn active={style.fontWeight === 'bold'} onClick={() => applyStyle({ fontWeight: style.fontWeight === 'bold' ? 'normal' : 'bold' })} title="Bold">
            <Bold size={14} />
          </ToggleBtn>
          <ToggleBtn active={style.fontStyle === 'italic'} onClick={() => applyStyle({ fontStyle: style.fontStyle === 'italic' ? 'normal' : 'italic' })} title="Italic">
            <Italic size={14} />
          </ToggleBtn>
          <ToggleBtn active={style.underline} onClick={() => applyStyle({ underline: !style.underline })} title="Underline">
            <Underline size={14} />
          </ToggleBtn>
          <span className="mx-1 w-px bg-white/10" />
          {(['left', 'center', 'right'] as const).map((a) => (
            <ToggleBtn key={a} active={style.textAlign === a} onClick={() => applyStyle({ textAlign: a })} title={`Align ${a}`}>
              {a === 'left' ? <AlignLeft size={14} /> : a === 'center' ? <AlignCenter size={14} /> : <AlignRight size={14} />}
            </ToggleBtn>
          ))}
        </div>
      </Section>

      {/* Print technique */}
      <Section title={`Print technique · ${VIEW_LABEL[p.view]}`} icon={<Sparkles size={14} />}>
        <div className="grid grid-cols-2 gap-2">
          {PRINT_EFFECTS.map((fx) => (
            <button
              key={fx.id}
              onClick={() => p.onEffect(fx.id)}
              title={fx.blurb}
              className={`rounded-lg border px-2.5 py-2 text-left transition ${
                p.effect === fx.id ? 'border-violet-500/70 bg-violet-500/[0.08]' : 'border-white/[0.07] bg-white/[0.02] hover:border-white/20'
              }`}
            >
              <span className="block text-xs font-medium text-zinc-100">{fx.name}</span>
              <span className="mt-0.5 block text-[10.5px] leading-snug text-zinc-500">{fx.blurb}</span>
            </button>
          ))}
        </div>
      </Section>
    </aside>
  );
}

function ToggleBtn({ active, onClick, title, children }: { active: boolean; onClick(): void; title: string; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`grid h-8 w-8 place-items-center rounded-md border transition ${
        active ? 'border-violet-500/60 bg-violet-500/15 text-violet-300' : 'border-white/[0.08] text-zinc-400 hover:text-zinc-100'
      }`}
    >
      {children}
    </button>
  );
}

/** Tiny tee diagram showing where each preset lands. */
function PlacementGlyph({ id }: { id: PlacementPreset['id'] }) {
  const box =
    id === 'left-chest' ? <rect x="21" y="11" width="5" height="5" rx="0.8" /> :
    id === 'center-chest' ? <rect x="12" y="11" width="12" height="9" rx="1" /> :
    <rect x="11" y="9" width="14" height="17" rx="1" />;
  return (
    <svg width="36" height="32" viewBox="0 0 36 32" aria-hidden>
      <path d="M12 3 C15 6 21 6 24 3 L32 7 L29 13 L26 12 L26 30 L10 30 L10 12 L7 13 L4 7 Z" fill="none" stroke="#71717a" strokeWidth="1.2" strokeLinejoin="round" />
      <g fill="#8b5cf6" opacity="0.9">{box}</g>
    </svg>
  );
}
