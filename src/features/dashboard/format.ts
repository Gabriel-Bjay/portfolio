// Number and date formatting. Kenyan English locale, UTC calendar days.
import type { Currency, Granularity } from "./types";
import { ymdFromDay } from "./values";

const LOCALE = "en-KE";
const MS_PER_DAY = 86_400_000;

const wholeNumber = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });
const twoDecimals = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 });
const compactNumber = new Intl.NumberFormat(LOCALE, { notation: "compact", maximumFractionDigits: 1 });

const dayMonth = new Intl.DateTimeFormat(LOCALE, { timeZone: "UTC", day: "numeric", month: "short" });
const dayMonthYear = new Intl.DateTimeFormat(LOCALE, {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const monthYear = new Intl.DateTimeFormat(LOCALE, { timeZone: "UTC", month: "short", year: "numeric" });

/** Longest money string that still fits a two-column KPI card at 390px. */
const KPI_MAX_CHARS = 11;

const PREFIX: Record<Currency, string> = { KES: "KES ", USD: "$", EUR: "€", GBP: "£" };

function toDate(day: number): Date {
  return new Date(day * MS_PER_DAY);
}

export interface Formatter {
  /** 1,234 (or 1,234.5 for small values). */
  number(value: number): string;
  /** "KES 1,234" with the detected currency, or a plain number when none was detected. */
  money(value: number): string;
  /** Like money(), but switches to "KES 1.2M" when the full text would be wider than a KPI card. */
  moneyCompact(value: number): string;
  /** Axis tick: 1.2M, 340K. */
  compact(value: number): string;
  /** 0.184 → "18%", 0.042 → "4.2%". */
  percent(fraction: number): string;
  date(day: number): string;
  dateWithYear(day: number): string;
  /** Short label for the start of a period at the given granularity. */
  period(start: number, g: Granularity): string;
  /** Longer label for tooltips and tables ("Week of 24 Nov 2025"). */
  periodLong(start: number, g: Granularity): string;
}

export function createFormatter(currency?: Currency): Formatter {
  const prefix = currency ? PREFIX[currency] : "";
  const number = (value: number) => {
    if (!Number.isFinite(value)) return "–";
    const abs = Math.abs(value);
    if (abs >= 1000 || Number.isInteger(value)) return wholeNumber.format(value);
    return (abs >= 100 ? oneDecimal : twoDecimals).format(value);
  };
  const money = (value: number) => {
    if (!Number.isFinite(value)) return "–";
    const text = number(value);
    return text.startsWith("-") ? `-${prefix}${text.slice(1)}` : `${prefix}${text}`;
  };
  return {
    number,
    money,
    moneyCompact(value) {
      if (!Number.isFinite(value)) return "–";
      const full = money(value);
      if (full.length <= KPI_MAX_CHARS) return full;
      const text = compactNumber.format(value);
      return text.startsWith("-") ? `-${prefix}${text.slice(1)}` : `${prefix}${text}`;
    },
    compact: (value) => (Number.isFinite(value) ? compactNumber.format(value) : "–"),
    percent(fraction) {
      if (!Number.isFinite(fraction)) return "–";
      const pct = fraction * 100;
      return `${Math.abs(pct) >= 10 ? wholeNumber.format(pct) : oneDecimal.format(pct)}%`;
    },
    date: (day) => dayMonth.format(toDate(day)),
    dateWithYear: (day) => dayMonthYear.format(toDate(day)),
    period(start, g) {
      if (g === "month") {
        const { year, month } = ymdFromDay(start);
        return monthYear.format(new Date(Date.UTC(year, month - 1, 1)));
      }
      return dayMonth.format(toDate(start));
    },
    periodLong(start, g) {
      if (g === "day") return dayMonthYear.format(toDate(start));
      if (g === "week") return `Week of ${dayMonthYear.format(toDate(start))}`;
      return monthYear.format(toDate(start));
    },
  };
}
