import { describe, expect, it } from "vitest";
import { RETRIEVAL } from "./config";
import { rankForMessages, selectSections } from "./retrieve";
import type { ChatMessage, Section } from "./types";

const user = (content: string): ChatMessage => ({ role: "user", content });
const bot = (content: string): ChatMessage => ({ role: "assistant", content });

const make = (count: number, bodyLength: number): Section[] =>
  Array.from({ length: count }, (_v, i) => ({
    id: `sec-${i + 1}`,
    title: `Topic ${i + 1}`,
    body: `${i === 3 ? "needle " : ""}${"x".repeat(bodyLength)}`,
    keywords: "",
  }));

describe("selectSections", () => {
  it("sends every section when the knowledge is small", () => {
    const sections = make(15, 500);
    expect(selectSections(sections, [user("anything at all")])).toBe(sections);
  });

  it("narrows to the top 6 matches when the knowledge is large", () => {
    const sections = make(30, 600); // ~18,000 chars
    const picked = selectSections(sections, [user("needle")]);
    expect(picked.length).toBeLessThanOrEqual(RETRIEVAL.topK);
    expect(picked[0].title).toBe("Topic 4");
  });

  it("narrows when there are very many tiny sections", () => {
    const sections = make(RETRIEVAL.sendAllMaxSections + 1, 5);
    expect(selectSections(sections, [user("needle")]).length).toBeLessThanOrEqual(RETRIEVAL.topK);
  });

  it("sends nothing when a large knowledge base has no match", () => {
    expect(selectSections(make(30, 600), [user("zanzibar")])).toEqual([]);
  });

  it("treats exactly the size limit as small", () => {
    const sections: Section[] = [
      { id: "a", title: "T", body: "x".repeat(RETRIEVAL.sendAllMaxChars - 1), keywords: "" },
    ];
    expect(selectSections(sections, [user("q")])).toBe(sections);
  });
});

describe("rankForMessages", () => {
  const sections: Section[] = [
    { id: "a", title: "Parking", body: "Free parking behind the building.", keywords: "" },
    { id: "b", title: "Delivery", body: "We deliver to Kilimani. Delivery is free above 2000.", keywords: "" },
    { id: "c", title: "Hours", body: "We open at 8 on Sunday.", keywords: "" },
  ];

  it("ranks on the latest question", () => {
    const ranked = rankForMessages(sections, [user("do you deliver"), bot("yes"), user("what time do you open")]);
    expect(ranked[0].section.title).toBe("Hours");
  });

  it("lets a one-word question stand on its own instead of dragging the previous topic in", () => {
    const ranked = rankForMessages(sections, [user("do you deliver to Kilimani"), bot("yes"), user("where is parking")]);
    expect(ranked[0].section.title).toBe("Parking");
  });

  it("falls back to the previous question when the latest matches nothing", () => {
    const ranked = rankForMessages(sections, [user("do you deliver"), bot("yes"), user("and on weekends?")]);
    expect(ranked[0].section.title).toBe("Delivery");
  });

  it("copes with a single message and with no user messages", () => {
    expect(rankForMessages(sections, [user("parking")])[0].section.title).toBe("Parking");
    expect(rankForMessages(sections, [user("zanzibar")])).toEqual([]);
    expect(rankForMessages(sections, [bot("hi")])).toEqual([]);
  });
});
