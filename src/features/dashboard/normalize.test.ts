import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { describeSkipped, normalizeOrders, normalizeOrdersAsync } from "./normalize";
import { parseCsvText } from "./parse";
import { detectColumns } from "./detect";
import type { Mapping, RawTable } from "./types";
import { dayFromYmd } from "./values";

const day = (y: number, m: number, d: number) => dayFromYmd(y, m, d) as number;
const table = (headers: string[], rows: string[][]): RawTable => ({ headers, rows });

describe("normalizeOrders on the e2e fixture", () => {
  const csv = parseCsvText(readFileSync(join(__dirname, "../../../e2e/fixtures/sales-small.csv"), "utf8"));
  const { mapping } = detectColumns(csv);

  it("keeps 19 orders worth KES 109,600 and counts the unreadable row", () => {
    const n = normalizeOrders(csv, mapping);
    expect(n.orders).toHaveLength(19);
    expect(n.orders.reduce((s, o) => s + o.amount, 0)).toBe(109_600);
    expect(n.skipped).toEqual({ total: 1, unreadableDate: 0, unreadableAmount: 1, examples: [20] });
    expect(n.currency).toBe("KES");
    expect(n.dateOrder).toBe("dmy");
    expect(n.firstDay).toBe(day(2025, 3, 3));
    expect(n.lastDay).toBe(day(2025, 3, 29));
    expect(n.totalRows).toBe(20);
    expect(describeSkipped(n.skipped)).toBe("1 row skipped: unreadable amount");
  });

  it("changes the numbers when the amount column is remapped", () => {
    const unitPriceCol = csv.headers.indexOf("Unit Price");
    const n = normalizeOrders(csv, { ...mapping, amount: unitPriceCol });
    expect(n.skipped.total).toBe(0);
    expect(n.orders.reduce((s, o) => s + o.amount, 0)).toBe(103_400);
    expect(describeSkipped(n.skipped)).toBe("");
  });
});

describe("normalizeOrders edge cases", () => {
  const mapping: Mapping = { date: 0, amount: 1 };

  it("skips and classifies unreadable dates and amounts", () => {
    const rows = [
      ["2025-01-01", "100"],
      ["not a date", "50"],
      ["2025-01-02", "abc"],
      ["", ""],
      ["2025-01-03", "(40)"],
    ];
    const n = normalizeOrders(table(["Date", "Amount"], rows), mapping);
    expect(n.orders.map((o) => o.amount)).toEqual([100, -40]);
    expect(n.skipped).toMatchObject({ total: 3, unreadableDate: 2, unreadableAmount: 1, examples: [2, 3, 4] });
    expect(describeSkipped(n.skipped)).toBe("3 rows skipped: 2 unreadable date, 1 unreadable amount");
  });

  it("formats big skip counts with thousands separators", () => {
    expect(describeSkipped({ total: 312, unreadableDate: 312, unreadableAmount: 0, examples: [] })).toBe(
      "312 rows skipped: unreadable date",
    );
    expect(describeSkipped({ total: 1200, unreadableDate: 1200, unreadableAmount: 0, examples: [] })).toBe(
      "1,200 rows skipped: unreadable date",
    );
  });

  it("limits the example row numbers", () => {
    const rows = Array.from({ length: 20 }, () => ["bad", "1"]);
    expect(normalizeOrders(table(["Date", "Amount"], rows), mapping).skipped.examples).toHaveLength(5);
  });

  it("reads ambiguous dates day-first unless the column proves month-first", () => {
    const ambiguous = table(
      ["Date", "Amount"],
      [
        ["03/04/2025", "1"],
        ["05/06/2025", "1"],
      ],
    );
    expect(normalizeOrders(ambiguous, mapping).orders[0].day).toBe(day(2025, 4, 3));

    const monthFirst = table(
      ["Date", "Amount"],
      [
        ["03/04/2025", "1"],
        ["04/13/2025", "1"],
      ],
    );
    const n = normalizeOrders(monthFirst, mapping);
    expect(n.dateOrder).toBe("mdy");
    expect(n.orders.map((o) => o.day)).toEqual([day(2025, 3, 4), day(2025, 4, 13)]);
  });

  it("reads Excel serial dates and ISO timestamps", () => {
    const n = normalizeOrders(
      table(
        ["Date", "Amount"],
        [
          ["45985", "5"],
          ["2025-11-24T10:00:00Z", "6"],
        ],
      ),
      mapping,
    );
    expect(n.orders.map((o) => o.day)).toEqual([day(2025, 11, 24), day(2025, 11, 24)]);
  });

  it("carries optional columns, treating blanks as missing", () => {
    const n = normalizeOrders(
      table(
        ["Date", "Amount", "Qty", "Item", "Order"],
        [
          ["2025-01-01", "10", "2", "Tea", "A1"],
          ["2025-01-02", "20", "x", "", ""],
        ],
      ),
      { date: 0, amount: 1, quantity: 2, product: 3, orderId: 4 },
    );
    expect(n.orders[0]).toEqual({ day: day(2025, 1, 1), amount: 10, quantity: 2, product: "Tea", orderId: "A1" });
    expect(n.orders[1].quantity).toBeUndefined();
    expect(n.orders[1].product).toBeUndefined();
    expect(n.orders[1].orderId).toBeUndefined();
  });

  it("reports no data range when every row is skipped, and when date is unmapped", () => {
    const rows = [
      ["nope", "1"],
      ["nah", "2"],
    ];
    const none = normalizeOrders(table(["Date", "Amount"], rows), mapping);
    expect(none.orders).toEqual([]);
    expect(none.firstDay).toBeUndefined();
    const unmapped = normalizeOrders(table(["Date", "Amount"], [["2025-01-01", "5"]]), { amount: 1 });
    expect(unmapped.skipped.unreadableDate).toBe(1);
  });

  it("picks the most common currency, falling back to the header", () => {
    const withCells = normalizeOrders(
      table(
        ["Date", "Amount"],
        [
          ["2025-01-01", "KES 5"],
          ["2025-01-02", "KES 6"],
          ["2025-01-03", "$7"],
        ],
      ),
      mapping,
    );
    expect(withCells.currency).toBe("KES");
    const header = normalizeOrders(table(["Date", "Amount (EUR)"], [["2025-01-01", "5"]]), mapping);
    expect(header.currency).toBe("EUR");
    const none = normalizeOrders(table(["Date", "Amount"], [["2025-01-01", "5"]]), mapping);
    expect(none.currency).toBeUndefined();
  });

  it("handles huge amounts and unicode labels", () => {
    const n = normalizeOrders(
      table(["Date", "Amount", "Product"], [["2025-01-01", "KES 9,000,000,000", "Café ☕ 😀"]]),
      { date: 0, amount: 1, product: 2 },
    );
    expect(n.orders[0]).toMatchObject({ amount: 9_000_000_000, product: "Café ☕ 😀" });
  });
});

describe("normalizeOrdersAsync", () => {
  const rows = Array.from({ length: 45_000 }, (_, i) => [
    `2025-01-${String((i % 28) + 1).padStart(2, "0")}`,
    String(i % 100),
  ]);
  const big = table(["Date", "Amount"], rows);

  it("matches the synchronous result and reports progress in chunks", async () => {
    const progress: number[] = [];
    const result = await normalizeOrdersAsync(
      big,
      { date: 0, amount: 1 },
      { onProgress: (done) => progress.push(done) },
    );
    expect(result).toEqual(normalizeOrders(big, { date: 0, amount: 1 }));
    expect(progress).toEqual([20_000, 40_000, 45_000]);
  });

  it("stops and returns null when cancelled", async () => {
    let calls = 0;
    const result = await normalizeOrdersAsync(big, { date: 0, amount: 1 }, { isCancelled: () => ++calls > 1 });
    expect(result).toBeNull();
  });
});
