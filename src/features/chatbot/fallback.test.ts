import { describe, expect, it } from "vitest";
import { chunkKnowledge } from "./chunk";
import { buildFallback, FALLBACK_PREFIX, NO_MATCH_TEXT } from "./fallback";
import type { ChatMessage } from "./types";

const ask = (content: string): ChatMessage[] => [{ role: "user", content }];
const sections = chunkKnowledge("## Hours\nWe open at 8.\n\n## Menu\n- Tea: KES 100\n\n## Contact\nAsk staff.");

describe("buildFallback", () => {
  it("returns the best section with the required prefix and one source", () => {
    const { text, sources } = buildFallback(sections, ask("what time do you open?"));
    expect(text.startsWith(FALLBACK_PREFIX)).toBe(true);
    expect(text).toContain("We open at 8.");
    expect(sources).toEqual([{ id: "S1", title: "Hours" }]);
  });

  it("says so when nothing matches", () => {
    expect(buildFallback(sections, ask("zanzibar"))).toEqual({ text: NO_MATCH_TEXT, sources: [] });
    expect(buildFallback([], ask("hours"))).toEqual({ text: NO_MATCH_TEXT, sources: [] });
  });

  it("truncates a very long section at a line boundary", () => {
    const lines = Array.from({ length: 200 }, (_v, i) => `- Item ${i}: KES ${i}`).join("\n");
    const big = chunkKnowledge(`## Menu\n${lines}\n\n## Other\nx`);
    // Menu is split by the chunker; use a section built directly to exercise the cap.
    const direct = [{ ...big[0], body: lines, title: "Menu" }];
    const { text } = buildFallback(direct, ask("menu item"));
    expect(text.length).toBeLessThan(1_700);
    expect(text.endsWith("…")).toBe(true);
    expect(text).not.toMatch(/- Item \d+: KES$/);
  });
});
