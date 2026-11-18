import { useCallback, useEffect, useRef, useState } from 'react';
import type Anthropic from '@anthropic-ai/sdk';
import { runStudioTool, type AgentContext } from './executor';

type MessageParam = Anthropic.Beta.BetaMessageParam;
type Message = Anthropic.Beta.BetaMessage;
type ToolResult = Anthropic.Beta.BetaToolResultBlockParam;

const MAX_STEPS = 24;

export interface AgentStatus {
  configured: boolean | null;
  busy: boolean;
  /** Name of the tool currently executing, for the progress line. */
  activeTool: string | null;
  error: string | null;
  notice: string | null;
}

/**
 * Client-side agent loop. Each step POSTs the whole conversation to the dev-server proxy, appends
 * Claude's reply (all content blocks, unchanged – thinking and fallback blocks must round-trip as-is),
 * executes any tool calls against the live studio, and sends every tool_result back in one user message.
 */
export function useStudioAgent(getContext: () => AgentContext) {
  const historyRef = useRef<MessageParam[]>([]);
  const [history, setHistory] = useState<MessageParam[]>([]);
  const [status, setStatus] = useState<AgentStatus>({ configured: null, busy: false, activeTool: null, error: null, notice: null });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch('/api/claude/status')
      .then((r) => (r.ok ? r.json() : { configured: false }))
      .then((j: { configured: boolean }) => setStatus((s) => ({ ...s, configured: !!j.configured })))
      .catch(() => setStatus((s) => ({ ...s, configured: false })));
  }, []);

  const push = (m: MessageParam) => {
    historyRef.current = [...historyRef.current, m];
    setHistory(historyRef.current);
  };

  const send = useCallback(async (text: string) => {
    const prompt = text.trim();
    if (!prompt || abortRef.current) return;
    const abort = new AbortController();
    abortRef.current = abort;
    setStatus((s) => ({ ...s, busy: true, error: null, notice: null, activeTool: null }));
    push({ role: 'user', content: prompt });

    try {
      for (let step = 0; step < MAX_STEPS; step++) {
        const res = await fetch('/api/claude', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: historyRef.current }),
          signal: abort.signal,
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `Request failed (${res.status}).`);
        }
        const message = (await res.json()) as Message;
        push({ role: 'assistant', content: message.content });

        if (message.stop_reason === 'tool_use') {
          const results: ToolResult[] = [];
          for (const block of message.content) {
            if (block.type !== 'tool_use') continue;
            if (abort.signal.aborted) {
              results.push({ type: 'tool_result', tool_use_id: block.id, content: 'Stopped by the user before this ran.', is_error: true });
              continue;
            }
            setStatus((s) => ({ ...s, activeTool: block.name }));
            // Let React flush state from the previous tool (designs, color, effects) before reading it.
            await new Promise((r) => setTimeout(r, 30));
            // Sequential on purpose: canvas edits depend on each other's order.
            results.push(await runStudioTool(block, getContext()));
          }
          setStatus((s) => ({ ...s, activeTool: null }));
          // Every tool_use must get its tool_result, all in one user message.
          push({ role: 'user', content: results });
          if (abort.signal.aborted) break;
          continue;
        }

        if (message.stop_reason === 'refusal') {
          setStatus((s) => ({ ...s, notice: 'Claude declined this request. Try rephrasing it.' }));
        } else if (message.stop_reason === 'max_tokens') {
          setStatus((s) => ({ ...s, notice: 'The reply hit the length limit. Ask Claude to continue.' }));
        }
        break;
      }
    } catch (e) {
      if (!abort.signal.aborted) setStatus((s) => ({ ...s, error: (e as Error).message }));
    } finally {
      abortRef.current = null;
      setStatus((s) => ({ ...s, busy: false, activeTool: null, notice: abort.signal.aborted ? 'Stopped.' : s.notice }));
    }
    // getContext is read fresh each call
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    historyRef.current = [];
    setHistory([]);
    setStatus((s) => ({ ...s, error: null, notice: null }));
  }, []);

  return { history, status, send, stop, reset };
}
