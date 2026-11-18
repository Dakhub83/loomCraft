import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Camera, Loader2, Pause, Play, RotateCcw, Scissors, X } from 'lucide-react';
import { GARMENT_H, GARMENT_W, getGarment } from '../data/garments';
import type { GarmentId, ViewDesigns, ViewEffects } from '../types';

/* ================================================================================================
 * 360° turntable. The garment is rebuilt as two curved surfaces (front and back) whose depth follows
 * the silhouette row by row: each horizontal run of fabric bulges into a flattened ellipse that meets
 * the other surface at its edges, so the straight-on view matches the 2D mockup exactly. Outside faces
 * carry the mockup texture; back faces carry the interior texture (darker fabric, print bleed-through,
 * neck label). The "Interior" slider is a clipping plane that always faces the camera, cutting away
 * the near half of the garment to reveal the inside from any angle.
 * ============================================================================================== */

interface Props {
  name: string;
  garment: GarmentId;
  color: string;
  designs: ViewDesigns;
  effects: ViewEffects;
  onClose(): void;
  onError(msg: string): void;
}

const U = 100; // studio px per world unit
const COLS = 200;
const ROWS = 224;
const SW = 250; // silhouette sampling resolution (half of the 500×560 studio space)
const SH = 280;

interface Built {
  group: THREE.Group;
  maxDepth: number;
  center: THREE.Vector3;
  dispose(): void;
}

function silhouette(c: HTMLCanvasElement): Uint8Array {
  const s = document.createElement('canvas');
  s.width = SW;
  s.height = SH;
  const x = s.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(c, 0, 0, SW, SH);
  const d = x.getImageData(0, 0, SW, SH).data;
  const m = new Uint8Array(SW * SH);
  for (let k = 0; k < m.length; k++) m[k] = d[k * 4 + 3] > 40 ? 1 : 0;
  return m;
}

function cloneCanvas(c: HTMLCanvasElement): HTMLCanvasElement {
  const o = document.createElement('canvas');
  o.width = c.width;
  o.height = c.height;
  o.getContext('2d')!.drawImage(c, 0, 0);
  return o;
}

function buildGarment(
  garment: GarmentId,
  tex: { front: { outside: HTMLCanvasElement; inside: HTMLCanvasElement }; back: { outside: HTMLCanvasElement; inside: HTMLCanvasElement } },
  clip: THREE.Plane,
): Built {
  const def = getGarment(garment);
  // Where only one side has fabric (a cap's brim, a hood), let the other side borrow it, mirrored, so the
  // two surfaces share one silhouette and meet cleanly at the side seams.
  const fill = (dst: HTMLCanvasElement, src: HTMLCanvasElement) => {
    const x = dst.getContext('2d')!;
    x.save();
    x.globalCompositeOperation = 'destination-over';
    x.translate(dst.width, 0);
    x.scale(-1, 1);
    x.drawImage(src, 0, 0, dst.width, dst.height);
    x.restore();
  };
  const fo = cloneCanvas(tex.front.outside);
  const fi = cloneCanvas(tex.front.inside);
  fill(tex.front.outside, tex.back.outside);
  fill(tex.front.inside, tex.back.inside);
  fill(tex.back.outside, fo);
  fill(tex.back.inside, fi);
  // Union of both silhouettes; the back image is seen from behind, so it is mirrored in world space.
  const fm = silhouette(tex.front.outside);
  const bm = silhouette(tex.back.outside);
  const mask = new Uint8Array(SW * SH);
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) mask[y * SW + x] = fm[y * SW + x] | bm[y * SW + (SW - 1 - x)];
  // Grow every texture's alpha a few px past the measured silhouette (where depth is already zero), so
  // anti-aliased edge texels don't fail the alpha test and open a slit along the side seams.
  for (const c of [tex.front.outside, tex.front.inside, tex.back.outside, tex.back.inside]) {
    const x = c.getContext('2d')!;
    const copy = cloneCanvas(c);
    // only solid fabric spreads (the blank's soft drop shadow must not build up into a dark halo)
    const cx = copy.getContext('2d')!;
    const img = cx.getImageData(0, 0, copy.width, copy.height);
    for (let k = 3; k < img.data.length; k += 4) if (img.data[k] < 128) img.data[k] = 0;
    cx.putImageData(img, 0, 0);
    x.clearRect(0, 0, c.width, c.height);
    x.drawImage(copy, 0, 0);
    const r = Math.max(2, Math.round(c.width / 250));
    x.save();
    x.globalCompositeOperation = 'destination-over';
    for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]]) x.drawImage(copy, dx, dy);
    x.restore();
  }

  // horizontal runs per row
  const runs: Array<Array<[number, number]>> = [];
  const halves: number[] = [];
  let minY = SH;
  let maxY = 0;
  for (let y = 0; y < SH; y++) {
    const r: Array<[number, number]> = [];
    let s = -1;
    for (let x = 0; x <= SW; x++) {
      const on = x < SW && mask[y * SW + x] === 1;
      if (on && s < 0) s = x;
      if (!on && s >= 0) {
        if (x - s > 1) r.push([s, x - 1]);
        s = -1;
      }
    }
    runs.push(r);
    if (r.length) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      for (const [a, b] of r) halves.push((b - a + 1) / 2);
    }
  }
  const colTop = new Int32Array(SW).fill(-1);
  for (let x = 0; x < SW; x++)
    for (let y = 0; y < SH; y++)
      if (mask[y * SW + x]) {
        colTop[x] = y;
        break;
      }

  // Depth by "inflation": distance to the nearest silhouette edge, through a rounded profile that
  // flattens out at R. Sleeves, shoulders and legs round off by their own width, with no creases.
  const sorted = halves.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 50;
  const maxHalf = sorted[sorted.length - 1] ?? 50;
  const factor = garment === 'tote' ? 0.14 : def.category === 'bottoms' ? 0.75 : def.category === 'accessories' ? 0.8 : 0.5;
  const R = Math.max(4, factor * median);
  // Waistbands and bag mouths stay open: treat everything above the top edge as fabric for the distance.
  const openTop = def.category === 'bottoms' || garment === 'tote';
  const solid = new Uint8Array(mask);
  if (openTop) for (let x = 0; x < SW; x++) for (let y = 0; y < colTop[x]; y++) solid[y * SW + x] = 1;

  // two-pass chamfer distance transform (3-4 metric), in sampling px
  const INF = 1e9;
  const dist = new Float32Array(SW * SH);
  for (let k = 0; k < dist.length; k++) dist[k] = solid[k] ? INF : 0;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= SW || y >= SH ? (openTop && y < 0 ? INF : 0) : dist[y * SW + x]);
  for (let y = 0; y < SH; y++)
    for (let x = 0; x < SW; x++) {
      const k = y * SW + x;
      if (!dist[k]) continue;
      dist[k] = Math.min(dist[k], at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4);
    }
  for (let y = SH - 1; y >= 0; y--)
    for (let x = SW - 1; x >= 0; x--) {
      const k = y * SW + x;
      if (!dist[k]) continue;
      dist[k] = Math.min(dist[k], at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4);
    }
  const field = new Float32Array(SW * SH);
  for (let k = 0; k < field.length; k++) {
    if (!mask[k]) continue;
    // zero on the outermost pixel so front and back meet at the seam; sine profile: rounded but not
    // so steep that the alpha-cut edge floats off the seam
    const d = Math.min(Math.max(0, dist[k] / 3 - 0.5), R);
    field[k] = R * Math.sin((Math.PI / 2) * (d / R));
  }
  // soften the chamfer's diamond artefacts (inside the garment only, so edges stay at zero)
  const blurred = new Float32Array(field);
  for (let pass = 0; pass < 2; pass++) {
    const src = pass ? new Float32Array(blurred) : field;
    for (let y = 1; y < SH - 1; y++)
      for (let x = 1; x < SW - 1; x++) {
        const k = y * SW + x;
        if (!mask[k]) continue;
        let s = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += src[k + dy * SW + dx];
        blurred[k] = dist[k] / 3 > 3 ? s / 9 : Math.min(src[k], s / 9);
      }
  }

  const depthAt = (x: number, y: number): number => {
    // bilinear, on pixel centres
    const fx = Math.min(SW - 1, Math.max(0, x - 0.5));
    const fy = Math.min(SH - 1, Math.max(0, y - 0.5));
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(SW - 1, x0 + 1);
    const y1 = Math.min(SH - 1, y0 + 1);
    const tx = fx - x0;
    const ty = fy - y0;
    const v = (xx: number, yy: number) => blurred[yy * SW + xx];
    return (v(x0, y0) * (1 - tx) + v(x1, y0) * tx) * (1 - ty) + (v(x0, y1) * (1 - tx) + v(x1, y1) * tx) * ty;
  };

  const verts = (COLS + 1) * (ROWS + 1);
  const pos = new Float32Array(verts * 3);
  const uvF = new Float32Array(verts * 2);
  const uvB = new Float32Array(verts * 2);
  let maxDepth = 0;
  for (let j = 0; j <= ROWS; j++) {
    for (let i = 0; i <= COLS; i++) {
      const k = j * (COLS + 1) + i;
      const x = (i / COLS) * SW;
      const y = (j / ROWS) * SH;
      const z = (depthAt(x, y) * (GARMENT_W / SW)) / U;
      maxDepth = Math.max(maxDepth, z);
      pos[k * 3] = ((i / COLS) * GARMENT_W - GARMENT_W / 2) / U;
      pos[k * 3 + 1] = (GARMENT_H / 2 - (j / ROWS) * GARMENT_H) / U;
      pos[k * 3 + 2] = z;
      uvF[k * 2] = i / COLS;
      uvF[k * 2 + 1] = 1 - j / ROWS;
      uvB[k * 2] = 1 - i / COLS;
      uvB[k * 2 + 1] = 1 - j / ROWS;
    }
  }
  const idxF: number[] = [];
  const idxB: number[] = [];
  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < COLS; i++) {
      const a = j * (COLS + 1) + i;
      const b = a + 1;
      const c = a + COLS + 1;
      const d = c + 1;
      idxF.push(a, c, b, b, c, d);
      idxB.push(a, b, c, b, d, c);
    }
  }
  const posB = pos.slice();
  for (let k = 2; k < posB.length; k += 3) posB[k] = -posB[k];

  const disposables: Array<{ dispose(): void }> = [];
  const texture = (c: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    disposables.push(t);
    return t;
  };
  const geometry = (p: Float32Array, uv: Float32Array, idx: number[]) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    disposables.push(g);
    return g;
  };
  const material = (map: THREE.Texture, side: THREE.Side) => {
    const m = new THREE.MeshStandardMaterial({ map, side, alphaTest: 0.5, roughness: 0.92, metalness: 0, clippingPlanes: [clip] });
    disposables.push(m);
    return m;
  };

  const group = new THREE.Group();
  const gF = geometry(pos, uvF, idxF);
  const gB = geometry(posB, uvB, idxB);
  group.add(new THREE.Mesh(gF, material(texture(tex.front.outside), THREE.FrontSide)));
  group.add(new THREE.Mesh(gF, material(texture(tex.front.inside), THREE.BackSide)));
  group.add(new THREE.Mesh(gB, material(texture(tex.back.outside), THREE.FrontSide)));
  group.add(new THREE.Mesh(gB, material(texture(tex.back.inside), THREE.BackSide)));

  // soft contact shadow
  const sh = document.createElement('canvas');
  sh.width = sh.height = 128;
  const sx = sh.getContext('2d')!;
  const grad = sx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  sx.fillStyle = grad;
  sx.fillRect(0, 0, 128, 128);
  const shadowTex = new THREE.CanvasTexture(sh);
  const shadowGeo = new THREE.PlaneGeometry(1, 1);
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
  disposables.push(shadowTex, shadowGeo, shadowMat);
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  const bottom = (GARMENT_H / 2 - ((maxY + 1) / SH) * GARMENT_H) / U;
  const top = (GARMENT_H / 2 - (minY / SH) * GARMENT_H) / U;
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = bottom - 0.12;
  shadow.scale.set(((maxHalf * 2) / SW) * (GARMENT_W / U) * 0.95, Math.max(0.6, maxDepth * 3.2), 1);
  group.add(shadow);

  return {
    group,
    maxDepth,
    center: new THREE.Vector3(0, (top + bottom) / 2, 0),
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}

const PRESETS: Array<{ id: string; label: string; azimuth: number; polar?: number; cut?: number }> = [
  { id: 'front', label: 'Front', azimuth: 0 },
  { id: 'side', label: 'Side', azimuth: Math.PI / 2 },
  { id: 'back', label: 'Back', azimuth: Math.PI },
  { id: 'inside', label: 'Inside', azimuth: 0.5, polar: 1.05, cut: 0.85 },
];

export default function Garment360({ name, garment, color, designs, effects, onClose, onError }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const three = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    clip: THREE.Plane;
    built: Built | null;
    tween: { from: THREE.Vector3; to: THREE.Vector3; t: number } | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [spin, setSpin] = useState(true);
  const [cut, setCut] = useState(0);
  const [angle, setAngle] = useState(0);
  const cutRef = useRef(cut);
  cutRef.current = cut;

  /* ---------- scene setup (once) ---------- */
  useEffect(() => {
    const host = hostRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.localClippingEnabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);
    renderer.domElement.className = 'absolute inset-0 h-full w-full cursor-grab active:cursor-grabbing';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.set(0, 0.6, 13);
    scene.add(camera);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3a44, 1.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(4, 5, 6); // relative to the camera: the side facing the viewer is always lit
    camera.add(key);
    const rim = new THREE.DirectionalLight(0xc4b5fd, 0.6);
    rim.position.set(-6, 3, -8);
    scene.add(rim);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 6;
    controls.maxDistance = 22;
    controls.minPolarAngle = 0.15;
    controls.maxPolarAngle = Math.PI - 0.15;
    controls.autoRotateSpeed = 2.2;
    controls.addEventListener('start', () => {
      if (three.current) three.current.tween = null;
    });

    const clip = new THREE.Plane(new THREE.Vector3(0, 0, -1), 100);
    three.current = { renderer, scene, camera, controls, clip, built: null, tween: null };

    const resize = () => {
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
    const dir = new THREE.Vector3();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const st = three.current!;
      if (st.tween) {
        st.tween.t = Math.min(1, st.tween.t + 0.045);
        const e = 1 - Math.pow(1 - st.tween.t, 3);
        const off = st.tween.from.clone().lerp(st.tween.to, e);
        // keep the distance while sweeping around
        off.setLength(st.tween.from.length() + (st.tween.to.length() - st.tween.from.length()) * e);
        camera.position.copy(controls.target).add(off);
        if (st.tween.t >= 1) st.tween = null;
      }
      controls.update();

      // camera-facing cutaway: remove everything nearer to the camera than `k`
      dir.copy(camera.position).sub(controls.target);
      dir.y = 0;
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
      dir.normalize();
      const extent = Math.abs(dir.x) * (GARMENT_W / 2 / U) + Math.abs(dir.z) * (st.built?.maxDepth ?? 1);
      const c = cutRef.current;
      clip.normal.set(-dir.x, 0, -dir.z);
      clip.constant = c <= 0 ? 100 : extent * (1 - c) + 0.01 - c * 0.02;

      const deg = Math.round(((THREE.MathUtils.radToDeg(Math.atan2(dir.x, dir.z)) % 360) + 360) % 360);
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
      renderer.dispose();
      renderer.domElement.remove();
      three.current = null;
    };
  }, []);

  useEffect(() => {
    if (three.current) three.current.controls.autoRotate = spin;
  }, [spin]);

  /* ---------- (re)build the garment when the design changes ---------- */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const { buildTurntableTextures } = await import('../utils/exportTools');
        const tex = await buildTurntableTextures({ garment, color, designs, effects }, 2);
        const st = three.current;
        if (cancelled || !st) return;
        const prev = st.built;
        const built = buildGarment(garment, tex, st.clip);
        st.scene.add(built.group);
        if (prev) {
          st.scene.remove(prev.group);
          prev.dispose();
        } else {
          st.controls.target.copy(built.center);
          st.camera.position.set(0, built.center.y + 0.6, 13);
        }
        st.built = built;
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
  }, [garment, color, designs, effects, onError]);

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [role="dialog"]')) return;
      if (e.key === 'Escape') onClose();
      else if (e.key === ' ') {
        e.preventDefault();
        setSpin((s) => !s);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const goTo = useCallback((p: (typeof PRESETS)[number]) => {
    const st = three.current;
    if (!st) return;
    setSpin(false);
    if (p.cut != null) setCut(p.cut);
    const from = st.camera.position.clone().sub(st.controls.target);
    const r = from.length();
    const polar = p.polar ?? Math.PI / 2 - 0.05;
    const to = new THREE.Vector3().setFromSphericalCoords(r, polar, p.azimuth);
    st.tween = { from, to, t: 0 };
  }, []);

  const reset = () => {
    setCut(0);
    goTo(PRESETS[0]);
    const st = three.current;
    if (st) st.tween!.to.setLength(13);
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
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
        <div className="pointer-events-auto rounded-lg border border-white/10 bg-black/45 px-3 py-2 backdrop-blur">
          <div className="text-xs font-semibold text-zinc-100">360° Preview · {getGarment(garment).name}</div>
          <div className="text-[10.5px] text-zinc-400">Drag to rotate · scroll to zoom · Space to spin · Esc to close</div>
        </div>
        <div className="pointer-events-auto flex items-center gap-1.5">
          <span className="rounded-md border border-white/10 bg-black/45 px-2 py-1 font-mono text-[11px] tabular-nums text-violet-300 backdrop-blur">{angle}°</span>
          <button onClick={snapshot} className="lc-btn h-8 gap-1.5 px-2.5 text-xs" title="Download this angle as PNG">
            <Camera size={14} /> Snapshot
          </button>
          <button onClick={onClose} className="lc-btn h-8 w-8 p-0" title="Close 360° preview (Esc)">
            <X size={15} />
          </button>
        </div>
      </div>

      {loading && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="flex items-center gap-2 rounded-lg bg-black/60 px-3 py-2 text-xs text-zinc-200">
            <Loader2 size={14} className="animate-spin text-violet-400" /> Building 3D garment…
          </span>
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
          <label className="flex items-center gap-2 pl-1 text-[11px] text-zinc-400" title="Cut away the half facing you to see the inside of the garment">
            <Scissors size={13} className={cut > 0 ? 'text-violet-400' : ''} />
            Interior
            <input type="range" min={0} max={1} step={0.01} value={cut} onChange={(e) => setCut(+e.target.value)} className="lc-range w-32" />
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
