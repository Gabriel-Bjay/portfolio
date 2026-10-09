import { describe, expect, it } from "vitest";
import { rankSections } from "./bm25";
import { chunkKnowledge } from "./chunk";
import type { Section } from "./types";

const section = (title: string, body: string, keywords = ""): Section => ({
  id: title,
  title,
  body,
  keywords,
});

describe("rankSections", () => {
  const sections = [
    section("Hours", "We open at 8 and close at 5 every day."),
    section("Menu", "Tea costs 100. Coffee costs 200."),
    section("Delivery", "We deliver to Kilimani for 250 shillings."),
  ];

  it("ranks the relevant section first", () => {
    expect(rankSections(sections, "when do you open?")[0].section.title).toBe("Hours");
    expect(rankSections(sections, "how much is coffee")[0].section.title).toBe("Menu");
    expect(rankSections(sections, "Do you deliver to Kilimani?")[0].section.title).toBe("Delivery");
  });

  it("returns only sections that share a term with the query", () => {
    const result = rankSections(sections, "coffee");
    expect(result.map((r) => r.section.title)).toEqual(["Menu"]);
  });

  it("returns nothing for empty, stopword-only or unmatched queries", () => {
    expect(rankSections(sections, "")).toEqual([]);
    expect(rankSections(sections, "what is the")).toEqual([]);
    expect(rankSections(sections, "zanzibar")).toEqual([]);
    expect(rankSections([], "coffee")).toEqual([]);
  });

  it("weights title matches above body matches", () => {
    const docs = [
      section("Parking", "Free for two hours, mention delivery riders."),
      section("Delivery", "We bring orders to your door."),
    ];
    expect(rankSections(docs, "delivery")[0].section.title).toBe("Delivery");
  });

  it("uses keywords so Swahili can reach English text", () => {
    const docs = [
      section("Hours", "We close at 9pm.", "mnafunga saa ngapi"),
      section("Menu", "Tea costs 100."),
    ];
    expect(rankSections(docs, "Mnafunga saa ngapi?")[0].section.title).toBe("Hours");
  });

  it("is rare-term aware: a rare word beats a common one", () => {
    const docs = [
      section("A", "common common common common"),
      section("B", "common rareword"),
      section("C", "common again"),
    ];
    expect(rankSections(docs, "common rareword")[0].section.title).toBe("B");
  });

  it("breaks ties by document order", () => {
    const docs = [section("One", "alpha"), section("Two", "alpha")];
    expect(rankSections(docs, "alpha").map((r) => r.section.title)).toEqual(["One", "Two"]);
  });

  it("handles one very large section without NaN scores", () => {
    const docs = [section("Big", "alpha ".repeat(20_000)), section("Small", "beta")];
    const [top] = rankSections(docs, "alpha");
    expect(Number.isFinite(top.score)).toBe(true);
  });

  it("scores are positive and sorted descending", () => {
    const result = rankSections(sections, "we coffee open deliver");
    for (const r of result) expect(r.score).toBeGreaterThan(0);
    const scores = result.map((r) => r.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("ranks paragraph chunks of knowledge without headings", () => {
    const docs = chunkKnowledge(
      `${"Our refund policy is simple. ".repeat(30)}\n\n${"Parking is behind the building. ".repeat(30)}`,
    );
    expect(docs.length).toBeGreaterThan(1);
    expect(rankSections(docs, "where is parking")[0].section.body).toContain("Parking");
  });
});
