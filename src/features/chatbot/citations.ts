import type { Source } from "./types";

// A citation is a bracketed group of section labels: [S2], [S1, S3] or [S1][S2].
const BRACKET_GROUP = /\[\s*(S\d{1,3}(?:\s*[,;&]\s*S\d{1,3})*)\s*\]/gi;
const LABEL = /S(\d{1,3})/gi;

/** Section numbers cited in `text`, in order of first appearance, without duplicates. */
export function citedNumbers(text: string): number[] {
  const seen = new Set<number>();
  for (const group of text.matchAll(BRACKET_GROUP)) {
    for (const label of group[1].matchAll(LABEL)) seen.add(Number(label[1]));
  }
  return [...seen];
}

/** Maps citations like [S2] to the sources of this request. Out-of-range numbers (a model
 *  inventing [S9]) are ignored. */
export function citedSources(text: string, sources: Source[]): Source[] {
  const result: Source[] = [];
  for (const n of citedNumbers(text)) {
    const source = n >= 1 ? sources[n - 1] : undefined;
    if (source) result.push(source);
  }
  return result;
}
