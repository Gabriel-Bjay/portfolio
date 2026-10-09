import { describe, expect, it } from "vitest";
import { tokenize } from "./tokenize";

describe("tokenize", () => {
  it("lowercases, strips punctuation and drops English stopwords", () => {
    // Stems are an internal detail ("time" -> "tim"), so compare against the same words alone.
    expect(tokenize("What time do you OPEN on Sunday?!")).toEqual(
      ["time", "open", "sunday"].flatMap((w) => tokenize(w)),
    );
    expect(tokenize("What time do you OPEN on Sunday?!")).toHaveLength(3);
  });

  it("drops Swahili stopwords but keeps meaningful words", () => {
    expect(tokenize("Mnafunga saa ngapi?")).toEqual(["mnafunga", "saa"]);
  });

  it("makes open / opens / opening meet", () => {
    const stems = ["open", "opens", "opening"].map((w) => tokenize(w)[0]);
    expect(new Set(stems).size).toBe(1);
  });

  it("makes close / closes / closing meet", () => {
    const stems = ["close", "closes", "closing"].map((w) => tokenize(w)[0]);
    expect(new Set(stems).size).toBe(1);
  });

  it("handles plurals", () => {
    expect(tokenize("prices")).toEqual(tokenize("price"));
    expect(tokenize("boxes")).toEqual(tokenize("box"));
    expect(tokenize("cities")).toEqual(tokenize("city"));
  });

  it("emits the joined form of hyphenated words", () => {
    expect(tokenize("M-Pesa")).toContain(tokenize("mpesa")[0]);
    expect(tokenize("mpesa")).toEqual(["mpesa"]);
  });

  it("strips accents", () => {
    expect(tokenize("Café")).toEqual(tokenize("cafe"));
  });

  it("drops one-letter tokens and apostrophe fragments", () => {
    expect(tokenize("what's a 5 b")).toEqual([]);
  });

  it("returns an empty list for empty or symbol-only input", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("   ?!… ---")).toEqual([]);
  });

  it("keeps unicode letters and numbers", () => {
    expect(tokenize("Kahawa ya 日本語 2024")).toEqual(["kahawa", "日本語", "2024"]);
  });

  it("does not crash on very long input", () => {
    const text = "word ".repeat(50_000);
    expect(tokenize(text)).toHaveLength(50_000);
  });
});
