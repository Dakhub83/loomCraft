import type { GarmentId, ManufacturingSpec, MeasurePoint, SizeChart, SizeUnit } from '../types';
import { getGarment } from '../data/garments';

/** Every size LoomCraft knows, in grading order. `OS` (one size) is used by accessories. */
export const ALL_SIZES = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', 'OS'];
const DEFAULT_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];

/**
 * SVG overlay markup (as a string so it can be rasterized for the PDF as well as rendered inline).
 * Lines get perpendicular end ticks and a lettered badge at their midpoint.
 */
export function measureOverlayMarkup(
  garment: GarmentId,
  points: MeasurePoint[],
  opts: { highlight?: string | null; color?: string; dim?: string } = {},
): string {
  const color = opts.color ?? '#8b5cf6';
  const dim = opts.dim ?? '#a1a1aa';
  const lines = getGarment(garment).measureLines ?? {};
  const parts: string[] = [];
  for (const p of points) {
    const l = p.diagram ? lines[p.diagram] : undefined;
    if (!l) continue;
    const active = !opts.highlight || opts.highlight === p.id;
    const c = active ? color : dim;
    const dx = l.x2 - l.x1;
    const dy = l.y2 - l.y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * 6;
    const ny = (dx / len) * 6;
    const mx = (l.x1 + l.x2) / 2;
    const my = (l.y1 + l.y2) / 2;
    const w = opts.highlight === p.id ? 3 : 1.8;
    parts.push(
      `<g opacity="${active ? 1 : 0.45}">` +
        `<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" stroke="${c}" stroke-width="${w}" stroke-dasharray="${
          opts.highlight === p.id ? '0' : '5 3'
        }"/>` +
        `<line x1="${l.x1 - nx}" y1="${l.y1 - ny}" x2="${l.x1 + nx}" y2="${l.y1 + ny}" stroke="${c}" stroke-width="${w}"/>` +
        `<line x1="${l.x2 - nx}" y1="${l.y2 - ny}" x2="${l.x2 + nx}" y2="${l.y2 + ny}" stroke="${c}" stroke-width="${w}"/>` +
        `<circle cx="${mx}" cy="${my}" r="10" fill="${c}" stroke="#fff" stroke-width="1.5"/>` +
        `<text x="${mx}" y="${my + 4}" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="11" font-weight="700" fill="#fff">${p.code}</text>` +
        `</g>`,
    );
  }
  return parts.join('');
}

/* ---------------------------------------------------------------- chart model */

const uid = () => Math.random().toString(36).slice(2, 9);

export const sortSizes = (sizes: string[]) =>
  [...sizes].sort((a, b) => {
    const ia = ALL_SIZES.indexOf(a);
    const ib = ALL_SIZES.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

/** Value for `size` from the base value and grade rule (grade steps are counted on the full size ladder). */
export function gradedValue(p: MeasurePoint, baseSize: string, size: string): number {
  const base = p.values[baseSize] ?? 0;
  const steps = ALL_SIZES.indexOf(size) - ALL_SIZES.indexOf(baseSize);
  return Math.max(0, round(base + steps * p.grade, 1 / 16));
}

/** Starting chart from the garment's registry seeds (src/data/garments.ts). */
export function defaultSizeChart(garment: GarmentId): SizeChart {
  const seed = getGarment(garment).sizeChart;
  const sizes = seed.sizes ?? DEFAULT_SIZES;
  const baseSize = seed.base ?? 'M';
  const points: MeasurePoint[] = seed.points.map(([code, name, how, base, grade, tolerance, diagram]) => {
    const p: MeasurePoint = { id: uid(), code, name, how, grade, tolerance, values: { [baseSize]: base }, diagram };
    for (const s of sizes) p.values[s] = gradedValue(p, baseSize, s);
    return p;
  });
  return { sizes: [...sizes], baseSize, unit: 'in', points, includeInTechPack: true };
}

/** Recompute every size from the base size using each point's grade rule. */
export function autoGrade(chart: SizeChart, onlyPointId?: string): SizeChart {
  return {
    ...chart,
    points: chart.points.map((p) => {
      if (onlyPointId && p.id !== onlyPointId) return p;
      const values = { ...p.values };
      for (const s of chart.sizes) if (s !== chart.baseSize) values[s] = gradedValue(p, chart.baseSize, s);
      return { ...p, values };
    }),
  };
}

/** Infer each point's grade rule from its current values (average step across the visible sizes). */
export function inferGrades(chart: SizeChart): SizeChart {
  const idx = chart.sizes.map((s) => ALL_SIZES.indexOf(s));
  return {
    ...chart,
    points: chart.points.map((p) => {
      const first = chart.sizes[0];
      const last = chart.sizes[chart.sizes.length - 1];
      const steps = idx[idx.length - 1] - idx[0];
      if (steps <= 0 || p.values[first] == null || p.values[last] == null) return p;
      return { ...p, grade: round((p.values[last] - p.values[first]) / steps, 1 / 16) };
    }),
  };
}

export function addSize(chart: SizeChart, size: string): SizeChart {
  if (chart.sizes.includes(size)) return chart;
  const sizes = sortSizes([...chart.sizes, size]);
  const points = chart.points.map((p) =>
    p.values[size] != null ? p : { ...p, values: { ...p.values, [size]: gradedValue(p, chart.baseSize, size) } },
  );
  return { ...chart, sizes, points };
}

export function removeSize(chart: SizeChart, size: string): SizeChart {
  if (chart.sizes.length <= 1 || size === chart.baseSize) return chart;
  return { ...chart, sizes: chart.sizes.filter((s) => s !== size) };
}

export function newPoint(chart: SizeChart): MeasurePoint {
  const used = new Set(chart.points.map((p) => p.code));
  let code = 'A';
  for (let i = 0; i < 26 * 2; i++) {
    code = i < 26 ? String.fromCharCode(65 + i) : `A${String.fromCharCode(65 + i - 26)}`;
    if (!used.has(code)) break;
  }
  const values: Record<string, number> = {};
  for (const s of chart.sizes) values[s] = 0;
  return { id: uid(), code, name: 'New measurement', how: '', grade: 0, tolerance: 0.25, values };
}

/* ---------------------------------------------------------------- validation */

export interface ChartIssue {
  pointId: string;
  size?: string;
  kind: 'non-monotonic' | 'missing' | 'off-grade';
  message: string;
}

/**
 * Flags values that shrink as sizes go up (for points that grade), missing cells, and cells that
 * drift from the grade rule by more than the tolerance.
 */
export function validateChart(chart: SizeChart): ChartIssue[] {
  const issues: ChartIssue[] = [];
  for (const p of chart.points) {
    let prev: number | undefined;
    for (const s of chart.sizes) {
      const v = p.values[s];
      if (v == null || Number.isNaN(v)) {
        issues.push({ pointId: p.id, size: s, kind: 'missing', message: `${p.code} ${s}: missing value` });
        continue;
      }
      if (p.grade > 0 && prev != null && v < prev) {
        issues.push({ pointId: p.id, size: s, kind: 'non-monotonic', message: `${p.code} ${s} is smaller than the previous size` });
      }
      if (s !== chart.baseSize && Math.abs(v - gradedValue(p, chart.baseSize, s)) > p.tolerance + 1e-6) {
        issues.push({ pointId: p.id, size: s, kind: 'off-grade', message: `${p.code} ${s} is outside tolerance of the grade rule` });
      }
      prev = v;
    }
  }
  return issues;
}

/* ---------------------------------------------------------------- units & formatting */

export const CM_PER_IN = 2.54;

export function round(v: number, step: number) {
  return Math.round(v / step) * step;
}

export const toUnit = (inches: number, unit: SizeUnit) => (unit === 'cm' ? inches * CM_PER_IN : inches);
export const fromUnit = (v: number, unit: SizeUnit) => (unit === 'cm' ? v / CM_PER_IN : v);

/** 23.5 → "23 1/2"; cm → one decimal. */
export function formatMeasure(inches: number, unit: SizeUnit, fractions = true): string {
  if (unit === 'cm') return (inches * CM_PER_IN).toFixed(1);
  if (!fractions) return (+inches.toFixed(3)).toString();
  const sixteenths = Math.round(inches * 16);
  const whole = Math.floor(sixteenths / 16);
  let rem = sixteenths % 16;
  if (!rem) return `${whole}`;
  let den = 16;
  while (rem % 2 === 0) {
    rem /= 2;
    den /= 2;
  }
  return whole ? `${whole} ${rem}/${den}` : `${rem}/${den}`;
}

/** Accepts "23.5", "23 1/2", "1/4", "59,7". Returns inches, or null if unparseable. */
export function parseMeasure(text: string, unit: SizeUnit): number | null {
  const t = text.trim().replace(',', '.');
  if (!t) return null;
  const m = t.match(/^(-?\d+(?:\.\d+)?)?\s*(?:(\d+)\/(\d+))?$/);
  if (!m || (!m[1] && !m[2])) return null;
  let v = m[1] ? parseFloat(m[1]) : 0;
  if (m[2] && m[3] && +m[3] !== 0) v += +m[2] / +m[3];
  return fromUnit(v, unit);
}

export function chartToCSV(chart: SizeChart, garmentName: string, spec?: ManufacturingSpec): string {
  const unit = chart.unit;
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const header = ['Code', 'Point of measure', 'How to measure', `Tolerance (+/- ${unit})`, `Grade (${unit})`, ...chart.sizes];
  const rows = chart.points.map((p) => [
    p.code,
    p.name,
    p.how,
    formatMeasure(p.tolerance, unit, false),
    formatMeasure(p.grade, unit, false),
    ...chart.sizes.map((s) => (p.values[s] == null ? '' : formatMeasure(p.values[s], unit, false))),
  ]);
  return [
    // BOM so Excel opens UTF-8 correctly
    `﻿# ${garmentName} size specification - base size ${chart.baseSize} - units ${unit === 'in' ? 'inches' : 'centimetres'}`,
    ...(spec ? [`# Fabric: ${spec.fabricWeight} - ${spec.composition}`.replace(/\n/g, ' ')] : []),
    header.map(esc).join(','),
    ...rows.map((r) => r.map((c) => esc(String(c))).join(',')),
  ].join('\r\n');
}
