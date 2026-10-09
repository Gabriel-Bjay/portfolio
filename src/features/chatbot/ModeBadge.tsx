import type { ModeState } from "./useChat";

const COPY: Record<ModeState, { label: string; dot: string }> = {
  ai: { label: "AI", dot: "bg-success" },
  fallback: { label: "Offline mode: showing best-matching FAQ section", dot: "bg-warning" },
  checking: { label: "Checking…", dot: "bg-muted" },
  unknown: { label: "Status unknown", dot: "bg-muted" },
};

export function ModeBadge({ mode }: { mode: ModeState }) {
  const { label, dot } = COPY[mode];
  return (
    <span
      role="status"
      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-fg"
    >
      <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${dot}`} />
      <span>
        <span className="sr-only">Mode: </span>
        {label}
      </span>
    </span>
  );
}
