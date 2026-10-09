import { describe, expect, it } from "vitest";
import { parseCsvText } from "./parse";
import {
  BLACK_FRIDAY_DAY,
  generateSampleRows,
  SAMPLE_FIRST_DAY,
  SAMPLE_HEADERS,
  SAMPLE_LABEL,
  SAMPLE_LAST_DAY,
  sampleCsv,
  sampleTable,
} from "./sample";
import { dayFromYmd, parseDate, weekdayIndex, ymdFromDay } from "./values";

const rows = generateSampleRows();

function revenueByDay(): Map<number, number> {
  const m = new Map<number, number>();
  for (const r of rows) {
    const d = parseDate(r[0]) as number;
    m.set(d, (m.get(d) ?? 0) + Number(r[8]));
  }
  return m;
}

describe("sample data generator", () => {
  it("is deterministic: same seed, identical output; different seed, different output", () => {
    expect(generateSampleRows(7)).toEqual(generateSampleRows(7));
    expect(generateSampleRows(7)).not.toEqual(generateSampleRows(8));
    expect(sampleCsv()).toBe(sampleCsv());
    expect(sampleTable().rows).toEqual(rows);
  });

  it("covers about 18 months of daily orders", () => {
    expect(rows.length).toBeGreaterThan(8000);
    expect(rows.length).toBeLessThan(12000);
    const days = new Set(rows.map((r) => r[0]));
    expect(days.size).toBe(SAMPLE_LAST_DAY - SAMPLE_FIRST_DAY + 1);
    expect(rows[0][0]).toBe("2025-04-01");
    expect(rows[rows.length - 1][0]).toBe("2026-09-20");
    expect(weekdayIndex(SAMPLE_LAST_DAY)).toBe(6);
  });

  it("matches the header layout and has well-formed cells", () => {
    expect(sampleTable().headers).toEqual([...SAMPLE_HEADERS]);
    const ids = new Set<string>();
    for (const r of rows) {
      expect(r).toHaveLength(SAMPLE_HEADERS.length);
      expect(Number(r[8])).toBeGreaterThan(0);
      expect(Number.isInteger(Number(r[8]))).toBe(true);
      expect(Number(r[7])).toBeGreaterThanOrEqual(1);
      ids.add(r[1]);
    }
    expect(ids.size).toBe(rows.length);
  });

  it("uses the regions and channels from the brief", () => {
    expect(new Set(rows.map((r) => r[4]))).toEqual(
      new Set(["Westlands", "CBD", "Kilimani", "Kasarani", "Thika Road", "Online delivery"]),
    );
    expect(new Set(rows.map((r) => r[5]))).toEqual(new Set(["In-store", "M-Pesa till", "WhatsApp order", "Website"]));
  });

  it("has a growth trend, weekend uplift, a December peak and a Black Friday spike", () => {
    const byDay = revenueByDay();
    const sum = (from: number, to: number) => {
      let s = 0;
      for (let d = from; d <= to; d++) s += byDay.get(d) ?? 0;
      return s;
    };
    const quarter = 91;
    expect(sum(SAMPLE_LAST_DAY - quarter + 1, SAMPLE_LAST_DAY)).toBeGreaterThan(
      sum(SAMPLE_FIRST_DAY, SAMPLE_FIRST_DAY + quarter - 1) * 1.2,
    );

    const avgFor = (weekday: number) => {
      let total = 0;
      let n = 0;
      for (const [d, v] of byDay)
        if (weekdayIndex(d) === weekday) {
          total += v;
          n++;
        }
      return total / n;
    };
    expect(avgFor(5)).toBeGreaterThan(avgFor(1) * 1.3); // Saturday vs Tuesday

    const december = sum(dayFromYmd(2025, 12, 1) as number, dayFromYmd(2025, 12, 24) as number) / 24;
    const november = sum(dayFromYmd(2025, 11, 1) as number, dayFromYmd(2025, 11, 27) as number) / 27;
    expect(december).toBeGreaterThan(november * 1.25);

    const typicalFriday = [-14, -7, 7, 14].map((o) => byDay.get(BLACK_FRIDAY_DAY + o) ?? 0);
    const mean = typicalFriday.reduce((a, b) => a + b, 0) / typicalFriday.length;
    expect(byDay.get(BLACK_FRIDAY_DAY)).toBeGreaterThan(mean * 2.2);
    expect(ymdFromDay(BLACK_FRIDAY_DAY)).toEqual({ year: 2025, month: 11, date: 28 });
    expect(weekdayIndex(BLACK_FRIDAY_DAY)).toBe(4);
  });

  it("labels the store as fictional", () => {
    expect(SAMPLE_LABEL).toMatch(/fictional/i);
  });

  it("round-trips through the CSV parser unchanged (download = same generator)", () => {
    const parsed = parseCsvText(sampleCsv());
    expect(parsed.headers).toEqual([...SAMPLE_HEADERS]);
    expect(parsed.rows).toEqual(rows);
  });
});
