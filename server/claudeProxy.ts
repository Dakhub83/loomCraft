import type { IncomingMessage, ServerResponse } from 'node:http';
import Anthropic from '@anthropic-ai/sdk';
import type { Connect, Plugin } from 'vite';
import { ASSISTANT_MODEL, STUDIO_TOOLS, SYSTEM_PROMPT } from '../src/ai/toolDefs';

/**
 * Vite plugin: a small same-origin proxy so the browser never sees the Anthropic API key.
 *
 *   POST /api/claude         { messages }  ->  one Claude turn (BetaMessage JSON)
 *   GET  /api/claude/status                ->  { configured }
 *
 * The model, system prompt and tools are fixed here, server-side; the browser only sends the
 * conversation. The browser runs the tool loop because every tool edits the live canvas.
 */

const MAX_BODY_BYTES = 25 * 1024 * 1024; // conversations carry mockup screenshots

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Conversation is too large. Start a new chat.'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export function claudeProxy(options: { apiKey?: string }): Plugin {
  const configured = !!options.apiKey;
  // Lazily constructed so the dev server starts fine without a key.
  let client: Anthropic | null = null;
  const getClient = () => (client ??= new Anthropic({ apiKey: options.apiKey }));

  const handler: Connect.NextHandleFunction = async (req, res, next) => {
    const url = req.url ?? '';
    if (req.method === 'GET' && url.startsWith('/status')) return send(res, 200, { configured, model: ASSISTANT_MODEL });
    if (req.method !== 'POST' || (url !== '/' && url !== '')) return next();

    if (!configured) {
      return send(res, 401, {
        error: 'No Anthropic API key configured. Add ANTHROPIC_API_KEY to a .env.local file in the project folder and restart `npm run dev`.',
      });
    }

    let messages: Anthropic.Beta.BetaMessageParam[];
    try {
      const body = JSON.parse(await readBody(req));
      if (!Array.isArray(body?.messages) || body.messages.length === 0) return send(res, 400, { error: 'Expected { messages: [...] }.' });
      messages = body.messages;
    } catch (e) {
      const status = (e as { status?: number }).status ?? 400;
      return send(res, status, { error: status === 413 ? (e as Error).message : 'Invalid JSON body.' });
    }

    try {
      const message = await getClient().beta.messages.create({
        model: ASSISTANT_MODEL,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        tools: STUDIO_TOOLS,
        messages,
        // Medium effort keeps the interactive assistant snappy; raise to "high" for more deliberate designs.
        output_config: { effort: 'medium' },
        // Caches the stable prefix (tools + system + earlier turns) across the tool loop.
        cache_control: { type: 'ephemeral' },
        // If the model declines a request, the API retries on a suitable fallback model in the same call.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      });
      send(res, 200, message);
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) {
        return send(res, 401, { error: 'The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in .env.local.' });
      }
      if (e instanceof Anthropic.RateLimitError) {
        return send(res, 429, { error: 'Rate limited by the Anthropic API. Wait a moment and try again.' });
      }
      if (e instanceof Anthropic.BadRequestError) {
        return send(res, 400, { error: `Claude rejected the request: ${e.message}` });
      }
      if (e instanceof Anthropic.APIError) {
        return send(res, e.status && e.status >= 400 ? e.status : 502, { error: `Anthropic API error: ${e.message}` });
      }
      send(res, 502, { error: `Couldn't reach Claude: ${(e as Error).message}` });
    }
  };

  return {
    name: 'loomcraft-claude-proxy',
    configureServer(server) {
      server.middlewares.use('/api/claude', handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/claude', handler);
    },
  };
}
