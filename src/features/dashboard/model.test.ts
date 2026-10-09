import { describe, expect, it } from "vitest";
import { detectColumns } from "./detect";
import { createFormatter } from "./format";
import { buildModel, DEFAULT_FILTERS, dimensionValues, resolveRange, type Filters, type ModelInput } from "./model";
import { normalizeOrders } from "./normalize";
import { sampleTable } from "./sample";
import type { Order, Role } from "./types";
import { ROLES } from "./types";
import { dayFromYmd } from "./values";

const day = (y: number, m: number, d: number) => dayFromYmd(y, m, d) as number;
const fmt = createFormatter("KES");

function hasRoles(...roles: Role[]): Record<Role, boolean> {
  return Object.fromEntries(ROLES.map((r) => [r, roles.includes(r)])) as Record<Role, boolean>;
}

/** 60 consecutive days from 1 Jan 2025: revenue 100 on days 1–30, 200 on days 31–60, alternating regions. */
function twoMonths(): ModelInput {
  const first = day(2025, 1, 1);
  const orders: Order[] = [];
  for (let i = 0; i < 60; i++) {
    orders.push({
      day: first + i,
      amount: i < 30 ? 100 : 200,
      region: i % 2 === 0 ? "East" : "West",
      product: i % 3 === 0 ? "Tea" : "Cake",
      quantity: 2,
    });
  }
  return {
    orders,
    firstDay: first,
    lastDay: first + 59,
    has: hasRoles("date", "amount", "region", "product", "quantity"),
  };
}

describe("resolveRange", () => {
  const first = day(2024, 6, 15);
  const last = day(2025, 3, 10);
  it("is relative to the latest date in the data", () => {
    expect(resolveRange("all", first, last)).toEqual({ from: first, to: last });
    expect(resolveRange("30d", first, last)).toEqual({ from: last - 29, to: last });
    expect(resolveRange("90d", first, last)).toEqual({ from: last - 89, to: last });
    expect(resolveRange("ytd", first, last)).toEqual({ from: day(2025, 1, 1), to: last });
  });

  it("never reaches before the first day of data", () => {
    expect(resolveRange("90d", last - 10, last).from).toBe(last - 10);
    expect(resolveRange("ytd", day(2025, 2, 1), last).from).toBe(day(2025, 2, 1));
  });
});

describe("buildModel", () => {
  const input = twoMonths();

  it("computes KPIs and compares with the previous equal-length period", () => {
    const m = buildModel(input, { ...DEFAULT_FILTERS, preset: "30d" }, fmt);
    expect(m.range).toEqual({ from: input.lastDay - 29, to: input.lastDay });
    expect(m.kpis.revenue).toEqual({ value: 6000, previous: 3000, change: 1 });
    expect(m.kpis.orders).toEqual({ value: 30, previous: 30, change: 0 });
    expect(m.kpis.averageOrder.value).toBe(200);
    expect(m.kpis.averageOrder.change).toBe(1);
    expect(m.kpis.units).toMatchObject({ value: 60, previous: 60, change: 0 });
    expect(m.kpis.previousRange).toEqual({ from: input.firstDay, to: input.firstDay + 29 });
  });

  it("has nothing to compare against for the full range", () => {
    const m = buildModel(input, DEFAULT_FILTERS, fmt);
    expect(m.kpis.revenue).toEqual({ value: 9000, previous: null, change: null });
    expect(m.kpis.previousRange).toBeNull();
  });

  it("does not compare with a previous period the data only partly covers", () => {
    const m = buildModel(input, { ...DEFAULT_FILTERS, preset: "90d" }, fmt);
    expect(m.range.from).toBe(input.firstDay); // clamped
    expect(m.kpis.revenue.change).toBeNull();
  });

  it("hides units when no quantity column is mapped", () => {
    const m = buildModel({ ...input, has: hasRoles("date", "amount") }, DEFAULT_FILTERS, fmt);
    expect(m.kpis.units).toBeNull();
  });

  it("filters by a dimension value and recomputes everything", () => {
    const filters: Filters = { preset: "all", dimension: "region", value: "East" };
    const m = buildModel(input, filters, fmt);
    expect(m.orderRows).toBe(30);
    expect(m.kpis.revenue.value).toBe(4500);
    expect(m.empty).toBe(false);
    const none = buildModel(input, { ...filters, value: "Nowhere" }, fmt);
    expect(none.empty).toBe(true);
    expect(none.kpis.revenue.value).toBe(0);
    expect(none.kpis.averageOrder.value).toBe(0);
  });

  it("uses day granularity for 60 days and builds a continuous series with a forecast", () => {
    const m = buildModel(input, DEFAULT_FILTERS, fmt);
    expect(m.granularity).toBe("day");
    expect(m.series.observed).toBe(60);
    expect(m.series.forecast.ok).toBe(true);
    const observed = m.series.points.filter((p) => !p.isForecast);
    const future = m.series.points.filter((p) => p.isForecast);
    expect(observed).toHaveLength(60);
    expect(future).toHaveLength(14);
    // The forecast starts the day after the data ends, and the dashed line joins the last actual point.
    expect(future[0].start).toBe(input.lastDay + 1);
    expect(observed[59].forecast).toBe(observed[59].revenue);
    expect(future.every((p) => p.revenue === null && p.lower! <= p.forecast! && p.forecast! <= p.upper!)).toBe(true);
    expect(m.series.summary).toContain("forecast for the next 14 days");
  });

  it("hides the forecast and explains why when there are fewer than six periods", () => {
    const m = buildModel(input, { ...DEFAULT_FILTERS, preset: "30d" }, fmt);
    expect(m.series.forecast.ok).toBe(true);
    const short: ModelInput = { ...input, orders: input.orders.slice(0, 4), lastDay: input.firstDay + 3 };
    const s = buildModel(short, DEFAULT_FILTERS, fmt);
    expect(s.series.forecast).toEqual({ ok: false, reason: expect.stringContaining("at least 6") });
    expect(s.series.points.every((p) => !p.isForecast)).toBe(true);
    expect(s.series.summary).toContain("at least 6");
  });

  it("builds product, breakdown and weekday data", () => {
    const m = buildModel(input, DEFAULT_FILTERS, fmt);
    expect(m.products?.bars.map((b) => b.name).sort()).toEqual(["Cake", "Tea"]);
    expect(m.breakdowns.region?.bars).toHaveLength(2);
    expect(m.breakdowns.category).toBeUndefined();
    expect(m.weekday.stats).toHaveLength(7);
    expect(m.weekday.summary).toMatch(/strongest day/);
    const noProduct = buildModel({ ...input, has: hasRoles("date", "amount") }, DEFAULT_FILTERS, fmt);
    expect(noProduct.products).toBeNull();
    expect(noProduct.breakdowns).toEqual({});
  });

  it("drops partial weeks from the weekly chart", () => {
    const first = day(2025, 4, 1); // a Tuesday
    const orders: Order[] = Array.from({ length: 100 }, (_, i) => ({ day: first + i, amount: 10 }));
    const m = buildModel(
      { orders, firstDay: first, lastDay: first + 99, has: hasRoles("date", "amount") },
      DEFAULT_FILTERS,
      fmt,
    );
    expect(m.granularity).toBe("week");
    expect(m.series.omittedPartial).toBeGreaterThanOrEqual(1);
    expect(m.series.points.filter((p) => !p.isForecast).every((p) => p.revenue === 70)).toBe(true);
    expect(m.series.forecast.ok && m.series.forecast.forecast.points).toHaveLength(6);
    expect(m.series.summary).toContain("Partial weeks");
  });

  it("lists dimension values alphabetically with (not set) last", () => {
    const values = dimensionValues(
      [
        { day: 1, amount: 1, region: "b" },
        { day: 1, amount: 1 },
        { day: 1, amount: 1, region: "a" },
      ],
      "region",
    );
    expect(values).toEqual(["a", "b", "(not set)"]);
  });
});

describe("buildModel on the sample data (acceptance criterion 1)", () => {
  const table = sampleTable();
  const { mapping } = detectColumns(table);
  const n = normalizeOrders(table, mapping);
  const has = Object.fromEntries(ROLES.map((r) => [r, mapping[r] !== undefined])) as Record<Role, boolean>;
  const input: ModelInput = { orders: n.orders, firstDay: n.firstDay!, lastDay: n.lastDay!, has };
  const model = buildModel(input, DEFAULT_FILTERS, createFormatter(n.currency));

  it("fills every panel", () => {
    expect(model.kpis.units).not.toBeNull();
    expect(model.granularity).toBe("week");
    expect(model.series.forecast.ok).toBe(true);
    expect(model.products?.bars).toHaveLength(11); // top 10 + Other
    expect(model.products?.bars[10].isOther).toBe(true);
    expect(Object.keys(model.breakdowns).sort()).toEqual(["category", "channel", "region"]);
    expect(model.weekday.stats).toHaveLength(7);
    expect(model.insights.length).toBeGreaterThanOrEqual(4);
    expect(model.insights.length).toBeLessThanOrEqual(6);
    expect(model.insights.join(" ")).not.toMatch(/NaN|undefined|Infinity/);
  });

  it("flags Black Friday as the unusual day", () => {
    expect(model.insights.some((s) => s.startsWith("Sales on 28 Nov 2025 were unusually high"))).toBe(true);
  });

  it("changes when filters change", () => {
    const month = buildModel(input, { ...DEFAULT_FILTERS, preset: "30d" }, createFormatter(n.currency));
    expect(month.kpis.revenue.value).toBeLessThan(model.kpis.revenue.value);
    expect(month.kpis.revenue.change).not.toBeNull();
    const one = buildModel(
      input,
      { preset: "all", dimension: "region", value: "Westlands" },
      createFormatter(n.currency),
    );
    expect(one.kpis.revenue.value).toBeLessThan(model.kpis.revenue.value);
    expect(one.kpis.revenue.value).toBeGreaterThan(0);
  });
});

describe("performance", () => {
  it("normalises and models 200,000 rows in a few seconds", () => {
    const rows: string[][] = [];
    const start = day(2023, 1, 1);
    for (let i = 0; i < 200_000; i++) {
      const d = start + (i % 900);
      rows.push([new Date(d * 86_400_000).toISOString().slice(0, 10), `P${i % 40}`, String(100 + (i % 17)), `O${i}`]);
    }
    const t0 = performance.now();
    const n = normalizeOrders(
      { headers: ["Date", "Product", "Amount", "Order ID"], rows },
      { date: 0, product: 1, amount: 2, orderId: 3 },
    );
    const model = buildModel(
      {
        orders: n.orders,
        firstDay: n.firstDay!,
        lastDay: n.lastDay!,
        has: hasRoles("date", "amount", "product", "orderId"),
      },
      DEFAULT_FILTERS,
      fmt,
    );
    const elapsed = performance.now() - t0;
    expect(n.orders).toHaveLength(200_000);
    expect(model.totals.orders).toBe(200_000);
    expect(model.granularity).toBe("month");
    expect(elapsed).toBeLessThan(5000);
  });
});
