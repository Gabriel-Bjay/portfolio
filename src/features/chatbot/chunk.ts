import { RETRIEVAL } from "./config";
import type { Section } from "./types";

const HEADING = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/;
const FENCE = /^ {0,3}(```|~~~)/;
const KEYWORDS_COMMENT = /<!--\s*keywords:([\s\S]*?)-->/gi;
const MAX_TITLE_CHARS = 80;

type RawSection = { title: string; lines: string[] };

/** Plain-text title: no markdown emphasis, single line, bounded length. */
function cleanTitle(raw: string): string {
  const flat = raw.replace(/[*_`~]+/g, "").replace(/\s+/g, " ").trim();
  return flat.length > MAX_TITLE_CHARS ? `${flat.slice(0, MAX_TITLE_CHARS - 1).trimEnd()}…` : flat;
}

/** Splits at markdown headings (any level), ignoring "#" lines inside code fences.
 *  Text before the first heading becomes an "Overview" section. */
function splitByHeadings(text: string): { raw: RawSection[]; headingCount: number } {
  const raw: RawSection[] = [{ title: "Overview", lines: [] }];
  let headingCount = 0;
  let inFence = false;
  for (const line of text.split("\n")) {
    if (FENCE.test(line)) inFence = !inFence;
    const heading = inFence ? null : HEADING.exec(line);
    if (heading) {
      headingCount += 1;
      raw.push({ title: cleanTitle(heading[2]) || "Untitled", lines: [] });
    } else {
      raw[raw.length - 1].lines.push(line);
    }
  }
  return { raw, headingCount };
}

/** Pulls `<!-- keywords: a, b -->` comments out of a body. They help retrieval (for example
 *  Swahili synonyms for an English FAQ) but are not content people should read. */
function extractKeywords(body: string): { body: string; keywords: string } {
  const found: string[] = [];
  const stripped = body.replace(KEYWORDS_COMMENT, (_all, list: string) => {
    found.push(list.trim());
    return "";
  });
  return { body: stripped.trim(), keywords: found.join(" ") };
}

/** Breaks one over-long block at line, then sentence, then word boundaries. */
function splitLongBlock(block: string, max: number): string[] {
  const pieces: string[] = [];
  for (const line of block.split("\n")) {
    if (line.length <= max) {
      pieces.push(line);
      continue;
    }
    for (const sentence of line.split(/(?<=[.!?])\s+/)) {
      let rest = sentence;
      while (rest.length > max) {
        const space = rest.lastIndexOf(" ", max);
        const cut = space > max / 2 ? space : max;
        pieces.push(rest.slice(0, cut).trimEnd());
        rest = rest.slice(cut).trimStart();
      }
      if (rest) pieces.push(rest);
    }
  }
  return pieces;
}

/** Greedily packs paragraphs into chunks of at most `max` characters. */
function packParagraphs(text: string, max: number): string[] {
  const blocks = text
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)
    .flatMap((b) => (b.length > max ? splitLongBlock(b, max) : [b]));
  const chunks: string[] = [];
  let current = "";
  for (const block of blocks) {
    const joined = current ? `${current}\n\n${block}` : block;
    if (joined.length <= max || !current) {
      current = joined;
    } else {
      chunks.push(current);
      current = block;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** First line of a chunk as a short title, for knowledge without headings. */
function titleFromText(text: string): string {
  const firstLine = text.split("\n").find((l) => l.trim()) ?? "";
  const plain = firstLine.replace(/^[\s>#*\-•\d.)]+/, "");
  const words = cleanTitle(plain);
  if (words.length <= 48) return words || "Info";
  const cut = words.slice(0, 48);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 24)).trimEnd()}…`;
}

function withIds(parts: Omit<Section, "id">[]): Section[] {
  return parts.map((p, i) => ({ id: `sec-${i + 1}`, ...p }));
}

/**
 * Turns a markdown knowledge base into retrievable sections.
 * - Two or more headings: one section per heading; oversize sections are split.
 * - Otherwise: paragraphs packed into chunks of about 600 characters.
 */
export function chunkKnowledge(markdown: string): Section[] {
  const text = markdown.replace(/^﻿/, "").replace(/\r\n?/g, "\n").trim();
  if (!text) return [];

  const { raw, headingCount } = splitByHeadings(text);

  if (headingCount < 2) {
    const { body } = extractKeywords(text.replace(/^ {0,3}#{1,6}[ \t]+/gm, ""));
    return withIds(
      packParagraphs(body, RETRIEVAL.paragraphChunkChars).map((chunk) => ({
        title: titleFromText(chunk),
        body: chunk,
        keywords: "",
      })),
    );
  }

  const parts: Omit<Section, "id">[] = [];
  for (const section of raw) {
    const { body, keywords } = extractKeywords(section.lines.join("\n"));
    if (!body) continue;
    const chunks = body.length > RETRIEVAL.maxSectionChars ? packParagraphs(body, RETRIEVAL.maxSectionChars) : [body];
    chunks.forEach((chunk, i) => {
      parts.push({
        title: chunks.length > 1 ? `${section.title} (${i + 1}/${chunks.length})` : section.title,
        body: chunk,
        keywords,
      });
    });
  }
  return withIds(parts);
}
