import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Download, Plus, RotateCcw, Ruler, Sparkles, Trash2, Wand2, X } from 'lucide-react';
import type { GarmentId, ManufacturingSpec, MeasurePoint, SizeChart, SizeUnit } from '../types';
import { GarmentSVG } from './GarmentTemplates';
import { getGarment } from '../data/garments';
import { GradingChart, Sparkline } from './GradingChart';
import {
  ladderOf,
  addSize,
  autoGrade,
  chartToCSV,
  formatMeasure,
  gradedValue,
  inferGrades,
  measureOverlayMarkup,
  newPoint,
  parseMeasure,
  removeSize,
  validateChart,
} from '../utils/sizeCharts';

interface Props {
  open: boolean;
  garment: GarmentId;
  color: string;
  chart: SizeChart;
  /** Manufacturing spec for this garment, shown as a fabric strip and exported with the CSV. */
  spec?: ManufacturingSpec;
  onChange(chart: SizeChart): void;
  onReset(): void;
  onClose(): void;
  onInfo(msg: string): void;
}

/** Text cell that accepts decimals or fractions ("23 1/2") and commits on blur/Enter. */
function MeasureCell({
  inches,
  unit,
  onCommit,
  className = '',
  title,
}: {
  inches: number | undefined;
  unit: SizeUnit;
  onCommit(v: number): void;
  className?: string;
  title?: string;
}) {
  const shown = inches == null ? '' : formatMeasure(inches, unit);
  const [text, setText] = useState(shown);
  const [bad, setBad] = useState(false);
  useEffect(() => setText(shown), [shown]);
  const commit = () => {
    if (text === shown) return;
    const v = parseMeasure(text, unit);
    if (v == null || v < 0) {
      setBad(true);
      setText(shown);
      setTimeout(() => setBad(false), 900);
      return;
    }
    onCommit(Math.round(v * 64) / 64);
  };
  return (
    <input
      value={text}
      title={title}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setText(shown);
          (e.target as HTMLInputElement).blur();
        }
      }}
      spellCheck={false}
      className={`h-7 w-full rounded border bg-transparent px-1.5 text-right font-mono text-[12px] tabular-nums outline-none transition focus:border-violet-500/70 focus:bg-black/40 ${
        bad ? 'border-red-500/70 bg-red-500/10' : 'border-transparent hover:border-white/10'
      } ${className}`}
    />
  );
}

export const SizeChartEditor = memo(function SizeChartEditor({ open, garment, color, chart, spec, onChange, onReset, onClose, onInfo }: Props) {
  const [selected, setSelected] = useState<string | null>(chart.points[0]?.id ?? null);
  const [hover, setHover] = useState<string | null>(null);
  const [linked, setLinked] = useState(true);
  const dialogRef = useRef<HTMLDivElement>(null);
  const g = getGarment(garment);
  const { unit, sizes, baseSize } = chart;

  useEffect(() => {
    if (!chart.points.some((p) => p.id === selected)) setSelected(chart.points[0]?.id ?? null);
  }, [chart.points, selected]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !(e.target as HTMLElement).closest('input') && onClose();
    window.addEventListener('keydown', onKey);
    dialogRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const issues = useMemo(() => validateChart(chart), [chart]);
  const issueAt = (pid: string, size: string) => issues.find((i) => i.pointId === pid && i.size === size);
  const selectedPoint = chart.points.find((p) => p.id === selected) ?? null;
  const highlight = hover ?? selected;
  const overlay = useMemo(() => measureOverlayMarkup(garment, chart.points, { highlight }), [garment, chart.points, highlight]);

  const updatePoint = (id: string, patch: Partial<MeasurePoint>, regrade = false) => {
    let next: SizeChart = { ...chart, points: chart.points.map((p) => (p.id === id ? { ...p, ...patch } : p)) };
    if (regrade) next = autoGrade(next, id);
    onChange(next);
  };

  const setCell = (p: MeasurePoint, size: string, v: number) =>
    updatePoint(p.id, { values: { ...p.values, [size]: v } }, linked && size === baseSize);

  const exportCSV = () => {
    const blob = new Blob([chartToCSV(chart, g.name, spec)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${garment}-size-chart.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    onInfo('Size chart exported as CSV');
  };

  if (!open) return null;

  const offGrade = issues.filter((i) => i.kind === 'off-grade').length;
  const shrinking = issues.filter((i) => i.kind === 'non-monotonic').length;
  const missing = issues.filter((i) => i.kind === 'missing').length;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Size specification chart"
        tabIndex={-1}
        className="flex max-h-full w-full max-w-[1380px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#111114] shadow-2xl outline-none"
      >
        {/* header */}
        <header className="flex flex-wrap items-center gap-3 border-b border-white/[0.06] px-5 py-3.5">
          <Ruler size={18} className="text-violet-400" />
          <div className="mr-auto min-w-0">
            <h2 className="text-sm font-semibold text-zinc-100">Size specification</h2>
            <p className="truncate text-[11px] text-zinc-500">
              {g.name} · base size {baseSize} · values accept decimals or fractions (23 1/2)
            </p>
          </div>

          <div className="flex rounded-md bg-black/30 p-0.5 text-xs" title="Display units">
            {(['in', 'cm'] as const).map((u) => (
              <button
                key={u}
                onClick={() => onChange({ ...chart, unit: u })}
                className={`rounded px-2.5 py-1 font-medium transition ${unit === u ? 'bg-violet-500 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                {u}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-xs text-zinc-400">
            Base
            <select value={baseSize} onChange={(e) => onChange({ ...chart, baseSize: e.target.value })} className="lc-input h-8 py-0 text-xs">
              {sizes.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <button onClick={() => onChange(autoGrade(chart))} className="lc-btn h-8 gap-1.5 px-2.5 text-xs" title="Recompute every size from the base size and each grade rule">
            <Wand2 size={13} /> Auto-grade
          </button>
          <button onClick={() => onChange(inferGrades(chart))} className="lc-btn h-8 gap-1.5 px-2.5 text-xs" title="Set each grade rule from the current smallest → largest values">
            <Sparkles size={13} /> Infer grades
          </button>
          <button
            onClick={() => window.confirm(`Reset the ${g.short} size chart to LoomCraft defaults?`) && onReset()}
            className="lc-btn h-8 gap-1.5 px-2.5 text-xs"
          >
            <RotateCcw size={13} /> Reset
          </button>
          <button onClick={exportCSV} className="lc-btn h-8 gap-1.5 px-2.5 text-xs">
            <Download size={13} /> CSV
          </button>
          <button onClick={onClose} className="lc-btn h-8 w-8 p-0" title="Close (Esc)">
            <X size={15} />
          </button>
        </header>

        {/* fabric spec strip (from the assistant's Specs tab) */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-white/[0.06] bg-violet-500/[0.04] px-5 py-2 text-[11px]">
          <span className="font-semibold uppercase tracking-[0.12em] text-zinc-500">Fabric</span>
          {spec ? (
            <>
              <span className="text-zinc-200">{spec.fabricWeight}</span>
              <span className="text-zinc-400">{spec.composition}</span>
            </>
          ) : (
            <span className="text-zinc-500">No manufacturing spec yet — generate one in Assistant → Specs to add fabric weight and composition here.</span>
          )}
        </div>

        {/* size range + options */}
        <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-5 py-2.5">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Size range</span>
          {ladderOf(chart).map((s) => {
            const on = sizes.includes(s);
            return (
              <button
                key={s}
                disabled={on && (s === baseSize || sizes.length <= 1)}
                onClick={() => onChange(on ? removeSize(chart, s) : addSize(chart, s))}
                title={on ? (s === baseSize ? 'Base size can’t be removed' : `Remove ${s}`) : `Add ${s} (auto-graded)`}
                className={`h-7 min-w-9 rounded-md border px-2 text-[11px] font-semibold transition disabled:cursor-not-allowed ${
                  on ? 'border-violet-500/60 bg-violet-500/15 text-violet-200' : 'border-white/[0.08] text-zinc-500 hover:border-white/20 hover:text-zinc-300'
                } ${s === baseSize ? 'ring-1 ring-violet-400' : ''}`}
              >
                {s}
              </button>
            );
          })}
          <div className="ml-auto flex items-center gap-4 text-[11px] text-zinc-400">
            <label className="flex cursor-pointer items-center gap-1.5" title="Editing a base-size value or a grade regrades the whole row">
              <input type="checkbox" checked={linked} onChange={(e) => setLinked(e.target.checked)} className="accent-violet-500" />
              Grade from base on edit
            </label>
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={chart.includeInTechPack}
                onChange={(e) => onChange({ ...chart, includeInTechPack: e.target.checked })}
                className="accent-violet-500"
              />
              Include in PDF tech pack
            </label>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* diagram */}
          <aside className="lc-scroll hidden w-[300px] shrink-0 overflow-y-auto border-r border-white/[0.06] p-4 lg:block">
            <div className="relative mx-auto aspect-[500/560] w-full rounded-xl bg-[radial-gradient(ellipse_at_center,#ffffff0d,transparent_70%)]">
              <GarmentSVG garment={garment} view={g.views[0].id} color={color} uid="spec" className="absolute inset-0 h-full w-full" width="100%" height="100%" showShadow={false} />
              <svg viewBox="0 0 500 560" className="absolute inset-0 h-full w-full overflow-visible" dangerouslySetInnerHTML={{ __html: overlay }} />
            </div>
            {selectedPoint && (
              <div className="mt-4 rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
                <div className="mb-1 flex items-center gap-2">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-violet-500 text-[10px] font-bold text-white">{selectedPoint.code}</span>
                  <span className="text-xs font-semibold text-zinc-100">{selectedPoint.name}</span>
                </div>
                <label className="block text-[10.5px] uppercase tracking-wide text-zinc-500">
                  How to measure
                  <textarea
                    value={selectedPoint.how}
                    onChange={(e) => updatePoint(selectedPoint.id, { how: e.target.value })}
                    rows={2}
                    className="lc-input mt-1 w-full resize-none text-xs normal-case tracking-normal"
                  />
                </label>
                {!selectedPoint.diagram && <p className="mt-2 text-[10.5px] text-zinc-500">Custom measurement — not drawn on the diagram.</p>}
              </div>
            )}
          </aside>

          {/* table + chart */}
          <div className="lc-scroll flex min-w-0 flex-1 flex-col overflow-y-auto">
            <div className="shrink-0 overflow-x-auto px-4 pt-3">
              <table className="w-full border-separate border-spacing-0 text-xs">
                <thead>
                  <tr className="text-[10.5px] uppercase tracking-wide text-zinc-500">
                    <th className="sticky left-0 z-10 w-9 bg-[#111114] py-2 text-left font-semibold">#</th>
                    <th className="sticky left-9 z-10 min-w-[190px] bg-[#111114] py-2 text-left font-semibold">Point of measure</th>
                    <th className="w-[68px] py-2 pr-1.5 text-right font-semibold" title="± tolerance">Tol ±</th>
                    <th className="w-[68px] py-2 pr-1.5 text-right font-semibold" title="Grade per size step">Grade</th>
                    {sizes.map((s) => (
                      <th key={s} className={`w-[70px] py-2 pr-1.5 text-right font-semibold ${s === baseSize ? 'text-violet-300' : ''}`}>
                        {s}
                      </th>
                    ))}
                    <th className="w-[64px] py-2 text-center font-semibold">Trend</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {chart.points.map((p) => {
                    const isSel = p.id === selected;
                    return (
                      <tr
                        key={p.id}
                        onClick={() => setSelected(p.id)}
                        onMouseEnter={() => setHover(p.id)}
                        onMouseLeave={() => setHover(null)}
                        className={`group cursor-pointer ${isSel ? 'bg-violet-500/[0.09]' : 'hover:bg-white/[0.025]'}`}
                      >
                        <td className={`sticky left-0 border-t border-white/[0.05] py-0.5 ${isSel ? 'bg-[#1a1626]' : 'bg-[#111114]'}`}>
                          <input
                            value={p.code}
                            onChange={(e) => updatePoint(p.id, { code: e.target.value.toUpperCase().slice(0, 3) })}
                            className="h-7 w-8 rounded bg-transparent text-center font-bold text-violet-300 outline-none focus:bg-black/40"
                          />
                        </td>
                        <td className={`sticky left-9 border-t border-white/[0.05] py-0.5 pr-2 ${isSel ? 'bg-[#1a1626]' : 'bg-[#111114]'}`}>
                          <input
                            value={p.name}
                            title={p.how}
                            onChange={(e) => updatePoint(p.id, { name: e.target.value })}
                            className="h-7 w-full rounded border border-transparent bg-transparent px-1.5 text-zinc-100 outline-none hover:border-white/10 focus:border-violet-500/70 focus:bg-black/40"
                          />
                        </td>
                        <td className="border-t border-white/[0.05] py-0.5 pr-1">
                          <MeasureCell inches={p.tolerance} unit={unit} onCommit={(v) => updatePoint(p.id, { tolerance: v })} className="text-zinc-400" />
                        </td>
                        <td className="border-t border-white/[0.05] py-0.5 pr-1">
                          <MeasureCell inches={p.grade} unit={unit} onCommit={(v) => updatePoint(p.id, { grade: v }, linked)} className="text-zinc-400" />
                        </td>
                        {sizes.map((s) => {
                          const issue = issueAt(p.id, s);
                          const cls =
                            issue?.kind === 'non-monotonic' || issue?.kind === 'missing'
                              ? 'bg-red-500/15 text-red-300'
                              : issue?.kind === 'off-grade'
                                ? 'text-orange-300'
                                : s === baseSize
                                  ? 'text-violet-200'
                                  : 'text-zinc-200';
                          return (
                            <td key={s} className={`border-t border-white/[0.05] py-0.5 pr-1 ${s === baseSize ? 'bg-violet-500/[0.06]' : ''}`}>
                              <MeasureCell
                                inches={p.values[s]}
                                unit={unit}
                                onCommit={(v) => setCell(p, s, v)}
                                className={cls}
                                title={issue?.message ?? (s !== baseSize ? `Grade rule: ${formatMeasure(gradedValue(p, baseSize, s, ladderOf(chart)), unit)}` : 'Base size')}
                              />
                            </td>
                          );
                        })}
                        <td className="border-t border-white/[0.05] py-0.5 text-center">
                          <Sparkline point={p} sizes={sizes} />
                        </td>
                        <td className="border-t border-white/[0.05] py-0.5 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onChange({ ...chart, points: chart.points.filter((x) => x.id !== p.id) });
                            }}
                            title="Delete measurement"
                            className="rounded p-1 text-zinc-600 opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="flex items-center gap-3 py-2.5">
                <button
                  onClick={() => {
                    const p = newPoint(chart);
                    onChange({ ...chart, points: [...chart.points, p] });
                    setSelected(p.id);
                  }}
                  className="lc-btn h-7 gap-1.5 px-2.5 text-xs"
                >
                  <Plus size={13} /> Add measurement
                </button>
                <span className="text-[11px] text-zinc-500">All values in {unit === 'in' ? 'inches' : 'centimetres'} · flat, garment laid down</span>
                <span className="ml-auto flex items-center gap-3 text-[11px]">
                  {shrinking + missing > 0 && (
                    <span className="flex items-center gap-1 text-red-300">
                      <AlertTriangle size={12} /> {shrinking + missing} invalid
                    </span>
                  )}
                  {offGrade > 0 && <span className="text-orange-300">{offGrade} off grade rule</span>}
                  {!issues.length && <span className="text-emerald-400">✓ Grading consistent</span>}
                </span>
              </div>
            </div>

            <div className="mx-4 mb-4 shrink-0 rounded-xl border border-white/[0.07] bg-black/20 p-4">
              <GradingChart chart={chart} point={selectedPoint} onHover={setHover} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
