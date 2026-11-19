import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Box, Camera, Check, ChevronUp, Film, Layers, Loader2, Pause, Play, PersonStanding, RotateCcw, Scissors, X } from 'lucide-react';
import { getGarment, viewLabel } from '../data/garments';
import { FABRICS, defaultFabricFor, fabricFor } from '../data/fabrics';
import type { GarmentId, ViewDesigns, ViewEffects } from '../types';
import { buildFlatLay, type Built } from '../three/flatLay';
import { buildModelScene, type ModelBuilt } from '../three/modelScene';
import { hasGarmentModel } from '../three/garmentModels';
import SpinMockupPanel, { type SpinRequest } from './SpinMockupPanel';
import { exportSpin, type FrameSource } from '../utils/spinMockup';

/* ================================================================================================
 * 360° viewer. Two modes:
 *  - "3D model": a procedural garment on a mannequin (three/garmentModels), with the artwork of every
 *    view projected onto its print zone at true size, trims, and a fabric look (three/fabricMaterials).
 *  - "Flat-lay": the 2D drawings inflated into 3D (three/flatLay) — exact to the mockup; the only mode
 *    for custom photo blanks.
 * The Interior slider is a clipping plane that always faces the camera, cutting away the near half of
 * the garment to reveal the inside from any angle (the mannequin hides while cutting).
 * ============================================================================================== */

interface Props {
  name: string;
  garment: GarmentId;
  color: string;
  designs: ViewDesigns;
  effects: ViewEffects;
  /** Explicit fabric for this garment (null/undefined = the garment's default). */
  fabricId: string | undefined;
  onFabric(id: string | null): void;
  onClose(): void;
  onError(msg: string): void;
}

type Mode = 'model' | 'flat';

const PRESETS: Array<{ id: string; label: string; azimuth: number; polar?: number; cut?: number }> = [
  { id: 'front', label: 'Front', azimuth: 0 },
  { id: 'side', label: 'Side', azimuth: Math.PI / 2 },
  { id: 'back', label: 'Back', azimuth: Math.PI },
  { id: 'inside', label: 'Inside', azimuth: 0.5, polar: 1.05, cut: 0.85 },
];

interface Fit {
  center: THREE.Vector3;
  size: THREE.Vector3;
  dist: number;
  halfX: number;
  halfZ: number;
}

/** Camera distance that fits the framing box for this camera's fov and aspect. */
function fitDistance(size: THREE.Vector3, camera: THREE.PerspectiveCamera) {
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  return Math.max(size.y / 2 / Math.tan(vFov / 2), Math.max(size.x, size.z) / 2 / Math.tan(hFov / 2)) * 1.3 + size.z / 2;
}

export default function Garment360({ name, garment, color, designs, effects, fabricId, onFabric, onClose, onError }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const three = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    clip: THREE.Plane;
    keyTarget: THREE.Object3D;
    built: (Built & { mannequin?: THREE.Group | null }) | null;
    builtKey: string;
    fit: Fit | null;
    tween: { from: THREE.Vector3; to: THREE.Vector3; t: number } | null;
    /** Aligns the cutaway plane and mannequin visibility with the camera; returns the view angle in degrees. */
    syncView(): number;
  } | null>(null);
  /** While a 360° mockup renders, the live loop pauses so it doesn't fight over the camera. */
  const capturing = useRef(false);
  const canModel = hasGarmentModel(garment);
  const [mode, setMode] = useState<Mode>(canModel ? 'model' : 'flat');
  const effectiveMode: Mode = canModel ? mode : 'flat';
  const [loading, setLoading] = useState(true);
  const [spin, setSpin] = useState(true);
  const [cut, setCut] = useState(0);
  const [angle, setAngle] = useState(0);
  const [showMannequin, setShowMannequin] = useState(true);
  const [fabricOpen, setFabricOpen] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  const [mockOpen, setMockOpen] = useState(false);
  const [spinJob, setSpinJob] = useState<{ running: boolean; progress: number; label: string; done: { filename: string; bytes: number } | null }>({
    running: false,
    progress: 0,
    label: '',
    done: null,
  });
  const spinAbort = useRef<AbortController | null>(null);
  const cutRef = useRef(cut);
  cutRef.current = cut;
  const mannequinRef = useRef(showMannequin);
  mannequinRef.current = showMannequin;

  const fabric = fabricFor(fabricId ? { [garment]: fabricId } : undefined, garment);
  const defaultFabric = defaultFabricFor(garment);

  /* ---------- scene setup (once) ---------- */
  useEffect(() => {
    const host = hostRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.localClippingEnabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping; // keeps garment colors close to their hex
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);
    renderer.domElement.className = 'absolute inset-0 h-full w-full cursor-grab active:cursor-grabbing';

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    scene.environment = pmrem.fromScene(room, 0.04).texture;
    scene.environmentIntensity = 0.25;
    room.dispose();

    const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 600);
    camera.position.set(0, 45, 90);
    scene.add(camera);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x2a2a33, 0.4));
    const keyTarget = new THREE.Object3D();
    scene.add(keyTarget);
    // key light rides with the camera (the side facing the viewer is always lit) and casts soft shadows
    const key = new THREE.DirectionalLight(0xffffff, 2.6);
    key.position.set(70, 50, 10); // from the upper side, so folds and curves read
    key.target = keyTarget;
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = key.shadow.camera.bottom = -40;
    key.shadow.camera.right = key.shadow.camera.top = 40;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 300;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.04;
    key.shadow.radius = 4;
    camera.add(key);
    const rim = new THREE.DirectionalLight(0xc4b5fd, 0.7);
    rim.position.set(-60, 40, -80);
    scene.add(rim);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minPolarAngle = 0.15;
    controls.maxPolarAngle = Math.PI - 0.15;
    controls.autoRotateSpeed = 2.2;
    controls.addEventListener('start', () => {
      if (three.current) three.current.tween = null;
    });

    const clip = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1e4);
    const dir = new THREE.Vector3();
    const syncView = () => {
      const st = three.current!;
      // camera-facing cutaway: remove everything nearer to the camera than `k`
      dir.copy(camera.position).sub(controls.target);
      dir.y = 0;
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
      dir.normalize();
      const fit = st.fit;
      const extent = fit ? Math.abs(dir.x) * fit.halfX + Math.abs(dir.z) * fit.halfZ : 10;
      const c = cutRef.current;
      const ox = fit ? fit.center.x * -dir.x + fit.center.z * -dir.z : 0;
      clip.normal.set(-dir.x, 0, -dir.z);
      clip.constant = c <= 0 ? 1e4 : extent * (1 - c) + 0.05 - c * 0.2 - ox;
      if (st.built?.mannequin) st.built.mannequin.visible = mannequinRef.current && c <= 0;
      return Math.round(((THREE.MathUtils.radToDeg(Math.atan2(dir.x, dir.z)) % 360) + 360) % 360);
    };
    three.current = { renderer, scene, camera, controls, clip, keyTarget, built: null, builtKey: '', fit: null, tween: null, syncView };

    const resize = () => {
      // an export owns the renderer size; end() re-applies the host size afterwards
      if (capturing.current) return;
      const w = host.clientWidth;
      const h = host.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    let raf = 0;
    let lastAngle = 999;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (capturing.current) return;
      const st = three.current!;
      if (st.tween) {
        st.tween.t = Math.min(1, st.tween.t + 0.045);
        const e = 1 - Math.pow(1 - st.tween.t, 3);
        const off = st.tween.from.clone().lerp(st.tween.to, e);
        off.setLength(st.tween.from.length() + (st.tween.to.length() - st.tween.from.length()) * e);
        camera.position.copy(controls.target).add(off);
        if (st.tween.t >= 1) st.tween = null;
      }
      controls.update();
      keyTarget.position.copy(controls.target);
      const deg = st.syncView();
      if (deg !== lastAngle) {
        lastAngle = deg;
        setAngle(deg);
      }
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      three.current?.built?.dispose();
      scene.environment?.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss(); // free the GL context right away (browsers cap live contexts)
      renderer.domElement.remove();
      three.current = null;
    };
  }, []);

  useEffect(() => {
    if (three.current) three.current.controls.autoRotate = spin;
  }, [spin]);

  // closing the preview (from anywhere in the app) cancels a running export
  useEffect(() => () => spinAbort.current?.abort(), []);

  /* ---------- (re)build when the design, fabric or mode changes ---------- */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const tools = await import('../utils/exportTools');
        const st = three.current;
        if (cancelled || !st) return;
        let built: (Built & { mannequin?: THREE.Group | null }) | null = null;
        let missingViews: string[] = [];
        if (effectiveMode === 'model') {
          const prints = await tools.buildPrintTextures({ garment, designs, effects }, 48);
          if (cancelled) return;
          const m: ModelBuilt | null = buildModelScene(garment, color, fabric, prints, effects, st.clip, mannequinRef.current);
          if (m) {
            built = m;
            missingViews = m.missingViews.map((v) => viewLabel(garment, v));
          }
        }
        if (!built) {
          const tex = await tools.buildTurntableTextures({ garment, color, designs, effects, fabrics: { [garment]: fabric.id } }, 2);
          if (cancelled) return;
          built = buildFlatLay(garment, tex, st.clip, fabric);
        }
        st.scene.add(built.group);
        const prev = st.built;
        if (prev) {
          st.scene.remove(prev.group);
          prev.dispose();
        }
        st.built = built;
        setMissing(missingViews);

        // re-frame only when what we're looking at changes shape (garment / mode), not on edits
        const key = `${garment}|${effectiveMode}`;
        if (key !== st.builtKey) {
          st.builtKey = key;
          const f = built.frame;
          const center = f.getCenter(new THREE.Vector3());
          const size = f.getSize(new THREE.Vector3());
          const dist = fitDistance(size, st.camera);
          st.fit = { center, size, dist, halfX: size.x / 2, halfZ: size.z / 2 };
          st.controls.target.copy(center);
          st.controls.minDistance = dist * 0.35;
          st.controls.maxDistance = dist * 2.4;
          st.camera.position.copy(center).add(new THREE.Vector3(0, dist * 0.08, dist));
          st.controls.update();
        }
      } catch (e) {
        if (!cancelled) onError(`3D preview failed: ${(e as Error).message}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // fabric is derived from fabricId + garment
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [garment, color, designs, effects, fabricId, effectiveMode, onError]);

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [role="dialog"]')) return;
      if (e.key === 'Escape') {
        if (spinJob.running) return;
        if (mockOpen) setMockOpen(false);
        else if (fabricOpen) setFabricOpen(false);
        else onClose();
      } else if (e.key === ' ') {
        e.preventDefault();
        setSpin((s) => !s);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, fabricOpen, mockOpen, spinJob.running]);

  const goTo = useCallback((p: (typeof PRESETS)[number], dist?: number) => {
    const st = three.current;
    if (!st) return;
    setSpin(false);
    if (p.cut != null) setCut(p.cut);
    const from = st.camera.position.clone().sub(st.controls.target);
    const r = dist ?? from.length();
    const polar = p.polar ?? Math.PI / 2 - 0.08;
    const to = new THREE.Vector3().setFromSphericalCoords(r, polar, p.azimuth);
    st.tween = { from, to, t: 0 };
  }, []);

  /* ---------- 360° mockup export ---------- */
  const frameSource = (): FrameSource | null => {
    const st = three.current;
    if (!st || !st.fit) return null;
    const { renderer, camera, controls } = st;
    const fit = st.fit;
    const saved = {
      ratio: renderer.getPixelRatio(),
      size: renderer.getSize(new THREE.Vector2()),
      aspect: camera.aspect,
      position: camera.position.clone(),
      quaternion: camera.quaternion.clone(),
    };
    const target = controls.target.clone();
    const polar = controls.getPolarAngle();
    // keep the user's zoom, refitted to the output's aspect ratio
    const zoom = camera.position.distanceTo(target) / fit.dist;
    const offset = new THREE.Vector3();
    let dist = fit.dist;
    return {
      begin(width, height) {
        capturing.current = true;
        renderer.setPixelRatio(1);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        dist = fitDistance(fit.size, camera) * zoom;
      },
      render(azimuth) {
        offset.setFromSphericalCoords(dist, polar, azimuth);
        camera.position.copy(target).add(offset);
        camera.lookAt(target);
        camera.updateMatrixWorld();
        st.keyTarget.position.copy(target);
        st.syncView();
        renderer.render(st.scene, camera);
        return renderer.domElement;
      },
      end() {
        // the window may have been resized during the export: size to the host as it is now
        const host = hostRef.current;
        const w = host?.clientWidth || saved.size.x;
        const h = host?.clientHeight || saved.size.y;
        renderer.setPixelRatio(saved.ratio);
        renderer.setSize(w, h, false);
        camera.aspect = host ? w / Math.max(1, h) : saved.aspect;
        camera.updateProjectionMatrix();
        camera.position.copy(saved.position);
        camera.quaternion.copy(saved.quaternion);
        controls.update();
        capturing.current = false;
      },
    };
  };

  const startSpin = async (req: SpinRequest) => {
    const source = frameSource();
    if (!source) return;
    const abort = new AbortController();
    spinAbort.current = abort;
    setSpinJob({ running: true, progress: 0, label: 'Preparing', done: null });
    try {
      const { blob, filename } = await exportSpin(source, {
        ...req,
        name,
        signal: abort.signal,
        onProgress: (progress, label) => setSpinJob((j) => ({ ...j, progress, label })),
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setSpinJob({ running: false, progress: 1, label: '', done: { filename, bytes: blob.size } });
    } catch (e) {
      setSpinJob({ running: false, progress: 0, label: '', done: null });
      if ((e as Error).name !== 'AbortError') onError(`360° mockup failed: ${(e as Error).message}`);
    } finally {
      spinAbort.current = null;
    }
  };

  const reset = () => {
    setCut(0);
    goTo(PRESETS[0], three.current?.fit?.dist);
  };

  const snapshot = () => {
    const st = three.current;
    if (!st) return;
    st.renderer.render(st.scene, st.camera);
    st.renderer.domElement.toBlob((b) => {
      if (!b) return;
      const url = URL.createObjectURL(b);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(name || 'loomcraft').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-360-${angle}deg.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, 'image/png');
  };

  return (
    <div className="lc-stage absolute inset-0 z-20 flex flex-col" role="region" aria-label="360 degree garment preview">
      <div ref={hostRef} className="relative min-h-0 flex-1 overflow-hidden" />

      {/* top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3">
        <div className="pointer-events-auto rounded-lg border border-white/10 bg-black/45 px-3 py-2 backdrop-blur">
          <div className="text-xs font-semibold text-zinc-100">
            360° Preview · {getGarment(garment).name} <span className="font-normal text-zinc-400">· {fabric.name}</span>
          </div>
          <div className="text-[10.5px] text-zinc-400">Drag to rotate · scroll to zoom · Space to spin · Esc to close</div>
          {missing.length > 0 && <div className="mt-1 text-[10.5px] text-amber-300/90">Not shown on the 3D model: {missing.join(', ')} (use Flat-lay)</div>}
        </div>
        <div className="pointer-events-auto flex items-center gap-1.5">
          <div className="flex rounded-lg border border-white/10 bg-black/45 p-0.5 backdrop-blur" role="radiogroup" aria-label="Preview mode">
            {(
              [
                ['model', '3D model', <Box key="i" size={13} />],
                ['flat', 'Flat-lay', <Layers key="i" size={13} />],
              ] as const
            ).map(([id, label, icon]) => (
              <button
                key={id}
                role="radio"
                aria-checked={effectiveMode === id}
                disabled={id === 'model' && !canModel}
                onClick={() => setMode(id)}
                title={id === 'model' && !canModel ? 'Custom blanks have no 3D model yet' : undefined}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-40 ${
                  effectiveMode === id ? 'bg-violet-500 text-white' : 'text-zinc-300 hover:text-white'
                }`}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
          <span className="rounded-md border border-white/10 bg-black/45 px-2 py-1 font-mono text-[11px] tabular-nums text-violet-300 backdrop-blur">{angle}°</span>
          <button onClick={snapshot} className="lc-btn h-8 gap-1.5 px-2.5 text-xs" title="Download this angle as PNG">
            <Camera size={14} /> Snapshot
          </button>
          <button
            onClick={() => setMockOpen((o) => !o)}
            disabled={loading && !spinJob.running}
            aria-expanded={mockOpen}
            className={`lc-btn h-8 gap-1.5 px-2.5 text-xs disabled:opacity-50 ${mockOpen ? 'border-violet-500/60 text-violet-200' : ''}`}
            title="Export a spinning 360° mockup: video, GIF, web spin or frames"
          >
            <Film size={14} /> 360° Mockup
          </button>
          <button onClick={onClose} className="lc-btn h-8 w-8 p-0" title="Close 360° preview (Esc)">
            <X size={15} />
          </button>
        </div>
      </div>

      {mockOpen && (
        <SpinMockupPanel
          running={spinJob.running}
          progress={spinJob.progress}
          label={spinJob.label}
          done={spinJob.done}
          onStart={startSpin}
          onCancel={() => spinAbort.current?.abort()}
          onClose={() => setMockOpen(false)}
        />
      )}
      {spinJob.running && (
        // blocks the toolbar and canvas (close, mode, fabric, orbit) while frames render; the panel (z-30) stays usable for Cancel
        <div className="absolute inset-0 z-20 grid place-items-center bg-[#0a0a0c]/70 backdrop-blur-sm">
          <span className="flex items-center gap-2 rounded-lg bg-black/60 px-3 py-2 text-xs text-zinc-200">
            <Loader2 size={14} className="animate-spin text-violet-400" /> Rendering 360° mockup… {Math.round(spinJob.progress * 100)}%
          </span>
        </div>
      )}

      {loading && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="flex items-center gap-2 rounded-lg bg-black/60 px-3 py-2 text-xs text-zinc-200">
            <Loader2 size={14} className="animate-spin text-violet-400" /> Building 3D garment…
          </span>
        </div>
      )}

      {/* fabric picker */}
      {fabricOpen && (
        <div className="absolute bottom-[72px] left-1/2 z-10 w-[min(560px,calc(100%-24px))] -translate-x-1/2 rounded-xl border border-white/10 bg-[#111114]/95 p-2 shadow-2xl backdrop-blur" role="listbox" aria-label="Fabric">
          <div className="lc-scroll grid max-h-[46vh] grid-cols-2 gap-1 overflow-y-auto">
            {FABRICS.map((f) => {
              const active = f.id === fabric.id;
              return (
                <button
                  key={f.id}
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onFabric(f.id === defaultFabric.id ? null : f.id);
                    setFabricOpen(false);
                  }}
                  className={`flex items-start gap-2 rounded-lg px-2.5 py-2 text-left transition ${active ? 'bg-violet-500/15 ring-1 ring-violet-500/50' : 'hover:bg-white/[0.04]'}`}
                >
                  <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center">{active && <Check size={13} className="text-violet-400" />}</span>
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-zinc-100">
                      {f.name}
                      {f.id === defaultFabric.id && <span className="ml-1.5 rounded bg-zinc-800 px-1 text-[9.5px] font-normal text-zinc-400">default</span>}
                    </span>
                    <span className="block text-[10.5px] leading-snug text-zinc-500">
                      {f.gsm ? `${f.gsm} GSM · ` : f.weightNote ? `${f.weightNote} · ` : ''}
                      {f.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="px-2.5 pb-1 pt-2 text-[10.5px] text-zinc-500">Saved with the design. Regenerate the manufacturing spec (Assistant → Specs) to use this fabric’s weight and composition.</p>
        </div>
      )}

      {/* bottom controls */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-[#111114]/90 px-3 py-2 shadow-2xl backdrop-blur">
          <button onClick={() => setSpin((s) => !s)} className={`lc-btn h-8 gap-1.5 px-2.5 text-xs ${spin ? 'text-violet-300' : ''}`} title="Auto-rotate (Space)">
            {spin ? <Pause size={13} /> : <Play size={13} />} {spin ? 'Spinning' : 'Spin'}
          </button>
          <div className="flex gap-1 rounded-lg bg-black/30 p-1">
            {PRESETS.map((p) => (
              <button key={p.id} onClick={() => goTo(p)} className="rounded-md px-2.5 py-1 text-[11px] font-medium text-zinc-300 transition hover:bg-zinc-700/70 hover:text-white">
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setFabricOpen((o) => !o)}
            className={`lc-btn h-8 gap-1.5 px-2.5 text-xs ${fabricOpen ? 'border-violet-500/60 text-violet-200' : ''}`}
            title="Fabric look"
            aria-expanded={fabricOpen}
          >
            <span className="h-3 w-3 rounded-sm border border-white/30" style={{ background: color }} />
            {fabric.short}
            <ChevronUp size={12} className={`transition ${fabricOpen ? '' : 'rotate-180'}`} />
          </button>
          {effectiveMode === 'model' && (
            <button
              onClick={() => setShowMannequin((s) => !s)}
              className={`lc-btn h-8 w-8 p-0 ${showMannequin ? 'text-violet-300' : ''}`}
              title={showMannequin ? 'Hide mannequin (ghost view)' : 'Show mannequin'}
              aria-pressed={showMannequin}
            >
              <PersonStanding size={14} />
            </button>
          )}
          <label className="flex items-center gap-2 pl-1 text-[11px] text-zinc-400" title="Cut away the half facing you to see the inside of the garment">
            <Scissors size={13} className={cut > 0 ? 'text-violet-400' : ''} />
            Interior
            <input type="range" min={0} max={1} step={0.01} value={cut} onChange={(e) => setCut(+e.target.value)} className="lc-range w-28" />
            <span className="w-8 font-mono text-zinc-300">{Math.round(cut * 100)}%</span>
          </label>
          <button onClick={reset} className="lc-btn h-8 w-8 p-0" title="Reset view">
            <RotateCcw size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
