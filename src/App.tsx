import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Maximize2, Minus, PersonStanding, Plus, Rotate3d, XCircle } from 'lucide-react';
import { Header, LoomCraftLogo } from './components/Header';
import { Toolbar } from './components/Toolbar';
import { LayersPanel, PropertiesPanel } from './components/LayersPanel';
import { ExportPanel } from './components/ExportPanel';
import { DraftManager } from './components/DraftManager';
import { SizeChartEditor } from './components/SizeChartEditor';
import { ClaudeChat } from './components/AssistantPanel';
import { AssistantDrawer } from './components/assistant/AssistantDrawer';
import { LayoutHelper } from './components/assistant/LayoutHelper';
import { ColorHelper } from './components/assistant/ColorHelper';
import { SpecHelper } from './components/assistant/SpecHelper';
import { useStudioAgent } from './ai/useStudioAgent';
import type { AgentContext } from './ai/executor';
import { DesignCanvas, type DesignCanvasHandle, type HistoryState } from './components/DesignCanvas';
import { GarmentSVG } from './components/GarmentTemplates';
import { CustomGarmentEditor } from './components/CustomGarmentEditor';
import { DEFAULT_GARMENT, GARMENT_H, GARMENT_W, garmentViews, getGarment, getZone, hasGarment, hasView, setCustomGarments, viewLabel } from './data/garments';
import type { CanvasJSON, CustomGarmentRecord, Draft, FabricChoices, GarmentId, LayerInfo, ManufacturingSpec, ManufacturingSpecs, PrintEffect, SelectionInfo, SizeChart, SizeCharts, ViewId, Workspace } from './types';
import { defaultEffects, effectFor, emptyDesigns, hasArtwork } from './types';
import { isDark } from './utils/color';
import { effectName, filterMarkup } from './utils/printEffects';
import type { StudioSnapshot } from './utils/exportTools';
import { refitDesign } from './utils/fabricHelpers';
import type { PlacementPreset } from './utils/placements';
import { defaultSizeChart } from './utils/sizeCharts';
import { fabricFor } from './data/fabrics';

// Three.js lives in this chunk; it loads the first time the 360° preview opens.
const Garment360 = lazy(() => import('./components/Garment360'));
const MannequinViewport = lazy(() => import('./components/MannequinViewport'));
const PsdImportDialog = lazy(() => import('./components/PsdImportDialog'));
import {
  deleteCustomGarment,
  deleteDraft,
  duplicateDraft,
  listCustomGarments,
  saveCustomGarment,
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
  const [boot, setBoot] = useState<{ ws: Workspace | null; customs: CustomGarmentRecord[] } | undefined>(undefined);
  useEffect(() => {
    Promise.all([loadWorkspace().catch(() => null), listCustomGarments().catch(() => [])]).then(([ws, customs]) => {
      // Custom blanks must be in the registry before the studio resolves garment ids.
      setCustomGarments(customs);
      setBoot({ ws, customs });
    });
  }, []);

  if (boot === undefined) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-[#0a0a0c]">
        <LoomCraftLogo size={40} />
        <Loader2 size={18} className="animate-spin text-zinc-500" />
      </div>
    );
  }
  return <Studio initial={boot.ws} initialCustoms={boot.customs} />;
}

const firstView = (g: GarmentId) => garmentViews(g)[0].id;

function Studio({ initial, initialCustoms }: { initial: Workspace | null; initialCustoms: CustomGarmentRecord[] }) {
  const [name, setName] = useState(initial?.name ?? DEFAULT_NAME);
  const [draftId, setDraftId] = useState<string | null>(initial?.draftId ?? null);
  const [garment, setGarment] = useState<GarmentId>(initial?.garment && hasGarment(initial.garment) ? initial.garment : DEFAULT_GARMENT);
  const [color, setColor] = useState(initial?.color ?? DEFAULT_COLOR);
  const [designs, setDesigns] = useState(initial?.designs ?? emptyDesigns());
  const [effects, setEffects] = useState(initial?.effects ?? defaultEffects());
  const [view, setView] = useState<ViewId>(() => firstView(initial?.garment && hasGarment(initial.garment) ? initial.garment : DEFAULT_GARMENT));
  const [customList, setCustomList] = useState<CustomGarmentRecord[]>(initialCustoms);
  const [customEditor, setCustomEditor] = useState<{ open: boolean; editing: CustomGarmentRecord | null }>({ open: false, editing: null });
  const [sizeCharts, setSizeCharts] = useState<SizeCharts>(initial?.sizeCharts ?? {});
  const [mfgSpecs, setMfgSpecs] = useState<ManufacturingSpecs>(initial?.mfgSpecs ?? {});
  const [fabrics, setFabrics] = useState<FabricChoices>(initial?.fabrics ?? {});
  const [sizeChartOpen, setSizeChartOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [show360, setShow360] = useState(false);
  const [showMannequin, setShowMannequin] = useState(false);
  const [psdFile, setPsdFile] = useState<File | null>(null);
  const closePsd = useCallback(() => setPsdFile(null), []);
  const close360 = useCallback(() => setShow360(false), []);

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
  const canvasWaiters = useRef<Array<() => void>>([]);

  const state = { name, draftId, garment, color, view, designs, effects, sizeCharts, mfgSpecs, fabrics };
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
    const t = setTimeout(() => void saveWorkspace({ draftId, name, garment, color, designs, effects, sizeCharts, mfgSpecs, fabrics }), 600);
    return () => clearTimeout(t);
  }, [draftId, name, garment, color, designs, effects, sizeCharts, mfgSpecs, fabrics]);

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
      const waiters = canvasWaiters.current;
      canvasWaiters.current = [];
      waiters.forEach((resolve) => resolve());
      const pl = pendingPlacement.current;
      if (pl && pl.view === v) {
        pendingPlacement.current = null;
        applyPlacement(pl);
      }
    },
    [applyPlacement],
  );

  const handlePlacement = (pl: PlacementPreset) => {
    if (!hasView(garment, pl.view)) {
      toast('error', `The ${getGarment(garment).name} has no ${pl.view} view for ${pl.name}.`);
      return;
    }
    if (pl.view !== view) {
      // Switch views first; the preset is applied once the new canvas has loaded.
      pendingPlacement.current = pl;
      setSelection(null);
      setView(pl.view);
    } else applyPlacement(pl);
  };

  /* ---------------- studio actions ---------------- */
  const changeGarment = (g: GarmentId, fromZones?: Record<ViewId, { w: number; h: number }>) => {
    if (g === garment && !fromZones) return;
    const next = { ...designs };
    // Artwork on views both garments share is refitted to the new print zones. Views the new garment
    // lacks are kept untouched, so switching back restores them.
    for (const v of garmentViews(g)) {
      const json = designs[v.id];
      const from = fromZones?.[v.id] ?? (hasView(garment, v.id) ? getZone(garment, v.id) : null);
      if (json && from) next[v.id] = refitDesign(json, from, v.zone);
    }
    setDesigns(next);
    setGarment(g);
    if (!hasView(g, view)) setView(firstView(g));
    setDirty(true);
    resetCanvases();
  };

  /* ---------------- custom blanks ---------------- */
  const saveCustom = async (rec: CustomGarmentRecord) => {
    try {
      const editingCurrent = rec.id === garment && hasGarment(rec.id);
      // Remember the old print zones so artwork can be refitted if the box moved.
      const oldZones = editingCurrent ? Object.fromEntries(garmentViews(rec.id).map((v) => [v.id, v.zone])) : undefined;
      const list = await saveCustomGarment(rec);
      setCustomGarments(list);
      setCustomList(list);
      setCustomEditor({ open: false, editing: null });
      changeGarment(rec.id, oldZones);
      toast('info', `${customEditor.editing ? 'Updated' : 'Added'} “${rec.name}”`);
    } catch (e) {
      toast('error', `Couldn't save the custom garment: ${(e as Error).message}`);
    }
  };

  const deleteCustom = async (id: GarmentId) => {
    const list = await deleteCustomGarment(id);
    if (garment === id) changeGarment(DEFAULT_GARMENT);
    setCustomGarments(list);
    setCustomList(list);
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

  /* ---------------- size chart (one per garment) ---------------- */
  const storedChart = sizeCharts[garment];
  const sizeChart = useMemo(() => storedChart ?? defaultSizeChart(garment), [storedChart, garment]);
  const updateSizeChart = useCallback(
    (c: SizeChart) => {
      setSizeCharts((all) => ({ ...all, [garment]: c }));
      setDirty(true);
    },
    [garment],
  );
  const resetSizeChart = useCallback(() => {
    setSizeCharts((all) => ({ ...all, [garment]: defaultSizeChart(garment) }));
    setDirty(true);
  }, [garment]);
  const closeSizeChart = useCallback(() => setSizeChartOpen(false), []);

  /* ---------------- manufacturing spec (one per garment) ---------------- */
  const updateSpec = useCallback(
    (spec: ManufacturingSpec | null) => {
      setMfgSpecs((all) => {
        const next = { ...all };
        if (spec) next[garment] = spec;
        else delete next[garment];
        return next;
      });
      setDirty(true);
    },
    [garment],
  );
  /** Fabric choice for the current garment (null = back to the garment's default). */
  const changeFabric = useCallback(
    (id: string | null) => {
      setFabrics((all) => {
        const next = { ...all };
        if (id) next[garment] = id;
        else delete next[garment];
        return next;
      });
      setDirty(true);
    },
    [garment],
  );

  /* ---------------- Claude design assistant ---------------- */
  /** Resolves when the next canvas (after a garment/view switch) has mounted and loaded its design. */
  const waitForCanvas = () =>
    new Promise<void>((resolve) => {
      canvasWaiters.current.push(resolve);
      setTimeout(resolve, 6000);
    });
  const agentCtx = useRef<AgentContext | null>(null);
  agentCtx.current = {
    canvas: () => canvasRef.current,
    state: () => stateRef.current,
    setGarment: async (g) => {
      if (g === stateRef.current.garment) return;
      const ready = waitForCanvas();
      changeGarment(g);
      await ready;
    },
    setView: async (v) => {
      if (v === stateRef.current.view) return;
      const ready = waitForCanvas();
      setSelection(null);
      setView(v);
      await ready;
    },
    setColor: (hex) => {
      setColor(hex);
      setDirty(true);
    },
    setEffect: (e) => {
      setEffects((x) => ({ ...x, [stateRef.current.view]: e }));
      setDirty(true);
    },
    mockupJpeg: async () => {
      const { composeMockup } = await import('./utils/exportTools');
      const s = stateRef.current;
      const c = await composeMockup({ garment: s.garment, view: s.view, color: s.color, json: s.designs[s.view], effect: effectFor(s.effects, s.view), scale: 2, fabric: fabricFor(s.fabrics, s.garment).id });
      return c.toDataURL('image/jpeg', 0.85).split(',')[1];
    },
  };
  const agent = useStudioAgent(() => agentCtx.current!);
  const closeAssistant = useCallback(() => setAssistantOpen(false), []);

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
          sizeCharts: s.sizeCharts,
          mfgSpecs: s.mfgSpecs,
          fabrics: s.fabrics,
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
    const g = hasGarment(d.garment) ? d.garment : DEFAULT_GARMENT;
    if (g !== d.garment) toast('error', `This draft used a custom garment that no longer exists, so it opened on the ${getGarment(g).name}.`);
    setName(d.name);
    setDraftId(d.id);
    setGarment(g);
    setColor(d.color);
    setDesigns({ ...emptyDesigns(), ...d.designs });
    setEffects({ ...defaultEffects(), ...d.effects });
    setSizeCharts(d.sizeCharts ?? {});
    setMfgSpecs(d.mfgSpecs ?? {});
    setFabrics(d.fabrics ?? {});
    setView(firstView(g));
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
    setSizeCharts({});
    setMfgSpecs({});
    setFabrics({});
    setView(firstView(garment));
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
  const fabric = fabricFor(fabrics, garment);
  const viewsWithArtList = useMemo(
    () => garmentViews(garment).map((v) => v.id).filter((v) => hasArtwork(designs[v])),
    // customList: a custom garment's views can change when it's edited
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [designs, garment, customList],
  );
  const viewsWithArt = useMemo(() => Object.fromEntries(viewsWithArtList.map((v) => [v, true])), [viewsWithArtList]);
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
        onOpenSizeChart={() => setSizeChartOpen(true)}
        assistantOpen={assistantOpen}
        onToggleAssistant={() => setAssistantOpen((o) => !o)}
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
          effect={effectFor(effects, view)}
          onEffect={changeEffect}
          customGarments={customList}
          onAddCustom={() => setCustomEditor({ open: true, editing: null })}
          onEditCustom={(id) => setCustomEditor({ open: true, editing: customList.find((c) => c.id === id) ?? null })}
          onDeleteCustom={deleteCustom}
          selection={selection}
          canvas={canvasRef}
          onPlacement={handlePlacement}
          autoPlace={autoPlace}
          onAutoPlace={setAutoPlace}
          onError={onError}
          onInfo={onInfo}
          onImportPsd={setPsdFile}
          fabricId={fabrics[garment]}
          onFabric={changeFabric}
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
                <GarmentSVG garment={garment} view={view} color={color} fabric={fabric.id} className="absolute inset-0 [contain:strict] [transform:translateZ(0)]" />

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
                    initialJSON={designs[view] ?? null}
                    history={historyFor(view)}
                    effect={effectFor(effects, view)}
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

            {!show360 && (
              <div className="absolute right-3 top-3 z-10 flex gap-1.5">
                <button
                  onClick={() => setShowMannequin(true)}
                  className="lc-btn h-8 gap-1.5 bg-[#111114]/90 px-3 text-xs text-zinc-300 backdrop-blur hover:text-zinc-100"
                  title="Mannequin Studio: sized mannequin, studio lighting, test-fit a tee or hoodie, load .glb models"
                >
                  <PersonStanding size={14} /> Mannequin
                </button>
                <button
                  onClick={() => {
                    canvasRef.current?.selectLayers([]);
                    setShow360(true);
                  }}
                  className="lc-btn h-8 gap-1.5 border-violet-500/40 bg-[#111114]/90 px-3 text-xs text-violet-200 backdrop-blur hover:border-violet-400"
                  title="Rotate the garment in 3D and look inside it"
                >
                  <Rotate3d size={14} /> 360° View
                </button>
              </div>
            )}
            {showMannequin && (
              <Suspense
                fallback={
                  <div className="fixed inset-0 z-50 grid place-items-center bg-[#0a0a0c] text-xs text-zinc-400">
                    <span className="flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin text-violet-400" /> Loading Mannequin Studio…
                    </span>
                  </div>
                }
              >
                <MannequinViewport initialColor={color} onClose={() => setShowMannequin(false)} />
              </Suspense>
            )}
            {show360 && (
              <Suspense
                fallback={
                  <div className="lc-stage absolute inset-0 z-20 grid place-items-center text-xs text-zinc-400">
                    <span className="flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin text-violet-400" /> Loading 3D viewer…
                    </span>
                  </div>
                }
              >
                <Garment360
                  name={name}
                  garment={garment}
                  color={color}
                  designs={designs}
                  effects={effects}
                  fabricId={fabrics[garment]}
                  onFabric={changeFabric}
                  onClose={close360}
                  onError={onError}
                />
              </Suspense>
            )}
          </div>

          {/* status bar */}
          <div className="flex h-10 shrink-0 items-center gap-4 border-t border-white/[0.06] bg-[#0d0d10] px-4 text-[11px] text-zinc-500">
            <span className="truncate whitespace-nowrap">
              <span className="text-zinc-300">{getGarment(garment).name}</span> · {fabric.name} · {viewLabel(garment, view)} · {effectName(effectFor(effects, view))}
            </span>
            <label className="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap">
              <input type="checkbox" checked={showZone} onChange={(e) => setShowZone(e.target.checked)} className="accent-violet-500" />
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
              <button className={`lc-btn h-6 gap-1 px-2 ${zoom === 'fit' ? 'text-violet-300' : ''}`} onClick={() => setZoom('fit')} title="Fit to screen">
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

      <AssistantDrawer
        open={assistantOpen}
        onClose={closeAssistant}
        render={(tab) => {
          switch (tab) {
            case 'layouts':
              return <LayoutHelper garment={garment} hasSelection={!!selection} getContext={() => agentCtx.current!} onInfo={onInfo} onError={onError} />;
            case 'colors':
              return <ColorHelper garmentColor={color} canvas={canvasRef} hasSelection={!!selection} designVersion={designs[view]} onInfo={onInfo} onError={onError} />;
            case 'specs':
              return (
                <SpecHelper
                  garment={garment}
                  color={color}
                  designs={designs}
                  effects={effects}
                  spec={mfgSpecs[garment]}
                  fabricId={fabrics[garment]}
                  onChange={updateSpec}
                  onOpenSizeChart={() => setSizeChartOpen(true)}
                  onInfo={onInfo}
                />
              );
            default:
              return <ClaudeChat active={assistantOpen} history={agent.history} status={agent.status} onSend={agent.send} onStop={agent.stop} onReset={agent.reset} />;
          }
        }}
      />

      <SizeChartEditor
        open={sizeChartOpen}
        garment={garment}
        color={color}
        chart={sizeChart}
        spec={mfgSpecs[garment]}
        onChange={updateSizeChart}
        onReset={resetSizeChart}
        onClose={closeSizeChart}
        onInfo={onInfo}
      />

      <CustomGarmentEditor
        open={customEditor.open}
        initial={customEditor.editing}
        color={color}
        onSave={saveCustom}
        onClose={() => setCustomEditor({ open: false, editing: null })}
        onError={onError}
      />

      {psdFile && (
        <Suspense fallback={null}>
          <PsdImportDialog file={psdFile} onClose={closePsd} getContext={() => agentCtx.current!} onInfo={onInfo} onError={onError} />
        </Suspense>
      )}

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
            {t.kind === 'error' ? <XCircle size={15} className="mt-px shrink-0 text-red-400" /> : <CheckCircle2 size={15} className="mt-px shrink-0 text-violet-400" />}
            <span className="break-words">{t.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
