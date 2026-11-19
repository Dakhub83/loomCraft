/* ================================================================================================
 * 360° mockup export. A `FrameSource` (the 360° viewer) renders the garment at any azimuth into a
 * canvas of the requested size; this module turns a full turn into:
 *   - video  : MP4 (where MediaRecorder can record it) or WebM, rendered in real time
 *   - gif    : looping animated GIF with one shared palette (no colour flicker between frames)
 *   - html   : a single self-contained page with every frame embedded, drag / swipe to rotate
 *   - zip    : numbered frames + an index.html viewer, for e-commerce 360° players
 * Nothing here touches Three.js directly, so it stays independent of how the frames are produced.
 * ============================================================================================== */

export type SpinFormat = 'video' | 'gif' | 'html' | 'zip';

export interface FrameSource {
  /** Prepare to render frames of exactly width × height pixels. */
  begin(width: number, height: number): void;
  /** Render the garment seen from `azimuth` radians (0 = front) and return the canvas holding it. */
  render(azimuth: number): CanvasImageSource;
  /** Restore the live viewer. Always called, even after an error or cancel. */
  end(): void;
}

export interface SpinOptions {
  format: SpinFormat;
  width: number;
  height: number;
  /** Frames per turn (gif / html / zip). Video uses its own frame rate. */
  frames: number;
  /** Seconds per full turn (video, gif, and the autoplay speed of html / zip viewers). */
  seconds: number;
  /** CSS colour, or null for a transparent background (not available for video). */
  background: string | null;
  /** Used for file names and the viewer title. */
  name: string;
  onProgress(fraction: number, label: string): void;
  signal: AbortSignal;
}

export interface SpinResult {
  blob: Blob;
  filename: string;
}

/** Longest side of an exported GIF: GIFs are 256-colour and grow fast with size. */
export const GIF_MAX_SIDE = 720;

const slug = (s: string) => (s || 'loomcraft').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'loomcraft';
const pad = (n: number, w: number) => String(n).padStart(w, '0');
const TAU = Math.PI * 2;

function checkAbort(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Export cancelled', 'AbortError');
}

/** Lets the browser paint (progress) between frames. */
const yieldFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/** `readback`: the pixels will be read with getImageData (GIF). Otherwise keep the GPU-backed canvas. */
function canvas2d(w: number, h: number, readback = false) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', readback ? { willReadFrequently: true } : undefined)!;
  return { c, ctx };
}

function compose(ctx: CanvasRenderingContext2D, src: CanvasImageSource, w: number, h: number, bg: string | null) {
  ctx.clearRect(0, 0, w, h);
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(src, 0, 0, w, h);
}

function toBlob(c: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not encode a frame'))), type, quality));
}

const blobToDataUrl = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });

const VIDEO_TYPES = ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];

/** The best video type this browser claims it can record from a canvas, or null if none. */
export function videoMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement.prototype.captureStream !== 'function') return null;
  return VIDEO_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

let probed: Promise<string | null> | null = null;

/**
 * The first video type that actually produces data. `isTypeSupported` is not enough: some Chromium
 * builds without proprietary codecs report MP4 as supported and then record 0 bytes. Each candidate
 * records a short test clip (about 0.7 s) once per session.
 */
export function workingVideoType(): Promise<string | null> {
  probed ??= (async () => {
    if (!videoMimeType()) return null;
    for (const type of VIDEO_TYPES) {
      if (!MediaRecorder.isTypeSupported(type)) continue;
      try {
        const c = document.createElement('canvas');
        c.width = 320;
        c.height = 240;
        const ctx = c.getContext('2d')!;
        const stream = c.captureStream(0);
        const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
        const rec = new MediaRecorder(stream, { mimeType: type });
        let bytes = 0;
        rec.ondataavailable = (e) => (bytes += e.data.size);
        const stopped = new Promise<void>((r) => (rec.onstop = () => r()));
        rec.start(100);
        // encoders need a few hundred milliseconds of real frames before they emit anything
        for (let i = 0; i < 16; i++) {
          ctx.fillStyle = `hsl(${i * 22}, 70%, 55%)`;
          ctx.fillRect(0, 0, 320, 240);
          track.requestFrame();
          await new Promise((r) => setTimeout(r, 40));
        }
        rec.stop();
        await stopped;
        track.stop();
        if (bytes > 0) return type;
      } catch {
        // try the next candidate
      }
    }
    return null;
  })();
  return probed;
}

export async function exportSpin(src: FrameSource, o: SpinOptions): Promise<SpinResult> {
  const base = `${slug(o.name)}-360`;
  let w = o.width;
  let h = o.height;
  if (o.format === 'gif') {
    const k = Math.min(1, GIF_MAX_SIDE / Math.max(w, h));
    w = Math.round(w * k);
    h = Math.round(h * k);
  }
  src.begin(w, h);
  try {
    switch (o.format) {
      case 'video':
        return (await encodeVideo(src, o, w, h, base)) ?? (await recordVideo(src, o, w, h, base));
      case 'gif':
        return await encodeGif(src, o, w, h, base);
      case 'html':
        return await webSpin(src, o, w, h, base);
      case 'zip':
        return await frameZip(src, o, w, h, base);
    }
  } finally {
    src.end();
  }
}

// ------------------------------------------------------------------------------------------ video

const VIDEO_FPS = 30;

/** WebCodecs configurations in order of preference: H.264 in MP4 plays everywhere, VP9/VP8 WebM is the fallback. */
const ENCODERS: Array<{ codec: string; container: 'mp4' | 'webm'; track: string }> = [
  { codec: 'avc1.640028', container: 'mp4', track: 'avc' },
  { codec: 'avc1.640033', container: 'mp4', track: 'avc' },
  { codec: 'avc1.42E033', container: 'mp4', track: 'avc' },
  { codec: 'vp09.00.40.08', container: 'webm', track: 'V_VP9' },
  { codec: 'vp8', container: 'webm', track: 'V_VP8' },
];

/**
 * Frame-exact video through WebCodecs: every frame is rendered, stamped at 1/30 s and encoded, so the
 * spin is smooth however long each frame takes to render. Returns null when WebCodecs (or a usable
 * codec) is unavailable, so the caller can fall back to real-time recording.
 */
async function encodeVideo(src: FrameSource, o: SpinOptions, w: number, h: number, base: string): Promise<SpinResult | null> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return null;
  // H.264 needs even dimensions
  const W = w - (w % 2);
  const H = h - (h % 2);
  const bitrate = Math.round(W * H * VIDEO_FPS * 0.12);
  let pick: (typeof ENCODERS)[number] | null = null;
  let config: VideoEncoderConfig | null = null;
  for (const e of ENCODERS) {
    const c: VideoEncoderConfig = { codec: e.codec, width: W, height: H, bitrate, framerate: VIDEO_FPS };
    if (e.container === 'mp4') c.avc = { format: 'avc' };
    try {
      if ((await VideoEncoder.isConfigSupported(c)).supported) {
        pick = e;
        config = c;
        break;
      }
    } catch {
      // unsupported codec string: try the next one
    }
  }
  if (!pick || !config) return null;

  const mp4 = pick.container === 'mp4';
  const muxer = mp4
    ? await import('mp4-muxer').then(({ Muxer, ArrayBufferTarget }) => {
        const target = new ArrayBufferTarget();
        const m = new Muxer({ target, video: { codec: 'avc', width: W, height: H, frameRate: VIDEO_FPS }, fastStart: 'in-memory' });
        return { add: m.addVideoChunk.bind(m), finish: () => (m.finalize(), target.buffer) };
      })
    : await import('webm-muxer').then(({ Muxer, ArrayBufferTarget }) => {
        const target = new ArrayBufferTarget();
        const m = new Muxer({ target, video: { codec: pick!.track, width: W, height: H, frameRate: VIDEO_FPS } });
        return { add: m.addVideoChunk.bind(m), finish: () => (m.finalize(), target.buffer) };
      });

  let failure: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.add(chunk, meta),
    error: (e) => (failure = e instanceof Error ? e : new Error(String(e))),
  });
  encoder.configure(config);
  const { c, ctx } = canvas2d(W, H);
  const bg = o.background ?? '#ffffff';
  const total = Math.round(o.seconds * VIDEO_FPS);
  const step = 1e6 / VIDEO_FPS;
  try {
    for (let i = 0; i < total; i++) {
      checkAbort(o.signal);
      if (failure) throw failure;
      compose(ctx, src.render((i / total) * TAU), W, H, bg);
      const frame = new VideoFrame(c, { timestamp: Math.round(i * step), duration: Math.round(step) });
      encoder.encode(frame, { keyFrame: i % (VIDEO_FPS * 2) === 0 });
      frame.close();
      // keep the encoder queue short so memory stays flat on long or large exports
      while (encoder.encodeQueueSize > 4) await new Promise((r) => setTimeout(r, 4));
      o.onProgress((i + 1) / total, `Encoding frame ${i + 1} / ${total}`);
      if (i % 3 === 0) await yieldFrame();
    }
    await encoder.flush();
    if (failure) throw failure;
  } finally {
    if (encoder.state !== 'closed') encoder.close();
  }
  const blob = new Blob([muxer.finish()], { type: mp4 ? 'video/mp4' : 'video/webm' });
  return { blob, filename: `${base}.${mp4 ? 'mp4' : 'webm'}` };
}

/** Real-time fallback for browsers without WebCodecs. */
async function recordVideo(src: FrameSource, o: SpinOptions, w: number, h: number, base: string): Promise<SpinResult> {
  o.onProgress(0, 'Checking video support');
  const mime = await workingVideoType();
  if (!mime) throw new Error("This browser can't record video. Choose GIF or Web spin instead.");
  const { c, ctx } = canvas2d(w, h);
  const bg = o.background ?? '#ffffff';
  compose(ctx, src.render(0), w, h, bg);
  const stream = c.captureStream(0);
  const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: Math.round(w * h * 30 * 0.16) });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise<void>((res) => (recorder.onstop = () => res()));
  recorder.start(250);

  // Real time: the azimuth follows the wall clock, so the turn speed is right even when a frame takes
  // longer than 1/30 s to render (the video then simply has fewer distinct frames).
  const duration = o.seconds * 1000;
  const start = performance.now();
  try {
    for (;;) {
      checkAbort(o.signal);
      const t = performance.now() - start;
      if (t >= duration) break;
      compose(ctx, src.render((t / duration) * TAU), w, h, bg);
      track.requestFrame();
      o.onProgress(t / duration, 'Recording video');
      await yieldFrame();
    }
    // hold the closing frame one tick so the last segment has a duration
    compose(ctx, src.render(TAU * 0.999), w, h, bg);
    track.requestFrame();
    await new Promise((r) => setTimeout(r, 1000 / 30));
  } finally {
    if (recorder.state !== 'inactive') recorder.stop();
    await stopped;
    track.stop();
  }
  checkAbort(o.signal);
  const type = mime.split(';')[0];
  const blob = new Blob(chunks, { type });
  if (blob.size === 0) throw new Error('The browser recorded an empty video. Choose GIF or Web spin instead.');
  return { blob, filename: `${base}.${type === 'video/mp4' ? 'mp4' : 'webm'}` };
}

// -------------------------------------------------------------------------------------------- gif

async function encodeGif(src: FrameSource, o: SpinOptions, w: number, h: number, base: string): Promise<SpinResult> {
  const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
  const { ctx } = canvas2d(w, h, true);
  const N = o.frames;
  const transparent = !o.background;
  const format = transparent ? 'rgba4444' : 'rgb565';
  const grab = (i: number) => {
    compose(ctx, src.render((i / N) * TAU), w, h, o.background);
    return ctx.getImageData(0, 0, w, h).data;
  };

  // one palette for the whole loop, sampled from frames spread around the turn
  const samples = Math.min(N, 8);
  const step = 3;
  const per = Math.ceil((w * h) / step);
  const pool = new Uint8ClampedArray(per * 4 * samples);
  for (let s = 0; s < samples; s++) {
    checkAbort(o.signal);
    const px = grab(Math.floor((s * N) / samples));
    for (let p = 0, q = s * per * 4; p < w * h; p += step, q += 4) pool.set(px.subarray(p * 4, p * 4 + 4), q);
    o.onProgress((s / samples) * 0.15, 'Building colour palette');
    await yieldFrame();
  }
  const palette = quantize(pool, 256, transparent ? { format, oneBitAlpha: true } : { format });
  const transparentIndex = transparent ? palette.findIndex((c) => c[3] === 0) : -1;

  const gif = GIFEncoder();
  const delay = Math.max(20, Math.round((o.seconds * 1000) / N / 10) * 10); // GIF delays are in 10 ms steps
  for (let i = 0; i < N; i++) {
    checkAbort(o.signal);
    const index = applyPalette(grab(i), palette, format);
    gif.writeFrame(index, w, h, {
      palette: i === 0 ? palette : undefined,
      delay,
      repeat: 0,
      transparent: transparentIndex >= 0,
      transparentIndex: Math.max(0, transparentIndex),
      dispose: transparentIndex >= 0 ? 2 : -1,
    });
    o.onProgress(0.15 + ((i + 1) / N) * 0.85, `Encoding frame ${i + 1} / ${N}`);
    await yieldFrame();
  }
  gif.finish();
  return { blob: new Blob([gif.bytes()], { type: 'image/gif' }), filename: `${base}.gif` };
}

// ----------------------------------------------------------------------------- frames (html / zip)

/** Renders N frames and encodes each one straight away (nothing raw is kept in memory). */
async function renderFrames(src: FrameSource, o: SpinOptions, w: number, h: number, label: string): Promise<{ blobs: Blob[]; ext: string }> {
  const { c, ctx } = canvas2d(w, h);
  // Solid backgrounds: JPEG (fast, small). Transparent: PNG for the frame set (lossless, universal),
  // WebP for the web spin (keeps alpha, much smaller); Safari can't encode WebP, so check what we got.
  const want = o.background ? 'image/jpeg' : o.format === 'zip' ? 'image/png' : 'image/webp';
  const blobs: Blob[] = [];
  for (let i = 0; i < o.frames; i++) {
    checkAbort(o.signal);
    compose(ctx, src.render((i / o.frames) * TAU), w, h, o.background);
    let b = await toBlob(c, want, 0.9);
    if (b.type !== want && want === 'image/webp') b = await toBlob(c, 'image/png');
    blobs.push(b);
    o.onProgress((i + 1) / o.frames, `${label} ${i + 1} / ${o.frames}`);
    await yieldFrame();
  }
  const t = blobs[0]?.type ?? 'image/png';
  return { blobs, ext: t === 'image/jpeg' ? 'jpg' : t === 'image/webp' ? 'webp' : 'png' };
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

/**
 * A dependency-free 360° viewer page. Autoplays (unless the visitor prefers reduced motion), drag or
 * swipe to turn, arrow keys step one frame, and it resumes spinning a few seconds after interaction.
 */
export function spinViewerHtml(opts: { title: string; frames: string[]; width: number; height: number; seconds: number; background: string | null }) {
  const { title, frames, width, height, seconds, background } = opts;
  const bg = background ?? 'transparent';
  const page = background ?? '#f4f4f5';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  html,body{margin:0;height:100%;background:${page};font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
  .wrap{min-height:100%;display:grid;place-items:center;padding:16px;box-sizing:border-box}
  figure{margin:0;width:min(100%,${width}px,calc((100vh - 72px) * ${(width / height).toFixed(4)}))}
  .spin{position:relative;width:100%;aspect-ratio:${width}/${height};background:${bg};border-radius:12px;overflow:hidden;cursor:grab;touch-action:pan-y;user-select:none;-webkit-user-select:none}
  .spin:active{cursor:grabbing}
  .spin:focus-visible{outline:3px solid #8b5cf6;outline-offset:3px}
  canvas{display:block;width:100%;height:100%}
  figcaption{margin-top:10px;text-align:center;font-size:13px;color:#71717a}
  .load{position:absolute;inset:0;display:grid;place-items:center;font-size:13px;color:#71717a}
</style>
</head>
<body>
<div class="wrap">
  <figure>
    <div class="spin" id="spin" tabindex="0" role="img" aria-label="${escapeHtml(title)}: 360 degree view. Drag or use the arrow keys to rotate.">
      <canvas id="c" width="${width}" height="${height}"></canvas>
      <div class="load" id="load">Loading 360° view…</div>
    </div>
    <figcaption>Drag to rotate · arrow keys step</figcaption>
  </figure>
</div>
<script>
(function () {
  var FRAMES = ${JSON.stringify(frames)};
  var N = FRAMES.length, MS = ${Math.round((seconds * 1000) / Math.max(1, frames.length))};
  var box = document.getElementById('spin'), cv = document.getElementById('c'), ctx = cv.getContext('2d');
  var imgs = [], ready = 0, cur = 0, playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  var resume = 0, last = 0, drag = null;
  function draw(i) { cur = ((i % N) + N) % N; var im = imgs[cur]; if (!im || !im.complete) return; ctx.clearRect(0, 0, cv.width, cv.height); ctx.drawImage(im, 0, 0, cv.width, cv.height); }
  FRAMES.forEach(function (src, i) { var im = new Image(); im.onload = function () { if (++ready === N) { document.getElementById('load').remove(); draw(0); requestAnimationFrame(loop); } }; im.src = src; imgs[i] = im; });
  function loop(t) { if (playing && !drag && t - last >= MS) { last = t; draw(cur + 1); } requestAnimationFrame(loop); }
  function pause() { playing = false; clearTimeout(resume); resume = setTimeout(function () { playing = !matchMedia('(prefers-reduced-motion: reduce)').matches; }, 3500); }
  box.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, f: cur }; box.setPointerCapture(e.pointerId); pause(); });
  box.addEventListener('pointermove', function (e) { if (!drag) return; var per = box.clientWidth / N * 1.6; draw(drag.f - Math.round((e.clientX - drag.x) / per)); });
  box.addEventListener('pointerup', function () { drag = null; pause(); });
  box.addEventListener('pointercancel', function () { drag = null; pause(); });
  box.addEventListener('keydown', function (e) { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); pause(); draw(cur + (e.key === 'ArrowRight' ? 1 : -1)); } });
})();
</script>
</body>
</html>
`;
}

async function webSpin(src: FrameSource, o: SpinOptions, w: number, h: number, base: string): Promise<SpinResult> {
  const { blobs } = await renderFrames(src, o, w, h, 'Rendering frame');
  const frames: string[] = [];
  for (const b of blobs) frames.push(await blobToDataUrl(b));
  const html = spinViewerHtml({ title: `${o.name || 'LoomCraft'} – 360° view`, frames, width: w, height: h, seconds: o.seconds, background: o.background });
  return { blob: new Blob([html], { type: 'text/html' }), filename: `${base}.html` };
}

async function frameZip(src: FrameSource, o: SpinOptions, w: number, h: number, base: string): Promise<SpinResult> {
  const { blobs, ext } = await renderFrames(src, o, w, h, 'Rendering frame');
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const digits = Math.max(2, String(o.frames).length);
  const names = blobs.map((_, i) => `frames/${base}-${pad(i + 1, digits)}.${ext}`);
  blobs.forEach((b, i) => zip.file(names[i], b));
  zip.file('index.html', spinViewerHtml({ title: `${o.name || 'LoomCraft'} – 360° view`, frames: names, width: w, height: h, seconds: o.seconds, background: o.background }));
  o.onProgress(1, 'Packing ZIP');
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  return { blob, filename: `${base}-frames.zip` };
}
