import { describe, expect, it } from "vitest";
import { createFormatter } from "./format";
import { dayFromYmd } from "./values";

const day = (y: number, m: number, d: number) => dayFromYmd(y, m, d) as number;

describe("createFormatter", () => {
  const kes = createFormatter("KES");
  const plain = createFormatter();

  it("formats money with thousands separators and the detected currency", () => {
    expect(kes.money(1234567)).toBe("KES 1,234,567");
    expect(kes.money(0)).toBe("KES 0");
    expect(kes.money(-1200)).toBe("-KES 1,200");
    expect(plain.money(1234.5)).toBe("1,235");
    expect(createFormatter("USD").money(99.5)).toBe("$99.5");
    expect(createFormatter("EUR").money(1200)).toBe("€1,200");
    expect(createFormatter("GBP").money(5)).toBe("£5");
  });

  it("shows decimals only for small values", () => {
    expect(kes.number(12.3456)).toBe("12.35");
    expect(kes.number(123.45)).toBe("123.5");
    expect(kes.number(1234.56)).toBe("1,235");
  });

  it("switches to a compact form only when the full text would not fit a KPI card", () => {
    expect(kes.moneyCompact(109600)).toBe("KES 109,600");
    expect(kes.moneyCompact(14203450)).toBe("KES 14.2M");
    expect(kes.moneyCompact(-14203450)).toBe("-KES 14.2M");
    expect(plain.moneyCompact(14203450)).toBe("14,203,450"); // no currency prefix, so it still fits
    expect(plain.moneyCompact(1500000000)).toBe("1.5B");
  });

  it("formats axis ticks and percentages", () => {
    expect(kes.compact(1200000)).toBe("1.2M");
    expect(kes.compact(340000)).toBe("340K");
    expect(kes.percent(0.184)).toBe("18%");
    expect(kes.percent(0.042)).toBe("4.2%");
    expect(kes.percent(-0.5)).toBe("-50%");
  });

  it("never prints NaN or Infinity", () => {
    expect(kes.money(Number.NaN)).toBe("–");
    expect(kes.compact(Infinity)).toBe("–");
    expect(kes.percent(Number.NaN)).toBe("–");
    expect(kes.moneyCompact(Infinity)).toBe("–");
  });

  it("formats dates and periods as UTC calendar days", () => {
    const d = day(2025, 11, 24);
    expect(kes.date(d)).toBe("24 Nov");
    expect(kes.dateWithYear(d)).toBe("24 Nov 2025");
    expect(kes.period(d, "day")).toBe("24 Nov");
    expect(kes.period(day(2025, 11, 1), "month")).toBe("Nov 2025");
    expect(kes.periodLong(d, "week")).toBe("Week of 24 Nov 2025");
    expect(kes.periodLong(day(2025, 11, 1), "month")).toBe("Nov 2025");
    expect(kes.periodLong(d, "day")).toBe("24 Nov 2025");
  });
});
