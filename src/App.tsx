import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Maximize2, Minus, Plus, XCircle } from 'lucide-react';
import { Header, LoomCraftLogo } from './components/Header';
import { Toolbar } from './components/Toolbar';
import { LayersPanel, PropertiesPanel } from './components/LayersPanel';
import { ExportPanel } from './components/ExportPanel';
import { DraftManager } from './components/DraftManager';
import { DesignCanvas, type DesignCanvasHandle, type HistoryState } from './components/DesignCanvas';
import { GARMENT_H, GARMENT_W, GARMENTS, GarmentSVG, getZone } from './components/GarmentTemplates';
import type { CanvasJSON, Draft, GarmentId, LayerInfo, PrintEffect, SelectionInfo, ViewId, Workspace } from './types';
import { VIEWS, defaultEffects, emptyDesigns, hasArtwork } from './types';
import { isDark } from './utils/color';
import { effectName, filterMarkup } from './utils/printEffects';
import type { StudioSnapshot } from './utils/exportTools';
import { refitDesign } from './utils/fabricHelpers';
import type { PlacementPreset } from './utils/placements';
import {
  deleteDraft,
  duplicateDraft,
  listDrafts,
  loadWorkspace,
  newDraftId,
  renameDraft,
  saveDraft,
  saveWorkspace,
} from './utils/storage';

interface Toast {
  id: number;
  kind: 'info' | 'error';
  msg: string;
}

const DEFAULT_NAME = 'Untitled Piece';
const DEFAULT_COLOR = '#141416';

/** Loads the autosaved workspace from IndexedDB before mounting the studio. */
export default function App() {
  const [initial, setInitial] = useState<Workspace | null | undefined>(undefined);
  useEffect(() => {
    loadWorkspace()
      .then(setInitial)
      .catch(() => setInitial(null));
  }, []);

  if (initial === undefined) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-[#0a0a0c]">
        <LoomCraftLogo size={40} />
        <Loader2 size={18} className="animate-spin text-zinc-500" />
      </div>
    );
  }
  return <Studio initial={initial} />;
}

function Studio({ initial }: { initial: Workspace | null }) {
  const [name, setName] = useState(initial?.name ?? DEFAULT_NAME);
  const [draftId, setDraftId] = useState<string | null>(initial?.draftId ?? null);
  const [garment, setGarment] = useState<GarmentId>(initial?.garment ?? 'tee');
  const [color, setColor] = useState(initial?.color ?? DEFAULT_COLOR);
  const [designs, setDesigns] = useState(initial?.designs ?? emptyDesigns());
  const [effects, setEffects] = useState(initial?.effects ?? defaultEffects());
  const [view, setView] = useState<ViewId>('front');

  const [layers, setLayers] = useState<LayerInfo[]>([]);
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [hist, setHist] = useState({ canUndo: false, canRedo: false });
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [canvasNonce, setCanvasNonce] = useState(0);
  const [showZone, setShowZone] = useState(true);
  const [autoPlace, setAutoPlace] = useState(true);
  const [zoom, setZoom] = useState<'fit' | number>('fit');
  const [fitScale, setFitScale] = useState(1);

  const canvasRef = useRef<DesignCanvasHandle | null>(null);
  const histories = useRef(new Map<string, HistoryState>());
  const stageRef = useRef<HTMLDivElement>(null);
  const pendingPlacement = useRef<PlacementPreset | null>(null);

  const state = { name, draftId, garment, color, view, designs, effects };
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    listDrafts().then(setDrafts).catch(() => undefined);
  }, []);

  /* ---------------- toasts ---------------- */
  const toast = useCallback((kind: Toast['kind'], msg: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, kind, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6500 : 3800);
  }, []);
  const onError = useCallback((m: string) => toast('error', m), [toast]);
  const onInfo = useCallback((m: string) => toast('info', m), [toast]);

  /* ---------------- history per view (survives view switches) ---------------- */
  const historyFor = (v: ViewId) => {
    const key = `${canvasNonce}:${garment}:${v}`;
    let h = histories.current.get(key);
    if (!h) {
      h = { stack: [], index: -1 };
      histories.current.set(key, h);
    }
    return h;
  };
  const resetCanvases = () => {
    histories.current = new Map();
    setCanvasNonce((n) => n + 1);
    setSelection(null);
  };

  /* ---------------- autosave workspace (IndexedDB, off the input path) ---------------- */
  useEffect(() => {
    const t = setTimeout(() => void saveWorkspace({ draftId, name, garment, color, designs, effects }), 600);
    return () => clearTimeout(t);
  }, [draftId, name, garment, color, designs, effects]);

  /* ---------------- stage fit ---------------- */
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setFitScale(Math.max(0.4, Math.min(1.5, (height - 64) / GARMENT_H, (width - 64) / GARMENT_W)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = zoom === 'fit' ? fitScale : zoom;

  /* ---------------- stable canvas callbacks (DesignCanvas is memoized) ---------------- */
  const handleCanvasChange = useCallback((v: ViewId, json: CanvasJSON) => {
    setDesigns((d) => ({ ...d, [v]: json }));
    setDirty(true);
  }, []);

  const applyPlacement = useCallback(
    (pl: PlacementPreset) => {
      const ok = canvasRef.current?.applyPlacement(pl);
      if (ok) toast('info', `${pl.name} placement applied`);
      else toast('error', `Add artwork to the ${pl.view} view first, then apply ${pl.name}.`);
    },
    [toast],
  );

  const handleCanvasReady = useCallback(
    (v: ViewId) => {
      const pl = pendingPlacement.current;
      if (pl && pl.view === v) {
        pendingPlacement.current = null;
        applyPlacement(pl);
      }
    },
    [applyPlacement],
  );

  const handlePlacement = (pl: PlacementPreset) => {
    if (pl.view !== view) {
      // Switch views first; the preset is applied once the new canvas has loaded.
      pendingPlacement.current = pl;
      setSelection(null);
      setView(pl.view);
    } else applyPlacement(pl);
  };

  /* ---------------- studio actions ---------------- */
  const changeGarment = (g: GarmentId) => {
    if (g === garment) return;
    const next = { ...designs };
    for (const v of VIEWS) {
      const json = designs[v];
      if (json) next[v] = refitDesign(json, getZone(garment, v), getZone(g, v));
    }
    setDesigns(next);
    setGarment(g);
    setDirty(true);
    resetCanvases();
  };

  const changeView = (v: ViewId) => {
    if (v === view) return;
    setSelection(null);
    setView(v);
  };

  const changeEffect = (e: PrintEffect) => {
    setEffects((x) => ({ ...x, [view]: e }));
    setDirty(true);
  };

  /* ---------------- drafts ---------------- */
  const getSnapshot = useCallback((): StudioSnapshot => ({ ...stateRef.current }), []);

  const persist = async (asNew: boolean) => {
    if (saving) return;
    const s = stateRef.current;
    const id = asNew || !s.draftId ? newDraftId() : s.draftId;
    const existing = drafts.find((d) => d.id === id);
    let finalName = s.name.trim() || DEFAULT_NAME;
    if (asNew && drafts.some((d) => d.name === finalName)) finalName = `${finalName} (copy)`;
    setSaving(true);
    try {
      const thumbnail = await import('./utils/exportTools').then((m) => m.makeThumbnail(s)).catch(() => undefined);
      const now = Date.now();
      setDrafts(
        await saveDraft({
          id,
          name: finalName,
          garment: s.garment,
          color: s.color,
          designs: s.designs,
          effects: s.effects,
          thumbnail,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        }),
      );
      setDraftId(id);
      setName(finalName);
      setDirty(false);
      setSavedAt(now);
      toast('info', asNew ? `Saved as new draft “${finalName}”` : `Saved “${finalName}”`);
    } catch (e) {
      toast('error', `Couldn't save draft: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const confirmDiscard = () => !dirty || window.confirm('You have unsaved changes. Discard them?');

  const loadDraft = (d: Draft) => {
    if (d.id !== draftId && !confirmDiscard()) return;
    setName(d.name);
    setDraftId(d.id);
    setGarment(d.garment);
    setColor(d.color);
    setDesigns({ ...emptyDesigns(), ...d.designs });
    setEffects({ ...defaultEffects(), ...d.effects });
    setView('front');
    setDirty(false);
    setSavedAt(d.updatedAt);
    resetCanvases();
    setDraftsOpen(false);
    toast('info', `Opened “${d.name}”`);
  };

  const newDesign = () => {
    if (!confirmDiscard()) return;
    setName(DEFAULT_NAME);
    setDraftId(null);
    setDesigns(emptyDesigns());
    setEffects(defaultEffects());
    setView('front');
    setDirty(false);
    setSavedAt(null);
    resetCanvases();
    setDraftsOpen(false);
  };

  // Ctrl/Cmd+S saves from anywhere. Canvas shortcuts (undo, redo, delete, nudge, duplicate) live in DesignCanvas.
  const persistRef = useRef(persist);
  persistRef.current = persist;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void persistRef.current(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty && draftId) e.preventDefault();
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty, draftId]);

  /* ---------------- derived ---------------- */
  const zone = getZone(garment, view);
  const viewsWithArtList = useMemo(() => VIEWS.filter((v) => hasArtwork(designs[v])), [designs]);
  const viewsWithArt = useMemo(
    () => ({ front: viewsWithArtList.includes('front'), back: viewsWithArtList.includes('back'), sleeve: viewsWithArtList.includes('sleeve') }),
    [viewsWithArtList],
  );
  const zoneLineColor = isDark(color) ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)';
  const savedLabel = saving
    ? 'Saving…'
    : dirty
      ? draftId
        ? 'Unsaved changes'
        : 'Not saved to drafts'
      : savedAt
        ? `Saved ${new Date(savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
        : 'New design';
  const fxDefs = useMemo(() => (['screen', 'puff', 'vintage'] as PrintEffect[]).map((e) => filterMarkup(e)).join(''), []);

  return (
    <div className="flex h-screen flex-col bg-[#0a0a0c] text-zinc-200">
      {/* SVG filters used by the live print-texture preview */}
      <svg width="0" height="0" className="absolute" aria-hidden>
        <defs dangerouslySetInnerHTML={{ __html: fxDefs }} />
      </svg>

      <Header
        name={name}
        onName={(n) => {
          setName(n);
          setDirty(true);
        }}
        dirty={dirty}
        savedLabel={savedLabel}
        canUndo={hist.canUndo}
        canRedo={hist.canRedo}
        onUndo={() => canvasRef.current?.undo()}
        onRedo={() => canvasRef.current?.redo()}
        onSave={() => persist(false)}
        onSaveAs={() => persist(true)}
        onNew={newDesign}
        onOpenDrafts={() => {
          listDrafts().then(setDrafts);
          setDraftsOpen(true);
        }}
        draftCount={drafts.length}
      />

      <div className="flex min-h-0 flex-1">
        <Toolbar
          garment={garment}
          onGarment={changeGarment}
          color={color}
          onColor={(c) => {
            setColor(c);
            setDirty(true);
          }}
          view={view}
          onView={changeView}
          viewsWithArt={viewsWithArt}
          effect={effects[view]}
          onEffect={changeEffect}
          selection={selection}
          canvas={canvasRef}
          onPlacement={handlePlacement}
          autoPlace={autoPlace}
          onAutoPlace={setAutoPlace}
          onError={onError}
          onInfo={onInfo}
        />

        {/* ---------------- stage ---------------- */}
        <main className="relative flex min-w-0 flex-1 flex-col">
          <div ref={stageRef} className="lc-stage relative flex flex-1 items-center justify-center overflow-hidden">
            <div style={{ width: GARMENT_W * scale, height: GARMENT_H * scale }} className="relative shrink-0">
              <div
                className="absolute left-0 top-0 origin-top-left will-change-transform"
                style={{ width: GARMENT_W, height: GARMENT_H, transform: `scale(${scale})` }}
              >
                {/* Own compositor layer: canvas redraws never repaint the (filter-heavy) garment SVG. */}
                <GarmentSVG garment={garment} view={view} color={color} className="absolute inset-0 [contain:strict] [transform:translateZ(0)]" />

                {showZone && (
                  <div
                    className="pointer-events-none absolute rounded-[2px]"
                    style={{ left: zone.x, top: zone.y, width: zone.w, height: zone.h, outline: `1px dashed ${zoneLineColor}` }}
                  >
                    <span className="absolute -top-5 left-0 whitespace-nowrap font-mono text-[10px] tracking-wide" style={{ color: zoneLineColor }}>
                      PRINT AREA {zone.widthIn}″ × {zone.heightIn}″
                    </span>
                  </div>
                )}

                <div className="absolute" style={{ left: zone.x, top: zone.y }}>
                  <DesignCanvas
                    key={`${canvasNonce}-${garment}-${view}`}
                    ref={canvasRef}
                    view={view}
                    zone={zone}
                    initialJSON={designs[view]}
                    history={historyFor(view)}
                    effect={effects[view]}
                    onChange={handleCanvasChange}
                    onLayers={setLayers}
                    onSelection={setSelection}
                    onHistory={setHist}
                    onReady={handleCanvasReady}
                    onError={onError}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* status bar */}
          <div className="flex h-10 shrink-0 items-center gap-4 border-t border-white/[0.06] bg-[#0d0d10] px-4 text-[11px] text-zinc-500">
            <span className="truncate whitespace-nowrap">
              <span className="text-zinc-300">{GARMENTS[garment].name}</span> · {view} · {effectName(effects[view])}
            </span>
            <label className="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap">
              <input type="checkbox" checked={showZone} onChange={(e) => setShowZone(e.target.checked)} className="accent-amber-400" />
              Print area
            </label>
            <span className="hidden whitespace-nowrap min-[1700px]:inline">
              <kbd>⌘/Ctrl</kbd>+<kbd>Z</kbd> undo · <kbd>⌘/Ctrl</kbd>+<kbd>Y</kbd> redo · <kbd>⌘/Ctrl</kbd>+<kbd>D</kbd> duplicate · <kbd>Del</kbd> ·{' '}
              <kbd>↑↓←→</kbd> 1px · <kbd>Shift</kbd> 10px
            </span>
            <div className="ml-auto flex items-center gap-1">
              <button className="lc-btn h-6 w-6 p-0" onClick={() => setZoom(Math.max(0.4, +(scale - 0.1).toFixed(2)))} title="Zoom out">
                <Minus size={12} />
              </button>
              <span className="w-12 text-center font-mono text-zinc-300">{Math.round(scale * 100)}%</span>
              <button className="lc-btn h-6 w-6 p-0" onClick={() => setZoom(Math.min(2, +(scale + 0.1).toFixed(2)))} title="Zoom in">
                <Plus size={12} />
              </button>
              <button className={`lc-btn h-6 gap-1 px-2 ${zoom === 'fit' ? 'text-amber-300' : ''}`} onClick={() => setZoom('fit')} title="Fit to screen">
                <Maximize2 size={11} /> Fit
              </button>
            </div>
          </div>
        </main>

        {/* ---------------- right panel ---------------- */}
        <aside className="lc-scroll flex w-[300px] shrink-0 flex-col overflow-y-auto border-l border-white/[0.06] bg-[#111114]">
          <PropertiesPanel selection={selection} canvas={canvasRef} />
          <LayersPanel layers={layers} selection={selection} canvas={canvasRef} />
          <ExportPanel getSnapshot={getSnapshot} viewsWithArt={viewsWithArtList} onError={onError} onInfo={onInfo} />
          <div className="mt-auto px-4 py-3 text-[10.5px] leading-relaxed text-zinc-600">
            Drafts are stored in this browser’s IndexedDB — no size limit for high-res uploads.
          </div>
        </aside>
      </div>

      <DraftManager
        open={draftsOpen}
        drafts={drafts}
        currentId={draftId}
        onClose={() => setDraftsOpen(false)}
        onLoad={loadDraft}
        onRename={async (id, n) => {
          try {
            setDrafts(await renameDraft(id, n));
            if (id === draftId) setName(n);
          } catch (e) {
            onError((e as Error).message);
          }
        }}
        onDelete={async (id) => {
          setDrafts(await deleteDraft(id));
          if (id === draftId) {
            setDraftId(null);
            setDirty(true);
          }
        }}
        onDuplicate={async (id) => {
          try {
            setDrafts(await duplicateDraft(id));
          } catch (e) {
            onError((e as Error).message);
          }
        }}
        onNew={newDesign}
      />

      {/* toasts */}
      <div className="pointer-events-none fixed bottom-14 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`lc-toast pointer-events-auto flex max-w-[560px] items-start gap-2 rounded-lg border px-3.5 py-2.5 text-xs shadow-xl backdrop-blur ${
              t.kind === 'error' ? 'border-red-500/30 bg-red-950/90 text-red-100' : 'border-white/10 bg-zinc-900/95 text-zinc-100'
            }`}
          >
            {t.kind === 'error' ? <XCircle size={15} className="mt-px shrink-0 text-red-400" /> : <CheckCircle2 size={15} className="mt-px shrink-0 text-amber-400" />}
            <span className="break-words">{t.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
