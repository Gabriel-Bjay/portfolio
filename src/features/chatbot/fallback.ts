import { rankForMessages } from "./retrieve";
import type { ChatMessage, Section, Source } from "./types";

export const FALLBACK_PREFIX = "I can't reach the AI right now, so here is the most relevant part of our info:";
export const NO_MATCH_TEXT =
  "I can't reach the AI right now, and I couldn't find anything about that in our info. Please ask a member of staff.";

const MAX_BODY_CHARS = 1_500;

function truncateAtLine(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const cut = head.lastIndexOf("\n");
  return `${(cut > max / 2 ? head.slice(0, cut) : head).trimEnd()}\n…`;
}

/** The offline answer: the best-matching section, shown as is. Never calls the model. */
export function buildFallback(sections: Section[], messages: ChatMessage[]): { text: string; sources: Source[] } {
  const top = rankForMessages(sections, messages)[0]?.section;
  if (!top) return { text: NO_MATCH_TEXT, sources: [] };
  return {
    text: `${FALLBACK_PREFIX}\n\n**${top.title}**\n\n${truncateAtLine(top.body, MAX_BODY_CHARS)}`,
    sources: [{ id: "S1", title: top.title }],
  };
}
