import Papa from "papaparse";
import { describe, expect, it } from "vitest";
import { buildSummaryCsv, isoDay } from "./exportSummary";
import { createFormatter } from "./format";
import { buildModel, DEFAULT_FILTERS, type ModelInput } from "./model";
import type { Order, Role } from "./types";
import { ROLES } from "./types";
import { dayFromYmd } from "./values";

const first = dayFromYmd(2025, 1, 1) as number;
const has = Object.fromEntries(ROLES.map((r) => [r, ["date", "amount", "product", "region"].includes(r)])) as Record<
  Role,
  boolean
>;

function input(products: string[]): ModelInput {
  const orders: Order[] = Array.from({ length: 20 }, (_, i) => ({
    day: first + i,
    amount: 100 + i,
    product: products[i % products.length],
    region: i % 2 ? "East" : "West",
  }));
  return { orders, firstDay: first, lastDay: first + 19, has };
}

function parse(csv: string): string[][] {
  return Papa.parse<string[]>(csv.replace(/^\uFEFF/, ""), { skipEmptyLines: true }).data;
}

describe("buildSummaryCsv", () => {
  const model = buildModel(input(["Tea", "Cake"]), DEFAULT_FILTERS, createFormatter("KES"));
  const csv = buildSummaryCsv(model, { fileName: "sales.csv", filters: DEFAULT_FILTERS, currency: "KES" });
  const rows = parse(csv);

  it("starts with a BOM and the header row, and uses CRLF line endings", () => {
    expect(csv.startsWith("\uFEFFSection,Item,Value,Share %,Note\r\n")).toBe(true);
  });

  it("contains the period, KPIs and every chart's data", () => {
    const find = (section: string, item: string) => rows.find((r) => r[0] === section && r[1] === item);
    expect(find("Report", "File")?.[2]).toBe("sales.csv");
    expect(find("Report", "Period")?.[2]).toBe("2025-01-01 to 2025-01-20");
    expect(find("Report", "Currency")?.[2]).toBe("KES");
    expect(find("Summary", "Revenue")?.[2]).toBe(String(model.kpis.revenue.value));
    expect(find("Summary", "Orders")?.[2]).toBe("20");
    expect(rows.filter((r) => r[0] === "Revenue by day").length).toBe(model.series.points.length);
    expect(rows.some((r) => r[0] === "Revenue by day" && r[4].startsWith("Forecast"))).toBe(true);
    expect(
      rows
        .filter((r) => r[0] === "Top products")
        .map((r) => r[1])
        .sort(),
    ).toEqual(["Cake", "Tea"]);
    expect(rows.filter((r) => r[0] === "By region")).toHaveLength(2);
    expect(rows.filter((r) => r[0] === "Average revenue by weekday")).toHaveLength(7);
  });

  it("reports shares as percentages", () => {
    const shares = rows.filter((r) => r[0] === "Top products").map((r) => Number(r[3]));
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 0);
  });

  it("records the active filter", () => {
    const filtered = buildSummaryCsv(model, {
      fileName: "x.csv",
      filters: { preset: "30d", dimension: "region", value: "East" },
    });
    expect(parse(filtered).find((r) => r[1] === "Filter")?.[2]).toBe("Region = East");
  });

  it("neutralises spreadsheet formulas in product names but leaves numbers alone", () => {
    const evil = buildModel(
      input(['=HYPERLINK("http://evil","x")', "+cmd|' /C calc'!A0", "@SUM(1)"]),
      DEFAULT_FILTERS,
      createFormatter(),
    );
    const out = buildSummaryCsv(evil, { fileName: "=bad.csv", filters: DEFAULT_FILTERS });
    const parsed = parse(out);
    for (const r of parsed.filter((row) => row[0] === "Top products")) expect(r[1]).toMatch(/^'[=+@]/);
    expect(parsed.find((r) => r[1] === "File")?.[2]).toBe("'=bad.csv");
    const negative = buildModel(
      {
        orders: [{ day: first, amount: -50, product: "Refund", region: "East" }, ...input(["Tea"]).orders],
        firstDay: first,
        lastDay: first + 19,
        has,
      },
      DEFAULT_FILTERS,
      createFormatter(),
    );
    const neg = parse(buildSummaryCsv(negative, { fileName: "r.csv", filters: DEFAULT_FILTERS })).find(
      (r) => r[0] === "Top products" && r[1] === "Refund",
    );
    expect(neg?.[2]).toBe("-50");
  });

  it("formats days as ISO dates", () => {
    expect(isoDay(first)).toBe("2025-01-01");
    expect(isoDay(0)).toBe("1970-01-01");
  });
});
