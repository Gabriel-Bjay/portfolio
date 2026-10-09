import { describe, expect, it } from "vitest";
import {
  dayFromYmd,
  detectCurrency,
  detectDateOrder,
  parseAmount,
  parseDate,
  weekdayIndex,
  ymdFromDay,
} from "./values";

const day = (y: number, m: number, d: number) => dayFromYmd(y, m, d);

describe("dayFromYmd / ymdFromDay / weekdayIndex", () => {
  it("round-trips and rejects impossible dates", () => {
    expect(dayFromYmd(1970, 1, 1)).toBe(0);
    expect(ymdFromDay(day(2025, 11, 28) as number)).toEqual({ year: 2025, month: 11, date: 28 });
    expect(dayFromYmd(2025, 2, 30)).toBeNull();
    expect(dayFromYmd(2025, 13, 1)).toBeNull();
    expect(dayFromYmd(2024, 2, 29)).not.toBeNull();
    expect(dayFromYmd(2023, 2, 29)).toBeNull();
  });

  it("numbers weekdays Monday = 0", () => {
    expect(weekdayIndex(day(2025, 11, 28) as number)).toBe(4); // a Friday
    expect(weekdayIndex(day(2026, 9, 20) as number)).toBe(6); // a Sunday
    expect(weekdayIndex(-1)).toBe(2); // 1969-12-31 was a Wednesday
  });
});

describe("parseAmount", () => {
  it.each([
    ["1200", 1200],
    ["1,200", 1200],
    ["KES 1,200", 1200],
    ["Ksh1,200.50", 1200.5],
    ["KSh. 3 400", 3400],
    ["$ 12.5", 12.5],
    ["€1,234,567.89", 1234567.89],
    ["£99", 99],
    ["-1200", -1200],
    ["(1,200)", -1200],
    ["(KES 1,200.00)", -1200],
    ["KES -1,200", -1200],
    ["1200-", -1200],
    ["−1200", -1200],
    ["1.200,50", 1200.5],
    ["1.234.567", 1234567],
    ["12,5", 12.5],
    ["0.5", 0.5],
    ["  42  ", 42],
    ["1 200", 1200],
  ])("reads %s as %d", (raw, expected) => {
    expect(parseAmount(raw)?.value).toBeCloseTo(expected, 6);
  });

  it.each(["", "   ", "abc", "N/A", "-", "12%", "1,2,3", "1..2", "12.34.5", "KES", "1e5", "0x10"])(
    "rejects %j",
    (raw) => {
      expect(parseAmount(raw)).toBeNull();
    },
  );

  it("reports the currency it saw", () => {
    expect(parseAmount("KES 1,200")?.currency).toBe("KES");
    expect(parseAmount("Ksh 5")?.currency).toBe("KES");
    expect(parseAmount("KSh. 5")?.currency).toBe("KES");
    expect(parseAmount("$5")?.currency).toBe("USD");
    expect(parseAmount("€5")?.currency).toBe("EUR");
    expect(parseAmount("£5")?.currency).toBe("GBP");
    expect(parseAmount("5")?.currency).toBeUndefined();
  });

  it("copes with very large values without overflowing", () => {
    expect(parseAmount("999,999,999,999,999")?.value).toBe(999_999_999_999_999);
    expect(parseAmount("9".repeat(400))).toBeNull(); // Infinity is not a number we can show
  });

  it("does not mistake text with digits for money", () => {
    expect(parseAmount("Order 12")).toBeNull();
    expect(parseAmount("2025-01-05")).toBeNull();
    expect(parseAmount("05/01/2025")).toBeNull();
  });
});

describe("detectCurrency", () => {
  it("finds currencies in headers", () => {
    expect(detectCurrency("Amount (KES)")).toBe("KES");
    expect(detectCurrency("Total USD")).toBe("USD");
    expect(detectCurrency("Amount")).toBeUndefined();
  });

  it("is stateless across repeated calls", () => {
    for (let i = 0; i < 4; i++) expect(detectCurrency("Amount (KES)")).toBe("KES");
  });
});

describe("parseDate", () => {
  const nov24 = day(2025, 11, 24);

  it("reads ISO dates with optional time and zone", () => {
    expect(parseDate("2025-11-24")).toBe(nov24);
    expect(parseDate("2025-11-24 18:30:00")).toBe(nov24);
    expect(parseDate("2025-11-24T23:59:59Z")).toBe(nov24);
    expect(parseDate("2025-11-24T23:59:59+03:00")).toBe(nov24);
    expect(parseDate("2025/11/24")).toBe(nov24);
  });

  it("is day-first by default and month-first on request", () => {
    expect(parseDate("03/04/2025")).toBe(day(2025, 4, 3));
    expect(parseDate("03/04/2025", "mdy")).toBe(day(2025, 3, 4));
    expect(parseDate("24/11/2025")).toBe(nov24);
    expect(parseDate("11/24/2025", "mdy")).toBe(nov24);
    expect(parseDate("24-11-2025")).toBe(nov24);
    expect(parseDate("24.11.2025")).toBe(nov24);
    expect(parseDate("24/11/25")).toBe(nov24);
    expect(parseDate("24/11/2025 14:05")).toBe(nov24);
  });

  it("rejects day/month values that cannot exist in the chosen order", () => {
    expect(parseDate("24/13/2025")).toBeNull();
    expect(parseDate("11/24/2025", "dmy")).toBeNull();
    expect(parseDate("31/02/2025")).toBeNull();
  });

  it("reads dates with month names, English and Swahili", () => {
    expect(parseDate("24-Nov-2025")).toBe(nov24);
    expect(parseDate("24 November 2025")).toBe(nov24);
    expect(parseDate("24 nov 25")).toBe(nov24);
    expect(parseDate("Nov 24, 2025")).toBe(nov24);
    expect(parseDate("24 Novemba 2025")).toBe(nov24);
    expect(parseDate("1 Machi 2025")).toBe(day(2025, 3, 1));
    expect(parseDate("5 Mei 2025")).toBe(day(2025, 5, 5));
    expect(parseDate("5 Des 2025")).toBe(day(2025, 12, 5));
    expect(parseDate("24 Foo 2025")).toBeNull();
  });

  it("reads Excel serial numbers and compact dates", () => {
    expect(parseDate("45985")).toBe(nov24); // 24 Nov 2025
    expect(parseDate("45985.75")).toBe(nov24);
    expect(parseDate("25569")).toBe(0);
    expect(parseDate("20251124")).toBe(nov24);
  });

  it("rejects things that are not dates", () => {
    for (const raw of ["", "  ", "hello", "12", "1200", "99999999", "2025-00-10", "KES 1,200"]) {
      expect(parseDate(raw)).toBeNull();
    }
  });
});

describe("detectDateOrder", () => {
  it("uses a value that can only be day-first", () => {
    expect(detectDateOrder(["03/04/2025", "13/04/2025"])).toBe("dmy");
  });

  it("uses a value that can only be month-first", () => {
    expect(detectDateOrder(["03/04/2025", "04/13/2025"])).toBe("mdy");
  });

  it("defaults to day-first when ambiguous or contradictory", () => {
    expect(detectDateOrder(["03/04/2025", "05/06/2025"])).toBe("dmy");
    expect(detectDateOrder(["13/04/2025", "04/13/2025"])).toBe("dmy");
    expect(detectDateOrder([])).toBe("dmy");
    expect(detectDateOrder(["2025-04-03"])).toBe("dmy");
  });
});
