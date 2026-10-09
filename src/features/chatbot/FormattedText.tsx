import { Fragment } from "react";
import { parseFormatted, type Inline } from "./format";
import type { Source } from "./types";

function Cite({ number, sources }: { number: number; sources: Source[] }) {
  const title = sources[number - 1]?.title;
  return (
    <span
      title={title}
      className="mx-0.5 inline-flex min-w-5 items-center justify-center rounded bg-accent-soft px-1 align-baseline text-[11px] font-semibold leading-5 text-fg"
    >
      <span className="sr-only">Source </span>S{number}
    </span>
  );
}

function Inlines({ nodes, sources }: { nodes: Inline[]; sources: Source[] }) {
  return nodes.map((node, i) => {
    if (node.kind === "text") return <Fragment key={i}>{node.text}</Fragment>;
    if (node.kind === "cite") return <Cite key={i} number={node.number} sources={sources} />;
    return (
      <strong key={i} className="font-semibold">
        <Inlines nodes={node.children} sources={sources} />
      </strong>
    );
  });
}

/**
 * Renders model (or knowledge-base) text through the safe formatter. Everything ends up as a
 * React text node, so markup in the text is displayed, never executed.
 */
export function FormattedText({ text, sources = [] }: { text: string; sources?: Source[] }) {
  const blocks = parseFormatted(text, { sourceCount: sources.length });
  return (
    <div className="space-y-2 [overflow-wrap:anywhere]">
      {blocks.map((block, i) => {
        if (block.kind === "paragraph") {
          return (
            <p key={i}>
              {block.lines.map((line, j) => (
                <Fragment key={j}>
                  {j > 0 && <br />}
                  <Inlines nodes={line} sources={sources} />
                </Fragment>
              ))}
            </p>
          );
        }
        const List = block.ordered ? "ol" : "ul";
        return (
          <List key={i} className={`${block.ordered ? "list-decimal" : "list-disc"} space-y-1 pl-5`}>
            {block.items.map((item, j) => (
              <li key={j}>
                <Inlines nodes={item} sources={sources} />
              </li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
