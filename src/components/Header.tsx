import { FilePlus2, FolderOpen, Redo2, Save, Undo2 } from 'lucide-react';

export function LoomCraftLogo({ size = 30 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="8" fill="#22222a" />
        <g strokeWidth="3.2" strokeLinecap="round" fill="none">
          <path d="M6 11h20M6 21h20" stroke="#fde7c0" />
          <path d="M11 6v20M21 6v20" stroke="#f5b041" />
          {/* re-draw crossings so the threads appear woven over/under */}
          <path d="M9 11h4M19 21h4" stroke="#fde7c0" />
        </g>
      </svg>
      <span className="text-[19px] font-bold tracking-tight text-white">
        Loom<span className="text-amber-400">Craft</span>
      </span>
    </div>
  );
}

interface Props {
  name: string;
  onName(n: string): void;
  dirty: boolean;
  savedLabel: string;
  canUndo: boolean;
  canRedo: boolean;
  onUndo(): void;
  onRedo(): void;
  onSave(): void;
  onSaveAs(): void;
  onNew(): void;
  onOpenDrafts(): void;
  draftCount: number;
}

export function Header(p: Props) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-white/[0.06] bg-[#0d0d10] px-4">
      <LoomCraftLogo />
      <span className="hidden text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500 lg:inline">Apparel Studio</span>

      <div className="mx-auto flex min-w-0 items-center gap-2">
        <input
          value={p.name}
          onChange={(e) => p.onName(e.target.value)}
          spellCheck={false}
          className="w-[260px] min-w-0 rounded-md border border-transparent bg-transparent px-2 py-1 text-center text-sm font-medium text-zinc-100 hover:border-white/10 focus:border-amber-400/50 focus:bg-black/30 focus:outline-none"
          title="Design name"
        />
        <span className={`whitespace-nowrap text-[11px] ${p.dirty ? 'text-amber-400' : 'text-zinc-500'}`}>{p.savedLabel}</span>
      </div>

      <div className="flex items-center gap-1">
        <button onClick={p.onUndo} disabled={!p.canUndo} className="lc-btn h-8 w-8 p-0" title="Undo (Ctrl+Z)">
          <Undo2 size={15} />
        </button>
        <button onClick={p.onRedo} disabled={!p.canRedo} className="lc-btn h-8 w-8 p-0" title="Redo (Ctrl+Shift+Z)">
          <Redo2 size={15} />
        </button>
        <span className="mx-2 h-5 w-px bg-white/10" />
        <button onClick={p.onNew} className="lc-btn h-8 gap-1.5 px-2.5 text-xs" title="New design">
          <FilePlus2 size={14} /> New
        </button>
        <button onClick={p.onOpenDrafts} className="lc-btn h-8 gap-1.5 px-2.5 text-xs" title="Open drafts">
          <FolderOpen size={14} /> Drafts
          {p.draftCount > 0 && <span className="rounded bg-white/10 px-1 text-[10px] text-zinc-300">{p.draftCount}</span>}
        </button>
        <button onClick={p.onSaveAs} className="lc-btn h-8 px-2.5 text-xs" title="Save as a new draft">
          Save as
        </button>
        <button onClick={p.onSave} className="lc-btn-primary h-8 gap-1.5 px-3 text-xs" title="Save draft (Ctrl+S)">
          <Save size={14} /> Save
        </button>
      </div>
    </header>
  );
}
