import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import {
  Box,
  Camera,
  Download,
  ImagePlus,
  Loader2,
  Pause,
  PersonStanding,
  Play,
  Shirt,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { BODY_PRESETS, MEASUREMENTS, type BodyParams, type BodyType, type MeasurementKey } from '../mannequin/anatomy';
import type { GarmentKind, LogoPlacement } from '../mannequin/garmentOverlay';
import { useGlbModel } from '../mannequin/glbModel';
import type { BodyMode } from '../mannequin/mannequinMesh';
import { SURFACES, sampleLogoCanvas, type SurfaceId } from '../mannequin/materials';
import { MannequinStudio, type CameraView } from '../mannequin/studio';

interface Props {
  /** Starting garment colour for the overlay (e.g. the studio's current garment colour). */
  initialColor?: string;
  onClose?: () => void;
}

const VIEWS: Array<{ id: CameraView; label: string }> = [
  { id: 'full', label: 'Full View' },
  { id: 'front', label: 'Front' },
  { id: 'back', label: 'Back' },
  { id: 'threeQuarter', label: '3/4 Angle' },
  { id: 'collar', label: 'Collar & Chest' },
];

const SWATCHES = ['#f4f1ea', '#141416', '#2f4b8f', '#8c1d2c', '#2f5a3a', '#c8a978', '#9aa0a8', '#e2662d'];

interface LogoState {
  texture: THREE.Texture;
  aspect: number;
  name: string;
  url: string | null;
}

function Panel({ title, icon, children, className = '' }: { title: string; icon: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`lc-scroll overflow-y-auto rounded-xl border border-white/10 bg-[#111114]/88 p-3 shadow-2xl shadow-black/40 backdrop-blur-md ${className}`}>
      <h2 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
        <span className="text-violet-400">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <div className="mb-1.5 mt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 first:mt-0">{children}</div>;
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Array<{ id: T; label: string }>; onChange(v: T): void }) {
  return (
    <div className="grid gap-1 rounded-lg bg-black/30 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={`rounded-md px-1.5 py-1.5 text-[11px] leading-tight transition ${value === o.id ? 'bg-violet-500 text-white' : 'text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Slider({ label, value, min, max, step = 0.5, unit, onChange, hint }: { label: string; value: number; min: number; max: number; step?: number; unit: string; hint?: string; onChange(v: number): void }) {
  return (
    <label className="mb-2.5 block">
      <div className="mb-1 flex items-baseline justify-between text-[11.5px]">
        <span className="text-zinc-300">{label}</span>
        <span className="tabular-nums text-zinc-400">
          {value.toFixed(step < 1 ? 1 : 0)} {unit}
          {hint && <span className="ml-1 text-zinc-600">{hint}</span>}
        </span>
      </div>
      <input type="range" className="lc-range w-full" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export default function MannequinViewport({ initialColor = '#2f4b8f', onClose }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const studioRef = useRef<MannequinStudio | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const [bodyType, setBodyType] = useState<BodyType>('male');
  const [params, setParams] = useState<BodyParams>(BODY_PRESETS.male.params);
  const [mode, setMode] = useState<BodyMode>('full');
  const [surface, setSurface] = useState<SurfaceId>('fiberglass');
  const [view, setView] = useState<CameraView>('full');
  const [garment, setGarment] = useState<GarmentKind | null>('tee');
  const [color, setColor] = useState(initialColor);
  const [logo, setLogo] = useState<LogoState | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [placement, setPlacement] = useState<LogoPlacement>({ side: 'front', widthCm: 20, belowCollarCm: 8 });
  const [override, setOverride] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'body' | 'garment' | null>(null);
  const glb = useGlbModel();
  const fileRef = useRef<HTMLInputElement>(null);
  const glbRef = useRef<HTMLInputElement>(null);

  // ------------------------------------------------------------------ studio lifecycle
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let studio: MannequinStudio;
    try {
      studio = new MannequinStudio(host, BODY_PRESETS.male.params);
    } catch (err) {
      setFailed(err instanceof Error ? err.message : 'WebGL is not available in this browser.');
      return;
    }
    studioRef.current = studio;
    return () => {
      studioRef.current = null;
      studio.dispose();
    };
  }, []);

  // the default sample graphic, so placement is visible before any upload
  useEffect(() => {
    const tex = new THREE.CanvasTexture(sampleLogoCanvas());
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    setLogo({ texture: tex, aspect: 1, name: 'Sample graphic', url: null });
  }, []);

  // own the logo texture: dispose it (and revoke its object URL) when replaced or on unmount
  useEffect(() => {
    if (!logo) return;
    return () => {
      logo.texture.dispose();
      if (logo.url) URL.revokeObjectURL(logo.url);
    };
  }, [logo]);

  useEffect(() => studioRef.current?.setBody(params), [params]);
  useEffect(() => {
    studioRef.current?.setMode(mode);
    studioRef.current?.snapTo(view);
    // re-frame only when the mode changes (the current view is read, not tracked)
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => studioRef.current?.setSurface(surface), [surface]);
  useEffect(() => studioRef.current?.setGarment(garment), [garment]);
  useEffect(() => studioRef.current?.setGarmentColor(color), [color]);
  useEffect(() => studioRef.current?.setLogo(logo?.texture ?? null, logo?.aspect ?? 1), [logo]);
  useEffect(() => studioRef.current?.setLogoPlacement(placement), [placement]);
  useEffect(() => {
    studioRef.current?.setExternalModel(glb.model);
    setPlaying(false);
  }, [glb.model]);
  useEffect(() => studioRef.current?.setExternalMaterialOverride(override), [override]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // ------------------------------------------------------------------ handlers
  const choosePreset = (t: BodyType) => {
    setBodyType(t);
    setParams({ ...BODY_PRESETS[t].params });
  };
  const setMeasurement = (k: MeasurementKey, v: number) => setParams((p) => ({ ...p, [k]: v }));
  const snap = (v: CameraView) => {
    setView(v);
    studioRef.current?.snapTo(v);
  };

  const uploadLogo = useCallback(async (file: File) => {
    setLogoError(null);
    const url = URL.createObjectURL(file);
    try {
      const tex = await new THREE.TextureLoader().loadAsync(url);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      const img = tex.image as { width: number; height: number };
      setLogo({ texture: tex, aspect: img.width / Math.max(1, img.height), name: file.name, url });
    } catch {
      URL.revokeObjectURL(url);
      setLogoError(`Couldn't read ${file.name} as an image.`);
    }
  }, []);

  const downloadSnapshot = () => {
    const data = studioRef.current?.snapshot();
    if (!data) return;
    const a = document.createElement('a');
    a.href = data;
    a.download = 'mannequin.png';
    a.click();
  };

  const external = !!glb.model;

  // ------------------------------------------------------------------ panels
  const bodyPanel = (
    <Panel title="Mannequin" icon={<PersonStanding size={13} />} className="max-h-full">
      <Label>Form</Label>
      <Segmented<BodyMode>
        value={mode}
        onChange={setMode}
        options={[
          { id: 'full', label: 'Full-Body Mannequin' },
          { id: 'dressform', label: 'Torso Dress Form' },
        ]}
      />

      <Label>Body type</Label>
      <Segmented<BodyType>
        value={bodyType}
        onChange={choosePreset}
        options={(Object.keys(BODY_PRESETS) as BodyType[]).map((id) => ({ id, label: BODY_PRESETS[id].label }))}
      />

      <Label>Measurements</Label>
      {MEASUREMENTS.map((m) => (
        <Slider
          key={m.key}
          label={m.label}
          value={params[m.key]}
          min={m.min}
          max={m.max}
          unit="cm"
          hint={`${(params[m.key] / 2.54).toFixed(1)}″`}
          onChange={(v) => setMeasurement(m.key, v)}
        />
      ))}
      {external && <p className="-mt-1 mb-2 text-[10.5px] leading-snug text-zinc-500">An imported model only follows Height (it is scaled to fit).</p>}

      <Label>Surface</Label>
      <div className="grid grid-cols-2 gap-1.5">
        {SURFACES.map((s) => (
          <button
            key={s.id}
            onClick={() => setSurface(s.id)}
            title={s.note}
            aria-pressed={surface === s.id}
            className={`flex items-center gap-2 rounded-lg border p-1.5 text-left text-[11px] leading-tight transition ${surface === s.id ? 'border-violet-500/70 bg-violet-500/10 text-violet-100' : 'border-white/10 text-zinc-400 hover:border-white/20 hover:text-zinc-200'}`}
          >
            <span className="h-6 w-6 shrink-0 rounded-full border border-white/15 shadow-inner" style={{ background: `radial-gradient(circle at 35% 30%, #ffffff55, ${s.swatch} 55%)` }} />
            {s.label}
          </button>
        ))}
      </div>

      <Label>Model</Label>
      {!glb.model ? (
        <>
          <button onClick={() => glbRef.current?.click()} className="lc-btn h-8 w-full justify-center gap-1.5 text-xs" disabled={glb.status === 'loading'}>
            {glb.status === 'loading' ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {glb.status === 'loading' ? `Loading… ${Math.round(glb.progress * 100)}%` : 'Load .glb mannequin'}
          </button>
          <p className="mt-1.5 text-[10.5px] leading-snug text-zinc-500">Rigged or static .glb / .gltf from Blender, CLO3D and others. Draco and Meshopt compression supported.</p>
          {glb.error && <p className="mt-1.5 text-[11px] text-rose-400">Couldn't load that model: {glb.error}</p>}
        </>
      ) : (
        <div className="rounded-lg bg-black/25 p-2 text-[11px]">
          <div className="flex items-center gap-2">
            <Box size={13} className="shrink-0 text-violet-400" />
            <span className="min-w-0 flex-1 truncate text-zinc-200">{glb.model.name}</span>
            <button onClick={glb.clear} className="text-zinc-500 hover:text-rose-300" title="Remove and use the procedural mannequin">
              <Trash2 size={13} />
            </button>
          </div>
          <p className="mt-1 text-zinc-500">
            {glb.model.stats.meshes} meshes · {glb.model.stats.triangles.toLocaleString()} triangles{glb.model.stats.skinned ? ' · rigged' : ''}
          </p>
          <label className="mt-2 flex items-center gap-2 text-zinc-300">
            <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} className="accent-violet-500" />
            Use the studio surface
          </label>
          {glb.model.animations.length > 0 && (
            <button onClick={() => setPlaying(studioRef.current?.toggleAnimation() ?? false)} className="lc-btn mt-2 h-7 gap-1.5 px-2 text-[11px]">
              {playing ? <Pause size={12} /> : <Play size={12} />} {playing ? 'Pause' : 'Play'} “{glb.model.animations[0].name || 'animation'}”
            </button>
          )}
        </div>
      )}
      <input
        ref={glbRef}
        type="file"
        accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) glb.load(f);
          e.target.value = '';
        }}
      />
    </Panel>
  );

  const garmentPanel = (
    <Panel title="Garment test" icon={<Shirt size={13} />} className="max-h-full">
      <Segmented<'none' | GarmentKind>
        value={garment ?? 'none'}
        onChange={(v) => setGarment(v === 'none' ? null : v)}
        options={[
          { id: 'none', label: 'Off' },
          { id: 'tee', label: 'Fitted Tee' },
          { id: 'hoodie', label: 'Hoodie' },
        ]}
      />
      {external && garment && <p className="mt-2 text-[10.5px] leading-snug text-zinc-500">The test garment is fitted to the procedural mannequin, so it's hidden while an imported model is shown.</p>}

      <div className={garment ? '' : 'pointer-events-none opacity-40'}>
        <Label>Fabric colour</Label>
        <div className="flex flex-wrap items-center gap-1.5">
          {SWATCHES.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              title={c}
              className={`h-6 w-6 rounded-full border transition ${color.toLowerCase() === c ? 'border-violet-400 ring-2 ring-violet-500/50' : 'border-white/15 hover:scale-110'}`}
              style={{ background: c }}
            />
          ))}
          <label className="relative h-6 w-6 cursor-pointer overflow-hidden rounded-full border border-dashed border-white/30" title="Custom colour">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
            <span className="grid h-full w-full place-items-center text-[13px] leading-none text-zinc-300">+</span>
          </label>
          <span className="ml-auto font-mono text-[11px] uppercase text-zinc-500">{color}</span>
        </div>

        <Label>Graphic</Label>
        <div className="flex items-center gap-2">
          <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/10 bg-[repeating-conic-gradient(#2a2a30_0%_25%,#1c1c21_0%_50%)] bg-[length:10px_10px]">
            {logo?.url ? <img src={logo.url} alt="" className="max-h-full max-w-full object-contain" /> : <ImagePlus size={16} className="text-zinc-500" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11.5px] text-zinc-200">{logo?.name ?? 'No graphic'}</div>
            <div className="mt-1 flex gap-1.5">
              <button onClick={() => fileRef.current?.click()} className="lc-btn h-7 gap-1 px-2 text-[11px]">
                <Upload size={12} /> Upload
              </button>
              {logo && (
                <button onClick={() => setLogo(null)} className="lc-btn h-7 px-2 text-[11px]" title="Remove the graphic">
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          </div>
        </div>
        {logoError && <p className="mt-1.5 text-[11px] text-rose-400">{logoError}</p>}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadLogo(f);
            e.target.value = '';
          }}
        />

        <div className={logo ? 'mt-3' : 'pointer-events-none mt-3 opacity-40'}>
          <Segmented<'front' | 'back'>
            value={placement.side}
            onChange={(side) => setPlacement((p) => ({ ...p, side }))}
            options={[
              { id: 'front', label: 'Front' },
              { id: 'back', label: 'Back' },
            ]}
          />
          <div className="mt-3">
            <Slider label="Print width" value={placement.widthCm} min={5} max={34} unit="cm" onChange={(widthCm) => setPlacement((p) => ({ ...p, widthCm }))} />
            <Slider label="Below collar" value={placement.belowCollarCm} min={2} max={34} unit="cm" onChange={(belowCollarCm) => setPlacement((p) => ({ ...p, belowCollarCm }))} />
          </div>
        </div>
      </div>
    </Panel>
  );

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[radial-gradient(ellipse_at_50%_38%,#2a2a31_0%,#141417_55%,#0a0a0c_100%)] text-zinc-200">
      <div ref={hostRef} className="absolute inset-0" />

      {failed && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-zinc-400">
          <div>
            <p className="mb-1 text-zinc-200">The 3D viewport couldn't start.</p>
            <p>{failed}</p>
          </div>
        </div>
      )}

      {/* top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3 sm:p-4">
        <div className="pointer-events-auto rounded-xl border border-white/10 bg-[#111114]/80 px-3 py-2 backdrop-blur-md">
          <div className="whitespace-nowrap text-[13px] font-semibold text-zinc-100">Mannequin Studio</div>
          <div className="hidden text-[11px] text-zinc-500 sm:block">Drag to orbit · right-drag to pan · scroll to zoom</div>
        </div>
        <div className="pointer-events-auto flex items-center gap-1.5">
          <button onClick={() => setMobilePanel((p) => (p === 'body' ? null : 'body'))} className="lc-btn h-8 gap-1.5 px-2.5 text-xs lg:hidden" aria-pressed={mobilePanel === 'body'}>
            <SlidersHorizontal size={13} /> Body
          </button>
          <button onClick={() => setMobilePanel((p) => (p === 'garment' ? null : 'garment'))} className="lc-btn h-8 gap-1.5 px-2.5 text-xs lg:hidden" aria-pressed={mobilePanel === 'garment'}>
            <Shirt size={13} /> Garment
          </button>
          <button onClick={downloadSnapshot} className="lc-btn h-8 gap-1.5 px-2.5 text-xs" title="Save a PNG of this view">
            <Camera size={13} /> <span className="hidden sm:inline">Snapshot</span>
            <Download size={12} className="sm:hidden" />
          </button>
          {onClose && (
            <button onClick={onClose} className="lc-btn h-8 w-8 p-0" title="Close (Esc)">
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {/* desktop panels */}
      <div className="pointer-events-none absolute bottom-20 left-4 top-20 hidden w-[290px] flex-col lg:flex">
        <div className="pointer-events-auto flex min-h-0 flex-col">{bodyPanel}</div>
      </div>
      <div className="pointer-events-none absolute bottom-20 right-4 top-20 hidden w-[270px] flex-col lg:flex">
        <div className="pointer-events-auto flex min-h-0 flex-col">{garmentPanel}</div>
      </div>

      {/* small screens: one panel at a time */}
      {mobilePanel && (
        <div className="absolute inset-x-4 bottom-20 top-[4.5rem] flex flex-col lg:hidden">
          <div className="flex min-h-0 flex-col">{mobilePanel === 'body' ? bodyPanel : garmentPanel}</div>
        </div>
      )}

      {/* camera snaps */}
      <div className="absolute inset-x-0 bottom-4 flex justify-center px-4">
        <div className="lc-scroll flex max-w-full gap-1 overflow-x-auto rounded-xl border border-white/10 bg-[#111114]/85 p-1 backdrop-blur-md">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => snap(v.id)}
              aria-pressed={view === v.id}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs transition ${view === v.id ? 'bg-violet-500 text-white' : 'text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100'}`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
