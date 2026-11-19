import { useMemo, useState } from 'react';
import { CheckCircle2, Clapperboard, FileArchive, Globe, Image as ImageIcon, Loader2, X } from 'lucide-react';
import { GIF_MAX_SIDE, videoMimeType, type SpinFormat } from '../utils/spinMockup';

export interface SpinRequest {
  format: SpinFormat;
  width: number;
  height: number;
  frames: number;
  seconds: number;
  background: string | null;
}

interface Props {
  running: boolean;
  progress: number;
  label: string;
  /** Result of the last export, shown under the button. */
  done: { filename: string; bytes: number } | null;
  onStart(req: SpinRequest): void;
  onCancel(): void;
  onClose(): void;
}

const FORMATS: Array<{ id: SpinFormat; label: string; note: string; icon: typeof Clapperboard }> = [
  { id: 'video', label: 'Video', note: 'MP4 or WebM: social posts and product pages', icon: Clapperboard },
  { id: 'gif', label: 'GIF', note: `Looping animation, up to ${GIF_MAX_SIDE} px`, icon: ImageIcon },
  { id: 'html', label: 'Web spin', note: 'One HTML file: drag to rotate, embeds anywhere', icon: Globe },
  { id: 'zip', label: 'Frames', note: 'Numbered images + viewer for 360° players', icon: FileArchive },
];

const SIZES = [
  { id: 'square', label: 'Square', w: 1080, h: 1080 },
  { id: 'portrait', label: 'Portrait 4:5', w: 1080, h: 1350 },
  { id: 'story', label: 'Story 9:16', w: 1080, h: 1920 },
  { id: 'landscape', label: 'Landscape 16:9', w: 1920, h: 1080 },
];

const BACKGROUNDS: Array<{ id: string; label: string; color: string | null }> = [
  { id: 'white', label: 'White', color: '#ffffff' },
  { id: 'light', label: 'Light grey', color: '#efeff1' },
  { id: 'studio', label: 'Studio dark', color: '#141417' },
  { id: 'none', label: 'Transparent', color: null },
];

const fmtBytes = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

export default function SpinMockupPanel({ running, progress, label, done, onStart, onCancel, onClose }: Props) {
  const canVideo = useMemo(() => videoMimeType() !== null, []);
  const [format, setFormat] = useState<SpinFormat>(canVideo ? 'video' : 'gif');
  const [size, setSize] = useState('square');
  const [frames, setFrames] = useState(36);
  const [seconds, setSeconds] = useState(6);
  const [bg, setBg] = useState('white');
  const [custom, setCustom] = useState('#d9d4cb');

  const transparentOk = format !== 'video';
  const bgId = !transparentOk && bg === 'none' ? 'white' : bg;
  const background = bgId === 'custom' ? custom : (BACKGROUNDS.find((b) => b.id === bgId)?.color ?? '#ffffff');
  const sz = SIZES.find((s) => s.id === size)!;
  const k = format === 'gif' ? Math.min(1, GIF_MAX_SIDE / Math.max(sz.w, sz.h)) : 1;
  const outW = Math.round(sz.w * k);
  const outH = Math.round(sz.h * k);

  const chip = (active: boolean) =>
    `rounded-md px-2 py-1 text-[11px] transition ${active ? 'bg-violet-500 text-white' : 'bg-black/30 text-zinc-300 hover:bg-zinc-700/70 hover:text-white'}`;

  return (
    <div className="absolute right-3 top-14 z-30 w-[min(340px,calc(100%-24px))] rounded-xl border border-white/10 bg-[#111114]/95 p-3 shadow-2xl backdrop-blur" role="dialog" aria-label="360° mockup export">
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-zinc-100">360° Mockup</h3>
        <button onClick={onClose} disabled={running} className="text-zinc-500 hover:text-zinc-200 disabled:opacity-40" title="Close">
          <X size={14} />
        </button>
      </div>

      <fieldset disabled={running} className="space-y-3 disabled:opacity-60">
        <div className="grid grid-cols-2 gap-1.5">
          {FORMATS.map((f) => {
            const off = f.id === 'video' && !canVideo;
            const Icon = f.icon;
            return (
              <button
                key={f.id}
                onClick={() => setFormat(f.id)}
                disabled={off}
                aria-pressed={format === f.id}
                title={off ? "This browser can't record video" : f.note}
                className={`flex items-start gap-2 rounded-lg border p-2 text-left transition disabled:opacity-40 ${format === f.id ? 'border-violet-500/70 bg-violet-500/10' : 'border-white/10 hover:border-white/20'}`}
              >
                <Icon size={14} className={`mt-0.5 shrink-0 ${format === f.id ? 'text-violet-300' : 'text-zinc-400'}`} />
                <span>
                  <span className="block text-[11.5px] font-medium text-zinc-100">{f.label}</span>
                  <span className="block text-[10px] leading-snug text-zinc-500">{f.note}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Size</div>
          <div className="flex flex-wrap gap-1">
            {SIZES.map((s) => (
              <button key={s.id} onClick={() => setSize(s.id)} className={chip(size === s.id)}>
                {s.label}
              </button>
            ))}
          </div>
          <div className="mt-1 text-[10.5px] text-zinc-500">
            {outW} × {outH} px{format === 'gif' && k < 1 ? ' (GIFs are scaled down)' : ''}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className={format === 'video' ? 'pointer-events-none opacity-40' : ''}>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Frames</div>
            <div className="flex gap-1">
              {[24, 36, 72].map((n) => (
                <button key={n} onClick={() => setFrames(n)} className={chip(frames === n)}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">One turn</div>
            <div className="flex gap-1">
              {[4, 6, 8].map((n) => (
                <button key={n} onClick={() => setSeconds(n)} className={chip(seconds === n)}>
                  {n}s
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Background</div>
          <div className="flex flex-wrap items-center gap-1">
            {BACKGROUNDS.map((b) => (
              <button
                key={b.id}
                onClick={() => setBg(b.id)}
                disabled={b.color === null && !transparentOk}
                title={b.color === null && !transparentOk ? 'Video has no transparency' : b.label}
                className={`${chip(bgId === b.id)} flex items-center gap-1.5 disabled:opacity-40`}
              >
                <span
                  className="h-3 w-3 rounded-sm border border-white/25"
                  style={b.color ? { background: b.color } : { background: 'repeating-conic-gradient(#888 0% 25%, #ddd 0% 50%) 0 0/6px 6px' }}
                />
                {b.label}
              </button>
            ))}
            <label className={`${chip(bgId === 'custom')} relative flex cursor-pointer items-center gap-1.5`} title="Custom colour">
              <span className="h-3 w-3 rounded-sm border border-white/25" style={{ background: custom }} />
              Custom
              <input
                type="color"
                value={custom}
                onChange={(e) => {
                  setCustom(e.target.value);
                  setBg('custom');
                }}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
          </div>
        </div>
      </fieldset>

      <p className="mt-3 text-[10.5px] leading-snug text-zinc-500">Uses the current zoom, tilt, mode, fabric, mannequin and interior settings, starting from the front.</p>

      {running ? (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-[11px] text-zinc-300">
            <span className="flex items-center gap-1.5">
              <Loader2 size={12} className="animate-spin text-violet-400" /> {label}
            </span>
            <span className="font-mono text-zinc-400">{Math.round(progress * 100)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full bg-violet-500 transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <button onClick={onCancel} className="lc-btn mt-2 h-8 w-full justify-center text-xs">
            Cancel
          </button>
        </div>
      ) : (
        <>
          <button
            onClick={() => onStart({ format, width: sz.w, height: sz.h, frames, seconds, background: transparentOk ? (bgId === 'none' ? null : background) : background })}
            className="lc-btn lc-btn-primary mt-3 h-9 w-full justify-center text-xs"
          >
            Export 360° {FORMATS.find((f) => f.id === format)!.label}
          </button>
          {done && (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-300">
              <CheckCircle2 size={12} /> Saved {done.filename} · {fmtBytes(done.bytes)}
            </p>
          )}
        </>
      )}
    </div>
  );
}
