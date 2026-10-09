// Pure maths for the dashboard: totals, period series, groupings, weekday pattern, anomalies.
import type { DateRange, Granularity, Order } from "./types";
import { dayFromYmd, weekdayIndex, ymdFromDay } from "./values";

// ───────────────────────────── periods ─────────────────────────────

/** Day granularity up to ~2 months of data, weekly up to ~18 months, monthly beyond that. */
export function pickGranularity(spanDays: number): Granularity {
  if (spanDays <= 62) return "day";
  if (spanDays <= 548) return "week";
  return "month";
}

/** First day of the bucket (Monday for weeks, the 1st for months) that contains `day`. */
export function bucketStart(day: number, g: Granularity): number {
  if (g === "day") return day;
  if (g === "week") return day - weekdayIndex(day);
  const { year, month } = ymdFromDay(day);
  return dayFromYmd(year, month, 1) as number;
}

export function bucketEnd(start: number, g: Granularity): number {
  if (g === "day") return start;
  if (g === "week") return start + 6;
  const { year, month } = ymdFromDay(start);
  const nextMonth = month === 12 ? dayFromYmd(year + 1, 1, 1) : dayFromYmd(year, month + 1, 1);
  return (nextMonth as number) - 1;
}

export function nextBucketStart(start: number, g: Granularity): number {
  return bucketEnd(start, g) + 1;
}

export interface Period {
  start: number;
  end: number;
  revenue: number;
  /** True when the selected date range cuts this period short (first or last bucket). */
  partial: boolean;
}

/** Zero-filled revenue per period over `range`. Orders outside the range are ignored. */
export function buildSeries(orders: readonly Order[], range: DateRange, g: Granularity): Period[] {
  const periods: Period[] = [];
  const indexByStart = new Map<number, number>();
  const last = bucketStart(range.to, g);
  for (let s = bucketStart(range.from, g); s <= last; s = nextBucketStart(s, g)) {
    const end = bucketEnd(s, g);
    indexByStart.set(s, periods.length);
    periods.push({ start: s, end, revenue: 0, partial: s < range.from || end > range.to });
  }
  for (const o of orders) {
    if (o.day < range.from || o.day > range.to) continue;
    const idx = indexByStart.get(bucketStart(o.day, g));
    if (idx !== undefined) periods[idx].revenue += o.amount;
  }
  return periods;
}

/** Revenue for each calendar day in the range, zero-filled. */
export function dailyRevenue(orders: readonly Order[], range: DateRange): number[] {
  const values = new Array<number>(range.to - range.from + 1).fill(0);
  for (const o of orders) {
    if (o.day >= range.from && o.day <= range.to) values[o.day - range.from] += o.amount;
  }
  return values;
}

// ───────────────────────────── totals ─────────────────────────────

export interface Totals {
  revenue: number;
  orders: number;
  /** Null when no quantity column is mapped. */
  units: number | null;
  /** Null when there are no orders. */
  averageOrder: number | null;
}

/** Orders are counted by distinct Order ID when one is mapped, otherwise one row = one order. */
export function computeTotals(orders: readonly Order[]): Totals {
  let revenue = 0;
  let units = 0;
  let hasUnits = false;
  let unnamed = 0;
  const ids = new Set<string>();
  for (const o of orders) {
    revenue += o.amount;
    if (o.quantity !== undefined) {
      units += o.quantity;
      hasUnits = true;
    }
    if (o.orderId === undefined) unnamed++;
    else ids.add(o.orderId);
  }
  const count = ids.size + unnamed;
  return {
    revenue,
    orders: count,
    units: hasUnits ? units : null,
    averageOrder: count === 0 ? null : revenue / count,
  };
}

/** Relative change from `previous` to `current`; null when there is nothing to compare against. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0 || !Number.isFinite(previous)) return null;
  return (current - previous) / Math.abs(previous);
}

// ───────────────────────────── groupings ─────────────────────────────

export type GroupKey = "product" | "category" | "region" | "channel";

export interface Bar {
  name: string;
  value: number;
  /** Fraction of the grand total (0..1). */
  share: number;
  isOther: boolean;
}

export const NOT_SET_LABEL = "(not set)";

export function groupRevenue(orders: readonly Order[], key: GroupKey): { name: string; value: number }[] {
  const totals = new Map<string, number>();
  for (const o of orders) {
    const name = o[key] ?? NOT_SET_LABEL;
    totals.set(name, (totals.get(name) ?? 0) + o.amount);
  }
  return [...totals]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

/** Top `limit` groups by value; everything else is folded into one "Other" bar. */
export function topWithOther(groups: readonly { name: string; value: number }[], limit: number): Bar[] {
  const total = groups.reduce((sum, g) => sum + g.value, 0);
  const share = (v: number) => (total > 0 ? v / total : 0);
  const head = groups.slice(0, limit).map((g) => ({ ...g, share: share(g.value), isOther: false }));
  const tail = groups.slice(limit);
  if (tail.length === 0) return head;
  const other = tail.reduce((sum, g) => sum + g.value, 0);
  return [...head, { name: "Other", value: other, share: share(other), isOther: true }];
}

/** What share of positive revenue the top 20% of items bring. Needs at least 5 items. */
export function paretoShare(
  values: readonly number[],
  topFraction = 0.2,
): { count: number; topCount: number; share: number } | null {
  const positive = values.filter((v) => v > 0).sort((a, b) => b - a);
  if (positive.length < 5) return null;
  const total = positive.reduce((s, v) => s + v, 0);
  const topCount = Math.max(1, Math.ceil(positive.length * topFraction));
  const top = positive.slice(0, topCount).reduce((s, v) => s + v, 0);
  return { count: positive.length, topCount, share: top / total };
}

// ───────────────────────────── weekday pattern ─────────────────────────────

export const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export interface WeekdayStat {
  index: number;
  name: string;
  short: string;
  /** Average revenue on this weekday across every such day in the range, including days with no sales. */
  average: number;
  total: number;
  days: number;
}

export function weekdayAverages(orders: readonly Order[], range: DateRange): WeekdayStat[] {
  const totals = new Array<number>(7).fill(0);
  const days = new Array<number>(7).fill(0);
  for (let d = range.from; d <= range.to; d++) days[weekdayIndex(d)]++;
  for (const o of orders) {
    if (o.day >= range.from && o.day <= range.to) totals[weekdayIndex(o.day)] += o.amount;
  }
  return WEEKDAY_NAMES.map((name, index) => ({
    index,
    name,
    short: WEEKDAY_SHORT[index],
    average: days[index] === 0 ? 0 : totals[index] / days[index],
    total: totals[index],
    days: days[index],
  }));
}

// ───────────────────────────── anomalies ─────────────────────────────

export interface Anomaly {
  index: number;
  value: number;
  /** Mean of the rolling baseline the point was compared with. */
  baseline: number;
  z: number;
  /** value ÷ baseline, e.g. 3.1 for "3.1× a normal day". */
  ratio: number;
}

/**
 * Flags points whose |z| against the mean/stdev of the preceding `window` points exceeds `threshold`.
 * Needs at least `minPeriods` points in total, and at least `minPeriods - 1` before the point itself.
 */
export function detectAnomalies(
  values: readonly number[],
  { window = 28, minPeriods = 8, threshold = 2.5 }: { window?: number; minPeriods?: number; threshold?: number } = {},
): Anomaly[] {
  if (values.length < minPeriods) return [];
  const found: Anomaly[] = [];
  for (let i = minPeriods - 1; i < values.length; i++) {
    const from = Math.max(0, i - window);
    const n = i - from;
    let sum = 0;
    for (let j = from; j < i; j++) sum += values[j];
    const mean = sum / n;
    let sq = 0;
    for (let j = from; j < i; j++) sq += (values[j] - mean) ** 2;
    const sd = Math.sqrt(sq / n);
    if (sd === 0 || mean <= 0) continue;
    const z = (values[i] - mean) / sd;
    if (Math.abs(z) > threshold) found.push({ index: i, value: values[i], baseline: mean, z, ratio: values[i] / mean });
  }
  return found.sort((a, b) => Math.abs(b.z) - Math.abs(a.z) || a.index - b.index);
}
