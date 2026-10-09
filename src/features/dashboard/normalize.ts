// Applies a column mapping to a RawTable and produces typed Orders, counting every skipped row.
import type { Currency, Mapping, Order, RawTable } from "./types";
import { detectCurrency, detectDateOrder, parseAmount, parseDate, type DateOrder } from "./values";

export interface SkipReport {
  total: number;
  unreadableDate: number;
  unreadableAmount: number;
  /** First few skipped rows, counted from the first data row = 1, to help the user find them. */
  examples: number[];
}

export interface Normalized {
  orders: Order[];
  skipped: SkipReport;
  currency?: Currency;
  dateOrder: DateOrder;
  /** First and last day with data; undefined when no row could be read. */
  firstDay?: number;
  lastDay?: number;
  totalRows: number;
}

const MAX_EXAMPLES = 5;
const DATE_CACHE_LIMIT = 10_000;

/** Human sentence for the skip notice, e.g. "312 rows skipped: unreadable date". Empty when nothing was skipped. */
export function describeSkipped(skipped: SkipReport): string {
  if (skipped.total === 0) return "";
  const head = `${skipped.total.toLocaleString("en-KE")} ${skipped.total === 1 ? "row" : "rows"} skipped`;
  const reasons: string[] = [];
  if (skipped.unreadableDate > 0) reasons.push("unreadable date");
  if (skipped.unreadableAmount > 0) reasons.push("unreadable amount");
  if (reasons.length === 1) return `${head}: ${reasons[0]}`;
  return `${head}: ${skipped.unreadableDate.toLocaleString("en-KE")} unreadable date, ${skipped.unreadableAmount.toLocaleString("en-KE")} unreadable amount`;
}

function cleanText(value: string | undefined): string | undefined {
  return value === undefined || value === "" ? undefined : value;
}

/** Incremental converter so large files can be processed in chunks without freezing the page. */
export class OrderBuilder {
  private readonly orders: Order[] = [];
  private readonly skipped: SkipReport = { total: 0, unreadableDate: 0, unreadableAmount: 0, examples: [] };
  private readonly dateOrder: DateOrder;
  private readonly dateCache = new Map<string, number | null>();
  private readonly currencyVotes = new Map<Currency, number>();
  private firstDay = Infinity;
  private lastDay = -Infinity;

  constructor(
    private readonly table: RawTable,
    private readonly mapping: Mapping,
  ) {
    const dateCol = mapping.date;
    this.dateOrder = dateCol === undefined ? "dmy" : detectDateOrder(table.rows.map((r) => r[dateCol]));
  }

  /** Processes rows [from, to). */
  process(from: number, to: number): void {
    const { rows } = this.table;
    const { date, amount, quantity, product, category, region, channel, customer, orderId } = this.mapping;
    const end = Math.min(to, rows.length);
    for (let i = from; i < end; i++) {
      const row = rows[i];
      const day = date === undefined ? null : this.parseDay(row[date]);
      const money = amount === undefined ? null : parseAmount(row[amount]);
      if (day === null || money === null) {
        this.skip(i, day === null);
        continue;
      }
      if (money.currency) this.currencyVotes.set(money.currency, (this.currencyVotes.get(money.currency) ?? 0) + 1);
      if (day < this.firstDay) this.firstDay = day;
      if (day > this.lastDay) this.lastDay = day;

      const order: Order = { day, amount: money.value };
      if (quantity !== undefined) {
        const q = parseAmount(row[quantity]);
        if (q) order.quantity = q.value;
      }
      if (product !== undefined) order.product = cleanText(row[product]);
      if (category !== undefined) order.category = cleanText(row[category]);
      if (region !== undefined) order.region = cleanText(row[region]);
      if (channel !== undefined) order.channel = cleanText(row[channel]);
      if (customer !== undefined) order.customer = cleanText(row[customer]);
      if (orderId !== undefined) order.orderId = cleanText(row[orderId]);
      this.orders.push(order);
    }
  }

  finish(): Normalized {
    let currency: Currency | undefined;
    let best = 0;
    for (const [c, n] of this.currencyVotes) {
      if (n > best) {
        best = n;
        currency = c;
      }
    }
    if (!currency && this.mapping.amount !== undefined) {
      currency = detectCurrency(this.table.headers[this.mapping.amount] ?? "");
    }
    const hasRows = this.orders.length > 0;
    return {
      orders: this.orders,
      skipped: this.skipped,
      ...(currency ? { currency } : {}),
      dateOrder: this.dateOrder,
      ...(hasRows ? { firstDay: this.firstDay, lastDay: this.lastDay } : {}),
      totalRows: this.table.rows.length,
    };
  }

  private parseDay(raw: string): number | null {
    const hit = this.dateCache.get(raw);
    if (hit !== undefined) return hit;
    const parsed = parseDate(raw, this.dateOrder);
    // Bounded: a column of unique timestamps must not grow the cache without limit.
    if (this.dateCache.size < DATE_CACHE_LIMIT) this.dateCache.set(raw, parsed);
    return parsed;
  }

  private skip(rowIndex: number, badDate: boolean): void {
    this.skipped.total++;
    if (badDate) this.skipped.unreadableDate++;
    else this.skipped.unreadableAmount++;
    if (this.skipped.examples.length < MAX_EXAMPLES) this.skipped.examples.push(rowIndex + 1);
  }
}

export function normalizeOrders(table: RawTable, mapping: Mapping): Normalized {
  const builder = new OrderBuilder(table, mapping);
  builder.process(0, table.rows.length);
  return builder.finish();
}

const CHUNK_ROWS = 20_000;

/**
 * Same result as normalizeOrders, but yields to the event loop between chunks so the page stays
 * responsive on big files. Resolves to null if `isCancelled` turns true (a newer job replaced it).
 */
export async function normalizeOrdersAsync(
  table: RawTable,
  mapping: Mapping,
  options: { isCancelled?: () => boolean; onProgress?: (done: number, total: number) => void } = {},
): Promise<Normalized | null> {
  const builder = new OrderBuilder(table, mapping);
  const total = table.rows.length;
  for (let from = 0; from < total; from += CHUNK_ROWS) {
    if (options.isCancelled?.()) return null;
    builder.process(from, from + CHUNK_ROWS);
    options.onProgress?.(Math.min(from + CHUNK_ROWS, total), total);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return options.isCancelled?.() ? null : builder.finish();
}
