"use client";

// Small presentational pieces shared by the dashboard screens.
import { useId, type ReactNode } from "react";

export const buttonPrimary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg transition hover:bg-accent-hover active:scale-[0.98] disabled:opacity-60";

export const buttonSecondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-medium text-fg transition hover:bg-surface-2 active:scale-[0.98] disabled:opacity-60";

export const selectClass =
  "min-h-11 w-full min-w-0 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg hover:border-muted";

/** A label tied to its control with htmlFor, so the control is named by the label text alone. */
export function Field({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className={`flex min-w-0 flex-col gap-1 text-sm ${className}`}>
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      {children(id)}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-surface p-4 sm:p-5 ${className}`}>{children}</div>;
}

export function LockIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <rect x="4" y="9" width="12" height="8" rx="2" />
      <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
    </svg>
  );
}

export function UploadIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-8 w-8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

export function AlertIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="mt-0.5 h-5 w-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <circle cx="10" cy="10" r="8" />
      <path d="M10 6v5M10 14h.01" />
    </svg>
  );
}

/** Pulsing placeholder blocks, shown while a file is being read or the charts load. */
export function DashboardSkeleton({ label }: { label: string }) {
  return (
    <div aria-busy="true">
      <p role="status" className="mb-4 flex items-center gap-2 text-sm text-muted">
        <span aria-hidden="true" className="h-2.5 w-2.5 animate-pulse rounded-full bg-accent" />
        {label}
      </p>
      <div className="grid animate-pulse gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-2xl bg-surface-2" />
        ))}
      </div>
      <div className="mt-4 grid animate-pulse gap-4 lg:grid-cols-3" aria-hidden="true">
        <div className="h-72 rounded-2xl bg-surface-2 lg:col-span-2" />
        <div className="h-72 rounded-2xl bg-surface-2" />
      </div>
    </div>
  );
}
