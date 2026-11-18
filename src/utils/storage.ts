import { createStore, del, get, getMany, keys, set, setMany } from 'idb-keyval';
import type { CustomGarmentRecord, Draft, Workspace } from '../types';

/**
 * IndexedDB persistence via idb-keyval. Unlike localStorage there's no ~5 MB cap, values are stored
 * with structured clone (no JSON.stringify of multi-MB data URLs on the main thread), and every
 * call is async so saving never blocks the canvas.
 *
 * Layout: one key per draft (`draft:<id>`) so saving one piece never rewrites the whole collection.
 */
const store = createStore('loomcraft', 'kv');
const DRAFT_PREFIX = 'draft:';
const WORKSPACE_KEY = 'workspace';
const MIGRATED_KEY = 'migrated-localstorage-v1';

export const newDraftId = () => `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const draftKey = (id: string) => `${DRAFT_PREFIX}${id}`;
const sortDrafts = (d: Draft[]) => d.sort((a, b) => b.updatedAt - a.updatedAt);

/** One-time import of drafts/workspace saved by the earlier localStorage version. */
async function migrateLegacy(): Promise<void> {
  if (await get(MIGRATED_KEY, store)) return;
  try {
    const legacyDrafts = JSON.parse(localStorage.getItem('loomcraft:drafts:v1') || '[]') as Draft[];
    const legacyWs = JSON.parse(localStorage.getItem('loomcraft:workspace:v1') || 'null') as Workspace | null;
    const entries: Array<[IDBValidKey, unknown]> = legacyDrafts.map((d) => [draftKey(d.id), d]);
    if (legacyWs && !(await get(WORKSPACE_KEY, store))) entries.push([WORKSPACE_KEY, legacyWs]);
    if (entries.length) await setMany(entries, store);
    localStorage.removeItem('loomcraft:drafts:v1');
    localStorage.removeItem('loomcraft:workspace:v1');
  } catch {
    /* corrupt legacy data – ignore */
  }
  await set(MIGRATED_KEY, true, store);
}

const ready = migrateLegacy();

export async function listDrafts(): Promise<Draft[]> {
  await ready;
  const draftKeys = (await keys(store)).filter((k) => typeof k === 'string' && k.startsWith(DRAFT_PREFIX));
  const drafts = (await getMany<Draft | undefined>(draftKeys, store)).filter((d): d is Draft => !!d);
  return sortDrafts(drafts);
}

export async function saveDraft(draft: Draft): Promise<Draft[]> {
  await ready;
  await set(draftKey(draft.id), draft, store);
  return listDrafts();
}

export async function renameDraft(id: string, name: string): Promise<Draft[]> {
  const d = await get<Draft>(draftKey(id), store);
  if (d) await set(draftKey(id), { ...d, name, updatedAt: Date.now() }, store);
  return listDrafts();
}

export async function deleteDraft(id: string): Promise<Draft[]> {
  await del(draftKey(id), store);
  return listDrafts();
}

export async function duplicateDraft(id: string): Promise<Draft[]> {
  const src = await get<Draft>(draftKey(id), store);
  if (src) {
    const now = Date.now();
    const copy: Draft = { ...src, id: newDraftId(), name: `${src.name} (copy)`, createdAt: now, updatedAt: now };
    await set(draftKey(copy.id), copy, store);
  }
  return listDrafts();
}

/** Autosaved working state, restored on reload. */
export async function loadWorkspace(): Promise<Workspace | null> {
  await ready;
  return (await get<Workspace>(WORKSPACE_KEY, store)) ?? null;
}

export async function saveWorkspace(ws: Workspace): Promise<void> {
  try {
    await set(WORKSPACE_KEY, ws, store);
  } catch {
    /* non-fatal */
  }
}

/* ---------------------------------------------------------------- custom garment blanks */

const GARMENT_PREFIX = 'garment:';

export const newCustomGarmentId = () => `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export async function listCustomGarments(): Promise<CustomGarmentRecord[]> {
  await ready;
  const ks = (await keys(store)).filter((k) => typeof k === 'string' && k.startsWith(GARMENT_PREFIX));
  return (await getMany<CustomGarmentRecord | undefined>(ks, store))
    .filter((g): g is CustomGarmentRecord => !!g)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function saveCustomGarment(g: CustomGarmentRecord): Promise<CustomGarmentRecord[]> {
  await set(`${GARMENT_PREFIX}${g.id}`, g, store);
  return listCustomGarments();
}

export async function deleteCustomGarment(id: string): Promise<CustomGarmentRecord[]> {
  await del(`${GARMENT_PREFIX}${id}`, store);
  return listCustomGarments();
}
