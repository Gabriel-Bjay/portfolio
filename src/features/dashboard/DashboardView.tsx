"use client";

import { useDeferredValue, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ChartCard } from "./ChartCard";
import { HorizontalBars, RevenueChart, WeekdayColumns } from "./charts";
import { baseName, downloadText } from "./download";
import { buildSummaryCsv } from "./exportSummary";
import { createFormatter, type Formatter } from "./format";
import {
  buildModel,
  DEFAULT_FILTERS,
  dimensionValues,
  PRESET_LABELS,
  type DashboardModel,
  type Filters,
  type KpiValue,
  type RangePreset,
} from "./model";
import type { Currency, Dimension, Mapping, Order, Role } from "./types";
import { DIMENSIONS, ROLES } from "./types";
import { buttonPrimary, buttonSecondary, Card, Field, selectClass } from "./ui";

const DIMENSION_LABELS: Record<Dimension, string> = { category: "Category", region: "Region", channel: "Channel" };
const PRESETS = Object.keys(PRESET_LABELS) as RangePreset[];

// Print as a light, ink-friendly page even when the screen is in dark mode.
const PRINT_CSS = `@media print {
  :root { --bg:#fff; --surface:#fff; --surface-2:#f2f1ef; --line:#d6d3d1; --fg:#1c1917; --muted:#57534e;
    --accent:#0f766e; --success:#15803d; --warning:#b45309; --danger:#b91c1c; --chart-1:#0f766e; --chart-grid:#e7e5e4; color-scheme: light; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}`;

export interface DashboardViewProps {
  orders: readonly Order[];
  firstDay: number;
  lastDay: number;
  /** The mapping `orders` was built from. */
  mapping: Mapping;
  currency?: Currency;
  fileName: string;
  filters: Filters;
  onFilters: (filters: Filters) => void;
}

export default function DashboardView({
  orders,
  firstDay,
  lastDay,
  mapping,
  currency,
  fileName,
  filters,
  onFilters,
}: DashboardViewProps) {
  const fmt = useMemo(() => createFormatter(currency), [currency]);
  const has = useMemo(
    () => Object.fromEntries(ROLES.map((r) => [r, mapping[r] !== undefined])) as Record<Role, boolean>,
    [mapping],
  );

  // Controls update at once; the heavy recomputation follows on a deferred value so typing and clicking stay snappy.
  const deferred = useDeferredValue(filters);
  const model = useMemo(
    () => buildModel({ orders, firstDay, lastDay, has }, deferred, fmt),
    [orders, firstDay, lastDay, has, deferred, fmt],
  );
  const updating = deferred !== filters;

  const availableDimensions = DIMENSIONS.filter((d) => has[d]);
  const [dimension, setDimension] = useState<Dimension>(availableDimensions[0] ?? "category");
  const activeDimension = availableDimensions.includes(dimension) ? dimension : availableDimensions[0];

  const [exported, setExported] = useState(false);
  const exportTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(exportTimer.current), []);

  function exportCsv() {
    downloadText(
      `${baseName(fileName)}-summary.csv`,
      buildSummaryCsv(model, { fileName, filters: deferred, currency }),
    );
    setExported(true);
    clearTimeout(exportTimer.current);
    exportTimer.current = setTimeout(() => setExported(false), 2500);
  }

  const filterSummary = [
    PRESET_LABELS[filters.preset],
    filters.dimension && filters.value ? `${DIMENSION_LABELS[filters.dimension]}: ${filters.value}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-5">
      <style>{PRINT_CSS}</style>
      <p className="hidden text-sm print:block">
        Report for {fileName} · {fmt.dateWithYear(model.range.from)} to {fmt.dateWithYear(model.range.to)} ·{" "}
        {filterSummary}
      </p>

      <div className="no-print flex flex-wrap items-end justify-between gap-4">
        <FiltersBar orders={orders} filters={filters} onChange={onFilters} availableDimensions={availableDimensions} />
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => window.print()}
            className={buttonSecondary}
            title="Opens the print dialog: choose Save as PDF"
          >
            Download report
          </button>
          <button type="button" onClick={exportCsv} className={buttonPrimary}>
            {exported ? "Summary exported ✓" : "Export summary CSV"}
          </button>
        </div>
      </div>
      <p role="status" className="sr-only">
        {exported ? "Summary CSV downloaded." : ""}
      </p>

      {model.empty ? (
        <Card className="text-center">
          <p className="text-muted">No orders match these filters.</p>
          <button type="button" onClick={() => onFilters(DEFAULT_FILTERS)} className={`${buttonSecondary} mt-3`}>
            Clear filters
          </button>
        </Card>
      ) : (
        <div className={`flex flex-col gap-5 transition-opacity ${updating ? "opacity-60" : ""}`} aria-busy={updating}>
          <Kpis model={model} fmt={fmt} whole={deferred.preset === "all"} />

          <div className="grid gap-5 lg:grid-cols-12">
            <ChartCard
              title="Revenue over time"
              summary={model.series.summary}
              className="lg:col-span-8"
              table={{
                caption: `Revenue per ${model.granularity}`,
                columns: [
                  { header: model.granularity === "day" ? "Day" : model.granularity === "week" ? "Week" : "Month" },
                  { header: "Revenue", numeric: true },
                  { header: "Forecast", numeric: true },
                  { header: "Likely range", numeric: true },
                ],
                rows: model.series.points.map((p) => [
                  p.longLabel,
                  p.isForecast ? "–" : fmt.money(p.revenue ?? 0),
                  p.isForecast ? fmt.money(p.forecast ?? 0) : "–",
                  p.isForecast ? `${fmt.money(p.lower ?? 0)} to ${fmt.money(p.upper ?? 0)}` : "–",
                ]),
              }}
            >
              <RevenueChart points={model.series.points} fmt={fmt} showForecast={model.series.forecast.ok} />
              {!model.series.forecast.ok ? (
                <p className="mt-2 text-sm text-muted" data-testid="forecast-note">
                  Forecast hidden. {model.series.forecast.reason}
                </p>
              ) : null}
            </ChartCard>

            <InsightsPanel insights={model.insights} className="lg:col-span-4" />

            <ChartCard
              title="Top products"
              summary={
                model.products ? model.products.summary : "Map a Product column above to see which items sell best."
              }
              className="lg:col-span-6"
              table={{
                caption: "Revenue by product",
                columns: [
                  { header: "Product" },
                  { header: "Revenue", numeric: true },
                  { header: "Share of revenue", numeric: true },
                ],
                rows: (model.products?.bars ?? []).map((b) => [b.name, fmt.money(b.value), fmt.percent(b.share)]),
              }}
            >
              {model.products ? (
                <HorizontalBars bars={model.products.bars} fmt={fmt} label="value" />
              ) : (
                <EmptyChart text="No product column is mapped." />
              )}
            </ChartCard>

            <BreakdownCard
              model={model}
              fmt={fmt}
              dimension={activeDimension}
              available={availableDimensions}
              onDimension={setDimension}
            />

            <ChartCard
              title="Weekday pattern"
              summary={model.weekday.summary}
              className="lg:col-span-6"
              table={{
                caption: "Average revenue by weekday",
                columns: [
                  { header: "Weekday" },
                  { header: "Average revenue", numeric: true },
                  { header: "Total revenue", numeric: true },
                  { header: "Days counted", numeric: true },
                ],
                rows: model.weekday.stats.map((s) => [
                  s.name,
                  fmt.money(s.average),
                  fmt.money(s.total),
                  String(s.days),
                ]),
              }}
            >
              <WeekdayColumns stats={model.weekday.stats} fmt={fmt} />
            </ChartCard>

            <AboutCard model={model} className="lg:col-span-6" />
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────── filters ─────────────────────────────

function FiltersBar({
  orders,
  filters,
  onChange,
  availableDimensions,
}: {
  orders: readonly Order[];
  filters: Filters;
  onChange: (filters: Filters) => void;
  availableDimensions: Dimension[];
}) {
  const id = useId();
  const values = useMemo(
    () => (filters.dimension ? dimensionValues(orders, filters.dimension) : []),
    [orders, filters.dimension],
  );
  const filtered = filters.preset !== "all" || filters.dimension !== null;

  return (
    <div className="flex min-w-0 flex-wrap items-end gap-x-6 gap-y-3" role="group" aria-label="Filters">
      <div>
        <p id={`${id}-range`} className="mb-1 text-sm font-medium">
          Date range
        </p>
        <div
          role="group"
          aria-labelledby={`${id}-range`}
          className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-surface p-1 sm:inline-flex"
        >
          {PRESETS.map((preset) => {
            const on = filters.preset === preset;
            return (
              <button
                key={preset}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ ...filters, preset })}
                className={`min-h-9 rounded-lg px-3 py-1.5 text-sm font-medium transition active:scale-[0.98] ${
                  on ? "bg-accent text-accent-fg" : "text-fg hover:bg-surface-2"
                }`}
              >
                {PRESET_LABELS[preset]}
              </button>
            );
          })}
        </div>
      </div>

      {availableDimensions.length > 0 ? (
        <>
          <Field label="Filter by" className="min-w-36">
            {(fieldId) => (
              <select
                id={fieldId}
                className={selectClass}
                value={filters.dimension ?? ""}
                onChange={(event) => {
                  const next = (event.target.value || null) as Dimension | null;
                  onChange({ ...filters, dimension: next, value: null });
                }}
              >
                <option value="">Nothing</option>
                {availableDimensions.map((d) => (
                  <option key={d} value={d}>
                    {DIMENSION_LABELS[d]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {filters.dimension ? (
            <Field label={`${DIMENSION_LABELS[filters.dimension]} value`} className="min-w-40">
              {(fieldId) => (
                <select
                  id={fieldId}
                  className={selectClass}
                  value={filters.value ?? ""}
                  onChange={(event) => onChange({ ...filters, value: event.target.value || null })}
                >
                  <option value="">All {DIMENSION_LABELS[filters.dimension!].toLowerCase()} values</option>
                  {values.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          ) : null}
        </>
      ) : null}

      {filtered ? (
        <button
          type="button"
          onClick={() => onChange(DEFAULT_FILTERS)}
          className="min-h-11 text-sm font-medium text-accent underline"
        >
          Clear filters
        </button>
      ) : null}
    </div>
  );
}

// ───────────────────────────── KPI cards ─────────────────────────────

function Delta({ kpi, days, fmt, whole }: { kpi: KpiValue; days: number; fmt: Formatter; whole: boolean }) {
  if (kpi.change === null) {
    return (
      <p className="text-sm text-muted">{whole ? `Across all ${days} days` : "Not enough earlier data to compare"}</p>
    );
  }
  const up = kpi.change > 0.0005;
  const down = kpi.change < -0.0005;
  return (
    <p className={`text-sm font-medium ${up ? "text-success" : down ? "text-danger" : "text-muted"}`}>
      <span aria-hidden="true">{up ? "▲" : down ? "▼" : "■"} </span>
      <span className="sr-only">{up ? "Up " : down ? "Down " : "No change, "}</span>
      {up || down ? fmt.percent(Math.abs(kpi.change)) : "0%"}{" "}
      <span className="font-normal text-muted">vs previous {days} days</span>
    </p>
  );
}

function KpiCard({
  label,
  kpi,
  shown,
  full,
  days,
  fmt,
  whole,
}: {
  label: string;
  kpi: KpiValue;
  shown: string;
  full: string;
  days: number;
  fmt: Formatter;
  whole: boolean;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-surface p-4 print:break-inside-avoid">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1">
        <p
          className="break-words text-xl font-semibold tracking-tight sm:text-3xl"
          data-testid={`kpi-${label.toLowerCase().replace(/\s+/g, "-")}`}
        >
          <span aria-hidden={shown !== full}>{shown}</span>
          {shown !== full ? <span className="sr-only">{full}</span> : null}
        </p>
        <Delta kpi={kpi} days={days} fmt={fmt} whole={whole} />
      </dd>
    </div>
  );
}

function Kpis({ model, fmt, whole }: { model: DashboardModel; fmt: Formatter; whole: boolean }) {
  const days = model.range.to - model.range.from + 1;
  const { kpis } = model;
  return (
    <section aria-labelledby="kpi-heading">
      <h2 id="kpi-heading" className="sr-only">
        Key numbers
      </h2>
      <dl className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard
          label="Revenue"
          kpi={kpis.revenue}
          shown={fmt.moneyCompact(kpis.revenue.value)}
          full={fmt.money(kpis.revenue.value)}
          days={days}
          fmt={fmt}
          whole={whole}
        />
        <KpiCard
          label="Orders"
          kpi={kpis.orders}
          shown={fmt.number(kpis.orders.value)}
          full={fmt.number(kpis.orders.value)}
          days={days}
          fmt={fmt}
          whole={whole}
        />
        <KpiCard
          label="Average order"
          kpi={kpis.averageOrder}
          shown={fmt.moneyCompact(kpis.averageOrder.value)}
          full={fmt.money(kpis.averageOrder.value)}
          days={days}
          fmt={fmt}
          whole={whole}
        />
        {kpis.units ? (
          <KpiCard
            label="Units sold"
            kpi={kpis.units}
            shown={fmt.number(kpis.units.value)}
            full={fmt.number(kpis.units.value)}
            days={days}
            fmt={fmt}
            whole={whole}
          />
        ) : null}
      </dl>
    </section>
  );
}

// ───────────────────────────── insights, breakdown, notes ─────────────────────────────

function InsightsPanel({ insights, className = "" }: { insights: string[]; className?: string }) {
  return (
    <section
      aria-labelledby="insights-heading"
      className={`rounded-2xl border border-line bg-surface p-4 print:break-inside-avoid sm:p-5 ${className}`}
    >
      <h2 id="insights-heading" className="text-base font-semibold">
        What stands out
      </h2>
      <ul className="mt-3 flex flex-col gap-3" data-testid="insights">
        {insights.map((text) => (
          <li key={text} className="flex gap-3 text-sm leading-relaxed">
            <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            <span>{text}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted">
        Written from your numbers with fixed templates. Nothing is guessed or made up.
      </p>
    </section>
  );
}

function EmptyChart({ text }: { text: string }) {
  return <p className="rounded-lg bg-surface-2 p-6 text-center text-sm text-muted">{text}</p>;
}

function BreakdownCard({
  model,
  fmt,
  dimension,
  available,
  onDimension,
}: {
  model: DashboardModel;
  fmt: Formatter;
  dimension: Dimension | undefined;
  available: Dimension[];
  onDimension: (d: Dimension) => void;
}) {
  const id = useId();
  const chart = dimension ? model.breakdowns[dimension] : undefined;
  const label = dimension ? DIMENSION_LABELS[dimension] : "Segment";
  return (
    <ChartCard
      title={`Revenue by ${label.toLowerCase()}`}
      summary={chart ? chart.summary : "Map a Category, Region or Channel column above to see a breakdown."}
      className="lg:col-span-6"
      headerExtra={
        available.length > 1 && dimension ? (
          <div className="flex items-center gap-2 text-sm">
            <label htmlFor={`${id}-by`} className="text-muted">
              Break down by
            </label>
            <select
              id={`${id}-by`}
              className={`${selectClass} !w-auto`}
              value={dimension}
              onChange={(event) => onDimension(event.target.value as Dimension)}
            >
              {available.map((d) => (
                <option key={d} value={d}>
                  {DIMENSION_LABELS[d]}
                </option>
              ))}
            </select>
          </div>
        ) : null
      }
      table={{
        caption: `Revenue by ${label.toLowerCase()}`,
        columns: [
          { header: label },
          { header: "Revenue", numeric: true },
          { header: "Share of revenue", numeric: true },
        ],
        rows: (chart?.bars ?? []).map((b) => [b.name, fmt.money(b.value), fmt.percent(b.share)]),
      }}
    >
      {chart ? (
        <HorizontalBars bars={chart.bars} fmt={fmt} label="share" />
      ) : (
        <EmptyChart text="No category, region or channel column is mapped." />
      )}
    </ChartCard>
  );
}

function AboutCard({ model, className = "" }: { model: DashboardModel; className?: string }) {
  const f = model.series.forecast;
  return (
    <ChartAside title="How to read this" className={className}>
      <ul className="flex flex-col gap-2 text-sm text-muted">
        <li>
          <strong className="font-medium text-fg">Privacy.</strong> Your file was read and calculated in this browser
          tab. Nothing was uploaded.
        </li>
        <li>
          <strong className="font-medium text-fg">Forecast.</strong>{" "}
          {f.ok
            ? `Holt's linear smoothing fitted to ${model.series.observed} ${model.granularity}s of revenue, with a 95% range that widens the further ahead it looks. It follows the recent trend and does not know about holidays or promotions.`
            : f.reason}
        </li>
        <li>
          <strong className="font-medium text-fg">Change vs previous period.</strong> Compares with the period of the
          same length just before the one you selected, when your file covers it.
        </li>
        <li>
          <strong className="font-medium text-fg">Orders.</strong> Counted by Order ID when that column is mapped,
          otherwise one row is one order.
        </li>
      </ul>
    </ChartAside>
  );
}

function ChartAside({ title, className = "", children }: { title: string; className?: string; children: ReactNode }) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={`rounded-2xl border border-line bg-surface p-4 print:break-inside-avoid sm:p-5 ${className}`}
    >
      <h2 id={id} className="text-base font-semibold">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
