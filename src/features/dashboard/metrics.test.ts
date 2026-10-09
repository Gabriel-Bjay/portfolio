import { describe, expect, it } from "vitest";
import {
  bucketEnd,
  bucketStart,
  buildSeries,
  computeTotals,
  dailyRevenue,
  detectAnomalies,
  groupRevenue,
  paretoShare,
  percentChange,
  pickGranularity,
  topWithOther,
  weekdayAverages,
} from "./metrics";
import type { Order } from "./types";
import { dayFromYmd, weekdayIndex } from "./values";

const day = (y: number, m: number, d: number) => dayFromYmd(y, m, d) as number;
const order = (d: number, amount: number, extra: Partial<Order> = {}): Order => ({ day: d, amount, ...extra });

describe("pickGranularity", () => {
  it("switches at 62 days and 18 months", () => {
    expect(pickGranularity(1)).toBe("day");
    expect(pickGranularity(62)).toBe("day");
    expect(pickGranularity(63)).toBe("week");
    expect(pickGranularity(548)).toBe("week");
    expect(pickGranularity(549)).toBe("month");
    expect(pickGranularity(2000)).toBe("month");
  });
});

describe("buckets", () => {
  it("starts weeks on Monday", () => {
    const wed = day(2025, 11, 26);
    expect(weekdayIndex(bucketStart(wed, "week"))).toBe(0);
    expect(bucketStart(wed, "week")).toBe(day(2025, 11, 24));
    expect(bucketEnd(day(2025, 11, 24), "week")).toBe(day(2025, 11, 30));
    expect(bucketStart(day(2025, 11, 24), "week")).toBe(day(2025, 11, 24));
  });

  it("handles month ends, December and leap February", () => {
    expect(bucketStart(day(2025, 11, 26), "month")).toBe(day(2025, 11, 1));
    expect(bucketEnd(day(2025, 11, 1), "month")).toBe(day(2025, 11, 30));
    expect(bucketEnd(day(2025, 12, 1), "month")).toBe(day(2025, 12, 31));
    expect(bucketEnd(day(2024, 2, 1), "month")).toBe(day(2024, 2, 29));
    expect(bucketEnd(day(2025, 2, 1), "month")).toBe(day(2025, 2, 28));
  });
});

describe("buildSeries", () => {
  it("zero-fills gaps and ignores orders outside the range", () => {
    const range = { from: day(2025, 1, 1), to: day(2025, 1, 5) };
    const s = buildSeries(
      [order(day(2025, 1, 1), 10), order(day(2025, 1, 1), 5), order(day(2025, 1, 4), 7), order(day(2024, 12, 31), 99)],
      range,
      "day",
    );
    expect(s.map((p) => p.revenue)).toEqual([15, 0, 0, 7, 0]);
    expect(s.every((p) => !p.partial)).toBe(true);
  });

  it("marks weeks cut by the range as partial", () => {
    const range = { from: day(2025, 11, 26), to: day(2025, 12, 8) }; // Wed … Mon
    const s = buildSeries([order(day(2025, 11, 26), 1), order(day(2025, 12, 8), 2)], range, "week");
    expect(s.map((p) => p.partial)).toEqual([true, false, true]);
    expect(s.map((p) => p.revenue)).toEqual([1, 0, 2]);
  });

  it("buckets months across a year boundary", () => {
    const range = { from: day(2025, 11, 1), to: day(2026, 1, 31) };
    const s = buildSeries([order(day(2025, 12, 31), 3), order(day(2026, 1, 1), 4)], range, "month");
    expect(s.map((p) => p.revenue)).toEqual([0, 3, 4]);
    expect(s.every((p) => !p.partial)).toBe(true);
  });

  it("returns a single zero period for a one-day range", () => {
    expect(buildSeries([], { from: 100, to: 100 }, "day")).toEqual([
      { start: 100, end: 100, revenue: 0, partial: false },
    ]);
  });
});

describe("dailyRevenue", () => {
  it("sums per calendar day over the whole range", () => {
    expect(dailyRevenue([order(10, 1), order(10, 2), order(12, 5), order(99, 100)], { from: 10, to: 13 })).toEqual([
      3, 0, 5, 0,
    ]);
  });
});

describe("computeTotals", () => {
  it("counts distinct order IDs and leaves units null without quantities", () => {
    const t = computeTotals([
      order(1, 100, { orderId: "A" }),
      order(1, 50, { orderId: "A" }),
      order(2, 30, { orderId: "B" }),
    ]);
    expect(t).toEqual({ revenue: 180, orders: 2, units: null, averageOrder: 90 });
  });

  it("counts rows when there is no order ID and sums units", () => {
    const t = computeTotals([order(1, 10, { quantity: 2 }), order(1, 20, { quantity: 3 }), order(2, 30)]);
    expect(t).toEqual({ revenue: 60, orders: 3, units: 5, averageOrder: 20 });
  });

  it("handles no orders and negative amounts (refunds)", () => {
    expect(computeTotals([])).toEqual({ revenue: 0, orders: 0, units: null, averageOrder: null });
    expect(computeTotals([order(1, 100), order(1, -30)]).revenue).toBe(70);
  });
});

describe("percentChange", () => {
  it("compares to the previous value", () => {
    expect(percentChange(118, 100)).toBeCloseTo(0.18);
    expect(percentChange(50, 100)).toBeCloseTo(-0.5);
    expect(percentChange(5, 0)).toBeNull();
    expect(percentChange(-50, -100)).toBeCloseTo(0.5);
  });
});

describe("groupRevenue / topWithOther", () => {
  const orders = [
    order(1, 100, { product: "A" }),
    order(1, 300, { product: "B" }),
    order(1, 50, { product: "A" }),
    order(1, 10, { product: "C" }),
    order(1, 5),
  ];

  it("sorts groups by revenue and labels blanks", () => {
    expect(groupRevenue(orders, "product")).toEqual([
      { name: "B", value: 300 },
      { name: "A", value: 150 },
      { name: "C", value: 10 },
      { name: "(not set)", value: 5 },
    ]);
  });

  it("folds the tail into Other and computes shares of the grand total", () => {
    const bars = topWithOther(groupRevenue(orders, "product"), 2);
    expect(bars.map((b) => b.name)).toEqual(["B", "A", "Other"]);
    expect(bars[2]).toMatchObject({ value: 15, isOther: true });
    expect(bars.reduce((s, b) => s + b.share, 0)).toBeCloseTo(1);
    expect(bars[0].share).toBeCloseTo(300 / 465);
  });

  it("adds no Other bar when everything fits and survives an empty list", () => {
    expect(topWithOther([{ name: "A", value: 1 }], 10)).toHaveLength(1);
    expect(topWithOther([], 10)).toEqual([]);
    expect(topWithOther([{ name: "A", value: 0 }], 10)[0].share).toBe(0);
  });

  it("breaks ties alphabetically so output is stable", () => {
    const g = groupRevenue([order(1, 5, { region: "B" }), order(1, 5, { region: "A" })], "region");
    expect(g.map((x) => x.name)).toEqual(["A", "B"]);
  });
});

describe("paretoShare", () => {
  it("measures what the top 20% of items bring", () => {
    const r = paretoShare([800, 100, 50, 30, 20]);
    expect(r).toEqual({ count: 5, topCount: 1, share: 0.8 });
  });

  it("needs at least five items and ignores non-positive values", () => {
    expect(paretoShare([1, 2, 3, 4])).toBeNull();
    expect(paretoShare([10, 10, 10, 10, -5, 0])).toBeNull();
  });

  it("rounds the top group up", () => {
    expect(paretoShare(Array.from({ length: 12 }, (_, i) => 12 - i))?.topCount).toBe(3);
  });
});

describe("weekdayAverages", () => {
  it("averages over every such day in the range, including empty days", () => {
    // Mon 3 Nov … Sun 16 Nov 2025: two of each weekday.
    const range = { from: day(2025, 11, 3), to: day(2025, 11, 16) };
    const stats = weekdayAverages(
      [order(day(2025, 11, 3), 100), order(day(2025, 11, 10), 50), order(day(2025, 11, 8), 90)],
      range,
    );
    expect(stats.map((s) => s.short)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(stats[0]).toMatchObject({ total: 150, days: 2, average: 75 });
    expect(stats[5]).toMatchObject({ total: 90, days: 2, average: 45 });
    expect(stats[1].average).toBe(0);
  });

  it("does not divide by zero when a weekday never occurs", () => {
    const stats = weekdayAverages([order(day(2025, 11, 3), 100)], { from: day(2025, 11, 3), to: day(2025, 11, 4) });
    expect(stats[6]).toMatchObject({ days: 0, average: 0 });
  });
});

describe("detectAnomalies", () => {
  const base = Array.from({ length: 30 }, (_, i) => 100 + (i % 3) * 2);

  it("flags a spike with its ratio to the baseline", () => {
    const values = [...base, 400];
    const found = detectAnomalies(values);
    expect(found).toHaveLength(1);
    expect(found[0].index).toBe(30);
    expect(found[0].z).toBeGreaterThan(2.5);
    expect(found[0].ratio).toBeCloseTo(400 / 101.3, 1);
  });

  it("flags dips as negative z", () => {
    expect(detectAnomalies([...base, 5])[0].z).toBeLessThan(-2.5);
  });

  it("needs at least eight periods", () => {
    expect(detectAnomalies([100, 100, 100, 100, 100, 100, 900])).toEqual([]);
    expect(detectAnomalies([100, 101, 99, 100, 101, 99, 100, 900]).length).toBe(1);
  });

  it("ignores flat series and normal wobble", () => {
    expect(detectAnomalies(new Array(20).fill(50))).toEqual([]);
    expect(detectAnomalies(base)).toEqual([]);
  });

  it("orders results by how extreme they are", () => {
    const values = [...base, 300, ...base.slice(0, 5), 900];
    const found = detectAnomalies(values);
    expect(found.length).toBeGreaterThanOrEqual(2);
    expect(Math.abs(found[0].z)).toBeGreaterThanOrEqual(Math.abs(found[1].z));
  });
});
