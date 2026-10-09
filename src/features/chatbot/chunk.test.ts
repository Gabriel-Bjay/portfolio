import { describe, expect, it } from "vitest";
import { chunkKnowledge } from "./chunk";
import { RETRIEVAL } from "./config";

describe("chunkKnowledge (headings)", () => {
  const md = "## Hours\nOpen 8 to 5.\n\n## Menu\n- Tea: KES 100\n- Coffee: KES 200\n";

  it("splits on headings and keeps bodies", () => {
    const sections = chunkKnowledge(md);
    expect(sections.map((s) => s.title)).toEqual(["Hours", "Menu"]);
    expect(sections[0].body).toBe("Open 8 to 5.");
    expect(sections[1].body).toContain("- Coffee: KES 200");
    expect(sections.map((s) => s.id)).toEqual(["sec-1", "sec-2"]);
  });

  it("treats every heading level as a boundary", () => {
    const sections = chunkKnowledge("# Shop\n\n## Hours\nA\n\n### Sunday\nB");
    expect(sections.map((s) => s.title)).toEqual(["Hours", "Sunday"]);
  });

  it("keeps text before the first heading as Overview", () => {
    const sections = chunkKnowledge("Welcome to the shop.\n\n## Hours\nA\n\n## Menu\nB");
    expect(sections.map((s) => s.title)).toEqual(["Overview", "Hours", "Menu"]);
  });

  it("drops headings that have no body", () => {
    const sections = chunkKnowledge("# Title only\n\n## Hours\nA\n\n## Menu\nB");
    expect(sections.map((s) => s.title)).toEqual(["Hours", "Menu"]);
  });

  it("ignores # lines inside code fences", () => {
    const sections = chunkKnowledge("## Code\n```\n# not a heading\n```\n\n## Next\nx");
    expect(sections).toHaveLength(2);
    expect(sections[0].body).toContain("# not a heading");
  });

  it("extracts keyword comments out of the body", () => {
    const [first] = chunkKnowledge("## Hours\n<!-- keywords: saa, fungua -->\nOpen 8.\n\n## B\nx");
    expect(first.body).toBe("Open 8.");
    expect(first.keywords).toBe("saa, fungua");
  });

  it("strips emphasis from titles and bounds their length", () => {
    const long = "x".repeat(300);
    const sections = chunkKnowledge(`## **Opening** _hours_\nA\n\n## ${long}\nB`);
    expect(sections[0].title).toBe("Opening hours");
    expect(sections[1].title.length).toBeLessThanOrEqual(80);
  });

  it("splits over-long sections and numbers the parts", () => {
    const para = "word ".repeat(100).trim(); // ~500 chars
    const body = Array.from({ length: 8 }, () => para).join("\n\n");
    const sections = chunkKnowledge(`## Big\n${body}\n\n## Small\nok`);
    const big = sections.filter((s) => s.title.startsWith("Big"));
    expect(big.length).toBeGreaterThan(1);
    expect(big[0].title).toBe(`Big (1/${big.length})`);
    for (const s of big) expect(s.body.length).toBeLessThanOrEqual(RETRIEVAL.maxSectionChars);
    expect(sections.at(-1)?.title).toBe("Small");
  });

  it("handles Windows line endings and a BOM", () => {
    const sections = chunkKnowledge("﻿## A\r\nx\r\n\r\n## B\r\ny");
    expect(sections.map((s) => s.title)).toEqual(["A", "B"]);
    expect(sections[0].body).toBe("x");
  });

  it("keeps unicode intact", () => {
    const [first] = chunkKnowledge("## Kahawa ☕\nBei: shilingi 300 😀\n\n## B\nx");
    expect(first.title).toBe("Kahawa ☕");
    expect(first.body).toContain("😀");
  });
});

describe("chunkKnowledge (no headings)", () => {
  it("returns nothing for empty or whitespace input", () => {
    expect(chunkKnowledge("")).toEqual([]);
    expect(chunkKnowledge("  \n\n \t ")).toEqual([]);
  });

  it("returns one chunk for a short paragraph, titled from its first words", () => {
    const sections = chunkKnowledge("We deliver to Kilimani and Lavington every day.");
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe("We deliver to Kilimani and Lavington every day.");
  });

  it("packs paragraphs into chunks of about 600 characters", () => {
    const para = `Paragraph about topic. ${"filler words here ".repeat(10)}`.trim(); // ~190 chars
    const text = Array.from({ length: 12 }, (_v, i) => `${i + 1}. ${para}`).join("\n\n");
    const sections = chunkKnowledge(text);
    expect(sections.length).toBeGreaterThan(2);
    for (const s of sections) expect(s.body.length).toBeLessThanOrEqual(RETRIEVAL.paragraphChunkChars);
    // Nothing is lost.
    expect(sections.map((s) => s.body).join("\n\n")).toBe(text);
  });

  it("splits a single giant paragraph and never exceeds the limit", () => {
    const text = "This is a sentence about delivery. ".repeat(200).trim();
    const sections = chunkKnowledge(text);
    expect(sections.length).toBeGreaterThan(5);
    for (const s of sections) expect(s.body.length).toBeLessThanOrEqual(RETRIEVAL.paragraphChunkChars);
  });

  it("hard-splits text with no spaces", () => {
    const sections = chunkKnowledge("a".repeat(2_000));
    expect(sections.length).toBe(4);
    for (const s of sections) expect(s.body.length).toBeLessThanOrEqual(RETRIEVAL.paragraphChunkChars);
  });

  it("treats a single heading as ordinary text", () => {
    const sections = chunkKnowledge("# FAQ\n\nWe open at 8.\n\nWe close at 5.");
    expect(sections).toHaveLength(1);
    expect(sections[0].body).toContain("We open at 8.");
    expect(sections[0].body).not.toContain("#");
  });

  it("truncates long first lines in titles with an ellipsis", () => {
    const [s] = chunkKnowledge("Our delivery service covers the whole of Westlands and Parklands on weekdays");
    expect(s.title.length).toBeLessThanOrEqual(49);
    expect(s.title.endsWith("…")).toBe(true);
  });
});
