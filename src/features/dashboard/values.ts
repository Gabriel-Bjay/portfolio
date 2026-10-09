// Cell-level parsing: money and dates as people actually write them in spreadsheets.
import type { Currency } from "./types";

const MS_PER_DAY = 86_400_000;

/** Day number (days since 1970-01-01 UTC) for a calendar date, or null if the date does not exist. */
export function dayFromYmd(year: number, month: number, day: number): number | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  // Date.UTC rolls 31 Feb over to March; reject anything that moved.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return Math.floor(date.getTime() / MS_PER_DAY);
}

export function ymdFromDay(day: number): { year: number; month: number; date: number } {
  const d = new Date(day * MS_PER_DAY);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, date: d.getUTCDate() };
}

/** Monday = 0 … Sunday = 6. 1970-01-01 was a Thursday. */
export function weekdayIndex(day: number): number {
  return (((day + 3) % 7) + 7) % 7;
}

// ───────────────────────────── amounts ─────────────────────────────

const CURRENCY_TOKENS: ReadonlyArray<readonly [RegExp, Currency]> = [
  // Letter lookarounds instead of \b so "Ksh1,200" (no space) still matches.
  [/(?<![a-z])(?:kes|kshs?)(?![a-z])\.?/gi, "KES"],
  [/(?<![a-z])usd(?![a-z])/gi, "USD"],
  [/(?<![a-z])eur(?![a-z])/gi, "EUR"],
  [/(?<![a-z])gbp(?![a-z])/gi, "GBP"],
  [/\$/g, "USD"],
  [/€/g, "EUR"],
  [/£/g, "GBP"],
];

/** Finds a currency mentioned in free text (a header such as "Amount (KES)" or a cell such as "Ksh 1,200"). */
export function detectCurrency(text: string): Currency | undefined {
  // search() ignores the global flag's lastIndex, so the shared patterns stay stateless.
  for (const [pattern, currency] of CURRENCY_TOKENS) {
    if (text.search(pattern) !== -1) return currency;
  }
  return undefined;
}

export interface ParsedAmount {
  value: number;
  currency?: Currency;
}

/**
 * Parses "KES 1,200", "(1,200.50)", "-1200", "$ 3 400", "1.200,50" (European) and similar.
 * Returns null when the cell is not a clear number, so callers can count it as unreadable.
 */
export function parseAmount(raw: string): ParsedAmount | null {
  let text = raw.trim();
  if (text === "") return null;

  const currency = detectCurrency(text);
  for (const [pattern] of CURRENCY_TOKENS) text = text.replace(pattern, "");

  // Accounting negatives: (1,200). A trailing minus ("1200-") is also common in exports.
  let negative = false;
  text = text.replace(/[\s  '’]/g, "").replace(/−/g, "-");
  const parens = /^\((.*)\)$/.exec(text);
  if (parens) {
    negative = true;
    text = parens[1];
  }
  if (text.startsWith("-")) {
    negative = !negative;
    text = text.slice(1);
  } else if (text.startsWith("+")) {
    text = text.slice(1);
  } else if (text.endsWith("-")) {
    negative = !negative;
    text = text.slice(0, -1);
  }

  if (!/^[\d.,]+$/.test(text) || !/\d/.test(text)) return null;

  const normalised = normaliseSeparators(text);
  if (normalised === null) return null;
  const value = Number(normalised);
  if (!Number.isFinite(value)) return null;
  return { value: negative ? -value : value, ...(currency ? { currency } : {}) };
}

/** Works out which of "." and "," is the decimal mark and returns a plain "1234.5" string. */
function normaliseSeparators(text: string): string | null {
  const lastDot = text.lastIndexOf(".");
  const lastComma = text.lastIndexOf(",");

  if (lastDot !== -1 && lastComma !== -1) {
    // Both present: whichever comes last is the decimal mark.
    const decimalMark = lastDot > lastComma ? "." : ",";
    const thousandsMark = decimalMark === "." ? "," : ".";
    if (text.split(decimalMark).length > 2) return null;
    return text.split(thousandsMark).join("").replace(decimalMark, ".");
  }

  if (lastComma !== -1) {
    const parts = text.split(",");
    const groups = parts.slice(1);
    // "1,200" or "12,345,678": comma groups of exactly three digits are thousands separators.
    if (parts[0].length >= 1 && parts[0].length <= 3 && groups.every((g) => g.length === 3)) {
      return parts.join("");
    }
    // "12,5": a single comma with a short tail is a decimal comma.
    if (parts.length === 2 && parts[0] !== "" && groups[0].length >= 1 && groups[0].length <= 2) {
      return `${parts[0]}.${groups[0]}`;
    }
    return null;
  }

  if (lastDot !== -1) {
    const parts = text.split(".");
    if (parts.length === 2) return parts[0] === "" && parts[1] === "" ? null : text;
    // "1.200.000": repeated dot groups of three are thousands separators.
    const groups = parts.slice(1);
    if (parts[0].length >= 1 && parts[0].length <= 3 && groups.every((g) => g.length === 3)) {
      return parts.join("");
    }
    return null;
  }

  return text;
}

// ───────────────────────────── dates ─────────────────────────────

export type DateOrder = "dmy" | "mdy";

// First three letters of English and Swahili month names (Mac = Machi, Mei, Ago, Okt, Des).
const MONTH_PREFIXES: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  mac: 3,
  apr: 4,
  may: 5,
  mei: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  ago: 8,
  sep: 9,
  oct: 10,
  okt: 10,
  nov: 11,
  dec: 12,
  des: 12,
};

function monthFromName(name: string): number | null {
  return MONTH_PREFIXES[name.slice(0, 3).toLowerCase()] ?? null;
}

function fullYear(text: string): number {
  const n = Number(text);
  if (text.length === 4) return n;
  return n < 70 ? 2000 + n : 1900 + n;
}

const TIME_SUFFIX = String.raw`(?:[T\s]+\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:\s?[AaPp][Mm])?\s?(?:Z|[+-]\d{2}:?\d{2})?)?`;
const ISO_RE = new RegExp(String.raw`^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})${TIME_SUFFIX}$`);
const NUMERIC_RE = new RegExp(String.raw`^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})${TIME_SUFFIX}$`);
const DAY_MONTH_NAME_RE = new RegExp(
  String.raw`^(\d{1,2})(?:st|nd|rd|th)?[\s\-/.]+([A-Za-z]{3,9})\.?[\s\-/.,]+(\d{4}|\d{2})${TIME_SUFFIX}$`,
);
const MONTH_NAME_DAY_RE = new RegExp(
  String.raw`^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})${TIME_SUFFIX}$`,
);
const COMPACT_RE = /^(\d{4})(\d{2})(\d{2})$/;
const SERIAL_RE = /^\d{4,6}(?:\.\d+)?$/;

/** Excel's day 1 is 1900-01-01 and it wrongly treats 1900 as a leap year, so serial 25569 = 1970-01-01. */
const EXCEL_EPOCH_OFFSET = 25569;
/** 1950-01-01 … 2099-12-31 as Excel serials; anything outside is far more likely to be a plain number. */
const PLAUSIBLE_SERIAL_MIN = 18264;
const PLAUSIBLE_SERIAL_MAX = 73415;

export function isPlausibleExcelSerial(raw: string): boolean {
  if (!SERIAL_RE.test(raw)) return false;
  const n = Math.floor(Number(raw));
  return n >= PLAUSIBLE_SERIAL_MIN && n <= PLAUSIBLE_SERIAL_MAX;
}

/**
 * Parses one date cell to a UTC day number. `order` only matters for ambiguous
 * numeric dates like 03/04/2025 (default day-first, the Kenyan convention).
 */
export function parseDate(raw: string, order: DateOrder = "dmy"): number | null {
  const text = raw.trim();
  if (text === "") return null;

  let m = ISO_RE.exec(text);
  if (m) return dayFromYmd(Number(m[1]), Number(m[2]), Number(m[3]));

  m = NUMERIC_RE.exec(text);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const year = fullYear(m[3]);
    return order === "dmy" ? dayFromYmd(year, b, a) : dayFromYmd(year, a, b);
  }

  m = DAY_MONTH_NAME_RE.exec(text);
  if (m) {
    const month = monthFromName(m[2]);
    return month === null ? null : dayFromYmd(fullYear(m[3]), month, Number(m[1]));
  }

  m = MONTH_NAME_DAY_RE.exec(text);
  if (m) {
    const month = monthFromName(m[1]);
    return month === null ? null : dayFromYmd(Number(m[3]), month, Number(m[2]));
  }

  m = COMPACT_RE.exec(text);
  if (m) {
    const year = Number(m[1]);
    if (year >= 1900 && year <= 2100) return dayFromYmd(year, Number(m[2]), Number(m[3]));
  }

  if (isPlausibleExcelSerial(text)) return Math.floor(Number(text)) - EXCEL_EPOCH_OFFSET;
  return null;
}

/** True when the cell is a bare Excel serial number rather than a written date. */
export function looksLikeSerial(raw: string): boolean {
  return isPlausibleExcelSerial(raw.trim());
}

/**
 * Decides whether ambiguous numeric dates are day-first or month-first by looking for
 * a value that can only be one of them (first part > 12 ⇒ day-first). Defaults to day-first.
 */
export function detectDateOrder(values: readonly string[]): DateOrder {
  let dayFirstEvidence = false;
  let monthFirstEvidence = false;
  for (const raw of values) {
    const m = NUMERIC_RE.exec(raw.trim());
    if (!m) continue;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a > 12 && b <= 12) dayFirstEvidence = true;
    if (b > 12 && a <= 12) monthFirstEvidence = true;
    if (dayFirstEvidence && monthFirstEvidence) break;
  }
  return monthFirstEvidence && !dayFirstEvidence ? "mdy" : "dmy";
}
