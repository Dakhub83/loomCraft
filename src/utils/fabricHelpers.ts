import { FabricObject, InteractiveFabricObject } from 'fabric';
import type { LayerInfo } from '../types';

/** Extra properties persisted with every object (on top of Fabric's defaults). */
export const SERIAL_PROPS = ['id', 'name', 'selectable', 'evented', 'hasControls', 'lockMovementX', 'lockMovementY'];

type Meta = { id?: string; name?: string };
export const meta = (o: FabricObject) => o as FabricObject & Meta;

export const newId = () => Math.random().toString(36).slice(2, 10);

export function objectKind(o: FabricObject): LayerInfo['kind'] {
  const t = (o.type || '').toLowerCase();
  if (t.includes('text')) return 'text';
  if (t === 'image') return 'image';
  if (t === 'group' || t === 'path' || t === 'polygon' || t === 'polyline') return 'vector';
  return 'shape';
}

export function objectName(o: FabricObject): string {
  const m = meta(o);
  if (m.name) return m.name;
  if (objectKind(o) === 'text') return ((o as unknown as { text?: string }).text || 'Text').slice(0, 28);
  return objectKind(o) === 'image' ? 'Image' : 'Graphic';
}

export const isLocked = (o: FabricObject) => o.selectable === false;

let configured = false;
/** Studio-wide control styling – call once before creating canvases. */
export function configureFabric() {
  if (configured) return;
  configured = true;
  FabricObject.customProperties = ['id', 'name'];
  Object.assign(InteractiveFabricObject.ownDefaults, {
    transparentCorners: false,
    cornerColor: '#8b5cf6',
    cornerStrokeColor: '#141418',
    borderColor: '#8b5cf6',
    cornerStyle: 'circle',
    cornerSize: 11,
    borderScaleFactor: 1.5,
    padding: 4,
  });
}

/**
 * Fits a serialized design from one print zone into another (e.g. when switching garments):
 * scales down if needed and keeps the artwork horizontally centered.
 */
export function refitDesign<T extends { objects?: Array<Record<string, unknown>> }>(
  json: T,
  from: { w: number; h: number },
  to: { w: number; h: number },
): T {
  if (from.w === to.w && from.h === to.h) return json;
  const s = Math.min(1, to.w / from.w, to.h / from.h);
  const dx = (to.w - from.w * s) / 2;
  const dy = s < 1 ? (to.h - from.h * s) / 2 : 0;
  const num = (v: unknown, d: number) => (typeof v === 'number' ? v : d);
  return {
    ...json,
    objects: (json.objects ?? []).map((o) => ({
      ...o,
      left: num(o.left, 0) * s + dx,
      top: num(o.top, 0) * s + dy,
      scaleX: num(o.scaleX, 1) * s,
      scaleY: num(o.scaleY, 1) * s,
    })),
  };
}
