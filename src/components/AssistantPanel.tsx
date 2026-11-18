import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type Anthropic from '@anthropic-ai/sdk';
import { AlertTriangle, ArrowUp, Check, KeyRound, Loader2, RotateCcw, Square } from 'lucide-react';
import { describeToolCall } from '../ai/executor';
import type { AgentStatus } from '../ai/useStudioAgent';

type MessageParam = Anthropic.Beta.BetaMessageParam;

interface Props {
  active: boolean;
  history: MessageParam[];
  status: AgentStatus;
  onSend(text: string): void;
  onStop(): void;
  onReset(): void;
}

const SUGGESTIONS = [
  'Design a black oversized tee with a bold collegiate “LOOMCRAFT ATHLETIC” arch across the chest',
  'Critique my current design for print readiness and fix the top issue',
  'Make a sand hoodie with a minimal left-chest logo and a large back print',
  'Switch this view to puff print and adjust colors so it reads well on the garment',
];

type ToolOutcome = { error: boolean; image?: string; text?: string };

type Item =
  | { kind: 'user'; key: string; text: string }
  | { kind: 'assistant'; key: string; text: string }
  | { kind: 'tool'; key: string; label: string; outcome?: ToolOutcome }
  | { kind: 'note'; key: string; text: string };

function buildItems(history: MessageParam[]): Item[] {
  const results = new Map<string, ToolOutcome>();
  for (const m of history) {
    if (m.role !== 'user' || typeof m.content === 'string') continue;
    for (const b of m.content) {
      if (b.type !== 'tool_result') continue;
      const parts = typeof b.content === 'string' ? [{ type: 'text' as const, text: b.content }] : b.content ?? [];
      const img = parts.find((p) => p.type === 'image');
      const txt = parts.find((p) => p.type === 'text');
      results.set(b.tool_use_id, {
        error: !!b.is_error,
        image: img && img.type === 'image' && img.source.type === 'base64' ? `data:${img.source.media_type};base64,${img.source.data}` : undefined,
        text: txt && txt.type === 'text' ? txt.text : undefined,
      });
    }
  }

  const items: Item[] = [];
  history.forEach((m, i) => {
    if (m.role === 'user') {
      if (typeof m.content === 'string') items.push({ kind: 'user', key: `u${i}`, text: m.content });
      return;
    }
    if (m.role !== 'assistant' || typeof m.content === 'string') return;
    m.content.forEach((b, j) => {
      const key = `a${i}-${j}`;
      if (b.type === 'text' && b.text.trim()) items.push({ kind: 'assistant', key, text: b.text.trim() });
      else if (b.type === 'tool_use') {
        items.push({ kind: 'tool', key, label: describeToolCall(b.name, b.input as Record<string, unknown>), outcome: results.get(b.id) });
      } else if (b.type === 'fallback') items.push({ kind: 'note', key, text: 'Continued on a fallback model' });
    });
  });
  return items;
}

/** Minimal formatting for Claude's replies: paragraphs, bullet lines and **bold**. */
function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n{2,}/).map((para, i) => (
        <p key={i} className="mb-2 whitespace-pre-wrap last:mb-0">
          {para.split(/(\*\*[^*]+\*\*)/g).map((seg, k) =>
            seg.startsWith('**') && seg.endsWith('**') ? (
              <strong key={k} className="font-semibold text-white">
                {seg.slice(2, -2)}
              </strong>
            ) : (
              seg
            ),
          )}
        </p>
      ))}
    </>
  );
}

/** Claude chat, rendered as the "Ask Claude" tab of the assistant drawer. */
export const ClaudeChat = memo(function ClaudeChat({ active, history, status, onSend, onStop, onReset }: Props) {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const items = useMemo(() => buildItems(history), [history]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [items.length, status.busy, status.activeTool]);

  useEffect(() => {
    if (active) inputRef.current?.focus();
  }, [active]);

  const submit = (text = draft) => {
    if (!text.trim() || status.busy) return;
    onSend(text);
    setDraft('');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2">
        <p className="mr-auto text-[11px] text-zinc-500">Claude edits your design directly · uses your Anthropic API key</p>
        <button onClick={onReset} disabled={!history.length} className="lc-btn h-7 gap-1 px-2 text-[11px]" title="New chat">
          <RotateCcw size={12} /> New chat
        </button>
      </div>

      <div ref={scrollRef} className="lc-scroll flex-1 space-y-3 overflow-y-auto px-4 py-4 text-[13px] leading-relaxed">
        {status.configured === false && (
          <div className="rounded-xl border border-violet-500/30 bg-violet-500/[0.07] p-3.5 text-xs text-zinc-300">
            <div className="mb-1.5 flex items-center gap-2 font-semibold text-violet-200">
              <KeyRound size={14} /> Connect your Anthropic API key
            </div>
            <p className="mb-2">
              Create a file named <code className="rounded bg-black/40 px-1 font-mono">.env.local</code> in the LoomCraft folder containing:
            </p>
            <pre className="mb-2 overflow-x-auto rounded-md bg-black/50 px-2.5 py-2 font-mono text-[11px] text-zinc-200">ANTHROPIC_API_KEY=sk-ant-...</pre>
            <p>
              Then restart <code className="rounded bg-black/40 px-1 font-mono">npm run dev</code>. The key stays on the dev server and is never sent to the browser.
            </p>
          </div>
        )}

        {!items.length && (
          <div className="pt-2">
            <p className="mb-3 text-zinc-400">
              Ask for a design, a change, or feedback. Claude can switch garments and colors, add and style text, draw vector artwork, place layers in inches, set print
              techniques, and look at the mockup to check its work.
            </p>
            <div className="space-y-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => submit(s)}
                  disabled={status.busy}
                  className="block w-full rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-left text-xs text-zinc-300 transition hover:border-violet-500/40 hover:bg-violet-500/[0.06] hover:text-zinc-100 disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {items.map((it) => {
          if (it.kind === 'user')
            return (
              <div key={it.key} className="ml-8 whitespace-pre-wrap rounded-2xl rounded-br-md bg-violet-500/90 px-3.5 py-2 text-white">
                {it.text}
              </div>
            );
          if (it.kind === 'assistant')
            return (
              <div key={it.key} className="mr-4 text-zinc-200">
                <RichText text={it.text} />
              </div>
            );
          if (it.kind === 'note')
            return (
              <div key={it.key} className="text-[11px] italic text-zinc-500">
                {it.text}
              </div>
            );
          const pending = !it.outcome;
          return (
            <div key={it.key}>
              <div
                className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] ${
                  it.outcome?.error ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-white/[0.08] bg-white/[0.03] text-zinc-400'
                }`}
                title={it.outcome?.error ? it.outcome.text : undefined}
              >
                {pending ? (
                  <Loader2 size={12} className="shrink-0 animate-spin text-violet-400" />
                ) : it.outcome?.error ? (
                  <AlertTriangle size={12} className="shrink-0" />
                ) : (
                  <Check size={12} className="shrink-0 text-violet-400" />
                )}
                <span className="truncate">{it.label}</span>
              </div>
              {it.outcome?.image && <img src={it.outcome.image} alt="Mockup Claude checked" className="mt-1.5 w-32 rounded-lg border border-white/10" />}
            </div>
          );
        })}

        {status.busy && !status.activeTool && (
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Loader2 size={13} className="animate-spin text-violet-400" /> Thinking…
          </div>
        )}
        {status.notice && <div className="text-xs text-zinc-400">{status.notice}</div>}
        {status.error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            <AlertTriangle size={14} className="mt-px shrink-0" />
            <span>{status.error}</span>
          </div>
        )}
      </div>

      <div className="border-t border-white/[0.06] p-3">
        <div className="flex items-end gap-2 rounded-xl border border-white/10 bg-black/30 p-1.5 focus-within:border-violet-500/60">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={2}
            placeholder={status.busy ? 'Claude is working…' : 'Describe a design or a change…'}
            className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[13px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
          />
          {status.busy ? (
            <button onClick={onStop} className="lc-btn h-9 w-9 shrink-0 p-0" title="Stop">
              <Square size={13} className="fill-current" />
            </button>
          ) : (
            <button onClick={() => submit()} disabled={!draft.trim()} className="lc-btn-primary h-9 w-9 shrink-0 p-0" title="Send (Enter)">
              <ArrowUp size={16} />
            </button>
          )}
        </div>
        <p className="mt-1.5 px-1 text-[10.5px] text-zinc-600">Enter to send · Shift+Enter for a new line · Ctrl+Z undoes any change</p>
      </div>
    </div>
  );
});
