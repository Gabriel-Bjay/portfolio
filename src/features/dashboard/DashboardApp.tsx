"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { detectColumns } from "./detect";
import { createFormatter } from "./format";
import { Landing } from "./Landing";
import { MappingBar } from "./MappingBar";
import { DEFAULT_FILTERS, type Filters } from "./model";
import { describeSkipped, normalizeOrdersAsync, type Normalized } from "./normalize";
import { FriendlyError, parseFile } from "./parse";
import { SAMPLE_FILE_NAME, SAMPLE_LABEL, sampleTable } from "./sample";
import type { Mapping, RawTable, Role } from "./types";
import { REQUIRED_ROLES, ROLE_LABELS } from "./types";
import { AlertIcon, buttonSecondary, DashboardSkeleton } from "./ui";

// The charts (and Recharts) load only once there is a dashboard to draw.
const DashboardView = dynamic(() => import("./DashboardView"), {
  ssr: false,
  loading: () => <DashboardSkeleton label="Drawing your charts" />,
});

interface Session {
  fileName: string;
  isSample: boolean;
  table: RawTable;
  /** What the column pickers show right now. */
  mapping: Mapping;
  /** The mapping `normalized` was built from; lags `mapping` while a recalculation is running. */
  computed: { mapping: Mapping; normalized: Normalized };
  busy: boolean;
}

type Stage = { name: "landing"; error?: string } | { name: "loading"; label: string } | { name: "ready" };

const noSubscription = () => () => {};

const nextFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function messageFor(error: unknown): string {
  if (error instanceof FriendlyError) return error.message;
  return "Something went wrong while reading that file. Check that it is a CSV or .xlsx export and try again.";
}

export function DashboardApp() {
  const [stage, setStage] = useState<Stage>({ name: "landing" });
  const [session, setSession] = useState<Session | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  // False during server rendering and the first client render, true once React has attached the handlers.
  // Tests wait for it so they never click a button that does nothing yet.
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  const job = useRef(0);
  const headingArea = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  const currency = session?.computed.normalized.currency;
  const fmt = useMemo(() => createFormatter(currency), [currency]);

  // Move focus to the heading when the screen changes so keyboard and screen-reader users land at the top.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingArea.current?.querySelector<HTMLElement>("h1")?.focus();
  }, [stage.name]);

  async function load(
    read: (stage: (label: string) => Promise<void>) => Promise<RawTable>,
    fileName: string,
    isSample: boolean,
  ) {
    const mine = ++job.current;
    const current = () => mine === job.current;
    const show = async (label: string) => {
      if (!current()) return;
      setStage({ name: "loading", label });
      await nextFrame(); // let the browser paint the new label before the next heavy step
    };
    try {
      await show("Reading your file");
      const table = await read(show);
      if (!current()) return;
      await show("Detecting columns");
      const { mapping } = detectColumns(table);
      const normalized = await normalizeOrdersAsync(table, mapping, {
        isCancelled: () => !current(),
        onProgress: (done, total) => {
          if (current() && total > 20_000)
            setStage({ name: "loading", label: `Preparing your data (${Math.round((done / total) * 100)}%)` });
        },
      });
      if (!normalized || !current()) return;
      setFilters(DEFAULT_FILTERS);
      setSession({ fileName, isSample, table, mapping, computed: { mapping, normalized }, busy: false });
      setStage({ name: "ready" });
    } catch (error) {
      if (!current()) return;
      setSession(null);
      setStage({ name: "landing", error: messageFor(error) });
    }
  }

  const openFile = (file: File) => load((show) => parseFile(file, show), file.name, false);
  const openSample = () => load(async () => sampleTable(), SAMPLE_FILE_NAME, true);

  function startOver() {
    job.current++; // abandons any calculation still running
    setSession(null);
    setFilters(DEFAULT_FILTERS);
    setStage({ name: "landing" });
  }

  async function changeMapping(role: Role, column: number | undefined) {
    if (!session) return;
    const mapping: Mapping = { ...session.mapping };
    if (column === undefined) delete mapping[role];
    else mapping[role] = column;

    const mine = ++job.current;
    const table = session.table;
    setSession({ ...session, mapping, busy: true });
    const normalized = await normalizeOrdersAsync(table, mapping, { isCancelled: () => mine !== job.current });
    if (!normalized || mine !== job.current) return;
    setSession((latest) => (latest ? { ...latest, computed: { mapping, normalized }, busy: false } : latest));
    // A dimension filter only makes sense while its column is still mapped.
    setFilters((f) =>
      f.dimension !== null && mapping[f.dimension] === undefined ? { ...f, dimension: null, value: null } : f,
    );
  }

  const ready = stage.name === "ready" && session;

  return (
    <div ref={headingArea} data-hydrated={hydrated}>
      {stage.name === "landing" ? <Landing error={stage.error} onFile={openFile} onSample={openSample} /> : null}

      {stage.name === "loading" ? (
        <div>
          <h1 tabIndex={-1} className="text-3xl font-semibold tracking-tight outline-none">
            Mauzo Insights
          </h1>
          <div className="mt-6">
            <DashboardSkeleton label={`${stage.label}…`} />
          </div>
        </div>
      ) : null}

      {ready ? (
        <ReadyScreen
          session={session}
          filters={filters}
          onFilters={setFilters}
          fmt={fmt}
          onMapping={changeMapping}
          onStartOver={startOver}
        />
      ) : null}
    </div>
  );
}

function ReadyScreen({
  session,
  filters,
  onFilters,
  fmt,
  onMapping,
  onStartOver,
}: {
  session: Session;
  filters: Filters;
  onFilters: (filters: Filters) => void;
  fmt: ReturnType<typeof createFormatter>;
  onMapping: (role: Role, column: number | undefined) => void;
  onStartOver: () => void;
}) {
  const { normalized, mapping: computedMapping } = session.computed;
  const skippedText = describeSkipped(normalized.skipped);
  const missing = REQUIRED_ROLES.filter((role) => session.mapping[role] === undefined);
  const hasData = normalized.orders.length > 0 && normalized.firstDay !== undefined && normalized.lastDay !== undefined;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 tabIndex={-1} className="text-3xl font-semibold tracking-tight outline-none">
            Mauzo Insights
          </h1>
          <p className="mt-1 break-words text-sm text-muted">
            <span className="font-medium text-fg">{session.fileName}</span> ·{" "}
            {normalized.totalRows.toLocaleString("en-KE")} rows
            {hasData ? (
              <>
                {" "}
                · {fmt.dateWithYear(normalized.firstDay as number)} to {fmt.dateWithYear(normalized.lastDay as number)}
              </>
            ) : null}
          </p>
        </div>
        <button type="button" onClick={onStartOver} className={`${buttonSecondary} no-print`}>
          Start over
        </button>
      </div>

      {session.isSample ? (
        <p className="rounded-lg border border-line bg-accent-soft px-4 py-3 text-sm text-fg">
          <strong className="font-medium">Demo data.</strong> {SAMPLE_LABEL}. The orders are generated for this demo,
          not a real business.
        </p>
      ) : null}

      {skippedText ? (
        <p
          role="status"
          className="flex gap-2 rounded-lg border border-warning bg-surface px-4 py-3 text-sm text-warning"
        >
          <AlertIcon />
          <span>
            {skippedText}
            {normalized.skipped.examples.length > 0 ? (
              <span className="text-muted">
                {" "}
                (for example data row{normalized.skipped.examples.length === 1 ? "" : "s"}{" "}
                {normalized.skipped.examples.join(", ")}). Check the Date and Amount columns below if that looks wrong.
              </span>
            ) : null}
          </span>
        </p>
      ) : null}

      <MappingBar headers={session.table.headers} mapping={session.mapping} onChange={onMapping} />

      {missing.length > 0 ? (
        <p role="status" className="rounded-2xl border border-line bg-surface p-6 text-center text-muted">
          Choose which column holds the {missing.map((role) => ROLE_LABELS[role]).join(" and ")} above and your
          dashboard will appear.
        </p>
      ) : !hasData ? (
        <p role="status" className="rounded-2xl border border-line bg-surface p-6 text-center text-muted">
          None of the {normalized.totalRows.toLocaleString("en-KE")} rows had both a readable date and a readable
          amount. Try different columns above, or check how dates and amounts are written in your file.
        </p>
      ) : (
        <div aria-busy={session.busy} className={session.busy ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <DashboardView
            orders={normalized.orders}
            firstDay={normalized.firstDay as number}
            lastDay={normalized.lastDay as number}
            mapping={computedMapping}
            currency={normalized.currency}
            fileName={session.fileName}
            filters={filters}
            onFilters={onFilters}
          />
        </div>
      )}
    </div>
  );
}
