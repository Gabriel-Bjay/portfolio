"use client";

// The three chart types on the dashboard, drawn with Recharts and coloured only through design tokens.
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  Rectangle,
  ReferenceArea,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type BarShapeProps,
  type TooltipContentProps,
  type YAxisTickContentProps,
} from "recharts";
import type { Formatter } from "./format";
import type { Bar as BarDatum, WeekdayStat } from "./metrics";
import type { SeriesPoint } from "./model";

const TICK = { fill: "var(--muted)", fontSize: 12 } as const;
const AXIS_LINE = { stroke: "var(--chart-grid)" } as const;

// ───────────────────────────── shared bits ─────────────────────────────

/** Width of an element, kept current with a ResizeObserver (used to size axis labels on phones). */
function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

function TooltipBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg shadow-lg">
      <p className="text-muted">{title}</p>
      <div className="mt-1 flex flex-col gap-1">{children}</div>
    </div>
  );
}

function TooltipRow({
  keyStyle,
  value,
  label,
}: {
  keyStyle: "solid" | "dashed" | "swatch";
  value: string;
  label: string;
}) {
  return (
    <p className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className={
          keyStyle === "swatch"
            ? "h-2.5 w-3 shrink-0 rounded-sm bg-chart-1 opacity-25"
            : `w-3 shrink-0 border-t-2 border-chart-1 ${keyStyle === "dashed" ? "border-dashed" : ""}`
        }
      />
      <strong className="text-base font-semibold">{value}</strong>
      <span className="text-muted">{label}</span>
    </p>
  );
}

// ───────────────────────────── revenue over time ─────────────────────────────

interface RevenueRow {
  start: number;
  longLabel: string;
  revenue: number | null;
  forecast: number | null;
  lower: number | null;
  upper: number | null;
  /** Transparent base of the stacked band. */
  bandBase: number | null;
  bandSize: number | null;
  isForecast: boolean;
}

function RevenueTooltip({ fmt, ...tooltip }: TooltipContentProps & { fmt: Formatter }) {
  const row = tooltip.payload?.[0]?.payload as RevenueRow | undefined;
  if (!tooltip.active || !row) return null;
  return (
    <TooltipBox title={row.longLabel}>
      {row.isForecast ? (
        <>
          <TooltipRow keyStyle="dashed" value={fmt.money(row.forecast ?? 0)} label="forecast" />
          <TooltipRow
            keyStyle="swatch"
            value={`${fmt.money(row.lower ?? 0)} to ${fmt.money(row.upper ?? 0)}`}
            label="likely range"
          />
        </>
      ) : (
        <TooltipRow keyStyle="solid" value={fmt.money(row.revenue ?? 0)} label="revenue" />
      )}
    </TooltipBox>
  );
}

export function RevenueChart({
  points,
  fmt,
  showForecast,
}: {
  points: SeriesPoint[];
  fmt: Formatter;
  showForecast: boolean;
}) {
  const rows: RevenueRow[] = points.map((p) => ({
    start: p.start,
    longLabel: p.longLabel,
    revenue: p.revenue,
    forecast: p.forecast,
    lower: p.lower,
    upper: p.upper,
    bandBase: p.lower,
    bandSize: p.lower !== null && p.upper !== null ? p.upper - p.lower : null,
    isForecast: p.isForecast,
  }));
  const labelByStart = new Map(points.map((p) => [p.start, p.label]));
  const observed = points.filter((p) => !p.isForecast);
  const last = observed[observed.length - 1];
  const firstForecast = points.find((p) => p.isForecast);
  const lastPoint = points[points.length - 1];

  return (
    <div>
      <ul className="mb-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted" aria-label="Legend">
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="w-4 border-t-2 border-chart-1" />
          Revenue
        </li>
        {showForecast ? (
          <>
            <li className="flex items-center gap-2">
              <span aria-hidden="true" className="w-4 border-t-2 border-dashed border-chart-1" />
              Forecast
            </li>
            <li className="flex items-center gap-2">
              <span aria-hidden="true" className="h-2.5 w-4 rounded-sm bg-chart-1 opacity-25" />
              Likely range (95%)
            </li>
          </>
        ) : null}
      </ul>
      <div className="h-[260px] sm:h-[300px]" data-testid="revenue-chart">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis
              dataKey="start"
              type="category"
              tickFormatter={(v: number) => labelByStart.get(v) ?? ""}
              interval="preserveStartEnd"
              minTickGap={28}
              tick={TICK}
              tickLine={false}
              tickMargin={8}
              axisLine={AXIS_LINE}
            />
            <YAxis
              width={52}
              tickFormatter={(v: number) => fmt.compact(v)}
              tick={TICK}
              tickLine={false}
              axisLine={false}
              domain={[0, "auto"]}
            />
            {showForecast && firstForecast ? (
              <ReferenceArea
                x1={last?.start ?? firstForecast.start}
                x2={lastPoint.start}
                fill="var(--surface-2)"
                fillOpacity={0.7}
                stroke="none"
                ifOverflow="visible"
              />
            ) : null}
            <Area
              dataKey="bandBase"
              stackId="band"
              stroke="none"
              fill="none"
              isAnimationActive={false}
              activeDot={false}
              legendType="none"
              tooltipType="none"
            />
            <Area
              dataKey="bandSize"
              stackId="band"
              stroke="none"
              fill="var(--chart-1)"
              fillOpacity={0.18}
              isAnimationActive={false}
              activeDot={false}
              legendType="none"
              tooltipType="none"
            />
            <Area
              dataKey="revenue"
              type="monotone"
              stroke="var(--chart-1)"
              strokeWidth={2}
              fill="var(--chart-1)"
              fillOpacity={0.1}
              dot={false}
              isAnimationActive={false}
              activeDot={{ r: 4, fill: "var(--chart-1)", stroke: "var(--surface)", strokeWidth: 2 }}
            />
            <Line
              dataKey="forecast"
              type="monotone"
              stroke="var(--chart-1)"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              isAnimationActive={false}
              activeDot={{ r: 4, fill: "var(--chart-1)", stroke: "var(--surface)", strokeWidth: 2 }}
            />
            {last && last.revenue !== null ? (
              <ReferenceDot
                x={last.start}
                y={last.revenue}
                r={4}
                fill="var(--chart-1)"
                stroke="var(--surface)"
                strokeWidth={2}
                ifOverflow="visible"
              />
            ) : null}
            <Tooltip
              content={(props) => <RevenueTooltip {...props} fmt={fmt} />}
              cursor={{ stroke: "var(--muted)", strokeWidth: 1 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ───────────────────────────── horizontal bars ─────────────────────────────

interface BarRow {
  name: string;
  value: number;
  share: number;
  isOther: boolean;
}

function shortName(name: string, maxChars: number): string {
  return name.length > maxChars ? `${name.slice(0, Math.max(1, maxChars - 1))}…` : name;
}

function BarsTooltip({ fmt, ...tooltip }: TooltipContentProps & { fmt: Formatter }) {
  const row = tooltip.payload?.[0]?.payload as BarRow | undefined;
  if (!tooltip.active || !row) return null;
  return (
    <TooltipBox title={row.name}>
      <TooltipRow keyStyle="swatch" value={fmt.money(row.value)} label={`revenue · ${fmt.percent(row.share)}`} />
    </TooltipBox>
  );
}

const ROW_HEIGHT = 30;

/** Revenue by name, biggest first. One series, so one colour; "Other" is neutral. */
export function HorizontalBars({ bars, fmt, label }: { bars: BarDatum[]; fmt: Formatter; label: "value" | "share" }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const labelWidth = width > 0 && width < 460 ? 108 : 170;
  // ~7.4px per character at 12px covers wide capitals; the full name stays in the tooltip and table.
  const maxChars = Math.floor(labelWidth / 7.4);
  const rows: BarRow[] = bars.map((b) => ({ name: b.name, value: b.value, share: b.share, isOther: b.isOther }));

  function renderTick(props: YAxisTickContentProps) {
    const name = String((props.payload as { value?: unknown }).value ?? "");
    return (
      <text x={Number(props.x)} y={Number(props.y)} dy={4} textAnchor="end" fontSize={12} fill="var(--fg)">
        <title>{name}</title>
        {shortName(name, maxChars)}
      </text>
    );
  }

  function renderShape(props: BarShapeProps) {
    const row = props.payload as BarRow;
    return (
      <Rectangle
        x={props.x}
        y={props.y}
        width={props.width}
        height={props.height}
        radius={[0, 4, 4, 0]}
        fill={row.isOther ? "var(--muted)" : "var(--chart-1)"}
        fillOpacity={props.isActive ? 0.8 : 1}
      />
    );
  }

  return (
    <div ref={ref} style={{ height: rows.length * ROW_HEIGHT + 12 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 52, bottom: 4, left: 0 }} barCategoryGap={6}>
          <XAxis type="number" hide domain={[0, "auto"]} />
          <YAxis
            type="category"
            dataKey="name"
            width={labelWidth}
            tick={renderTick}
            tickLine={false}
            axisLine={AXIS_LINE}
            interval={0}
          />
          <Tooltip
            content={(props) => <BarsTooltip {...props} fmt={fmt} />}
            cursor={{ fill: "var(--surface-2)" }}
            isAnimationActive={false}
          />
          <Bar dataKey="value" barSize={16} shape={renderShape} activeBar={renderShape} isAnimationActive={false}>
            <LabelList
              dataKey={label}
              position="right"
              fill="var(--muted)"
              fontSize={12}
              formatter={(v: unknown) => (label === "share" ? fmt.percent(Number(v)) : fmt.compact(Number(v)))}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ───────────────────────────── weekday columns ─────────────────────────────

interface WeekdayRow {
  short: string;
  name: string;
  average: number;
  best: boolean;
}

function WeekdayTooltip({ fmt, ...tooltip }: TooltipContentProps & { fmt: Formatter }) {
  const row = tooltip.payload?.[0]?.payload as WeekdayRow | undefined;
  if (!tooltip.active || !row) return null;
  return (
    <TooltipBox title={row.name}>
      <TooltipRow keyStyle="swatch" value={fmt.money(row.average)} label="average revenue" />
    </TooltipBox>
  );
}

/** Average revenue per weekday; the strongest day is full colour, the rest are toned down. */
export function WeekdayColumns({ stats, fmt }: { stats: WeekdayStat[]; fmt: Formatter }) {
  const max = Math.max(...stats.map((s) => s.average));
  const rows: WeekdayRow[] = stats.map((s) => ({
    short: s.short,
    name: s.name,
    average: s.average,
    best: max > 0 && s.average === max,
  }));

  function renderShape(props: BarShapeProps) {
    const row = props.payload as WeekdayRow;
    return (
      <Rectangle
        x={props.x}
        y={props.y}
        width={props.width}
        height={props.height}
        radius={[4, 4, 0, 0]}
        fill="var(--chart-1)"
        fillOpacity={props.isActive ? 0.85 : row.best ? 1 : 0.7}
      />
    );
  }

  return (
    <div className="h-[240px]" data-testid="weekday-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 20, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="short" tick={TICK} tickLine={false} axisLine={AXIS_LINE} tickMargin={8} />
          <YAxis
            width={52}
            tickFormatter={(v: number) => fmt.compact(v)}
            tick={TICK}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            content={(props) => <WeekdayTooltip {...props} fmt={fmt} />}
            cursor={{ fill: "var(--surface-2)" }}
            isAnimationActive={false}
          />
          <Bar dataKey="average" barSize={24} shape={renderShape} activeBar={renderShape} isAnimationActive={false}>
            <LabelList
              dataKey="average"
              position="top"
              fill="var(--muted)"
              fontSize={12}
              formatter={(v: unknown) => fmt.compact(Number(v))}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
