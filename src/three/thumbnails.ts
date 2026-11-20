import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { FabricDef } from '../data/fabrics';
import type { GarmentId } from '../types';
import { hasGarmentModel } from './garmentModels';
import { buildModelScene } from './modelScene';

/* ================================================================================================
 * 3D thumbnails for the garment picker: catalog-style renders (no mannequin, slight three-quarter
 * turn, soft floor shadow) on a transparent background.
 *
 * One offscreen renderer serves every thumbnail. Jobs run one at a time, one per animation frame,
 * so the editor stays responsive; a job whose caller has moved on (aborted signal) is skipped. The
 * renderer is released after a few idle seconds, because browsers cap live WebGL contexts and the
 * 360° view needs its own. Results are cached as object URLs (LRU).
 * ============================================================================================== */

export const THUMB_W = 240;
export const THUMB_H = 252;
const YAW = THREE.MathUtils.degToRad(-18);
const CACHE_MAX = 160;
const IDLE_RELEASE_MS = 6000;

interface Studio {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  key: THREE.DirectionalLight;
}

let studio: Studio | null = null;
let unavailable = false;
let idleTimer: number | undefined;
const cache = new Map<string, string>();
/** In-flight jobs by cache key. A job is skipped only when every caller waiting on it has aborted. */
const pending = new Map<string, { promise: Promise<string | null>; waiters: Array<AbortSignal | undefined> }>();
let queue: Promise<unknown> = Promise.resolve();

function setup(): Studio | null {
  if (studio) return studio;
  if (unavailable) return null;
  try {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(THUMB_W, THUMB_H, false);
    renderer.setClearColor(0x000000, 0);
    renderer.localClippingEnabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    scene.environment = pmrem.fromScene(room, 0.04).texture;
    scene.environmentIntensity = 0.32;
    room.dispose();
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(30, THUMB_W / THUMB_H, 0.5, 600);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb8b8c0, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 400 });
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.04;
    key.shadow.radius = 6;
    scene.add(key, key.target);
    const fill = new THREE.DirectionalLight(0xffffff, 0.35);
    fill.position.set(-60, 20, 40);
    scene.add(fill);

    studio = { renderer, scene, camera, key };
    return studio;
  } catch {
    unavailable = true;
    return null;
  }
}

function release() {
  if (!studio) return;
  studio.scene.environment?.dispose();
  studio.renderer.dispose();
  studio.renderer.forceContextLoss();
  studio = null;
}

function scheduleRelease() {
  window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(release, IDLE_RELEASE_MS);
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

function remember(key: string, url: string) {
  cache.set(key, url);
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value as string;
    URL.revokeObjectURL(cache.get(oldest)!);
    cache.delete(oldest);
  }
}

async function render(garment: GarmentId, color: string, fabric: FabricDef): Promise<string | null> {
  const s = setup();
  if (!s) return null;
  const clip = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1e4); // never cuts
  const built = buildModelScene(garment, color, fabric, {}, {}, clip, false);
  if (!built) return null;
  try {
    const g = built.group;
    g.rotation.y = YAW;
    const frame = built.frame.clone().applyMatrix4(new THREE.Matrix4().makeRotationY(YAW));
    const center = frame.getCenter(new THREE.Vector3());
    const size = frame.getSize(new THREE.Vector3());
    // Tops and bottoms are built around the (hidden) mannequin, so their shadow sits on its floor;
    // lift it to just under the garment for a ghost-mannequin catalog look.
    if (built.mannequin) built.shadow.position.y = frame.min.y - size.y * 0.05;
    s.scene.add(g);

    const { camera, key } = s;
    const aspect = THUMB_W / THUMB_H;
    // Fit the front silhouette, but never closer than the bounding sphere allows: long, deep items
    // (sneakers, duffels) would otherwise poke out of the frame once turned.
    const half = THREE.MathUtils.degToRad(15);
    const dist = Math.max((Math.max(size.y, size.x / aspect) * 0.6) / Math.tan(half), ((size.length() / 2) * 0.82) / Math.sin(half));
    camera.position.set(center.x, center.y + size.y * 0.1, center.z + dist);
    camera.lookAt(center.x, center.y - size.y * 0.05, center.z);
    key.position.set(center.x + 40, center.y + 70, center.z + 60);
    key.target.position.copy(center);
    key.target.updateMatrixWorld();

    s.renderer.render(s.scene, camera);
    s.scene.remove(g);
    const blob = await new Promise<Blob | null>((r) => s.renderer.domElement.toBlob(r, 'image/webp', 0.9));
    return blob ? URL.createObjectURL(blob) : null;
  } finally {
    built.dispose();
  }
}

/** Whether a garment has a 3D model to render (custom photo blanks don't). */
export function canThumb(garment: GarmentId): boolean {
  return hasGarmentModel(garment);
}

/** A cached thumbnail, if one has been rendered already. */
export function cachedThumb(garment: GarmentId, color: string, fabric: FabricDef): string | null {
  return cache.get(thumbKey(garment, color, fabric)) ?? null;
}

function thumbKey(garment: GarmentId, color: string, fabric: FabricDef) {
  return `${garment}|${color.toLowerCase()}|${fabric.id}`;
}

/**
 * Renders (or returns the cached) thumbnail as an object URL. Resolves null when the garment has no
 * 3D model, WebGL is unavailable, or `signal` was aborted before the job started.
 */
export function garmentThumb(garment: GarmentId, color: string, fabric: FabricDef, signal?: AbortSignal): Promise<string | null> {
  if (!hasGarmentModel(garment)) return Promise.resolve(null);
  const key = thumbKey(garment, color, fabric);
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit); // most recently used
    return Promise.resolve(hit);
  }
  const inFlight = pending.get(key);
  if (inFlight) {
    inFlight.waiters.push(signal);
    return inFlight.promise;
  }

  const waiters: Array<AbortSignal | undefined> = [signal];
  const abandoned = () => waiters.every((w) => w?.aborted);
  const job = queue.then(async () => {
    if (abandoned()) return null;
    await nextFrame();
    if (abandoned()) return null;
    try {
      const url = await render(garment, color, fabric);
      if (url) remember(key, url);
      return url;
    } catch (e) {
      console.warn('Garment thumbnail failed', garment, e);
      return null;
    } finally {
      scheduleRelease();
    }
  });
  // Abandoned jobs resolve null without caching, so a later request renders again.
  const tracked = job.finally(() => pending.delete(key));
  pending.set(key, { promise: tracked, waiters });
  queue = tracked;
  return tracked;
}
