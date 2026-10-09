# Mauzo Insights: sales spreadsheet → dashboard

*Mauzo* is Swahili for "sales". A small-business owner drops in a CSV or Excel export
(from a POS, M-Pesa statement, Shopify, or a hand-kept sheet) and gets an interactive
dashboard, a forecast and plain-English insights in seconds. **All processing happens in
the browser; the file never leaves the device.** That is a headline selling point.

Sells the Fiverr gig: *"I will build an interactive dashboard from your Excel or CSV data."*

## Owned paths (scope word: `dashboard`)
`src/app/dashboard/**`, `src/features/dashboard/**`, `e2e/dashboard.spec.ts`, this file.

## User flow
1. **Landing state**: headline, one-line pitch, a large drag-and-drop zone (also a real
   `<input type=file>` with a label, keyboard operable), a **"Try with sample data"** button,
   a "Download sample CSV" link (shows the expected format), and a privacy note.
2. **Column mapping**: auto-detected roles shown as a compact row of labelled `<select>`s
   (Date, Amount, Quantity, Product, Category, Region, Channel, Customer, Order ID; all except
   Date and Amount optional). The user can override any role; the dashboard updates instantly.
3. **Dashboard**:
   - KPI cards: revenue, orders, average order value, units (if quantity mapped), each with
     change vs the previous equal-length period (▲/▼, coloured, with text, not colour alone).
   - Revenue over time (auto granularity: day ≤ 62 days span, week ≤ 18 months, else month)
     with a dashed **forecast** for the next periods and a shaded prediction band.
   - Top products (horizontal bars, top 10, rest grouped as "Other").
   - Breakdown by one selectable dimension (category/region/channel), horizontal bars with share %.
   - Weekday pattern (Mon–Sun average revenue).
   - **Insights panel**: 4–6 plain-English sentences, most important first.
   - Filters: date range presets (All, Last 30 days, Last 90 days, Year to date, relative to the
     latest date in the data) and a dimension value filter. Everything recomputes.
   - Each chart has a title, a one-line text summary, and a "Show table" toggle with the same
     data as an accessible `<table>`.
   - Actions: "Download report" (print stylesheet → save as PDF; hide controls when printing)
     and "Export summary CSV". "Start over" returns to the landing state.

## Logic (pure `.ts`, unit-tested)
- **parse**: CSV via `papaparse` (handle BOM, `;` or `,` delimiters, quoted fields, blank lines);
  `.xlsx` via `read-excel-file` (browser entry; first sheet). Output: header list + string rows.
  Limit: 10 MB / 200,000 rows → friendly error.
- **detect columns**: score each column by header-name hints (English + common Swahili, e.g.
  "tarehe" = date, "kiasi"/"bei" = amount/price, "bidhaa" = product) and by value checks.
  - Dates: ISO `yyyy-mm-dd` (with optional time), `dd/mm/yyyy` vs `mm/dd/yyyy` (disambiguate
    using any value with first part > 12; default to day-first, the Kenyan convention),
    `dd-Mon-yyyy`, Excel serial numbers, JS `Date` objects from xlsx.
  - Amounts: strip `KES`, `Ksh`, `KSh`, `$`, `€`, `£`, spaces and thousands separators;
    `(1,200)` and `-1200` are negative. Detect the currency symbol for display (default none).
  - Categorical: string columns with low cardinality relative to rows.
  - Rows with an unparseable date or amount are skipped and **counted** ("312 rows skipped:
    unreadable date"), shown to the user, never silently dropped.
- **metrics**: totals, period series, period-over-period change, top-N with "Other", share %,
  weekday averages, Pareto share (what % of revenue the top 20% of products bring), anomalies
  (periods with |z| > 2.5 vs a rolling baseline, needing ≥ 8 periods).
- **forecast**: Holt's linear exponential smoothing (fit α, β by grid search minimising SSE),
  horizon 3 periods (month) / 6 (week) / 14 (day), band ±1.96·σ·√h, floored at 0. Needs ≥ 6
  periods, otherwise hide the forecast and say why. Test against a known hand-computed series.
- **insights**: deterministic sentence templates from the metrics, with numbers formatted with
  thousands separators and the detected currency, e.g. "Revenue grew 18% in the last 30 days
  compared with the 30 days before." "Your top 3 products bring in 61% of revenue."
  "Saturdays are your strongest day, 34% above the weekly average."
  "Sales on 24 Nov were unusually high (3.1× a normal day)." Never invent facts.
- **sample data**: a seeded deterministic generator for a **fictional** Nairobi electronics &
  phone-accessories shop ("Duka Digital, a fictional store"), about 18 months of daily orders
  with KES amounts, products, categories, regions (Westlands, CBD, Kilimani, Kasarani,
  Thika Road, Online delivery), channels (In-store, M-Pesa till, WhatsApp order, Website),
  with a growth trend, weekend uplift, December peak and one Black-Friday spike. Same seed →
  identical output (tested). The CSV download uses the same generator.

## Performance & quality
- Parse + compute 200k rows without freezing the UI for more than a moment: do the work off
  the render path (e.g. `startTransition` / chunking) and show a progress or skeleton state.
- Charts with Recharts, coloured only with `var(--chart-N)` tokens; readable in dark mode.
  Load the `dataviz` skill before writing chart code.
- Number formatting via `Intl.NumberFormat("en-KE")`.

## Acceptance criteria
1. Sample data → full dashboard renders with KPIs, all 4 charts, forecast, ≥ 4 insights.
2. Uploading `e2e/fixtures/sales-small.csv` (create it: ~20 rows, known totals, a `KES 1,200`
   style amount, a day-first date, one bad row) shows the exact expected revenue total and
   "1 row skipped".
3. Mapping override changes the numbers.
4. Filters change KPIs and charts.
5. Every chart has a working "Show table".
6. Works at 390px without horizontal scroll; light and dark both legible.
7. No console errors; axe finds no WCAG 2 A/AA violations.
8. Unit tests cover parse, detect, metrics, forecast, insights, sample generator.

## Implementation notes
*(builder: fill in key files, data flow and gotchas when done)*
