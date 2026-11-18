import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { claudeProxy } from './server/claudeProxy';

export default defineConfig(({ mode }) => {
  // Load ALL env vars (empty prefix) server-side only. ANTHROPIC_API_KEY is never exposed to the
  // browser bundle – only VITE_-prefixed vars are, and we don't use any.
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), tailwindcss(), claudeProxy({ apiKey: env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY })],
  };
});
