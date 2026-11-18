import { memo, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ImagePlus, Trash2, Upload, X } from 'lucide-react';
import type { CustomGarmentRecord, PrintZone, TintMode } from '../types';
import { GARMENT_H, GARMENT_W } from '../data/garments';
import { PhotoGarmentSVG } from './GarmentTemplates';
import { newCustomGarmentId } from '../utils/storage';

interface Props {
  open: boolean;
  /** Present when editing an existing custom blank. */
  initial: CustomGarmentRecord | null;
  color: string;
  onSave(record: CustomGarmentRecord): void;
  onClose(): void;
  onError(msg: string): void;
}

type SideId = 'front' | 'back';
interface Side {
  image: string | null;
  zone: { x: number; y: number; w: number; h: number };
  widthIn: number;
}

const SCALE = 0.64; // editor preview scale of the 500 × 560 garment space
const MIN = 24;
const MAX_IMAGE_PX = 1400;
const TINTS: Array<{ id: TintMode; label: string; hint: string }> = [
  { id: 'multiply', label: 'Multiply', hint: 'Best for white or light blanks – keeps shadows and texture' },
  { id: 'overlay', label: 'Overlay', hint: 'Keeps highlights; good for mid-tone photos' },
  { id: 'none', label: 'No tint', hint: 'Show the photo as uploaded' },
];

const defaultSide = (): Side => ({ image: null, zone: { x: 150, y: 140, w: 200, h: 240 }, widthIn: 10 });

/** Reads an image file, downscaling large photos so drafts and IndexedDB stay light. Keeps transparency (PNG). */
async function readImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const s = Math.min(1, MAX_IMAGE_PX / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * s);
    c.height = Math.round(img.naturalHeight * s);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL(file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.92);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function ZoneEditor({ side, color, tint, onChange }: { side: Side; color: string; tint: TintMode; onChange(z: Side['zone']): void }) {
  const drag = useRef<{ mode: string; sx: number; sy: number; z: Side['zone'] } | null>(null);
  const z = side.zone;

  const start = (mode: string) => (e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    drag.current = { mode, sx: e.clientX, sy: e.clientY, z: { ...z } };
    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = (ev.clientX - d.sx) / SCALE;
      const dy = (ev.clientY - d.sy) / SCALE;
      let { x, y, w, h } = d.z;
      if (d.mode === 'move') {
        x = Math.min(Math.max(0, x + dx), GARMENT_W - w);
        y = Math.min(Math.max(0, y + dy), GARMENT_H - h);
      } else {
        if (d.mode.includes('w')) {
          const nx = Math.min(Math.max(0, x + dx), x + w - MIN);
          w += x - nx;
          x = nx;
        }
        if (d.mode.includes('e')) w = Math.min(Math.max(MIN, w + dx), GARMENT_W - x);
        if (d.mode.includes('n')) {
          const ny = Math.min(Math.max(0, y + dy), y + h - MIN);
          h += y - ny;
          y = ny;
        }
        if (d.mode.includes('s')) h = Math.min(Math.max(MIN, h + dy), GARMENT_H - y);
      }
      onChange({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
    };
    const up = () => {
      drag.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div
      className="lc-stage relative shrink-0 overflow-hidden rounded-xl border border-white/10"
      style={{ width: GARMENT_W * SCALE, height: GARMENT_H * SCALE }}
    >
      {side.image && <PhotoGarmentSVG image={side.image} color={color} tint={tint} uid="cge" className="absolute inset-0" />}
      <div
        onPointerDown={start('move')}
        className="absolute cursor-move touch-none border-2 border-dashed border-violet-400 bg-violet-500/15"
        style={{ left: z.x * SCALE, top: z.y * SCALE, width: z.w * SCALE, height: z.h * SCALE }}
      >
        <span className="pointer-events-none absolute left-1 top-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-200 drop-shadow">Print area</span>
        {(['nw', 'ne', 'sw', 'se'] as const).map((h) => (
          <span
            key={h}
            onPointerDown={start(h)}
            className="absolute h-3 w-3 touch-none rounded-full border-2 border-[#141418] bg-violet-400"
            style={{
              left: h.includes('w') ? -6 : undefined,
              right: h.includes('e') ? -6 : undefined,
              top: h.includes('n') ? -6 : undefined,
              bottom: h.includes('s') ? -6 : undefined,
              cursor: h === 'nw' || h === 'se' ? 'nwse-resize' : 'nesw-resize',
            }}
          />
        ))}
      </div>
    </div>
  );
}

export const CustomGarmentEditor = memo(function CustomGarmentEditor({ open, initial, color, onSave, onClose, onError }: Props) {
  const [name, setName] = useState('');
  const [tint, setTint] = useState<TintMode>('multiply');
  const [sides, setSides] = useState<Record<SideId, Side>>({ front: defaultSide(), back: defaultSide() });
  const [active, setActive] = useState<SideId>('front');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setActive('front');
    if (initial) {
      setName(initial.name);
      setTint(initial.tint);
      const next = { front: defaultSide(), back: defaultSide() };
      for (const v of initial.views) {
        if (v.id !== 'front' && v.id !== 'back') continue;
        next[v.id] = { image: v.image, zone: { x: v.zone.x, y: v.zone.y, w: v.zone.w, h: v.zone.h }, widthIn: v.zone.widthIn };
      }
      setSides(next);
    } else {
      setName('');
      setTint('multiply');
      setSides({ front: defaultSide(), back: defaultSide() });
    }
  }, [open, initial]);

  if (!open) return null;

  const side = sides[active];
  const heightIn = +((side.zone.h * side.widthIn) / side.zone.w).toFixed(2);
  const update = (patch: Partial<Side>) => setSides((s) => ({ ...s, [active]: { ...s[active], ...patch } }));

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return onError('Upload a PNG, JPG or WebP flat-lay image.');
    try {
      update({ image: await readImage(file) });
    } catch {
      onError(`Couldn't read ${file.name}.`);
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const save = () => {
    if (!name.trim()) return onError('Give your custom garment a name.');
    if (!sides.front.image) return onError('Upload at least a front flat-lay image.');
    const views: CustomGarmentRecord['views'] = [];
    for (const id of ['front', 'back'] as const) {
      const s = sides[id];
      if (!s.image) continue;
      const z: PrintZone = {
        ...s.zone,
        widthIn: s.widthIn,
        heightIn: +((s.zone.h * s.widthIn) / s.zone.w).toFixed(2),
        placement: `Custom ${id} print area`,
      };
      views.push({ id, label: id === 'front' ? 'Front' : 'Back', image: s.image, zone: z });
    }
    onSave({ id: initial?.id ?? newCustomGarmentId(), name: name.trim().slice(0, 40), tint, views, createdAt: initial?.createdAt ?? Date.now() });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Custom garment" className="flex max-h-full w-full max-w-[760px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#111114] shadow-2xl">
        <header className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-3.5">
          <ImagePlus size={18} className="text-violet-400" />
          <div className="mr-auto">
            <h2 className="text-sm font-semibold text-zinc-100">{initial ? 'Edit custom garment' : 'Add custom garment'}</h2>
            <p className="text-[11px] text-zinc-500">Upload flat-lay photos, then drag the print area onto the garment</p>
          </div>
          <button onClick={onClose} className="lc-btn h-8 w-8 p-0" title="Close">
            <X size={15} />
          </button>
        </header>

        <div className="lc-scroll flex flex-1 flex-col gap-5 overflow-y-auto p-5 sm:flex-row">
          <div className="flex flex-col gap-2">
            <div className="flex gap-1 rounded-lg bg-black/30 p-1">
              {(['front', 'back'] as const).map((id) => (
                <button
                  key={id}
                  onClick={() => setActive(id)}
                  className={`flex-1 rounded-md py-1.5 text-xs font-medium capitalize transition ${active === id ? 'bg-zinc-700/80 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
                >
                  {id}
                  {id === 'back' && !sides.back.image && <span className="ml-1 text-zinc-500">(optional)</span>}
                </button>
              ))}
            </div>
            <ZoneEditor side={side} color={color} tint={tint} onChange={(zone) => update({ zone })} />
          </div>

          <div className="min-w-0 flex-1 space-y-4">
            <label className="block text-[11px] text-zinc-400">
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Heavyweight Raglan" className="lc-input mt-1 w-full" />
            </label>

            <div>
              <span className="text-[11px] text-zinc-400">{active === 'front' ? 'Front' : 'Back'} flat-lay image</span>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
              <div className="mt-1 flex gap-2">
                <button
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    upload(e.dataTransfer.files[0]);
                  }}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 px-3 py-3 text-xs text-zinc-300 transition hover:border-violet-500/50 hover:bg-violet-500/[0.05]"
                >
                  <Upload size={14} /> {side.image ? 'Replace image' : 'Upload PNG / JPG'}
                </button>
                {side.image && active === 'back' && (
                  <button onClick={() => update({ image: null })} className="lc-btn px-3" title="Remove back view">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              <p className="mt-1.5 text-[10.5px] leading-relaxed text-zinc-500">
                A white or light garment on a transparent background (PNG) tints best. Photos with a background get tinted edge to edge.
              </p>
            </div>

            <div>
              <span className="text-[11px] text-zinc-400">Color tint</span>
              <div className="mt-1 grid grid-cols-3 gap-1.5">
                {TINTS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTint(t.id)}
                    title={t.hint}
                    className={`rounded-md border px-2 py-1.5 text-xs transition ${tint === t.id ? 'border-violet-500/70 bg-violet-500/15 text-violet-200' : 'border-white/[0.08] text-zinc-400 hover:text-zinc-200'}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[10.5px] text-zinc-500">{TINTS.find((t) => t.id === tint)?.hint}. Preview uses the current garment color.</p>
            </div>

            <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{active} print area</span>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <label className="text-[11px] text-zinc-400">
                  Real width (in)
                  <input
                    type="number"
                    min={0.5}
                    max={40}
                    step={0.25}
                    value={side.widthIn}
                    onChange={(e) => update({ widthIn: Math.max(0.5, Number(e.target.value) || 0.5) })}
                    className="lc-input mt-1 w-full"
                  />
                </label>
                <div className="text-[11px] text-zinc-400">
                  Height (in)
                  <div className="mt-1 rounded-md border border-white/5 bg-black/20 px-2.5 py-1.5 font-mono text-sm text-zinc-200">{heightIn}</div>
                </div>
              </div>
              <p className="mt-2 text-[10.5px] text-zinc-500">
                Drag the box to move it and the corner dots to resize. Height follows the box's proportions so artwork prints at true size.
              </p>
            </div>
          </div>
        </div>

        <footer className="flex justify-end gap-2 border-t border-white/[0.06] px-5 py-3">
          <button onClick={onClose} className="lc-btn h-9 px-4 text-xs">
            Cancel
          </button>
          <button onClick={save} className="lc-btn-primary h-9 px-4 text-xs">
            {initial ? 'Save changes' : 'Add garment'}
          </button>
        </footer>
      </div>
    </div>
  );
});
