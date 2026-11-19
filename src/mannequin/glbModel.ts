import * as THREE from 'three';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/* ================================================================================================
 * External mannequin models (.glb / self-contained .gltf from Blender, CLO3D, Marvelous Designer…).
 * Draco and Meshopt compression are supported; the Draco decoder is served from /draco/ (copied
 * from three's examples into public/), so loading never depends on a CDN.
 * ============================================================================================== */

export interface LoadedModel {
  name: string;
  /** Normalised root: feet on y = 0, centred on x/z. Scale it to the target height. */
  root: THREE.Group;
  /** Height of the model in its own units after normalisation. */
  nativeHeight: number;
  animations: THREE.AnimationClip[];
  stats: { meshes: number; triangles: number; skinned: boolean };
}

let dracoLoader: DRACOLoader | null = null;
let dracoUsers = 0;

/** A GLTFLoader wired with Draco + Meshopt. Call `releaseGltfLoader` when done with it. */
export function createGltfLoader(manager?: THREE.LoadingManager): GLTFLoader {
  if (!dracoLoader) {
    dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(`${import.meta.env.BASE_URL}draco/`);
    dracoLoader.setDecoderConfig({ type: 'wasm' });
  }
  dracoUsers++;
  const loader = new GLTFLoader(manager);
  loader.setDRACOLoader(dracoLoader);
  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader;
}

export function releaseGltfLoader() {
  dracoUsers = Math.max(0, dracoUsers - 1);
  if (dracoUsers === 0 && dracoLoader) {
    dracoLoader.dispose();
    dracoLoader = null;
  }
}

function normalise(gltf: GLTF, name: string): LoadedModel {
  const scene = gltf.scene;
  let meshes = 0;
  let triangles = 0;
  let skinned = false;
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    meshes++;
    const g = m.geometry;
    triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
    m.castShadow = true;
    m.receiveShadow = true;
    if ((m as THREE.SkinnedMesh).isSkinnedMesh) {
      skinned = true;
      m.frustumCulled = false;
    }
    m.userData.originalMaterial = m.material;
  });
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene, true);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  scene.position.sub(new THREE.Vector3(centre.x, box.min.y, centre.z));
  const root = new THREE.Group();
  root.name = `glb:${name}`;
  root.add(scene);
  return { name, root, nativeHeight: Math.max(size.y, 1e-6), animations: gltf.animations, stats: { meshes, triangles: Math.round(triangles), skinned } };
}

/** Loads a .glb / .gltf from a File or URL and normalises it to stand on the floor. */
export async function loadModel(source: File | string, onProgress?: (fraction: number) => void): Promise<LoadedModel> {
  const isFile = typeof source !== 'string';
  const url = isFile ? URL.createObjectURL(source) : source;
  const name = isFile ? source.name : source.split('/').pop() || 'model';
  const loader = createGltfLoader();
  try {
    const gltf = await loader.loadAsync(url, (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    });
    return normalise(gltf, name);
  } finally {
    if (isFile) URL.revokeObjectURL(url);
    releaseGltfLoader();
  }
}

/** Frees the GPU resources of a loaded model (geometries, materials and their textures). */
export function disposeModel(model: LoadedModel) {
  const textures = new Set<THREE.Texture>();
  const materials = new Set<THREE.Material>();
  model.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    const original = (m.userData.originalMaterial ?? m.material) as THREE.Material | THREE.Material[];
    for (const mat of Array.isArray(original) ? original : [original]) materials.add(mat);
  });
  for (const mat of materials) {
    for (const v of Object.values(mat)) if (v instanceof THREE.Texture) textures.add(v);
    mat.dispose();
  }
  for (const t of textures) t.dispose();
}

export type ModelStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * React hook around `loadModel`. Keeps one model at a time and disposes the previous one when a new
 * model replaces it, when it is cleared, and on unmount.
 */
export function useGlbModel() {
  const [model, setModel] = useState<LoadedModel | null>(null);
  const [status, setStatus] = useState<ModelStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const current = useRef<LoadedModel | null>(null);
  const request = useRef(0);

  const replace = useCallback((next: LoadedModel | null) => {
    if (current.current) disposeModel(current.current);
    current.current = next;
    setModel(next);
  }, []);

  const load = useCallback(
    async (source: File | string) => {
      const id = ++request.current;
      setStatus('loading');
      setProgress(0);
      setError(null);
      try {
        const m = await loadModel(source, (f) => id === request.current && setProgress(f));
        if (id !== request.current) {
          disposeModel(m);
          return;
        }
        replace(m);
        setStatus('ready');
      } catch (err) {
        if (id !== request.current) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus('error');
      }
    },
    [replace],
  );

  const clear = useCallback(() => {
    request.current++;
    replace(null);
    setStatus('idle');
    setError(null);
  }, [replace]);

  useEffect(
    () => () => {
      request.current++;
      if (current.current) disposeModel(current.current);
      current.current = null;
    },
    [],
  );

  return { model, status, progress, error, load, clear };
}
