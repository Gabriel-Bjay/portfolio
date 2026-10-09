"use client";

import { useId, useState, type DragEvent } from "react";
import { SAMPLE_FILE_NAME } from "./sample";
import { AlertIcon, buttonPrimary, LockIcon, UploadIcon } from "./ui";

const ACCEPT = ".csv,.tsv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const FEATURES = [
  {
    title: "A dashboard in seconds",
    text: "Revenue, orders, average order and units, each compared with the previous period, plus four interactive charts and filters.",
  },
  {
    title: "A forecast you can see",
    text: "The next few weeks of revenue as a dashed line, with a shaded range showing how sure the numbers are.",
  },
  {
    title: "Insights in plain English",
    text: "Sentences like “Saturdays are your strongest day”, written from your own numbers and nothing else.",
  },
];

export function Landing({
  error,
  onFile,
  onSample,
}: {
  error?: string;
  onFile: (file: File) => void;
  onSample: () => void;
}) {
  const inputId = useId();
  const errorId = useId();
  const [dragging, setDragging] = useState(false);

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  }

  return (
    <div>
      <div className="max-w-3xl">
        <p className="text-sm font-medium text-accent">Demo · works on your own data</p>
        <h1 tabIndex={-1} className="mt-2 text-4xl font-semibold tracking-tight outline-none sm:text-5xl">
          Mauzo Insights
        </h1>
        <p className="mt-4 text-lg text-muted">
          Drop in a sales spreadsheet from your POS, M-Pesa statement, Shopify or a sheet you keep by hand. In seconds
          you get an interactive dashboard, a forecast and plain-English insights.
        </p>

        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`mt-8 rounded-2xl border-2 border-dashed p-6 text-center transition has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-accent sm:p-10 ${
            dragging ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-accent"
          }`}
        >
          <input
            id={inputId}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Clearing the value lets the same file be chosen again after an error.
              event.target.value = "";
              if (file) onFile(file);
            }}
          />
          <label htmlFor={inputId} className="flex cursor-pointer flex-col items-center gap-3">
            <span className="text-accent">
              <UploadIcon />
            </span>
            <span className="text-lg font-medium">Drop a CSV or Excel file here</span>
            <span className="text-sm text-muted">
              or <span className="font-medium text-accent underline">choose a file</span> · .csv or .xlsx · up to 10 MB
              / 200,000 rows
            </span>
          </label>
        </div>

        {error ? (
          <p
            id={errorId}
            role="alert"
            className="mt-4 flex gap-2 rounded-lg border border-danger bg-surface p-3 text-sm text-danger"
          >
            <AlertIcon />
            <span>{error}</span>
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
          <button type="button" onClick={onSample} className={buttonPrimary}>
            Try with sample data
          </button>
          <a
            href="/dashboard/sample.csv"
            download={SAMPLE_FILE_NAME}
            className="inline-flex min-h-11 items-center text-sm font-medium text-accent underline"
          >
            Download sample CSV
          </a>
        </div>

        <p className="mt-6 flex items-start gap-2 text-sm text-muted">
          <LockIcon />
          <span>
            <strong className="font-medium text-fg">Your file never leaves your device.</strong> Everything is read and
            calculated in your browser. Nothing is uploaded or stored.
          </span>
        </p>
        <p className="mt-2 text-sm text-muted">
          The sample is <strong className="font-medium text-fg">Duka Digital, a fictional store</strong>: generated
          numbers, not a real business. Open the sample CSV to see the layout we expect: one row per sale with at least
          a date and an amount.
        </p>
      </div>

      <ul className="mt-12 grid gap-4 sm:grid-cols-3">
        {FEATURES.map((f) => (
          <li key={f.title} className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="font-semibold">{f.title}</h2>
            <p className="mt-1 text-sm text-muted">{f.text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
