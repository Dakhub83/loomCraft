import { useState } from 'react';
import { Copy, FolderOpen, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { Draft } from '../types';
import { GARMENTS } from './GarmentTemplates';

interface Props {
  open: boolean;
  drafts: Draft[];
  currentId: string | null;
  onClose(): void;
  onLoad(d: Draft): void;
  onRename(id: string, name: string): void;
  onDelete(id: string): void;
  onDuplicate(id: string): void;
  onNew(): void;
}

const timeAgo = (t: number) => {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
};

export function DraftManager({ open, drafts, currentId, onClose, onLoad, onRename, onDelete, onDuplicate, onNew }: Props) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  return (
    <div className={`fixed inset-0 z-40 ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <div onClick={onClose} className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`} />
      <aside
        className={`absolute right-0 top-0 flex h-full w-[420px] max-w-full flex-col border-l border-white/10 bg-[#121216] shadow-2xl transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <header className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Collection drafts</h2>
            <p className="text-[11px] text-zinc-500">Saved locally in this browser · {drafts.length} pieces</p>
          </div>
          <div className="flex gap-2">
            <button onClick={onNew} className="lc-btn gap-1.5 px-2.5 py-1.5 text-xs">
              <Plus size={14} /> New
            </button>
            <button onClick={onClose} className="lc-btn px-2 py-1.5" title="Close">
              <X size={15} />
            </button>
          </div>
        </header>

        <div className="lc-scroll flex-1 space-y-2 overflow-y-auto p-4">
          {drafts.length === 0 && (
            <div className="rounded-xl border border-dashed border-white/10 px-6 py-12 text-center">
              <FolderOpen className="mx-auto mb-3 text-zinc-600" size={28} />
              <p className="text-sm text-zinc-300">No drafts yet</p>
              <p className="mt-1 text-xs text-zinc-500">Use “Save” in the header to store this design in your collection.</p>
            </div>
          )}
          {drafts.map((d) => (
            <div
              key={d.id}
              className={`group flex gap-3 rounded-xl border p-2.5 transition ${
                d.id === currentId ? 'border-amber-400/50 bg-amber-400/[0.05]' : 'border-white/[0.07] bg-white/[0.02] hover:border-white/15'
              }`}
            >
              <button
                onClick={() => onLoad(d)}
                className="h-[86px] w-[77px] shrink-0 overflow-hidden rounded-lg bg-zinc-800"
                title="Open draft"
              >
                {d.thumbnail ? <img src={d.thumbnail} alt="" className="h-full w-full object-cover" /> : null}
              </button>
              <div className="flex min-w-0 flex-1 flex-col">
                {renaming === d.id ? (
                  <input
                    autoFocus
                    defaultValue={d.name}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== d.name) onRename(d.id, v);
                      setRenaming(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      if (e.key === 'Escape') setRenaming(null);
                    }}
                    className="lc-input h-7 px-2 py-0 text-sm"
                  />
                ) : (
                  <button onClick={() => onLoad(d)} className="truncate text-left text-sm font-medium text-zinc-100 hover:text-amber-300">
                    {d.name}
                  </button>
                )}
                <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-500">
                  <span className="h-2.5 w-2.5 rounded-full border border-white/20" style={{ background: d.color }} />
                  {GARMENTS[d.garment]?.short} · {timeAgo(d.updatedAt)}
                  {d.id === currentId && <span className="font-semibold text-amber-400">· open</span>}
                </span>
                <div className="mt-auto flex gap-1 pt-2">
                  {confirmDelete === d.id ? (
                    <>
                      <button
                        onClick={() => {
                          onDelete(d.id);
                          setConfirmDelete(null);
                        }}
                        className="rounded-md bg-red-500/90 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-500"
                      >
                        Delete forever
                      </button>
                      <button onClick={() => setConfirmDelete(null)} className="rounded-md px-2 py-1 text-[11px] text-zinc-400 hover:text-white">
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <SmallBtn onClick={() => onLoad(d)} title="Open">
                        <FolderOpen size={13} />
                      </SmallBtn>
                      <SmallBtn onClick={() => setRenaming(d.id)} title="Rename">
                        <Pencil size={13} />
                      </SmallBtn>
                      <SmallBtn onClick={() => onDuplicate(d.id)} title="Duplicate">
                        <Copy size={13} />
                      </SmallBtn>
                      <SmallBtn onClick={() => setConfirmDelete(d.id)} title="Delete">
                        <Trash2 size={13} />
                      </SmallBtn>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

function SmallBtn({ onClick, title, children }: { onClick(): void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="grid h-7 w-7 place-items-center rounded-md border border-white/[0.07] text-zinc-400 transition hover:border-white/20 hover:text-zinc-100"
    >
      {children}
    </button>
  );
}
