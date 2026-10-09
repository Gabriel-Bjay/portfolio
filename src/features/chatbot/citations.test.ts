import { describe, expect, it } from "vitest";
import { citedNumbers, citedSources } from "./citations";

const sources = [
  { id: "S1", title: "Hours" },
  { id: "S2", title: "Menu" },
  { id: "S3", title: "Delivery" },
];

describe("citedNumbers", () => {
  it("finds single citations in order", () => {
    expect(citedNumbers("Open at 8 [S2]. Closes at 5 [S1].")).toEqual([2, 1]);
  });

  it("dedupes repeated citations", () => {
    expect(citedNumbers("a [S1] b [S1] c [S1]")).toEqual([1]);
  });

  it("handles grouped and adjacent citations", () => {
    expect(citedNumbers("x [S1, S3] y [S2][S3]")).toEqual([1, 3, 2]);
    expect(citedNumbers("x [S1; S2 & S3]")).toEqual([1, 2, 3]);
  });

  it("is case-insensitive about the S", () => {
    expect(citedNumbers("x [s2]")).toEqual([2]);
  });

  it("ignores things that only look similar", () => {
    expect(citedNumbers("S1 without brackets, [S], [SX], [1], (S2), [S1x]")).toEqual([]);
  });

  it("returns an empty list for empty text", () => {
    expect(citedNumbers("")).toEqual([]);
  });
});

describe("citedSources", () => {
  it("maps numbers to titles", () => {
    expect(citedSources("See [S3] and [S1].", sources).map((s) => s.title)).toEqual(["Delivery", "Hours"]);
  });

  it("ignores out-of-range citations", () => {
    expect(citedSources("[S0] [S4] [S99] [S2]", sources).map((s) => s.id)).toEqual(["S2"]);
  });

  it("returns nothing when there are no sources", () => {
    expect(citedSources("[S1]", [])).toEqual([]);
  });
});
