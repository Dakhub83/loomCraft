import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, EyeOff, FileImage, Folder, Image as ImageIcon, Layers, Loader2, Type, X } from 'lucide-react';
import { garmentViews, getZone, viewLabel } from '../data/garments';
import type { ViewId } from '../types';
import type { LayoutContext } from '../utils/autoLayout';
import type { FitMode, LeafRef, ParsedPsd, PsdNode } from '../utils/psdImport';

interface Props {
  file: File | null;
  onClose(): void;
  /** Same context the layout helper and the AI use: canvas, state, and a view switch that waits for the canvas. */
  getContext(): LayoutContext;
  onInfo(msg: string): void;
  onError(msg: string): void;
}

type Target = ViewId | 'skip';

/** Whole-word match, so a "Background" layer doesn't land on the Back view. */
const namesView = (name: string, word: string) =>
  new RegExp(`(^|[^a-z])${word.toLowerCase().replace(/[^a-z0-9]+/g, '[^a-z0-9]*')}($|[^a-z])`).test(name.toLowerCase());

function leavesOf(top: PsdNode): LeafRef[] {
  const out: LeafRef[] = [];
  const walk = (n: PsdNode, opacity: number, hidden: boolean) => {
    const o = opacity * n.opacity;
    const h = hidden || n.hidden;
    if (n.children) n.children.forEach((c) => walk(c, o, h));
    else out.push({ node: n, opacity: o, hidden: h, artboard: top.artboard });
  };
  walk(top, 1, false);
  return out; // top-most first
}

export default function PsdImportDialog({ file, onClose, getContext, onInfo, onError }: Props) {
  const ctx = getContext();
  const { garment, view: currentView } = ctx.state();
  const views = garmentViews(garment);

  const [psd, setPsd] = useState<ParsedPsd | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [targets, setTargets] = useState<Record<string, Target>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [fit, setFit] = useState<FitMode>('document');
  const [editableText, setEditableText] = useState(true);
  const [merge, setMerge] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  /* ---------- parse ---------- */
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    setPsd(null);
    setError(null);
    (async () => {
      try {
        const { parsePsd } = await import('../utils/psdImport');
        const parsed = await parsePsd(file);
        if (cancelled) return;
        // defaults: visible, non-background layers; top-level groups named after a view go to that view
        const on = new Set<string>();
        const t: Record<string, Target> = {};
        for (const top of parsed.nodes) {
          for (const l of leavesOf(top)) if (!l.hidden && !l.node.likelyBackground) on.add(l.node.key);
          const match = views.find((v) => namesView(top.name, v.label) || namesView(top.name, v.id));
          t[top.key] = match?.id ?? currentView;
        }
        setChecked(on);
        setTargets(t);
        setExpanded(new Set(parsed.nodes.filter((n) => n.children).map((n) => n.key)));
        // Document = print area when the canvas has the print area's proportions; otherwise fit the artwork.
        const z = getZone(garment, currentView);
        const frame = parsed.nodes.find((n) => n.artboard)?.artboard ?? { width: parsed.width, height: parsed.height };
        const ratio = frame.width / frame.height / (z.w / z.h);
        setFit(ratio > 0.85 && ratio < 1.18 ? 'document' : 'artwork');
        setPsd(parsed);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  useEffect(() => {
    if (!file) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [file, busy, onClose]);

  /* ---------- plan ---------- */
  const plan = useMemo(() => {
    const byView = new Map<ViewId, LeafRef[]>();
    if (!psd) return byView;
    for (const top of psd.nodes) {
      const target = targets[top.key];
      if (!target || target === 'skip') continue;
      const leaves = leavesOf(top).filter((l) => checked.has(l.node.key));
      if (leaves.length) byView.set(target, [...(byView.get(target) ?? []), ...leaves]);
    }
    return byView;
  }, [psd, targets, checked]);
  const total = [...plan.values()].reduce((n, l) => n + l.length, 0);

  if (!file) return null;

  const toggle = (n: PsdNode) => {
    const keys = n.children ? leavesOf(n).map((l) => l.node.key) : [n.key];
    setChecked((prev) => {
      const next = new Set(prev);
      const allOn = keys.every((k) => next.has(k));
      keys.forEach((k) => (allOn ? next.delete(k) : next.add(k)));
      return next;
    });
  };

  const run = async () => {
    if (!psd || !total) return;
    setBusy('Preparing…');
    const { buildView } = await import('../utils/psdImport');
    const order = [...plan.keys()].sort((a, b) => (a === currentView ? -1 : b === currentView ? 1 : 0));
    let added = 0;
    let rasterized = 0;
    try {
      for (const v of order) {
        setBusy(`Placing layers on ${viewLabel(garment, v)}…`);
        if (ctx.state().view !== v) await ctx.setView(v);
        const c = ctx.canvas();
        if (!c) throw new Error('The canvas is still loading.');
        const built = await buildView(psd, plan.get(v)!, getZone(garment, v), {
          fit,
          editableText,
          merge,
          mergedName: psd.fileName.replace(/\.psd$/i, ''),
        });
        const ids = await c.importLayers(built.objects);
        for (const f of built.textFits) c.setLayerGeometry(ids[f.index], { widthIn: f.widthIn, centerOffsetIn: f.centerOffsetIn, topIn: f.topIn });
        c.selectLayers([]);
        added += ids.length;
        rasterized += built.rasterizedTexts;
      }
      if (ctx.state().view !== order[0]) await ctx.setView(order[0]);
      onInfo(
        `Imported ${added} layer${added === 1 ? '' : 's'} from ${psd.fileName} to ${order.map((v) => viewLabel(garment, v)).join(' + ')}` +
          (rasterized ? ` · ${rasterized} text layer${rasterized === 1 ? '' : 's'} kept as image (font not on Google Fonts, or warped/mixed styles)` : ''),
      );
      onClose();
    } catch (e) {
      onError(`PSD import failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const renderNode = (n: PsdNode, depth: number, top: PsdNode) => {
    const keys = n.children ? leavesOf(n).map((l) => l.node.key) : [n.key];
    const on = keys.filter((k) => checked.has(k)).length;
    const isOpen = expanded.has(n.key);
    const skip = targets[top.key] === 'skip';
    return (
      <li key={n.key}>
        <div className={`flex items-center gap-2 rounded-md py-1 pr-2 hover:bg-white/[0.03] ${skip ? 'opacity-40' : ''}`} style={{ paddingLeft: 6 + depth * 18 }}>
          {n.children ? (
            <button
              onClick={() =>
                setExpanded((s) => {
                  const x = new Set(s);
                  if (x.has(n.key)) x.delete(n.key);
                  else x.add(n.key);
                  return x;
                })
              }
              className="text-zinc-500 hover:text-zinc-200"
              aria-label={isOpen ? 'Collapse' : 'Expand'}
            >
              {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
          ) : (
            <span className="w-[13px]" />
          )}
          <input
            type="checkbox"
            checked={on === keys.length}
            ref={(el) => {
              if (el) el.indeterminate = on > 0 && on < keys.length;
            }}
            onChange={() => toggle(n)}
            className="accent-violet-500"
            aria-label={`Import ${n.name}`}
          />
          <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded border border-white/10 bg-[repeating-conic-gradient(#2a2a30_0_25%,#1c1c21_0_50%)] bg-[length:8px_8px]">
            {n.thumb ? <img src={n.thumb} alt="" className="h-full w-full object-contain" /> : <Folder size={13} className="text-zinc-400" />}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-zinc-200" title={n.name}>
            {n.kind === 'text' && <Type size={11} className="mr-1 inline text-violet-400" />}
            {n.name}
          </span>
          {n.text && (
            <span className={`shrink-0 text-[10px] ${n.text.editable ? 'text-zinc-500' : 'text-amber-300/80'}`} title={n.text.psName}>
              {n.text.editable ? n.text.family : 'as image'}
            </span>
          )}
          {n.hidden && <EyeOff size={11} className="shrink-0 text-zinc-500" aria-label="Hidden in Photoshop" />}
          {n.likelyBackground && !n.children && <span className="shrink-0 rounded bg-zinc-800 px-1 text-[9.5px] text-zinc-400">background?</span>}
          {depth === 0 && (
            <select
              value={targets[n.key] ?? currentView}
              onChange={(e) => setTargets((t) => ({ ...t, [n.key]: e.target.value }))}
              className="lc-input h-6 w-[104px] shrink-0 py-0 text-[11px]"
              aria-label={`View for ${n.name}`}
            >
              {views.map((v) => (
                <option key={v.id} value={v.id}>
                  → {v.label}
                </option>
              ))}
              <option value="skip">Skip</option>
            </select>
          )}
        </div>
        {n.children && isOpen && <ul>{n.children.map((c) => renderNode(c, depth + 1, top))}</ul>}
      </li>
    );
  };

  const inches = psd?.dpi ? `${(psd.width / psd.dpi).toFixed(2).replace(/\.?0+$/, '')} × ${(psd.height / psd.dpi).toFixed(2).replace(/\.?0+$/, '')} in @ ${Math.round(psd.dpi)} ppi` : null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Import Photoshop file" className="flex max-h-full w-full max-w-[820px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#111114] shadow-2xl">
        <header className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-3.5">
          <FileImage size={18} className="text-violet-400" />
          <div className="mr-auto min-w-0">
            <h2 className="truncate text-sm font-semibold text-zinc-100">Import Photoshop file · {file.name}</h2>
            <p className="text-[11px] text-zinc-500">
              {psd ? (
                <>
                  {psd.width} × {psd.height} px{inches ? ` · ${inches}` : ''} · choose layers and which view each group goes to
                </>
              ) : (
                'Reading layers…'
              )}
            </p>
          </div>
          <button onClick={onClose} disabled={!!busy} className="lc-btn h-8 w-8 p-0" title="Close">
            <X size={15} />
          </button>
        </header>

        {error ? (
          <p className="m-5 rounded-lg bg-red-500/10 px-3 py-3 text-xs text-red-200">{error}</p>
        ) : !psd ? (
          <div className="grid h-60 place-items-center text-xs text-zinc-400">
            <span className="flex items-center gap-2">
              <Loader2 size={14} className="animate-spin text-violet-400" /> Reading {file.name}…
            </span>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
            {/* layer tree */}
            <div className="flex min-h-0 flex-1 flex-col border-white/[0.06] sm:border-r">
              <div className="flex items-center gap-2 px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                <Layers size={12} className="text-violet-400" /> Layers
                <span className="ml-auto font-normal normal-case tracking-normal">
                  {checked.size} selected
                </span>
              </div>
              <ul className="lc-scroll max-h-[52vh] min-h-[200px] flex-1 overflow-y-auto px-2 pb-3" role="tree">
                {psd.nodes.map((n) => renderNode(n, 0, n))}
              </ul>
            </div>

            {/* options */}
            <div className="w-full shrink-0 space-y-4 p-4 sm:w-[280px]">
              <fieldset>
                <legend className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-zinc-500">Placement</legend>
                {(
                  [
                    ['document', 'Canvas = print area', 'Keeps positions: the PSD canvas (or artboard) is fitted to the print area.'],
                    ['artwork', 'Fit artwork to print area', 'Ignores empty canvas and mockup space; scales the selected layers to fill the print area width.'],
                    ['actual', 'Actual size', psd.dpi ? `Uses the file's ${Math.round(psd.dpi)} ppi, so 1 in in Photoshop prints at 1 in.` : 'Needs resolution info in the PSD.'],
                  ] as const
                ).map(([id, label, help]) => (
                  <label key={id} className={`mb-1 flex cursor-pointer gap-2 rounded-lg border px-2.5 py-2 ${fit === id ? 'border-violet-500/60 bg-violet-500/10' : 'border-white/[0.06]'} ${id === 'actual' && !psd.dpi ? 'pointer-events-none opacity-40' : ''}`}>
                    <input type="radio" name="fit" checked={fit === id} onChange={() => setFit(id)} className="mt-0.5 accent-violet-500" />
                    <span>
                      <span className="block text-xs font-medium text-zinc-200">{label}</span>
                      <span className="block text-[10.5px] leading-snug text-zinc-500">{help}</span>
                    </span>
                  </label>
                ))}
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-zinc-500">Layers</legend>
                <label className="flex cursor-pointer items-start gap-2 text-xs text-zinc-300">
                  <input type="checkbox" checked={editableText && !merge} disabled={merge} onChange={(e) => setEditableText(e.target.checked)} className="mt-0.5 accent-violet-500" />
                  <span>
                    Editable text
                    <span className="block text-[10.5px] text-zinc-500">When the font is on Google Fonts; otherwise the text comes in as an image.</span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 text-xs text-zinc-300">
                  <input type="checkbox" checked={merge} onChange={(e) => setMerge(e.target.checked)} className="mt-0.5 accent-violet-500" />
                  <span>
                    Merge into one image per view
                    <span className="block text-[10.5px] text-zinc-500">Exact blend look, but no longer editable layer by layer.</span>
                  </span>
                </label>
              </fieldset>

              <div className="rounded-lg bg-black/30 px-3 py-2 text-[11px] text-zinc-400">
                {plan.size ? (
                  [...plan.entries()].map(([v, l]) => (
                    <div key={v} className="flex justify-between">
                      <span>{viewLabel(garment, v)}</span>
                      <span className="text-zinc-200">
                        {merge ? '1 merged image' : `${l.length} layer${l.length === 1 ? '' : 's'}`}
                      </span>
                    </div>
                  ))
                ) : (
                  <span>Nothing selected.</span>
                )}
              </div>
              <p className="text-[10.5px] leading-snug text-zinc-600">
                Layer effects (stroke, drop shadow) and adjustment layers aren’t imported; rasterize them in Photoshop first if you need them.
              </p>
            </div>
          </div>
        )}

        <footer className="flex items-center justify-end gap-2 border-t border-white/[0.06] px-5 py-3">
          {busy && (
            <span className="mr-auto flex items-center gap-2 text-xs text-zinc-400">
              <Loader2 size={13} className="animate-spin text-violet-400" /> {busy}
            </span>
          )}
          <button onClick={onClose} disabled={!!busy} className="lc-btn h-9 px-4 text-xs">
            Cancel
          </button>
          <button onClick={run} disabled={!psd || !total || !!busy} className="lc-btn-primary h-9 gap-2 px-4 text-xs">
            <ImageIcon size={14} /> Import {total ? `${total} layer${total === 1 ? '' : 's'}` : ''}
          </button>
        </footer>
      </div>
    </div>
  );
}
