import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { columnLabels, detectColumns, headerScore } from "./detect";
import { parseCsvText } from "./parse";
import { sampleTable } from "./sample";
import type { RawTable } from "./types";

const table = (headers: string[], rows: string[][]): RawTable => ({ headers, rows });

describe("headerScore", () => {
  it("ranks exact, word and weak matches", () => {
    expect(headerScore("amount", "Total")).toBe(1);
    expect(headerScore("amount", "Amount (KES)")).toBe(0.85);
    expect(headerScore("amount", "Unit Price")).toBe(0.5);
    expect(headerScore("amount", "Product")).toBe(0);
    expect(headerScore("date", "Tarehe")).toBe(1);
    expect(headerScore("product", "Bidhaa")).toBe(1);
    expect(headerScore("amount", "kiasi")).toBe(1);
    expect(headerScore("amount", "")).toBe(0);
  });

  it("understands camelCase and joined words", () => {
    expect(headerScore("orderId", "orderId")).toBe(1);
    expect(headerScore("amount", "TotalSales")).toBe(0.85);
    expect(headerScore("date", "OrderDate")).toBe(1);
  });
});

describe("detectColumns on realistic files", () => {
  it("maps the bundled sample data fully", () => {
    const d = detectColumns(sampleTable());
    expect(d.mapping).toEqual({
      date: 0,
      orderId: 1,
      product: 2,
      category: 3,
      region: 4,
      channel: 5,
      customer: 6,
      quantity: 7,
      amount: 8,
    });
    expect(d.currency).toBe("KES");
  });

  it("maps the e2e fixture, preferring Amount over Unit Price", () => {
    const csv = readFileSync(join(__dirname, "../../../e2e/fixtures/sales-small.csv"), "utf8");
    const d = detectColumns(parseCsvText(csv));
    expect(d.mapping).toEqual({
      date: 0,
      orderId: 1,
      product: 2,
      category: 3,
      region: 4,
      channel: 5,
      quantity: 6,
      amount: 8,
    });
    expect(d.currency).toBe("KES");
  });

  it("reads Swahili headers", () => {
    const d = detectColumns(
      table(
        ["Tarehe", "Bidhaa", "Idadi", "Kiasi"],
        [
          ["01/02/2025", "Mkate", "2", "100"],
          ["02/02/2025", "Maziwa", "1", "60"],
          ["03/02/2025", "Mkate", "3", "150"],
        ],
      ),
    );
    expect(d.mapping).toEqual({ date: 0, product: 1, quantity: 2, amount: 3 });
  });

  it("reads typical POS and Shopify style headers", () => {
    const d = detectColumns(
      table(
        ["Order Date", "Item", "Qty", "Total Sales", "Store", "Payment Method", "Customer Name"],
        Array.from({ length: 30 }, (_, i) => [
          `2025-03-${String((i % 28) + 1).padStart(2, "0")}`,
          ["Tea", "Coffee", "Cake"][i % 3],
          String((i % 4) + 1),
          String(100 + i * 10),
          ["Westlands", "CBD"][i % 2],
          ["Cash", "M-Pesa"][i % 2],
          `Customer ${i % 7}`,
        ]),
      ),
    );
    expect(d.mapping).toMatchObject({
      date: 0,
      product: 1,
      quantity: 2,
      amount: 3,
      region: 4,
      channel: 5,
      customer: 6,
    });
  });

  it("finds date and amount from values alone when headers are unhelpful", () => {
    const d = detectColumns(
      table(
        ["A", "B", "C"],
        Array.from({ length: 12 }, (_, i) => [
          `2025-01-${String(i + 1).padStart(2, "0")}`,
          `Row ${i}`,
          String(250 + i),
        ]),
      ),
    );
    expect(d.mapping).toEqual({ date: 0, amount: 2 });
  });

  it("does not treat large whole-number amounts as Excel date serials", () => {
    const d = detectColumns(
      table(
        ["Date", "Revenue"],
        Array.from({ length: 10 }, (_, i) => [`2025-02-${String(i + 1).padStart(2, "0")}`, String(30000 + i * 1000)]),
      ),
    );
    expect(d.mapping).toEqual({ date: 0, amount: 1 });
  });

  it("accepts Excel serial dates when the header says date", () => {
    const d = detectColumns(
      table(
        ["Date", "Amount"],
        Array.from({ length: 10 }, (_, i) => [String(45900 + i), String(100 + i)]),
      ),
    );
    expect(d.mapping).toEqual({ date: 0, amount: 1 });
  });

  it("leaves date unmapped when no column holds dates", () => {
    const d = detectColumns(
      table(
        ["Product", "Amount"],
        [
          ["Tea", "10"],
          ["Cake", "20"],
          ["Tea", "30"],
        ],
      ),
    );
    expect(d.mapping.date).toBeUndefined();
    expect(d.mapping.amount).toBe(1);
  });

  it("never assigns one column to two roles", () => {
    const d = detectColumns(
      table(
        ["Date", "Amount", "Product"],
        Array.from({ length: 10 }, (_, i) => [
          `2025-01-${String(i + 1).padStart(2, "0")}`,
          String(100 + i),
          ["Tea", "Cake"][i % 2],
        ]),
      ),
    );
    const cols = Object.values(d.mapping);
    expect(new Set(cols).size).toBe(cols.length);
  });

  it("does not map a high-cardinality column as a category", () => {
    const rows = Array.from({ length: 40 }, (_, i) => [
      `2025-01-${String((i % 28) + 1).padStart(2, "0")}`,
      "100",
      `Unique label ${i}`,
    ]);
    const d = detectColumns(table(["Date", "Amount", "Category"], rows));
    expect(d.mapping.category).toBeUndefined();
  });

  it("copes with an empty table and blank columns", () => {
    expect(detectColumns(table([], [])).mapping).toEqual({});
    expect(
      detectColumns(
        table(
          ["Date", "Amount"],
          [
            ["", ""],
            ["", ""],
          ],
        ),
      ).mapping,
    ).toEqual({});
  });

  it("takes the currency from the header when cells are plain numbers", () => {
    const d = detectColumns(
      table(
        ["Date", "Amount (USD)"],
        [
          ["2025-01-01", "10"],
          ["2025-01-02", "12"],
          ["2025-01-03", "9"],
        ],
      ),
    );
    expect(d.currency).toBe("USD");
  });
});

describe("columnLabels", () => {
  it("names blank headers and disambiguates repeats", () => {
    expect(columnLabels(["Date", "", "Amount", "Amount"])).toEqual([
      "Date",
      "Column 2",
      "Amount (column 3)",
      "Amount (column 4)",
    ]);
  });
});
