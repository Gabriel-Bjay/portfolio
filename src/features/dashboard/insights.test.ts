import { describe, expect, it } from "vitest";
import { createFormatter } from "./format";
import { buildInsights, MAX_INSIGHTS, MIN_INSIGHTS, type InsightInput } from "./insights";
import type { Bar, WeekdayStat } from "./metrics";
import { WEEKDAY_NAMES, WEEKDAY_SHORT } from "./metrics";
import { dayFromYmd } from "./values";

const day = (y: number, m: number, d: number) => dayFromYmd(y, m, d) as number;
const fmt = createFormatter("KES");

const bar = (name: string, value: number, share: number): Bar => ({ name, value, share, isOther: false });
const weekdays = (averages: number[], days = 10): WeekdayStat[] =>
  averages.map((average, index) => ({
    index,
    name: WEEKDAY_NAMES[index],
    short: WEEKDAY_SHORT[index],
    average,
    total: average * days,
    days,
  }));

const full: InsightInput = {
  fmt,
  range: { from: day(2025, 4, 1), to: day(2025, 9, 30) },
  granularity: "week",
  totals: { revenue: 5_000_000, orders: 900, units: 1500, averageOrder: 5555 },
  growth: { days: 30, current: 1_180_000, previous: 1_000_000 },
  topProducts: [
    bar("Phone A", 1, 0.3),
    bar("Phone B", 1, 0.2),
    bar("Case", 1, 0.11),
    bar("Cable", 1, 0.05),
    { ...bar("Other", 1, 0.2), isOther: true },
  ],
  leaders: [{ dimension: "region", name: "Westlands", share: 0.31, count: 5 }],
  weekday: weekdays([100, 90, 95, 100, 110, 134, 120]),
  anomaly: { anomaly: { index: 10, value: 310, baseline: 100, z: 4, ratio: 3.1 }, day: day(2025, 11, 24) },
  forecast: {
    forecast: {
      alpha: 0.5,
      beta: 0.1,
      sigma: 10,
      points: [{ step: 1, value: 612_000, lower: 540_000, upper: 690_000 }],
    },
    firstPeriodStart: day(2025, 10, 6),
  },
  pareto: { count: 20, topCount: 4, share: 0.78 },
  repeatShare: 0.62,
};

describe("buildInsights", () => {
  it("produces plain-English sentences with formatted numbers, most important first", () => {
    const out = buildInsights(full);
    expect(out).toHaveLength(MAX_INSIGHTS);
    expect(out[0]).toBe(
      "Revenue grew 18% in the last 30 days compared with the 30 days before (KES 1,180,000 vs KES 1,000,000).",
    );
    expect(out[1]).toContain("forecast at about KES 612,000 (likely between KES 540,000 and KES 690,000)");
    expect(out[1]).toContain("next week (from 6 Oct)");
    expect(out).toContain("Your top 3 products (Phone A, Phone B and Case) bring in 61% of revenue.");
    expect(out).toContain("Sales on 24 Nov were unusually high (3.1× a normal day).");
    expect(out).toContain("Saturdays are your strongest day, 25% above the weekly average.");
  });

  it("reports declines and flat periods honestly", () => {
    const fell = buildInsights({ ...full, growth: { days: 14, current: 800, previous: 1000 } })[0];
    expect(fell).toMatch(/^Revenue fell 20% in the last 14 days/);
    const flat = buildInsights({ ...full, growth: { days: 7, current: 1004, previous: 1000 } })[0];
    expect(flat).toMatch(/^Revenue was about the same in the last 7 days/);
  });

  it("describes unusually low days and adds the year when the range is long", () => {
    const out = buildInsights({
      ...full,
      range: { from: day(2024, 1, 1), to: day(2025, 12, 31) },
      anomaly: { anomaly: { index: 1, value: 10, baseline: 100, z: -5, ratio: 0.1 }, day: day(2025, 12, 25) },
    });
    expect(out).toContain("Sales on 25 Dec 2025 were unusually low (0.1× a normal day).");
  });

  it("falls back to facts that are always true when little else applies", () => {
    const out = buildInsights({
      ...full,
      growth: null,
      topProducts: null,
      leaders: [],
      weekday: weekdays([1, 1, 1, 1, 1, 1, 1], 1),
      anomaly: null,
      forecast: null,
      pareto: null,
      repeatShare: null,
    });
    expect(out.length).toBeLessThanOrEqual(MIN_INSIGHTS);
    expect(out[0]).toBe("900 orders worth KES 5,000,000 between 1 Apr and 30 Sept 2025.");
    expect(out[1]).toBe("The average order is worth KES 5,555.");
  });

  it("handles a single order and zero revenue without NaN", () => {
    const out = buildInsights({
      ...full,
      totals: { revenue: 0, orders: 1, units: null, averageOrder: 0 },
      growth: { days: 7, current: 0, previous: 0 },
      topProducts: [bar("Only", 0, 0)],
      weekday: weekdays([0, 0, 0, 0, 0, 0, 0]),
      anomaly: null,
      forecast: null,
      pareto: null,
      repeatShare: null,
      leaders: [],
    });
    expect(out.join(" ")).not.toMatch(/NaN|Infinity|undefined/);
    expect(out[0]).toContain("1 order worth KES 0");
  });

  it("says sales are even when no weekday stands out, and skips weekdays with too little data", () => {
    const even = buildInsights({ ...full, weekday: weekdays([100, 101, 99, 100, 102, 101, 99]) });
    expect(even).toContain("Sales are spread fairly evenly across the week.");
    const thin = buildInsights({ ...full, weekday: weekdays([100, 90, 95, 100, 110, 134, 120], 1) });
    expect(thin.join(" ")).not.toMatch(/strongest day/);
  });

  it("names a single best seller when there are too few products for a top 3", () => {
    const out = buildInsights({ ...full, topProducts: [bar("Tea", 1, 0.7), bar("Cake", 1, 0.3)] });
    expect(out).toContain("Tea is your best-selling product, bringing in 70% of revenue.");
  });

  it("picks the segment with the largest leading share", () => {
    const out = buildInsights({
      ...full,
      weekday: weekdays([1, 1, 1, 1, 1, 1, 1], 1),
      leaders: [
        { dimension: "region", name: "Westlands", share: 0.31, count: 5 },
        { dimension: "channel", name: "In-store", share: 0.52, count: 4 },
        { dimension: "category", name: "Solo", share: 1, count: 1 },
      ],
    });
    expect(out.join(" ")).toContain("In-store leads your sales channels with 52% of revenue.");
    expect(out.join(" ")).not.toContain("Solo");
  });

  it("phrases the forecast per granularity", () => {
    const f = full.forecast!;
    expect(buildInsights({ ...full, granularity: "day" })[1]).toContain("the next day (6 Oct)");
    expect(
      buildInsights({ ...full, granularity: "month", forecast: { ...f, firstPeriodStart: day(2025, 10, 1) } })[1],
    ).toContain("next month (Oct 2025)");
  });
});
