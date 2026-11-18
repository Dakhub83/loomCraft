import * as THREE from 'three';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';
import type { FabricDef } from '../data/fabrics';
import type { PrintEffect } from '../types';
import type { Anchor } from './garmentModels';

/* ================================================================================================
 * Projects print zones and trims onto garment surfaces with DecalGeometry, so artwork wraps the
 * curves at its true size in inches. Print materials vary by technique: DTG soaks into the weave,
 * plastisol lies on top as a smoother film, puff is raised (bump), vintage is dry and cracked.
 * ============================================================================================== */

const ray = new THREE.Raycaster();

/** Returns the decal geometry for an anchor, or null if the projection misses the surface. */
export function decalGeometry(a: Anchor, w: number, h: number): THREE.BufferGeometry | null {
  a.mesh.updateMatrixWorld(true);
  ray.set(a.center, a.dir);
  const hit = ray.intersectObject(a.mesh, false)[0];
  if (!hit) return null;
  const z = a.dir.clone().negate();
  const y = a.up.clone().sub(z.clone().multiplyScalar(a.up.dot(z))).normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  const euler = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  return new DecalGeometry(a.mesh, hit.point, euler, new THREE.Vector3(w, h, a.depth));
}

function tex(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Fabric weave relief under the print, tiled across a w×h-inch decal. */
function weaveUnder(fabricNormal: THREE.Texture | null, f: FabricDef, w: number, h: number) {
  if (!fabricNormal) return null;
  const n = fabricNormal.clone();
  n.repeat.set(w / f.look.tileIn, h / f.look.tileIn);
  n.needsUpdate = true;
  return n;
}

export function printMaterial(
  art: HTMLCanvasElement,
  effect: PrintEffect,
  fabric: FabricDef,
  fabricNormal: THREE.Texture | null,
  w: number,
  h: number,
  clip: THREE.Plane[],
): THREE.MeshPhysicalMaterial {
  const base = {
    map: tex(art),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    clippingPlanes: clip,
    metalness: 0,
  };
  const normal = weaveUnder(fabricNormal, fabric, w, h);
  const k = fabric.look.normalStrength;
  switch (effect) {
    case 'screen':
      return new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.55, clearcoat: 0.18, clearcoatRoughness: 0.5, normalMap: normal, normalScale: new THREE.Vector2(k * 0.3, k * 0.3) });
    case 'puff': {
      // raised ink: a blurred white silhouette of the artwork drives the bump
      const sil = document.createElement('canvas');
      sil.width = art.width;
      sil.height = art.height;
      const sx = sil.getContext('2d')!;
      sx.drawImage(art, 0, 0);
      sx.globalCompositeOperation = 'source-in';
      sx.fillStyle = '#fff';
      sx.fillRect(0, 0, sil.width, sil.height);
      const bump = document.createElement('canvas');
      bump.width = art.width;
      bump.height = art.height;
      const bx = bump.getContext('2d')!;
      bx.fillStyle = '#000';
      bx.fillRect(0, 0, bump.width, bump.height);
      bx.filter = `blur(${Math.max(1, art.width / 250)}px)`;
      bx.drawImage(sil, 0, 0);
      return new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.72, bumpMap: new THREE.CanvasTexture(bump), bumpScale: 4, sheen: 0.2, sheenRoughness: 0.6 });
    }
    case 'vintage':
      return new THREE.MeshPhysicalMaterial({ ...base, roughness: 1, normalMap: normal, normalScale: new THREE.Vector2(k, k) });
    default:
      // DTG: ink soaks into the fibres, so the weave shows through fully
      return new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.95, normalMap: normal, normalScale: new THREE.Vector2(k * 0.9, k * 0.9), sheen: fabric.look.sheen * 0.5, sheenRoughness: 0.6 });
  }
}

export function trimMaterial(canvas: HTMLCanvasElement, clip: THREE.Plane[], side: THREE.Side = THREE.FrontSide): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: tex(canvas),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
    roughness: 0.9,
    side,
    clippingPlanes: clip,
  });
}

/** Woven brand label for the inside back neck (drawn mirrored: it's read from inside the garment). */
export function labelCanvas(size: string): HTMLCanvasElement {
  const ppi = 160;
  const c = document.createElement('canvas');
  c.width = Math.round(1.9 * ppi);
  c.height = Math.round(1.05 * ppi);
  const x = c.getContext('2d')!;
  x.translate(c.width, 0);
  x.scale(-1, 1);
  x.fillStyle = '#efebe3';
  x.fillRect(0, 0, c.width, c.height);
  x.strokeStyle = 'rgba(0,0,0,0.25)';
  x.setLineDash([6, 4]);
  x.lineWidth = 2;
  x.strokeRect(5, 5, c.width - 10, c.height - 10);
  x.setLineDash([]);
  x.textAlign = 'center';
  x.fillStyle = '#7c3aed';
  x.font = `800 ${0.27 * ppi}px Inter, system-ui, sans-serif`;
  x.fillText('LOOMCRAFT', c.width / 2, 0.45 * ppi);
  x.fillStyle = '#3f3f46';
  x.font = `600 ${0.17 * ppi}px Inter, system-ui, sans-serif`;
  x.fillText(size, c.width / 2, 0.78 * ppi);
  return c;
}
