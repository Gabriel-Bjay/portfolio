import { tokenize } from "./tokenize";
import type { Section } from "./types";

export type Ranked = { section: Section; score: number; index: number };

const K1 = 1.5;
const B = 0.75;
/** Section titles are the strongest signal of what a section is about. */
const TITLE_WEIGHT = 2;

function documentTokens(section: Section): string[] {
  const title = tokenize(section.title);
  const tokens: string[] = [];
  for (let i = 0; i < TITLE_WEIGHT; i += 1) tokens.push(...title);
  tokens.push(...tokenize(section.body), ...tokenize(section.keywords));
  return tokens;
}

/**
 * Okapi BM25 over sections. Returns only sections that share at least one term with the
 * query, best first; ties keep document order so results are deterministic.
 */
export function rankSections(sections: Section[], query: string): Ranked[] {
  const queryTerms = [...new Set(tokenize(query))];
  if (queryTerms.length === 0 || sections.length === 0) return [];

  const docs = sections.map(documentTokens);
  const avgLength = docs.reduce((sum, d) => sum + d.length, 0) / docs.length || 1;

  const documentFrequency = new Map<string, number>();
  const termCounts = docs.map((tokens) => {
    const counts = new Map<string, number>();
    for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
    for (const t of counts.keys()) documentFrequency.set(t, (documentFrequency.get(t) ?? 0) + 1);
    return counts;
  });

  const n = sections.length;
  const ranked: Ranked[] = [];
  termCounts.forEach((counts, index) => {
    let score = 0;
    const lengthNorm = 1 - B + B * (docs[index].length / avgLength);
    for (const term of queryTerms) {
      const tf = counts.get(term);
      if (!tf) continue;
      const df = documentFrequency.get(term) ?? 0;
      const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
      score += idf * ((tf * (K1 + 1)) / (tf + K1 * lengthNorm));
    }
    if (score > 0) ranked.push({ section: sections[index], score, index });
  });

  return ranked.sort((a, b) => b.score - a.score || a.index - b.index);
}
