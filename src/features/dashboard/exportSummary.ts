// "Export summary CSV": the numbers on screen, as a flat file that opens cleanly in Excel.
import Papa from "papaparse";
import { PRESET_LABELS, type DashboardModel, type Filters } from "./model";
import type { Currency, Dimension } from "./types";
import { ymdFromDay } from "./values";

export interface SummaryContext {
  fileName: string;
  filters: Filters;
  currency?: Currency;
}

const HEADER = ["Section", "Item", "Value", "Share %", "Note"] as const;
type Cell = string | number;

function round(value: number, places = 2): number {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

export function isoDay(day: number): string {
  const { year, month, date } = ymdFromDay(day);
  return `${year}-${String(month).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
}

const DIMENSION_TITLE: Record<Dimension, string> = { category: "Category", region: "Region", channel: "Channel" };

export function buildSummaryCsv(model: DashboardModel, ctx: SummaryContext): string {
  const rows: Cell[][] = [];
  const add = (section: string, item: string, value: Cell = "", share: Cell = "", note: Cell = "") =>
    rows.push([section, item, value, share, note]);

  const { filters } = ctx;
  add("Report", "File", ctx.fileName);
  add(
    "Report",
    "Period",
    `${isoDay(model.range.from)} to ${isoDay(model.range.to)}`,
    "",
    PRESET_LABELS[filters.preset],
  );
  if (filters.dimension && filters.value)
    add("Report", "Filter", `${DIMENSION_TITLE[filters.dimension]} = ${filters.value}`);
  if (ctx.currency) add("Report", "Currency", ctx.currency);

  const { kpis } = model;
  add("Summary", "Revenue", round(kpis.revenue.value));
  add("Summary", "Orders", kpis.orders.value);
  add("Summary", "Average order value", round(kpis.averageOrder.value));
  if (kpis.units) add("Summary", "Units", round(kpis.units.value));
  if (kpis.revenue.change !== null) {
    add("Summary", "Revenue change vs previous period", round(kpis.revenue.change * 100, 1), "", "Percent");
  }

  const unit = model.granularity;
  for (const p of model.series.points) {
    if (p.isForecast) {
      add(
        `Revenue by ${unit}`,
        isoDay(p.start),
        round(p.forecast ?? 0),
        "",
        `Forecast (range ${round(p.lower ?? 0)} to ${round(p.upper ?? 0)})`,
      );
    } else add(`Revenue by ${unit}`, isoDay(p.start), round(p.revenue ?? 0));
  }
  for (const b of model.products?.bars ?? []) add("Top products", b.name, round(b.value), round(b.share * 100, 1));
  for (const dimension of Object.keys(model.breakdowns) as Dimension[]) {
    for (const b of model.breakdowns[dimension]?.bars ?? []) {
      add(`By ${DIMENSION_TITLE[dimension].toLowerCase()}`, b.name, round(b.value), round(b.share * 100, 1));
    }
  }
  for (const d of model.weekday.stats) add("Average revenue by weekday", d.name, round(d.average));

  // escapeFormulae stops product names such as "=HYPERLINK(...)" from running as formulas in Excel.
  // The BOM makes Excel read the file as UTF-8.
  return "\uFEFF" + Papa.unparse({ fields: [...HEADER], data: rows }, { newline: "\r\n", escapeFormulae: true });
}
