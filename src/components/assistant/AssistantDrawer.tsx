import { memo, useEffect, useState, type ReactNode } from 'react';
import { Bot, ClipboardList, LayoutTemplate, Palette, Sparkles, X } from 'lucide-react';

export type AssistantTab = 'layouts' | 'colors' | 'specs' | 'claude';

const TABS: Array<{ id: AssistantTab; label: string; icon: ReactNode }> = [
  { id: 'layouts', label: 'Layouts', icon: <LayoutTemplate size={13} /> },
  { id: 'colors', label: 'Colors', icon: <Palette size={13} /> },
  { id: 'specs', label: 'Specs', icon: <ClipboardList size={13} /> },
  { id: 'claude', label: 'Ask Claude', icon: <Bot size={13} /> },
];

interface Props {
  open: boolean;
  onClose(): void;
  /** Body for a tab. Only the active tab is mounted; chat history lives in App, so switching tabs loses nothing. */
  render(tab: AssistantTab): ReactNode;
}

/**
 * Right slide-over that stays mounted (for the slide animation and to keep chat state) and doesn't block
 * the canvas, so layouts and colors can be applied while watching the garment.
 */
export const AssistantDrawer = memo(function AssistantDrawer({ open, onClose, render }: Props) {
  const [tab, setTab] = useState<AssistantTab>('layouts');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [role="dialog"]')) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <aside
      aria-hidden={!open}
      className={`fixed bottom-0 right-0 top-14 z-30 flex w-[400px] max-w-full flex-col border-l border-white/10 bg-[#101013]/[0.98] shadow-[-24px_0_60px_-20px_rgba(0,0,0,0.75)] backdrop-blur transition-transform duration-300 ease-out ${
        open ? 'translate-x-0' : 'pointer-events-none translate-x-full'
      }`}
    >
      <header className="flex items-center gap-2.5 px-4 pb-2 pt-3">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-violet-500/15 text-violet-300">
          <Sparkles size={16} />
        </span>
        <div className="mr-auto">
          <h2 className="text-sm font-semibold text-zinc-100">Design assistant</h2>
          <p className="text-[11px] text-zinc-500">Local helpers run instantly · no account needed</p>
        </div>
        <button onClick={onClose} className="lc-btn h-8 w-8 p-0" title="Close (Esc)">
          <X size={15} />
        </button>
      </header>

      <nav className="mx-4 mb-1 grid grid-cols-4 gap-1 rounded-lg bg-black/30 p-1" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center justify-center gap-1 rounded-md py-1.5 text-[11px] font-medium transition ${
              tab === t.id ? 'bg-zinc-700/80 text-white shadow' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>

      <div className="flex min-h-0 flex-1 flex-col border-t border-white/[0.06]">
        {tab === 'claude' ? render('claude') : <div className="lc-scroll min-h-0 flex-1 overflow-y-auto">{open && render(tab)}</div>}
      </div>
    </aside>
  );
});
