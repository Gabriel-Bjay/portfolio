import { FormattedText } from "./FormattedText";
import type { Section } from "./types";

type Props = {
  sections: Section[];
  /** Whose knowledge this is, e.g. "Twiga Brew Café (fictional demo business)". */
  owner: string;
};

/** Read-only view of what the assistant knows, one collapsible block per section. */
export function KnowledgeViewer({ sections, owner }: Props) {
  return (
    <section aria-labelledby="kb-heading" className="space-y-3">
      <div>
        <h2 id="kb-heading" className="text-lg font-semibold">
          Knowledge base
        </h2>
        <p className="text-sm text-muted">
          {owner} · {sections.length} {sections.length === 1 ? "section" : "sections"}. Jibu answers only from this text.
        </p>
      </div>
      <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {sections.map((s, i) => (
          <details key={s.id} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
              <span className="min-w-0 [overflow-wrap:anywhere]">
                <span className="text-muted">S{i + 1}</span> {s.title}
              </span>
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                className="size-4 shrink-0 text-muted transition-transform group-open:rotate-90"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m7 4 6 6-6 6" />
              </svg>
            </summary>
            <div className="px-4 pb-4 text-sm text-fg">
              <FormattedText text={s.body} />
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
