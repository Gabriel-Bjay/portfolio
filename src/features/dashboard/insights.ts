// Deterministic plain-English insights. Every sentence is a template filled from computed
// numbers; nothing is inferred beyond what the data shows.
import type { Forecast } from "./forecast";
import type { Formatter } from "./format";
import type { Anomaly, Bar, Totals, WeekdayStat } from "./metrics";
import type { DateRange, Dimension, Granularity } from "./types";

export interface InsightInput {
  fmt: Formatter;
  range: DateRange;
  granularity: Granularity;
  totals: Totals;
  /** Revenue in the last N days of the range vs the N days before, when the range is long enough. */
  growth: { days: number; current: number; previous: number } | null;
  topProducts: Bar[] | null;
  /** Top group per mapped dimension, with the number of distinct values. */
  leaders: { dimension: Dimension; name: string; share: number; count: number }[];
  weekday: WeekdayStat[];
  anomaly: { anomaly: Anomaly; day: number } | null;
  forecast: { forecast: Forecast; firstPeriodStart: number } | null;
  pareto: { count: number; topCount: number; share: number } | null;
  repeatShare: number | null;
}

export const MAX_INSIGHTS = 6;
export const MIN_INSIGHTS = 4;

const DIMENSION_PLURAL: Record<Dimension, string> = {
  category: "categories",
  region: "regions",
  channel: "sales channels",
};

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Sentences in priority order; the caller keeps the first few. Each builder returns null when it does not apply. */
export function buildInsights(input: InsightInput): string[] {
  const { fmt, range, totals } = input;
  const spanDays = range.to - range.from + 1;
  const dateText = (day: number) => (spanDays > 365 ? fmt.dateWithYear(day) : fmt.date(day));
  const candidates: (string | null)[] = [];

  // 1. Growth
  const g = input.growth;
  if (g && g.previous > 0) {
    const change = (g.current - g.previous) / g.previous;
    const money = `${fmt.money(g.current)} vs ${fmt.money(g.previous)}`;
    if (Math.abs(change) < 0.01) {
      candidates.push(
        `Revenue was about the same in the last ${g.days} days as in the ${g.days} days before (${money}).`,
      );
    } else {
      candidates.push(
        `Revenue ${change > 0 ? "grew" : "fell"} ${fmt.percent(Math.abs(change))} in the last ${g.days} days compared with the ${g.days} days before (${money}).`,
      );
    }
  } else candidates.push(null);

  // 2. Forecast
  if (input.forecast) {
    const { forecast, firstPeriodStart } = input.forecast;
    const first = forecast.points[0];
    const when =
      input.granularity === "day"
        ? `the next day (${fmt.date(firstPeriodStart)})`
        : input.granularity === "week"
          ? `next week (from ${fmt.date(firstPeriodStart)})`
          : `next month (${fmt.period(firstPeriodStart, "month")})`;
    candidates.push(
      `If the recent trend continues, revenue for ${when} is forecast at about ${fmt.money(first.value)} (likely between ${fmt.money(first.lower)} and ${fmt.money(first.upper)}).`,
    );
  } else candidates.push(null);

  // 3. Top products
  const named = input.topProducts?.filter((b) => !b.isOther) ?? [];
  if (named.length >= 4) {
    const top = named.slice(0, 3);
    const share = top.reduce((s, b) => s + b.share, 0);
    candidates.push(
      `Your top 3 products (${joinNames(top.map((b) => b.name))}) bring in ${fmt.percent(share)} of revenue.`,
    );
  } else if (named.length >= 2 && named[0].share > 0) {
    candidates.push(
      `${named[0].name} is your best-selling product, bringing in ${fmt.percent(named[0].share)} of revenue.`,
    );
  } else candidates.push(null);

  // 4. Unusual day
  if (input.anomaly) {
    const { anomaly, day } = input.anomaly;
    const high = anomaly.z > 0;
    candidates.push(
      `Sales on ${dateText(day)} were unusually ${high ? "high" : "low"} (${anomaly.ratio.toFixed(1)}× a normal day).`,
    );
  } else candidates.push(null);

  // 5. Weekday pattern (needs every weekday to appear at least twice)
  const complete = input.weekday.length === 7 && input.weekday.every((d) => d.days >= 2);
  if (complete) {
    const mean = input.weekday.reduce((s, d) => s + d.average, 0) / 7;
    const best = input.weekday.reduce((a, b) => (b.average > a.average ? b : a));
    if (mean > 0 && best.average / mean - 1 >= 0.05) {
      candidates.push(
        `${best.name}s are your strongest day, ${fmt.percent(best.average / mean - 1)} above the weekly average.`,
      );
    } else if (mean > 0) {
      candidates.push("Sales are spread fairly evenly across the week.");
    } else candidates.push(null);
  } else candidates.push(null);

  // 6. Biggest segment
  const leader = input.leaders.filter((l) => l.count >= 2 && l.share > 0).sort((a, b) => b.share - a.share)[0];
  if (leader) {
    candidates.push(
      `${leader.name} leads your ${DIMENSION_PLURAL[leader.dimension]} with ${fmt.percent(leader.share)} of revenue.`,
    );
  } else candidates.push(null);

  // 7. Concentration
  if (input.pareto) {
    candidates.push(
      `The top 20% of products (${input.pareto.topCount} of ${input.pareto.count}) bring in ${fmt.percent(input.pareto.share)} of revenue.`,
    );
  } else candidates.push(null);

  // 8. Repeat customers
  if (input.repeatShare !== null && input.repeatShare > 0) {
    candidates.push(`${fmt.percent(input.repeatShare)} of revenue came from customers who ordered more than once.`);
  } else candidates.push(null);

  const picked = candidates.filter((c): c is string => c !== null);

  // Facts that are always true, used only to reach a useful minimum on sparse data.
  const fallbacks = [
    `${totals.orders.toLocaleString("en-KE")} ${totals.orders === 1 ? "order" : "orders"} worth ${fmt.money(totals.revenue)} between ${fmt.date(range.from)} and ${fmt.dateWithYear(range.to)}.`,
    totals.averageOrder === null ? null : `The average order is worth ${fmt.money(totals.averageOrder)}.`,
  ].filter((f): f is string => f !== null);
  for (const f of fallbacks) {
    if (picked.length >= MIN_INSIGHTS) break;
    picked.push(f);
  }
  return picked.slice(0, MAX_INSIGHTS);
}
