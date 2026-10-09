// Guesses which spreadsheet column plays which role, from header names and cell values.
// The guess is only a starting point: the UI lets the user override every role.
import type { Currency, Mapping, RawTable, Role } from "./types";
import { ROLES } from "./types";
import { detectCurrency, looksLikeSerial, parseAmount, parseDate } from "./values";

/** Header words, English plus common Swahili. "strong" is a near-certain match, "weak" is a hint. */
const HINTS: Record<Role, { strong: string[]; weak: string[] }> = {
  date: {
    strong: ["date", "tarehe", "datetime", "timestamp", "orderdate", "saledate", "transactiondate", "siku"],
    weak: ["day", "time", "created", "createdat", "when", "period"],
  },
  amount: {
    strong: [
      "amount",
      "total",
      "totalamount",
      "revenue",
      "sales",
      "jumla",
      "kiasi",
      "mauzo",
      "linetotal",
      "grandtotal",
      "subtotal",
    ],
    weak: ["price", "bei", "value", "cost", "paid", "payment", "income", "gross", "net"],
  },
  quantity: {
    strong: ["quantity", "qty", "units", "idadi", "pcs", "pieces"],
    weak: ["count", "items", "number"],
  },
  product: {
    strong: ["product", "bidhaa", "item", "sku", "productname", "itemname"],
    weak: ["name", "description", "goods", "article"],
  },
  category: {
    strong: ["category", "kategori", "aina", "department", "productcategory"],
    weak: ["type", "group", "class", "segment"],
  },
  region: {
    strong: ["region", "branch", "store", "shop", "location", "eneo", "mkoa", "outlet", "area"],
    weak: ["town", "city", "county", "zone", "site"],
  },
  channel: {
    strong: ["channel", "njia", "paymentmethod", "source", "platform"],
    weak: ["method", "mode", "payment", "medium"],
  },
  customer: {
    strong: ["customer", "mteja", "client", "buyer", "customername", "customerid"],
    weak: ["name", "phone", "contact", "account"],
  },
  orderId: {
    strong: [
      "orderid",
      "orderno",
      "ordernumber",
      "receipt",
      "receiptno",
      "invoice",
      "invoiceno",
      "transactionid",
      "txn",
      "txnid",
      "reference",
      "ref",
    ],
    weak: ["order", "id", "no", "number", "transaction"],
  },
};

function tokens(header: string): string[] {
  return header
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** 0..1: how strongly a header name suggests a role. */
export function headerScore(role: Role, header: string): number {
  const words = tokens(header);
  if (words.length === 0) return 0;
  const joined = words.join("");
  const { strong, weak } = HINTS[role];
  if (strong.includes(joined)) return 1;
  if (words.some((w) => strong.includes(w))) return 0.85;
  if (strong.some((s) => s.length >= 5 && joined.includes(s))) return 0.7;
  if (weak.includes(joined) || words.some((w) => weak.includes(w))) return 0.5;
  return 0;
}

interface ColumnStats {
  /** Cells inspected (all rows, or an even sample of them on big files). */
  sampled: number;
  /** Non-blank cells among the inspected ones. */
  filled: number;
  /** Share of filled cells that parse as written dates. */
  dateText: number;
  /** Share that are bare Excel serial numbers (ambiguous with plain numbers). */
  serial: number;
  /** Share that parse as money / numbers. */
  numeric: number;
  /** Share of numeric cells that are whole numbers. */
  integer: number;
  maxAbs: number;
  distinct: number;
  currency?: Currency;
}

const SAMPLE_LIMIT = 2000;

function columnStats(table: RawTable, col: number): ColumnStats {
  const { rows } = table;
  const step = Math.max(1, Math.floor(rows.length / SAMPLE_LIMIT));
  let sampled = 0;
  let filled = 0;
  let dateText = 0;
  let serial = 0;
  let numeric = 0;
  let integer = 0;
  let maxAbs = 0;
  const seen = new Set<string>();
  const currencies = new Map<Currency, number>();

  for (let i = 0; i < rows.length; i += step) {
    const cell = rows[i][col];
    sampled++;
    if (cell === "") continue;
    filled++;
    seen.add(cell);
    if (looksLikeSerial(cell)) serial++;
    else if (parseDate(cell) !== null) dateText++;
    const amount = parseAmount(cell);
    if (amount) {
      numeric++;
      if (Number.isInteger(amount.value)) integer++;
      maxAbs = Math.max(maxAbs, Math.abs(amount.value));
      if (amount.currency) currencies.set(amount.currency, (currencies.get(amount.currency) ?? 0) + 1);
    }
  }

  let currency: Currency | undefined;
  let best = 0;
  for (const [c, n] of currencies) {
    if (n > best) {
      best = n;
      currency = c;
    }
  }
  const share = (n: number) => (filled === 0 ? 0 : n / filled);
  return {
    sampled,
    filled,
    dateText: share(dateText),
    serial: share(serial),
    numeric: share(numeric),
    integer: numeric === 0 ? 0 : integer / numeric,
    maxAbs,
    distinct: seen.size,
    currency,
  };
}

/** 0..1: how well the column's values fit a role, regardless of its name. */
function valueScore(role: Role, s: ColumnStats): number {
  if (s.filled === 0) return 0;
  const textShare = Math.max(0, 1 - s.numeric - s.dateText);
  switch (role) {
    case "date":
      return Math.max(s.dateText, s.serial * 0.6);
    case "amount":
      return s.dateText > 0.5 ? 0 : s.numeric;
    case "quantity":
      return s.numeric >= 0.8 && s.integer >= 0.9 ? (s.maxAbs <= 10_000 ? 1 : 0.3) : 0;
    case "category":
    case "region":
    case "channel":
      // Low cardinality: a handful of repeated labels, not one-off values.
      return textShare >= 0.7 && s.distinct <= Math.max(12, s.filled * 0.5) ? textShare : 0;
    case "product":
      return textShare >= 0.5 ? textShare : 0;
    case "customer":
      // Customer references may be names, IDs or phone numbers, so any filled column qualifies.
      return Math.max(textShare, 0.5);
    case "orderId":
      return s.filled >= s.sampled * 0.5 && s.distinct >= s.filled * 0.8 ? s.distinct / s.filled : 0;
  }
}

/** Option text for each column: its header, or "Column N" when blank; repeated headers get their position. */
export function columnLabels(headers: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const h of headers) counts.set(h, (counts.get(h) ?? 0) + 1);
  return headers.map((h, i) => {
    if (h === "") return `Column ${i + 1}`;
    return (counts.get(h) ?? 0) > 1 ? `${h} (column ${i + 1})` : h;
  });
}

export interface Detection {
  mapping: Mapping;
  /** Currency spotted in the amount cells or header, if any. */
  currency?: Currency;
}

/** Picks the best column for each role, never using a column twice. */
export function detectColumns(table: RawTable): Detection {
  const stats = table.headers.map((_, col) => columnStats(table, col));

  interface Candidate {
    role: Role;
    col: number;
    score: number;
  }
  const candidates: Candidate[] = [];
  for (const role of ROLES) {
    const required = role === "date" || role === "amount";
    table.headers.forEach((header, col) => {
      const h = headerScore(role, header);
      const v = valueScore(role, stats[col]);
      // Optional roles need both a matching name and plausible values. Date/amount may rely on
      // values alone when the header is unhelpful, but only if the values are clearly right.
      const accepted = required ? (h > 0 && v > 0) || v >= (role === "date" ? 0.8 : 0.9) : h > 0 && v > 0;
      if (accepted) candidates.push({ role, col, score: h * 3 + v * 2 });
    });
  }
  candidates.sort((a, b) => b.score - a.score || ROLES.indexOf(a.role) - ROLES.indexOf(b.role) || a.col - b.col);

  const mapping: Mapping = {};
  const usedCols = new Set<number>();
  for (const { role, col } of candidates) {
    if (mapping[role] !== undefined || usedCols.has(col)) continue;
    mapping[role] = col;
    usedCols.add(col);
  }

  let currency: Currency | undefined;
  if (mapping.amount !== undefined) {
    currency = stats[mapping.amount].currency ?? detectCurrency(table.headers[mapping.amount]);
  }
  return { mapping, ...(currency ? { currency } : {}) };
}
