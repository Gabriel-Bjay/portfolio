// Turns normalised orders + the current filters into everything the dashboard shows.
// Pure and synchronous so it can be unit-tested and memoised by the UI.
import { forecastSeries, HORIZON, type ForecastResult } from "./forecast";
import type { Formatter } from "./format";
import { buildInsights } from "./insights";
import {
  buildSeries,
  computeTotals,
  dailyRevenue,
  detectAnomalies,
  groupRevenue,
  nextBucketStart,
  NOT_SET_LABEL,
  paretoShare,
  percentChange,
  pickGranularity,
  topWithOther,
  weekdayAverages,
  type Bar,
  type Totals,
  type WeekdayStat,
} from "./metrics";
import type { DateRange, Dimension, Granularity, Order, Role } from "./types";
import { DIMENSIONS } from "./types";
import { dayFromYmd, ymdFromDay } from "./values";

export type RangePreset = "all" | "30d" | "90d" | "ytd";

export const PRESET_LABELS: Record<RangePreset, string> = {
  all: "All",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  ytd: "Year to date",
};

export interface Filters {
  preset: RangePreset;
  dimension: Dimension | null;
  /** Value of `dimension` to keep; null means no dimension filter. */
  value: string | null;
}

export const DEFAULT_FILTERS: Filters = { preset: "all", dimension: null, value: null };

/** Presets are relative to the latest date in the data, so old exports still work. */
export function resolveRange(preset: RangePreset, firstDay: number, lastDay: number): DateRange {
  let from = firstDay;
  if (preset === "30d") from = lastDay - 29;
  else if (preset === "90d") from = lastDay - 89;
  else if (preset === "ytd") from = dayFromYmd(ymdFromDay(lastDay).year, 1, 1) as number;
  return { from: Math.max(firstDay, from), to: lastDay };
}

export function dimensionValues(orders: readonly Order[], dimension: Dimension): string[] {
  const values = new Set<string>();
  for (const o of orders) values.add(o[dimension] ?? NOT_SET_LABEL);
  return [...values].sort((a, b) => {
    if (a === NOT_SET_LABEL) return 1;
    if (b === NOT_SET_LABEL) return -1;
    return a.localeCompare(b);
  });
}

function matchesFilter(o: Order, filters: Filters): boolean {
  return (
    filters.dimension === null || filters.value === null || (o[filters.dimension] ?? NOT_SET_LABEL) === filters.value
  );
}

export interface KpiValue {
  value: number;
  /** Same measure over the previous equal-length period; null when that period is not fully covered by the data. */
  previous: number | null;
  /** Fractional change vs previous; null when there is nothing to compare with. */
  change: number | null;
}

export interface SeriesPoint {
  start: number;
  /** Short axis label. */
  label: string;
  /** Long label for tooltips and tables. */
  longLabel: string;
  /** Observed revenue; null for future (forecast) periods. */
  revenue: number | null;
  /** Dashed forecast line. The last observed point repeats its revenue so the line joins up. */
  forecast: number | null;
  lower: number | null;
  upper: number | null;
  isForecast: boolean;
}

export interface BreakdownChart {
  bars: Bar[];
  summary: string;
}

export interface DashboardModel {
  range: DateRange;
  granularity: Granularity;
  /** True when no order matches the filters. */
  empty: boolean;
  orderRows: number;
  totals: Totals;
  kpis: {
    revenue: KpiValue;
    orders: KpiValue;
    averageOrder: KpiValue;
    units: KpiValue | null;
    previousRange: DateRange | null;
  };
  series: {
    points: SeriesPoint[];
    observed: number;
    /** Partial first/last weeks or months that are left out of the chart. */
    omittedPartial: number;
    forecast: ForecastResult;
    summary: string;
  };
  products: BreakdownChart | null;
  breakdowns: Partial<Record<Dimension, BreakdownChart>>;
  weekday: { stats: WeekdayStat[]; summary: string };
  insights: string[];
}

export interface ModelInput {
  orders: readonly Order[];
  firstDay: number;
  lastDay: number;
  /** Which optional roles are mapped; unmapped roles hide their charts. */
  has: Record<Role, boolean>;
}

const TOP_N = 10;
const GRANULARITY_UNIT: Record<Granularity, string> = { day: "day", week: "week", month: "month" };

function summarizeBars(fmt: Formatter, noun: string, bars: Bar[]): string {
  const named = bars.filter((b) => !b.isOther);
  if (named.length === 0) return `No ${noun} data.`;
  const lead = named[0];
  const top3 = named.slice(0, 3).reduce((s, b) => s + b.share, 0);
  const tail = named.length > 1 ? ` The top ${Math.min(3, named.length)} bring in ${fmt.percent(top3)}.` : "";
  return `${lead.name} leads with ${fmt.money(lead.value)} (${fmt.percent(lead.share)} of revenue).${tail}`;
}

export function buildModel(input: ModelInput, filters: Filters, fmt: Formatter): DashboardModel {
  const { firstDay, lastDay, has } = input;
  const range = resolveRange(filters.preset, firstDay, lastDay);
  const spanDays = range.to - range.from + 1;
  const granularity = pickGranularity(spanDays);

  const scoped: Order[] = [];
  const previousRange: DateRange = { from: range.from - spanDays, to: range.from - 1 };
  const previousCovered = previousRange.from >= firstDay;
  const previousOrders: Order[] = [];
  for (const o of input.orders) {
    if (!matchesFilter(o, filters)) continue;
    if (o.day >= range.from && o.day <= range.to) scoped.push(o);
    else if (previousCovered && o.day >= previousRange.from && o.day <= previousRange.to) previousOrders.push(o);
  }

  const totals = computeTotals(scoped);
  const previous = previousCovered ? computeTotals(previousOrders) : null;
  const kpi = (value: number, prev: number | null | undefined): KpiValue => ({
    value,
    previous: prev ?? null,
    change: prev === null || prev === undefined ? null : percentChange(value, prev),
  });
  const kpis: DashboardModel["kpis"] = {
    revenue: kpi(totals.revenue, previous?.revenue),
    orders: kpi(totals.orders, previous?.orders),
    averageOrder: kpi(totals.averageOrder ?? 0, previous?.averageOrder),
    units: has.quantity && totals.units !== null ? kpi(totals.units, previous?.units) : null,
    previousRange: previousCovered ? previousRange : null,
  };

  // ── revenue over time + forecast ──
  const allPeriods = buildSeries(scoped, range, granularity);
  const periods = granularity === "day" ? allPeriods : allPeriods.filter((p) => !p.partial);
  const omittedPartial = allPeriods.length - periods.length;
  const forecast = forecastSeries(
    periods.map((p) => p.revenue),
    HORIZON[granularity],
  );
  const points: SeriesPoint[] = periods.map((p, i) => {
    const last = i === periods.length - 1 && forecast.ok;
    return {
      start: p.start,
      label: fmt.period(p.start, granularity),
      longLabel: fmt.periodLong(p.start, granularity),
      revenue: p.revenue,
      forecast: last ? p.revenue : null,
      lower: last ? p.revenue : null,
      upper: last ? p.revenue : null,
      isForecast: false,
    };
  });
  let firstForecastStart: number | null = null;
  if (forecast.ok && periods.length > 0) {
    let start = nextBucketStart(periods[periods.length - 1].start, granularity);
    firstForecastStart = start;
    for (const f of forecast.forecast.points) {
      points.push({
        start,
        label: fmt.period(start, granularity),
        longLabel: fmt.periodLong(start, granularity),
        revenue: null,
        forecast: f.value,
        lower: f.lower,
        upper: f.upper,
        isForecast: true,
      });
      start = nextBucketStart(start, granularity);
    }
  }

  let seriesSummary: string;
  if (periods.length === 0) seriesSummary = "No revenue in this period.";
  else {
    const peak = periods.reduce((a, b) => (b.revenue > a.revenue ? b : a));
    const mean = periods.reduce((s, p) => s + p.revenue, 0) / periods.length;
    const unit = GRANULARITY_UNIT[granularity];
    seriesSummary = `Revenue per ${unit} averaged ${fmt.money(mean)} and peaked at ${fmt.money(peak.revenue)} (${fmt.periodLong(peak.start, granularity)}).`;
    if (forecast.ok) {
      const avg = forecast.forecast.points.reduce((s, p) => s + p.value, 0) / forecast.forecast.points.length;
      seriesSummary += ` The forecast for the next ${forecast.forecast.points.length} ${unit}s averages ${fmt.money(avg)} per ${unit}.`;
    } else seriesSummary += ` ${forecast.reason}`;
    if (omittedPartial > 0) {
      seriesSummary += ` Partial ${unit}s at the edges of the range are left out.`;
    }
  }

  // ── breakdowns ──
  const products = has.product
    ? (() => {
        const bars = topWithOther(groupRevenue(scoped, "product"), TOP_N);
        return { bars, summary: summarizeBars(fmt, "product", bars) };
      })()
    : null;
  const breakdowns: DashboardModel["breakdowns"] = {};
  for (const dimension of DIMENSIONS) {
    if (!has[dimension]) continue;
    const bars = topWithOther(groupRevenue(scoped, dimension), TOP_N);
    breakdowns[dimension] = { bars, summary: summarizeBars(fmt, dimension, bars) };
  }

  // ── weekday pattern ──
  const weekdayStats = weekdayAverages(scoped, range);
  let weekdaySummary = "Not enough days to compare weekdays.";
  if (scoped.length > 0 && weekdayStats.every((d) => d.days >= 1)) {
    const best = weekdayStats.reduce((a, b) => (b.average > a.average ? b : a));
    const worst = weekdayStats.reduce((a, b) => (b.average < a.average ? b : a));
    weekdaySummary = `${best.name} is the strongest day, averaging ${fmt.money(best.average)}; ${worst.name} is the quietest at ${fmt.money(worst.average)}.`;
  }

  // ── insights ──
  let growth: { days: number; current: number; previous: number } | null = null;
  const window = spanDays >= 60 ? 30 : spanDays >= 28 ? 14 : spanDays >= 14 ? 7 : 0;
  if (window > 0) {
    let current = 0;
    let before = 0;
    for (const o of scoped) {
      if (o.day > range.to - window) current += o.amount;
      else if (o.day > range.to - 2 * window) before += o.amount;
    }
    growth = { days: window, current, previous: before };
  }

  const leaders = DIMENSIONS.flatMap((dimension) => {
    const bars = breakdowns[dimension]?.bars.filter((b) => !b.isOther);
    return bars && bars.length > 0 && bars[0].name !== NOT_SET_LABEL
      ? [{ dimension, name: bars[0].name, share: bars[0].share, count: bars.length }]
      : [];
  });

  let anomaly: { anomaly: ReturnType<typeof detectAnomalies>[number]; day: number } | null = null;
  if (spanDays >= 8) {
    const found = detectAnomalies(dailyRevenue(scoped, range))[0];
    if (found) anomaly = { anomaly: found, day: range.from + found.index };
  }

  let repeatShare: number | null = null;
  if (has.customer) {
    const perCustomer = new Map<string, { orders: number; revenue: number }>();
    let known = 0;
    for (const o of scoped) {
      if (o.customer === undefined) continue;
      known += o.amount;
      const entry = perCustomer.get(o.customer) ?? { orders: 0, revenue: 0 };
      entry.orders++;
      entry.revenue += o.amount;
      perCustomer.set(o.customer, entry);
    }
    if (perCustomer.size >= 2 && known > 0) {
      let repeat = 0;
      for (const c of perCustomer.values()) if (c.orders > 1) repeat += c.revenue;
      repeatShare = repeat / known;
    }
  }

  const insights = buildInsights({
    fmt,
    range,
    granularity,
    totals,
    growth,
    topProducts: products?.bars ?? null,
    leaders,
    weekday: weekdayStats,
    anomaly,
    forecast:
      forecast.ok && firstForecastStart !== null
        ? { forecast: forecast.forecast, firstPeriodStart: firstForecastStart }
        : null,
    pareto: has.product ? paretoShare(groupRevenue(scoped, "product").map((g) => g.value)) : null,
    repeatShare,
  });

  return {
    range,
    granularity,
    empty: scoped.length === 0,
    orderRows: scoped.length,
    totals,
    kpis,
    series: { points, observed: periods.length, omittedPartial, forecast, summary: seriesSummary },
    products,
    breakdowns,
    weekday: { stats: weekdayStats, summary: weekdaySummary },
    insights,
  };
}
