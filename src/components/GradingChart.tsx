import { memo, useState } from 'react';
import type { MeasurePoint, SizeChart } from '../types';
import { formatMeasure, gradedValue, ladderOf, toUnit } from '../utils/sizeCharts';

const ACCENT = '#8b5cf6';
const WARN = '#fb923c';
const BAD = '#f87171';
const SERIES = ['#a78bfa', '#2dd4bf', '#f472b6', '#60a5fa', '#facc15', '#4ade80', '#fb923c', '#e879f9', '#38bdf8', '#f87171', '#a3e635', '#c084fc'];

/** "Nice" axis ticks for a [min, max] range. */
function ticks(min: number, max: number, count = 4): number[] {
  const span = max - min || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const start = Math.floor(min / step) * step;
  const out: number[] = [];
  let v = start;
  out.push(+v.toFixed(6));
  // always end on a tick at or above max so nothing is drawn past the plot area
  while (v < max - 1e-9) {
    v += step;
    out.push(+v.toFixed(6));
  }
  return out;
}

interface Props {
  chart: SizeChart;
  point: MeasurePoint | null;
  onHover?(pointId: string | null): void;
}

const W = 560;
const H = 230;
const PAD = { l: 46, r: 16, t: 18, b: 30 };

/**
 * Grading chart. "Single" plots one POM across sizes with its ± tolerance band and the grade-rule line;
 * cells that drift outside tolerance are orange, shrinking steps red. "Compare" overlays every POM as
 * % change from the base size so grade proportions can be checked at a glance.
 */
export const GradingChart = memo(function GradingChart({ chart, point, onHover }: Props) {
  const [mode, setMode] = useState<'single' | 'compare'>('single');
  const [hoverSize, setHoverSize] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const { sizes, unit, baseSize } = chart;
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (sizes.length === 1 ? iw / 2 : (i / (sizes.length - 1)) * iw);

  const header = (
    <div className="mb-2 flex items-center justify-between gap-2">
      <div className="min-w-0">
        <h4 className="truncate text-xs font-semibold text-zinc-200">
          {mode === 'single' ? (point ? `${point.code} · ${point.name}` : 'Select a measurement') : 'All measurements · % change from base'}
        </h4>
        <p className="text-[10.5px] text-zinc-500">
          {mode === 'single'
            ? 'Band = ± tolerance · dashed = grade rule'
            : `Base size ${baseSize} = 0% · steeper lines grade faster`}
        </p>
      </div>
      <div className="flex shrink-0 rounded-md bg-black/30 p-0.5 text-[11px]">
        {(['single', 'compare'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded px-2 py-1 capitalize transition ${mode === m ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            {m}
          </button>
        ))}
      </div>
    </div>
  );

  if (mode === 'single') {
    if (!point) return <div>{header}</div>;
    const vals = sizes.map((s) => (point.values[s] == null ? null : toUnit(point.values[s], unit)));
    const rule = sizes.map((s) => toUnit(gradedValue(point, baseSize, s, ladderOf(chart)), unit));
    const tol = toUnit(point.tolerance, unit);
    const all = [...(vals.filter((v) => v != null) as number[]), ...rule.map((r) => r + tol), ...rule.map((r) => r - tol)];
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    const pad = (hi - lo || 1) * 0.12;
    const yt = ticks(lo - pad, hi + pad);
    const y0 = yt[0];
    const y1 = yt[yt.length - 1];
    const y = (v: number) => PAD.t + ih - ((v - y0) / (y1 - y0 || 1)) * ih;

    const band =
      sizes.map((_, i) => `${x(i)},${y(rule[i] + tol)}`).join(' ') +
      ' ' +
      sizes
        .map((_, i) => `${x(i)},${y(rule[i] - tol)}`)
        .reverse()
        .join(' ');

    return (
      <div>
        {header}
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Grading chart for ${point.name}`}>
          {yt.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="#ffffff10" />
              <text x={PAD.l - 8} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill="#71717a">
                {unit === 'cm' ? t.toFixed(0) : formatMeasure(t, 'in')}
              </text>
            </g>
          ))}
          <polygon points={band} fill={ACCENT} opacity={0.13} />
          <polyline points={rule.map((r, i) => `${x(i)},${y(r)}`).join(' ')} fill="none" stroke={ACCENT} strokeWidth={1.4} strokeDasharray="5 4" opacity={0.75} />
          <polyline
            points={vals.map((v, i) => (v == null ? '' : `${x(i)},${y(v)}`)).filter(Boolean).join(' ')}
            fill="none"
            stroke="#e4e4e7"
            strokeWidth={2}
            strokeLinejoin="round"
          />
          {sizes.map((s, i) => {
            const v = vals[i];
            const prev = i > 0 ? vals[i - 1] : null;
            const shrinks = point.grade > 0 && v != null && prev != null && v < prev;
            const off = v != null && Math.abs(v - rule[i]) > tol + 1e-6;
            const color = shrinks ? BAD : off ? WARN : s === baseSize ? ACCENT : '#e4e4e7';
            const delta = v != null && prev != null ? v - prev : null;
            return (
              <g key={s} onMouseEnter={() => setHoverSize(s)} onMouseLeave={() => setHoverSize(null)}>
                <rect x={x(i) - iw / sizes.length / 2} y={PAD.t} width={iw / sizes.length} height={ih} fill="transparent" />
                {hoverSize === s && <line x1={x(i)} x2={x(i)} y1={PAD.t} y2={PAD.t + ih} stroke="#ffffff22" />}
                {v != null && <circle cx={x(i)} cy={y(v)} r={s === baseSize ? 5.5 : 4} fill={color} stroke="#18181b" strokeWidth={2} />}
                {delta != null && i > 0 && (
                  <text x={(x(i) + x(i - 1)) / 2} y={Math.min(y(v!), y(prev!)) - 9} textAnchor="middle" fontSize="9.5" fill={shrinks ? BAD : '#a1a1aa'}>
                    {delta >= 0 ? '+' : '−'}
                    {formatMeasure(fromDisplay(Math.abs(delta), unit), unit)}
                  </text>
                )}
                {hoverSize === s && v != null && (
                  <g>
                    <rect x={Math.min(x(i) + 8, W - 108)} y={y(v) - 30} width={100} height={22} rx={4} fill="#27272a" stroke="#3f3f46" />
                    <text x={Math.min(x(i) + 8, W - 108) + 50} y={y(v) - 15} textAnchor="middle" fontSize="10.5" fill="#fafafa">
                      {s}: {formatMeasure(fromDisplay(v, unit), unit)} {unit}
                    </text>
                  </g>
                )}
                <text x={x(i)} y={H - 10} textAnchor="middle" fontSize="10.5" fontWeight={s === baseSize ? 700 : 400} fill={s === baseSize ? '#c4b5fd' : '#a1a1aa'}>
                  {s}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    );
  }

  // compare mode: % change from base for every POM
  const series = chart.points
    .map((p, k) => {
      const base = p.values[baseSize];
      if (!base) return null;
      return {
        p,
        color: SERIES[k % SERIES.length],
        pts: sizes.map((s) => (p.values[s] == null ? null : ((p.values[s] - base) / base) * 100)),
      };
    })
    .filter(Boolean) as Array<{ p: MeasurePoint; color: string; pts: Array<number | null> }>;
  const flat = series.flatMap((s) => s.pts.filter((v) => v != null) as number[]);
  const yt = ticks(Math.min(0, ...flat), Math.max(0, ...flat), 5);
  const y0 = yt[0];
  const y1 = yt[yt.length - 1];
  const y = (v: number) => PAD.t + ih - ((v - y0) / (y1 - y0 || 1)) * ih;

  // End-of-line labels: nudge apart so codes never overlap (min 11px apart).
  const labelY = new Map<string, number>();
  const ends = series
    .map((s) => ({ id: s.p.id, v: s.pts[s.pts.length - 1] }))
    .filter((e): e is { id: string; v: number } => e.v != null)
    .map((e) => ({ id: e.id, y: y(e.v) + 3.5 }))
    .sort((a, b) => a.y - b.y);
  for (let i = 0; i < ends.length; i++) {
    if (i > 0 && ends[i].y - ends[i - 1].y < 11) ends[i].y = ends[i - 1].y + 11;
    labelY.set(ends[i].id, ends[i].y);
  }

  return (
    <div>
      {header}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" role="img" aria-label="Grade comparison chart">
        {yt.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? '#ffffff30' : '#ffffff10'} />
            <text x={PAD.l - 8} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill="#71717a">
              {t > 0 ? '+' : ''}
              {t}%
            </text>
          </g>
        ))}
        {series.map((s) => {
          const dimmed = focus && focus !== s.p.id;
          return (
            <g
              key={s.p.id}
              opacity={dimmed ? 0.15 : 1}
              onMouseEnter={() => {
                setFocus(s.p.id);
                onHover?.(s.p.id);
              }}
              onMouseLeave={() => {
                setFocus(null);
                onHover?.(null);
              }}
              className="cursor-pointer"
            >
              <polyline
                points={s.pts.map((v, i) => (v == null ? '' : `${x(i)},${y(v)}`)).filter(Boolean).join(' ')}
                fill="none"
                stroke={s.color}
                strokeWidth={focus === s.p.id ? 3 : 1.8}
                strokeLinejoin="round"
              />
              {/* fat invisible hit area */}
              <polyline
                points={s.pts.map((v, i) => (v == null ? '' : `${x(i)},${y(v)}`)).filter(Boolean).join(' ')}
                fill="none"
                stroke="transparent"
                strokeWidth={12}
              />
              {s.pts.length > 0 && s.pts[s.pts.length - 1] != null && (
                <text x={x(s.pts.length - 1) + 6} y={labelY.get(s.p.id)} fontSize="10" fontWeight={700} fill={s.color}>
                  {s.p.code}
                </text>
              )}
            </g>
          );
        })}
        {sizes.map((s, i) => (
          <text key={s} x={x(i)} y={H - 10} textAnchor="middle" fontSize="10.5" fontWeight={s === baseSize ? 700 : 400} fill={s === baseSize ? '#c4b5fd' : '#a1a1aa'}>
            {s}
          </text>
        ))}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
        {series.map((s) => (
          <span key={s.p.id} className="flex items-center gap-1 text-[10.5px] text-zinc-400">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            {s.p.code} {s.p.name}
          </span>
        ))}
      </div>
    </div>
  );
});

const fromDisplay = (v: number, unit: SizeChart['unit']) => (unit === 'cm' ? v / 2.54 : v);

/** Tiny per-row grade curve for the spec table. Red when a size shrinks. */
export const Sparkline = memo(function Sparkline({ point, sizes }: { point: MeasurePoint; sizes: string[] }) {
  const vals = sizes.map((s) => point.values[s]).filter((v): v is number => v != null);
  if (vals.length < 2) return null;
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const w = 54;
  const h = 16;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - 2 - ((v - lo) / (hi - lo || 1)) * (h - 4)}`).join(' ');
  const bad = point.grade > 0 && vals.some((v, i) => i > 0 && v < vals[i - 1]);
  return (
    <svg width={w} height={h} className="overflow-visible" aria-hidden>
      <polyline points={pts} fill="none" stroke={bad ? BAD : '#a78bfa'} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
});
