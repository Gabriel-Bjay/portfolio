"use client";

import { useId, useState, type ReactNode } from "react";
import { buttonSecondary } from "./ui";

export interface TableColumn {
  header: string;
  /** Numbers line up on the right. */
  numeric?: boolean;
}

/** The accessible twin of a chart: same numbers, as a real table. */
export function DataTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: TableColumn[];
  rows: ReactNode[][];
}) {
  return (
    // Scrollable regions must be focusable so keyboard users can scroll long tables.
    <div
      tabIndex={0}
      role="region"
      aria-label={`${caption}, table`}
      className="max-h-72 overflow-auto rounded-lg border border-line"
    >
      <table className="w-full min-w-max border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-surface-2 text-left">
          <tr>
            {columns.map((c) => (
              <th key={c.header} scope="col" className={`px-3 py-2 font-medium ${c.numeric ? "text-right" : ""}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="border-t border-line">
              {row.map((cell, c) =>
                c === 0 ? (
                  <th key={c} scope="row" className="px-3 py-1.5 text-left font-normal">
                    {cell}
                  </th>
                ) : (
                  <td key={c} className={`px-3 py-1.5 ${columns[c]?.numeric ? "text-right tabular-nums" : ""}`}>
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A titled card with a one-line text summary, the chart, and a "Show table" toggle. */
export function ChartCard({
  title,
  summary,
  headerExtra,
  className = "",
  table,
  children,
}: {
  title: string;
  summary: string;
  headerExtra?: ReactNode;
  className?: string;
  table: { caption: string; columns: TableColumn[]; rows: ReactNode[][] };
  children: ReactNode;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <section
      aria-labelledby={`${id}-title`}
      className={`flex min-w-0 flex-col rounded-2xl border border-line bg-surface p-4 print:break-inside-avoid sm:p-5 ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[min(100%,14rem)] flex-1">
          <h2 id={`${id}-title`} className="text-base font-semibold">
            {title}
          </h2>
          <p className="mt-1 text-sm text-muted">{summary}</p>
        </div>
        {headerExtra}
      </div>
      <div className="mt-4 min-w-0">{children}</div>
      {/* Pinned to the bottom so cards of different heights line up across a row. */}
      <div className="mt-auto pt-3">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-table`}
          onClick={() => setOpen((v) => !v)}
          className={`${buttonSecondary} no-print min-h-9 px-3 py-1.5`}
        >
          {open ? "Hide table" : "Show table"}
        </button>
        {open ? (
          <div id={`${id}-table`} className="no-print mt-3">
            <DataTable {...table} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
