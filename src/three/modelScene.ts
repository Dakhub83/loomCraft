import * as THREE from 'three';
import { getView } from '../data/garments';
import type { FabricDef } from '../data/fabrics';
import type { GarmentId, ViewEffects, ViewId } from '../types';
import { effectFor } from '../types';
import { isDark } from '../utils/color';
import { buildMannequin } from './body';
import { decalGeometry, labelCanvas, printMaterial, trimMaterial } from './decals';
import { weaveNormal } from './fabricMaterials';
import { contactShadow, type Built } from './flatLay';
import { buildGarmentModel } from './garmentModels';

/* ================================================================================================
 * Assembles the "3D model" scene: procedural garment + print decals (one per view with artwork) +
 * trim decals + inside neck label + mannequin + floor shadow.
 * ============================================================================================== */

export interface ModelBuilt extends Built {
  mannequin: THREE.Group | null;
  /** Views whose artwork has no place on this 3D model. */
  missingViews: ViewId[];
  /** The soft floor shadow (on the floor under the mannequin, or under a standalone item). */
  shadow: THREE.Mesh;
}

export function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      const r = mat as THREE.MeshPhysicalMaterial;
      r.map?.dispose();
      r.normalMap?.dispose();
      r.alphaMap?.dispose();
      r.bumpMap?.dispose();
      mat.dispose();
    }
  });
}

export function buildModelScene(
  garment: GarmentId,
  color: string,
  fabric: FabricDef,
  prints: Partial<Record<ViewId, HTMLCanvasElement>>,
  effects: ViewEffects,
  clip: THREE.Plane,
  showMannequin: boolean,
): ModelBuilt | null {
  const model = buildGarmentModel(garment, color, fabric, [clip]);
  if (!model) return null;
  const group = new THREE.Group();
  group.add(model.group);

  // print decals
  const normal = weaveNormal(fabric, 1, 1);
  const missingViews: ViewId[] = [];
  for (const [view, canvas] of Object.entries(prints) as Array<[ViewId, HTMLCanvasElement | undefined]>) {
    if (!canvas) continue;
    const a = model.anchors[view];
    const z = getView(garment, view).zone;
    const geo = a ? decalGeometry(a, z.widthIn, z.heightIn) : null;
    if (!geo) {
      missingViews.push(view);
      continue;
    }
    const mesh = new THREE.Mesh(geo, printMaterial(canvas, effectFor(effects, view), fabric, normal, z.widthIn, z.heightIn, [clip]));
    mesh.renderOrder = 2;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  normal.dispose();

  // trims: stitches and shading tuned to read on this garment color
  const dark = isDark(color);
  const ink = dark ? 'rgba(255,255,255,0.34)' : 'rgba(0,0,0,0.38)';
  const shade = dark ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.045)';
  const PPI = 40;
  for (const t of model.trims) {
    const c = document.createElement('canvas');
    c.width = Math.max(2, Math.round(t.w * PPI));
    c.height = Math.max(2, Math.round(t.h * PPI));
    t.paint(c.getContext('2d')!, PPI, ink, shade);
    const geo = decalGeometry(t.anchor, t.w, t.h);
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, trimMaterial(c, [clip]));
    mesh.renderOrder = 1;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  if (model.label) {
    const geo = decalGeometry(model.label, 1.9, 1.05);
    if (geo) group.add(new THREE.Mesh(geo, trimMaterial(labelCanvas(`M · ${fabric.short.toUpperCase()}`), [clip], THREE.BackSide)));
  }

  const mannequin = model.mannequin ? buildMannequin(model.armAngle, [clip]) : null;
  if (mannequin) {
    mannequin.visible = showMannequin;
    group.add(mannequin);
  }

  const f = model.frame;
  const shadow = contactShadow((f.max.x - f.min.x) * 1.15, Math.max(8, (f.max.z - f.min.z) * 2.2));
  shadow.position.y = mannequin ? 0.02 : f.min.y + 0.02;
  group.add(shadow);

  return {
    group,
    frame: f,
    mannequin,
    missingViews,
    shadow,
    dispose: () => disposeTree(group),
  };
}
