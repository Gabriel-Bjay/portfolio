import { describe, expect, it } from "vitest";
import { cleanLabel, normalizeHexColor, readableForeground } from "./embed-params";

describe("normalizeHexColor", () => {
  it.each([
    ["0f766e", "#0f766e"],
    ["#0F766E", "#0f766e"],
    ["#0f7", "#00ff77"],
    [" 123abc ", "#123abc"],
  ])("accepts %j", (input, expected) => expect(normalizeHexColor(input)).toBe(expected));

  it.each([null, undefined, "", "red", "#12", "#12345", "#1234567", "0f766e;background:red", "url(x)", "#ggg"])(
    "rejects %j",
    (input) => expect(normalizeHexColor(input)).toBeNull(),
  );
});

describe("readableForeground", () => {
  it("uses white on dark colours and near-black on light ones", () => {
    expect(readableForeground("#0f766e")).toBe("#ffffff");
    expect(readableForeground("#000000")).toBe("#ffffff");
    expect(readableForeground("#ffffff")).toBe("#111111");
    expect(readableForeground("#fde047")).toBe("#111111");
  });
});

describe("cleanLabel", () => {
  it("collapses whitespace, strips control characters and bounds length", () => {
    expect(cleanLabel("  Twiga \n\t Brew  ", "x")).toBe("Twiga Brew");
    expect(cleanLabel("a".repeat(100), "x")).toHaveLength(40);
  });

  it("falls back when empty", () => {
    expect(cleanLabel("   ", "Jibu")).toBe("Jibu");
    expect(cleanLabel(null, "Jibu")).toBe("Jibu");
  });

  it("leaves markup as text for React to escape", () => {
    expect(cleanLabel("<b>x</b>", "d")).toBe("<b>x</b>");
  });
});
