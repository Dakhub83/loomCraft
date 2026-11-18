import { memo, useState } from 'react';
import { Download, FileArchive, ImageDown, Loader2 } from 'lucide-react';
import { Section } from './Toolbar';
import type { StudioSnapshot } from '../utils/exportTools';
import type { ViewId } from '../types';

interface Props {
  getSnapshot(): StudioSnapshot;
  viewsWithArt: ViewId[];
  onError(msg: string): void;
  onInfo(msg: string): void;
}

// Export code (jsPDF, JSZip, SVG rasterizing) is loaded on first use, keeping the studio's startup bundle lean.
const loadExportTools = () => import('../utils/exportTools');

export const ExportPanel = memo(function ExportPanel({ getSnapshot, viewsWithArt, onError, onInfo }: Props) {
  const [busy, setBusy] = useState<null | 'mockup' | 'zip'>(null);
  const [progress, setProgress] = useState('');

  const run = async (kind: 'mockup' | 'zip') => {
    setBusy(kind);
    try {
      const tools = await loadExportTools();
      const snap = getSnapshot();
      if (kind === 'mockup') {
        await tools.exportMockupPNG(snap);
        onInfo('Mockup PNG exported (2000 × 2240 px)');
      } else {
        const { filename, files } = await tools.exportProductionZip(snap, setProgress);
        onInfo(`Downloaded ${filename} · ${files.length} files`);
      }
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(null);
      setProgress('');
    }
  };

  return (
    <Section title="Export" icon={<Download size={14} />}>
      <button onClick={() => run('zip')} disabled={!!busy} className="lc-btn-primary w-full justify-start gap-3 px-3 py-2.5">
        {busy === 'zip' ? <Loader2 size={16} className="animate-spin" /> : <FileArchive size={16} />}
        <span className="text-left">
          <span className="block text-xs font-semibold">Download Production Pack (.ZIP)</span>
          <span className="block text-[11px] opacity-75">Front & back mockups · 300 DPI PNGs · PDF tech pack</span>
        </span>
      </button>
      <button onClick={() => run('mockup')} disabled={!!busy} className="lc-btn mt-2 w-full justify-start gap-3 px-3 py-2.5">
        {busy === 'mockup' ? <Loader2 size={16} className="animate-spin text-violet-400" /> : <ImageDown size={16} className="text-violet-400" />}
        <span className="text-left">
          <span className="block text-xs font-semibold text-zinc-100">Mockup PNG only</span>
          <span className="block text-[11px] text-zinc-500">Current view · garment + artwork</span>
        </span>
      </button>
      <p className="mt-2 min-h-4 text-[11px] text-zinc-500" aria-live="polite">
        {progress || (viewsWithArt.length ? `Artwork on: ${viewsWithArt.join(', ')}` : 'Add artwork to export a production pack.')}
      </p>
    </Section>
  );
});
