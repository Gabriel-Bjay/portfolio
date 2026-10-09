import { rankSections, type Ranked } from "./bm25";
import { RETRIEVAL } from "./config";
import type { ChatMessage, Section } from "./types";

/**
 * Ranks sections for the latest question. A one-word question ("parking?") is a fine query on
 * its own, so the previous question is only mixed in when the latest matches nothing, which is
 * what a follow-up like "and on weekends?" usually does.
 */
export function rankForMessages(sections: Section[], messages: ChatMessage[]): Ranked[] {
  const userTexts = messages.filter((m) => m.role === "user").map((m) => m.content);
  const latest = userTexts.at(-1) ?? "";
  const previous = userTexts.at(-2);
  const direct = rankSections(sections, latest);
  if (direct.length > 0 || !previous) return direct;
  return rankSections(sections, `${previous}\n${latest}`);
}

export function contentSize(sections: Section[]): number {
  return sections.reduce((sum, s) => sum + s.title.length + s.body.length, 0);
}

/**
 * Which sections the model sees. A small knowledge base goes in whole (so a Swahili question
 * can still reach English text); a large one is narrowed to the best BM25 matches.
 */
export function selectSections(sections: Section[], messages: ChatMessage[]): Section[] {
  if (sections.length <= RETRIEVAL.sendAllMaxSections && contentSize(sections) <= RETRIEVAL.sendAllMaxChars) {
    return sections;
  }
  return rankForMessages(sections, messages)
    .slice(0, RETRIEVAL.topK)
    .map((r) => r.section);
}
