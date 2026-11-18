import { forwardRef, memo, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  ActiveSelection,
  Canvas,
  FabricImage,
  type FabricObject,
  IText,
  Point,
  cache,
  loadSVGFromString,
  util,
} from 'fabric';
import type { CanvasJSON, LayerInfo, PrintEffect, PrintZone, SelectionInfo, ViewId } from '../types';
import { zonePpi } from './GarmentTemplates';
import { SERIAL_PROPS, configureFabric, isLocked, meta, newId, objectKind, objectName } from '../utils/fabricHelpers';
import { ensureFonts, loadGoogleFont } from '../utils/fonts';
import { filterId } from '../utils/printEffects';
import type { PlacementPreset } from '../utils/placements';

export interface HistoryState {
  stack: string[];
  index: number;
}

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  fill: string;
  charSpacing: number;
  fontWeight: string;
  fontStyle: string;
  textAlign: string;
  underline: boolean;
}

export type ArrangeDir = 'forward' | 'backward' | 'front' | 'back';

export interface DesignCanvasHandle {
  addImageFile(file: File, placement?: PlacementPreset | null): Promise<void>;
  addText(text: string, style: TextStyle): Promise<void>;
  updateText(props: Partial<TextStyle> & { text?: string }): Promise<void>;
  /** Scale + align the selection (or every unlocked layer when nothing is selected) to a preset. */
  applyPlacement(preset: PlacementPreset): boolean;
  setOpacity(v: number): void;
  arrange(dir: ArrangeDir, id?: string): void;
  deleteSelected(): void;
  duplicateSelected(): Promise<void>;
  center(axis: 'h' | 'v'): void;
  flip(axis: 'x' | 'y'): void;
  nudge(dx: number, dy: number): void;
  selectLayer(id: string): void;
  toggleVisible(id: string): void;
  toggleLock(id: string): void;
  removeLayer(id: string): void;
  renameLayer(id: string, name: string): void;
  undo(): Promise<void>;
  redo(): Promise<void>;
  isEditingText(): boolean;
  hasSelection(): boolean;
}

interface Props {
  view: ViewId;
  zone: PrintZone;
  /** Read once on mount only – the parent re-keys the component to load different content. */
  initialJSON: CanvasJSON | null;
  history: HistoryState;
  effect: PrintEffect;
  onChange(view: ViewId, json: CanvasJSON): void;
  onLayers(layers: LayerInfo[]): void;
  onSelection(info: SelectionInfo | null): void;
  onHistory(state: { canUndo: boolean; canRedo: boolean }): void;
  onReady?(view: ViewId): void;
  onError(msg: string): void;
}

const SNAP = 7;
const MAX_HISTORY = 80;

const readAsDataURL = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

const isTypingTarget = (t: EventTarget | null) =>
  t instanceof HTMLElement && !!t.closest('input, textarea, select, [contenteditable="true"]');

const DesignCanvasInner = forwardRef<DesignCanvasHandle, Props>(function DesignCanvas(props, ref) {
  const { zone, effect } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const fcRef = useRef<Canvas | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const restoring = useRef(false);
  const debounce = useRef<number | undefined>(undefined);
  const pending = useRef(false);
  const loaded = useRef(false);
  const selRaf = useRef(0);
  const lastSel = useRef('');
  const lastLayers = useRef('');
  const guidesRef = useRef({ v: false, h: false });
  const [guides, setGuides] = useState({ v: false, h: false });
  const ppi = zonePpi(zone);

  /* ---------- emitters (deduped so the parent only re-renders on real changes) ---------- */

  const serialize = (): CanvasJSON => fcRef.current!.toObject(SERIAL_PROPS) as CanvasJSON;

  const emitLayers = () => {
    const c = fcRef.current;
    if (!c) return;
    const layers: LayerInfo[] = c
      .getObjects()
      .slice()
      .reverse()
      .map((o) => ({
        id: meta(o).id!,
        name: objectName(o),
        kind: objectKind(o),
        visible: o.visible !== false,
        locked: isLocked(o),
      }));
    const key = JSON.stringify(layers);
    if (key === lastLayers.current) return;
    lastLayers.current = key;
    propsRef.current.onLayers(layers);
  };

  const emitSelection = () => {
    const c = fcRef.current;
    if (!c) return;
    const objs = c.getActiveObjects();
    const active = c.getActiveObject();
    let info: SelectionInfo | null = null;
    if (active && objs.length) {
      const first = objs[0];
      const kind = objectKind(first);
      info = {
        id: meta(first).id ?? '',
        name: objs.length > 1 ? `${objs.length} layers` : objectName(first),
        kind,
        multiple: objs.length > 1,
        opacity: active.opacity ?? 1,
        widthIn: +(active.getScaledWidth() / ppi).toFixed(2),
        heightIn: +(active.getScaledHeight() / ppi).toFixed(2),
        angle: Math.round(active.angle ?? 0),
      };
      if (objs.length === 1 && kind === 'image') {
        info.effectiveDpi = Math.round(ppi / Math.max(first.scaleX, first.scaleY));
      }
      if (objs.length === 1 && kind === 'text') {
        const t = first as IText;
        info.text = {
          fontFamily: t.fontFamily,
          fontSize: Math.round(t.fontSize),
          fill: typeof t.fill === 'string' ? t.fill : '#ffffff',
          charSpacing: t.charSpacing,
          fontWeight: String(t.fontWeight),
          fontStyle: String(t.fontStyle),
          textAlign: t.textAlign,
          underline: !!t.underline,
        };
      }
    }
    const key = JSON.stringify(info);
    if (key === lastSel.current) return;
    lastSel.current = key;
    propsRef.current.onSelection(info);
  };

  /** Coalesce high-frequency transform events to one parent update per animation frame. */
  const scheduleSelection = () => {
    if (selRaf.current) return;
    selRaf.current = requestAnimationFrame(() => {
      selRaf.current = 0;
      emitSelection();
    });
  };

  const emitHistory = () => {
    const h = propsRef.current.history;
    propsRef.current.onHistory({ canUndo: h.index > 0, canRedo: h.index < h.stack.length - 1 });
  };

  /** Push current state onto the undo stack and notify the parent. */
  const commit = () => {
    window.clearTimeout(debounce.current);
    pending.current = false;
    if (restoring.current || !fcRef.current) return;
    const h = propsRef.current.history;
    const snapshot = JSON.stringify(serialize());
    if (snapshot !== h.stack[h.index]) {
      h.stack = h.stack.slice(0, h.index + 1);
      h.stack.push(snapshot);
      if (h.stack.length > MAX_HISTORY) h.stack.shift();
      h.index = h.stack.length - 1;
      propsRef.current.onChange(propsRef.current.view, JSON.parse(snapshot));
    }
    emitHistory();
    emitLayers();
  };
  const commitSoon = () => {
    window.clearTimeout(debounce.current);
    pending.current = true;
    debounce.current = window.setTimeout(commit, 350);
  };

  const ensureIds = () => {
    fcRef.current?.getObjects().forEach((o) => {
      if (!meta(o).id) meta(o).id = newId();
    });
  };

  const restore = async (snapshot: string) => {
    const c = fcRef.current;
    if (!c) return;
    restoring.current = true;
    try {
      const json = JSON.parse(snapshot);
      await ensureFonts(json);
      await c.loadFromJSON(json);
      ensureIds();
      c.requestRenderAll();
      propsRef.current.onChange(propsRef.current.view, json);
    } finally {
      restoring.current = false;
    }
    emitLayers();
    emitHistory();
    emitSelection();
  };

  /* ---------- mount ---------- */

  useEffect(() => {
    configureFabric();
    const host = hostRef.current!;
    const el = document.createElement('canvas');
    host.appendChild(el);
    const canvas = new Canvas(el, {
      width: zone.w,
      height: zone.h,
      preserveObjectStacking: true,
      controlsAboveOverlay: true,
      stopContextMenu: true,
      selectionColor: 'rgba(245,176,65,0.08)',
      selectionBorderColor: '#f5b041',
      selectionLineWidth: 1,
    });
    fcRef.current = canvas;
    const wrapper = canvas.wrapperEl;
    let disposed = false;

    (async () => {
      const { initialJSON, history } = propsRef.current;
      try {
        if (initialJSON) {
          restoring.current = true;
          await ensureFonts(initialJSON);
          if (disposed) return;
          await canvas.loadFromJSON(initialJSON);
          if (disposed) return;
          ensureIds();
          canvas.requestRenderAll();
        }
      } catch (e) {
        if (!disposed) propsRef.current.onError(`Could not load design: ${(e as Error).message}`);
      } finally {
        restoring.current = false;
      }
      if (disposed) return;
      loaded.current = true;
      if (history.stack.length === 0) {
        history.stack = [JSON.stringify(serialize())];
        history.index = 0;
      }
      emitLayers();
      emitHistory();
      emitSelection();
      propsRef.current.onReady?.(propsRef.current.view);
    })();

    const setGuideState = (v: boolean, h: boolean) => {
      if (guidesRef.current.v !== v || guidesRef.current.h !== h) {
        guidesRef.current = { v, h };
        setGuides({ v, h });
      }
    };

    canvas.on('object:moving', ({ target }) => {
      const c = target.getCenterPoint();
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const snapV = Math.abs(c.x - cx) < SNAP;
      const snapH = Math.abs(c.y - cy) < SNAP;
      if (snapV || snapH) {
        target.setPositionByOrigin(new Point(snapV ? cx : c.x, snapH ? cy : c.y), 'center', 'center');
        target.setCoords();
      }
      setGuideState(snapV, snapH);
      scheduleSelection();
    });
    canvas.on('mouse:up', () => setGuideState(false, false));
    canvas.on('object:modified', () => {
      commit();
      emitSelection();
    });
    canvas.on('object:scaling', scheduleSelection);
    canvas.on('object:rotating', scheduleSelection);
    canvas.on('selection:created', emitSelection);
    canvas.on('selection:updated', emitSelection);
    canvas.on('selection:cleared', emitSelection);
    canvas.on('text:changed', () => {
      emitLayers();
      scheduleSelection();
    });
    canvas.on('text:editing:exited', commit);

    return () => {
      disposed = true;
      // Persist an edit that was still waiting on the debounce (e.g. a slider drag right before a view switch).
      if (loaded.current && pending.current) commit();
      window.clearTimeout(debounce.current);
      cancelAnimationFrame(selRaf.current);
      loaded.current = false;
      fcRef.current = null;
      canvas.dispose().finally(() => {
        wrapper?.remove();
        el.remove();
      });
    };
    // Canvas is created once per mount; the parent re-keys this component when the zone/draft changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- print texture preview ---------- */

  useEffect(() => {
    const c = fcRef.current;
    if (c) c.lowerCanvasEl.style.filter = effect === 'none' ? '' : `url(#${filterId(effect)})`;
  }, [effect]);

  /* ---------- imperative API ---------- */

  const api = useMemo<DesignCanvasHandle>(() => {
    const c = () => fcRef.current!;
    const findById = (id: string) => c().getObjects().find((o) => meta(o).id === id);

    const selectObjects = (objs: FabricObject[]) => {
      const canvas = c();
      if (!objs.length) return;
      canvas.setActiveObject(objs.length === 1 ? objs[0] : new ActiveSelection(objs, { canvas }));
    };

    const placeAt = (objs: FabricObject[], preset: PlacementPreset) => {
      const canvas = c();
      canvas.discardActiveObject(); // restores absolute coordinates for grouped selections
      let L = Infinity;
      let T = Infinity;
      let R = -Infinity;
      let B = -Infinity;
      for (const o of objs) {
        o.setCoords();
        const r = o.getBoundingRect();
        L = Math.min(L, r.left);
        T = Math.min(T, r.top);
        R = Math.max(R, r.left + r.width);
        B = Math.max(B, r.top + r.height);
      }
      const bw = Math.max(1, R - L);
      const bh = Math.max(1, B - T);
      const box = preset.box(zone);
      const s = Math.min((box.maxW * ppi) / bw, (box.maxH * ppi) / bh);
      const tx = box.cx * ppi - (bw * s) / 2;
      const ty = box.top * ppi;
      for (const o of objs) {
        o.set({
          left: tx + ((o.left ?? 0) - L) * s,
          top: ty + ((o.top ?? 0) - T) * s,
          scaleX: o.scaleX * s,
          scaleY: o.scaleY * s,
        });
        o.setCoords();
      }
      selectObjects(objs);
      canvas.requestRenderAll();
    };

    const place = (obj: FabricObject, name: string, preset?: PlacementPreset | null) => {
      const canvas = c();
      meta(obj).id = newId();
      meta(obj).name = name;
      obj.set({ originX: 'center', originY: 'center', left: canvas.width / 2, top: canvas.height / 2 });
      obj.setCoords();
      canvas.add(obj);
      if (preset) placeAt([obj], preset);
      else canvas.setActiveObject(obj);
      canvas.requestRenderAll();
      commit();
      emitSelection();
    };

    const arrangeObj = (o: FabricObject, dir: ArrangeDir) => {
      const canvas = c();
      if (dir === 'forward') canvas.bringObjectForward(o);
      else if (dir === 'backward') canvas.sendObjectBackwards(o);
      else if (dir === 'front') canvas.bringObjectToFront(o);
      else canvas.sendObjectToBack(o);
    };

    return {
      async addImageFile(file, placement) {
        const canvas = c();
        const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
        let obj: FabricObject;
        if (isSvg) {
          const { objects, options } = await loadSVGFromString(await file.text());
          const valid = objects.filter(Boolean) as FabricObject[];
          if (!valid.length) throw new Error(`${file.name}: no drawable shapes found in SVG.`);
          obj = valid.length === 1 ? valid[0] : util.groupSVGElements(valid, options);
        } else {
          obj = await FabricImage.fromURL(await readAsDataURL(file));
        }
        if (!placement) {
          const w = obj.width || 1;
          const h = obj.height || 1;
          obj.scale(Math.min((canvas.width * 0.7) / w, (canvas.height * 0.7) / h));
        }
        place(obj, file.name.replace(/\.[^.]+$/, ''), placement);
      },

      async addText(text, style) {
        await loadGoogleFont(style.fontFamily);
        const t = new IText(text || 'Your Text', { ...style, textAlign: style.textAlign || 'center' } as Partial<IText>);
        place(t, (text || 'Text').slice(0, 28));
      },

      async updateText(p) {
        const canvas = c();
        const texts = canvas.getActiveObjects().filter((o) => objectKind(o) === 'text') as IText[];
        if (!texts.length) return;
        if (p.fontFamily) {
          const ok = await loadGoogleFont(p.fontFamily);
          if (!ok) {
            propsRef.current.onError(`Couldn't load "${p.fontFamily}" from Google Fonts. Check the exact family name.`);
            return;
          }
          cache.clearFontCache(p.fontFamily);
        }
        for (const t of texts) {
          t.set(p as Partial<IText>);
          t.initDimensions();
          t.setCoords();
        }
        canvas.getActiveObject()?.setCoords();
        canvas.requestRenderAll();
        emitSelection();
        emitLayers();
        commitSoon();
      },

      applyPlacement(preset) {
        const canvas = c();
        let objs = canvas.getActiveObjects();
        if (!objs.length) objs = canvas.getObjects().filter((o) => o.visible !== false && !isLocked(o));
        if (!objs.length) return false;
        placeAt(objs, preset);
        commit();
        emitSelection();
        return true;
      },

      setOpacity(v) {
        const canvas = c();
        canvas.getActiveObjects().forEach((o) => o.set('opacity', v));
        canvas.requestRenderAll();
        emitSelection();
        commitSoon();
      },

      arrange(dir, id) {
        const canvas = c();
        const target = id ? findById(id) : undefined;
        const objs = target ? [target] : canvas.getActiveObjects();
        if (!objs.length) return;
        const ordered = dir === 'forward' || dir === 'back' ? [...objs].reverse() : objs;
        ordered.forEach((o) => arrangeObj(o, dir));
        canvas.requestRenderAll();
        commit();
      },

      deleteSelected() {
        const canvas = c();
        const objs = canvas.getActiveObjects();
        if (!objs.length) return;
        canvas.discardActiveObject();
        objs.forEach((o) => canvas.remove(o));
        canvas.requestRenderAll();
        commit();
        emitSelection();
      },

      async duplicateSelected() {
        const canvas = c();
        const objs = canvas.getActiveObjects();
        if (!objs.length) return;
        canvas.discardActiveObject();
        const clones: FabricObject[] = [];
        for (const o of objs) {
          const cl = await o.clone(SERIAL_PROPS);
          meta(cl).id = newId();
          meta(cl).name = `${objectName(o)} copy`;
          cl.set({ left: (o.left ?? 0) + 14, top: (o.top ?? 0) + 14 });
          cl.setCoords();
          canvas.add(cl);
          clones.push(cl);
        }
        selectObjects(clones);
        canvas.requestRenderAll();
        commit();
        emitSelection();
      },

      center(axis) {
        const canvas = c();
        const o = canvas.getActiveObject();
        if (!o) return;
        if (axis === 'h') canvas.centerObjectH(o);
        else canvas.centerObjectV(o);
        o.setCoords();
        canvas.requestRenderAll();
        commit();
      },

      flip(axis) {
        const canvas = c();
        const o = canvas.getActiveObject();
        if (!o) return;
        if (axis === 'x') o.set('flipX', !o.flipX);
        else o.set('flipY', !o.flipY);
        canvas.requestRenderAll();
        commit();
      },

      nudge(dx, dy) {
        const canvas = c();
        const o = canvas.getActiveObject();
        if (!o) return;
        o.set({ left: (o.left ?? 0) + dx, top: (o.top ?? 0) + dy });
        o.setCoords();
        canvas.requestRenderAll();
        scheduleSelection();
        commitSoon();
      },

      selectLayer(id) {
        const canvas = c();
        const o = findById(id);
        if (!o || isLocked(o) || o.visible === false) return;
        canvas.setActiveObject(o);
        canvas.requestRenderAll();
        emitSelection();
      },

      toggleVisible(id) {
        const canvas = c();
        const o = findById(id);
        if (!o) return;
        const visible = o.visible === false;
        o.set('visible', visible);
        if (!visible && canvas.getActiveObjects().includes(o)) canvas.discardActiveObject();
        canvas.requestRenderAll();
        commit();
        emitSelection();
      },

      toggleLock(id) {
        const canvas = c();
        const o = findById(id);
        if (!o) return;
        const lock = !isLocked(o);
        o.set({ selectable: !lock, evented: !lock, hasControls: !lock, lockMovementX: lock, lockMovementY: lock });
        if (lock && canvas.getActiveObjects().includes(o)) canvas.discardActiveObject();
        canvas.requestRenderAll();
        commit();
        emitSelection();
      },

      removeLayer(id) {
        const canvas = c();
        const o = findById(id);
        if (!o) return;
        if (canvas.getActiveObjects().includes(o)) canvas.discardActiveObject();
        canvas.remove(o);
        canvas.requestRenderAll();
        commit();
        emitSelection();
      },

      renameLayer(id, name) {
        const o = findById(id);
        if (!o) return;
        meta(o).name = name.trim() || undefined;
        commit();
        emitSelection();
      },

      async undo() {
        const h = propsRef.current.history;
        commit(); // flush any pending debounced change first
        if (h.index <= 0) return;
        h.index--;
        await restore(h.stack[h.index]);
      },

      async redo() {
        const h = propsRef.current.history;
        if (h.index >= h.stack.length - 1) return;
        h.index++;
        await restore(h.stack[h.index]);
      },

      isEditingText() {
        const o = fcRef.current?.getActiveObject() as IText | undefined;
        return !!o && 'isEditing' in o && !!o.isEditing;
      },

      hasSelection() {
        return !!fcRef.current?.getActiveObject();
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ppi, zone]);

  useImperativeHandle(ref, () => api, [api]);

  /* ---------- keyboard shortcuts (only the mounted canvas listens) ---------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTypingTarget(e.target) || !fcRef.current || api.isEditingText()) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') {
        e.preventDefault();
        void (e.shiftKey ? api.redo() : api.undo());
      } else if (mod && key === 'y') {
        e.preventDefault();
        void api.redo();
      } else if (mod && key === 'd') {
        e.preventDefault();
        void api.duplicateSelected();
      } else if (!mod && (key === 'delete' || key === 'backspace') && api.hasSelection()) {
        e.preventDefault();
        api.deleteSelected();
      } else if (!mod && key.startsWith('arrow') && api.hasSelection()) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        api.nudge(
          key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0,
          key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0,
        );
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [api]);

  return (
    <div className="relative" style={{ width: zone.w, height: zone.h }}>
      <div ref={hostRef} className="absolute inset-0" />
      {guides.v && (
        <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-pink-500 shadow-[0_0_6px_#ec4899]" />
      )}
      {guides.h && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-pink-500 shadow-[0_0_6px_#ec4899]" />
      )}
    </div>
  );
});

/**
 * Memoized: `initialJSON` is ignored for prop comparison (it's only read on mount and changes on every
 * commit), so routine design edits never re-render the canvas wrapper. All callbacks must be stable.
 */
export const DesignCanvas = memo(DesignCanvasInner, (a, b) => {
  for (const k of Object.keys(b) as Array<keyof Props>) {
    if (k === 'initialJSON') continue;
    if (a[k] !== b[k]) return false;
  }
  return true;
});
