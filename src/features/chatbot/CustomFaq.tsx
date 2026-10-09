"use client";

import { useId, useMemo, useState } from "react";
import { chunkKnowledge } from "./chunk";
import { LIMITS } from "./config";
import { SAMPLE_FAQ } from "./suggestions";

type Props = {
  /** The FAQ currently in use, or null for the built-in café. */
  active: string | null;
  sectionCount: number;
  onApply: (faq: string) => void;
  onReset: () => void;
};

export function CustomFaq({ active, sectionCount, onApply, onReset }: Props) {
  const [draft, setDraft] = useState("");
  const textId = useId();
  const hintId = useId();
  // Text made only of headings or comments has nothing to answer from.
  const usable = useMemo(() => chunkKnowledge(draft).length > 0, [draft]);
  const nearLimit = draft.length >= LIMITS.maxKnowledgeChars - 500;

  return (
    <section aria-labelledby="faq-heading" className="space-y-3">
      <div>
        <h2 id="faq-heading" className="text-lg font-semibold">
          Try it with your own FAQ
        </h2>
        <p className="text-sm text-muted">
          Paste your business info. Jibu will answer from it instead of the café, until you reset. Nothing is saved; it
          lasts only while this page is open.
        </p>
      </div>

      <div>
        <label htmlFor={textId} className="mb-1 block text-sm font-medium">
          Your FAQ or business info
        </label>
        <textarea
          id={textId}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={LIMITS.maxKnowledgeChars}
          rows={6}
          aria-describedby={hintId}
          placeholder={"## Opening hours\nWe are open 9 to 5, Monday to Friday.\n\n## Returns\nReturns are accepted within 14 days."}
          className="w-full rounded-xl border border-line bg-surface px-3 py-2 font-mono text-sm text-fg placeholder:text-muted"
        />
        <p id={hintId} className="mt-1 flex justify-between gap-3 text-xs text-muted">
          <span>Tip: use headings (##) to split topics into sections.</span>
          <span className={nearLimit ? "text-warning" : undefined}>
            {draft.length.toLocaleString("en-US")}/{LIMITS.maxKnowledgeChars.toLocaleString("en-US")}
          </span>
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!usable}
          onClick={() => onApply(draft)}
          className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 active:scale-95"
        >
          Use my FAQ
        </button>
        <button
          type="button"
          onClick={() => setDraft(SAMPLE_FAQ)}
          className="rounded-xl border border-line px-4 py-2 text-sm font-medium hover:bg-surface-2"
        >
          Fill with an example
        </button>
        <button
          type="button"
          disabled={active === null}
          onClick={() => {
            setDraft("");
            onReset();
          }}
          className="rounded-xl border border-line px-4 py-2 text-sm font-medium hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Reset to Twiga Brew
        </button>
      </div>

      <p role="status" className="text-sm text-muted">
        {active === null
          ? "Currently answering from Twiga Brew Café (fictional demo business)."
          : `Now answering from your FAQ (${sectionCount} ${sectionCount === 1 ? "section" : "sections"}). The chat was reset.`}
      </p>
    </section>
  );
}
