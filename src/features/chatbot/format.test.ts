import { describe, expect, it } from "vitest";
import { parseFormatted, type Block, type Inline } from "./format";

const parse = (text: string, sourceCount = 3) => parseFormatted(text, { sourceCount });
const t = (text: string): Inline => ({ kind: "text", text });

describe("parseFormatted", () => {
  it("returns nothing for empty text", () => {
    expect(parse("")).toEqual([]);
    expect(parse("  \n\n \n")).toEqual([]);
  });

  it("keeps plain text as one paragraph", () => {
    expect(parse("Hello there")).toEqual([{ kind: "paragraph", lines: [[t("Hello there")]] }]);
  });

  it("turns single newlines into line breaks and blank lines into new paragraphs", () => {
    const blocks = parse("one\ntwo\n\nthree");
    expect(blocks).toEqual([
      { kind: "paragraph", lines: [[t("one")], [t("two")]] },
      { kind: "paragraph", lines: [[t("three")]] },
    ]);
  });

  it("parses **bold**", () => {
    expect(parse("We **open** at 8")).toEqual([
      {
        kind: "paragraph",
        lines: [[t("We "), { kind: "bold", children: [t("open")] }, t(" at 8")]],
      },
    ]);
  });

  it("leaves an unclosed ** as literal text (streaming)", () => {
    expect(parse("We **open")).toEqual([{ kind: "paragraph", lines: [[t("We **open")]] }]);
  });

  it("parses bulleted and numbered lists", () => {
    expect(parse("Menu:\n- Tea\n- Coffee")).toEqual([
      { kind: "paragraph", lines: [[t("Menu:")]] },
      { kind: "list", ordered: false, items: [[t("Tea")], [t("Coffee")]] },
    ]);
    expect(parse("1. First\n2) Second")).toEqual([
      { kind: "list", ordered: true, items: [[t("First")], [t("Second")]] },
    ]);
    expect(parse("* star\n• dot")).toEqual([{ kind: "list", ordered: false, items: [[t("star")], [t("dot")]] }]);
  });

  it("splits lists when the style changes and resumes paragraphs after a list", () => {
    const blocks = parse("- a\n1. b\nafter");
    expect(blocks.map((b: Block) => b.kind)).toEqual(["list", "list", "paragraph"]);
  });

  it("does not mistake **bold** at the start of a line for a bullet", () => {
    const [block] = parse("**Hours**");
    expect(block.kind).toBe("paragraph");
  });

  it("shows markdown headings as bold lines", () => {
    expect(parse("## Opening hours")).toEqual([
      { kind: "paragraph", lines: [[{ kind: "bold", children: [t("Opening hours")] }]] },
    ]);
  });

  it("turns [S1] into a citation chip and handles groups", () => {
    expect(parse("Open at 8 [S1].")).toEqual([
      { kind: "paragraph", lines: [[t("Open at 8 "), { kind: "cite", number: 1 }, t(".")]] },
    ]);
    const [block] = parse("x [S1, S3] y [S2][S3]");
    const cites = (block as Extract<Block, { kind: "paragraph" }>).lines[0].filter((n) => n.kind === "cite");
    expect(cites.map((c) => (c.kind === "cite" ? c.number : 0))).toEqual([1, 3, 2, 3]);
  });

  it("drops citations to sources that do not exist", () => {
    const [block] = parse("a [S0] b [S4] c [S99]");
    const line = (block as Extract<Block, { kind: "paragraph" }>).lines[0];
    expect(line.some((n) => n.kind === "cite")).toBe(false);
    expect(parse("a [S1]", 0)).toEqual([{ kind: "paragraph", lines: [[t("a ")]] }]);
  });

  it("allows a citation inside bold and inside list items", () => {
    const [block] = parse("- **Open** [S2]");
    expect(block).toEqual({
      kind: "list",
      ordered: false,
      items: [[{ kind: "bold", children: [t("Open")] }, t(" "), { kind: "cite", number: 2 }]],
    });
  });

  it("handles Windows line endings", () => {
    expect(parse("a\r\n\r\nb")).toHaveLength(2);
  });

  it("keeps unicode", () => {
    expect(parse("Karibu! 😀 Habari")[0]).toEqual({ kind: "paragraph", lines: [[t("Karibu! 😀 Habari")]] });
  });

  // XSS: the output has no HTML, links or attributes. Hostile text can only ever be text.
  it("never produces anything but text, bold and cite nodes for hostile input", () => {
    const hostile = [
      '<script>alert(1)</script>',
      '<img src=x onerror="alert(1)">',
      "[click](javascript:alert(1))",
      '<a href="javascript:alert(1)">x</a>',
      "**<b onmouseover=alert(1)>bold</b>**",
      "- <iframe src=//evil></iframe>",
      "&lt;script&gt;",
    ].join("\n");
    const seen = new Set<string>();
    const walk = (nodes: Inline[]) =>
      nodes.forEach((n) => {
        seen.add(n.kind);
        if (n.kind === "bold") walk(n.children);
      });
    for (const block of parse(hostile)) {
      if (block.kind === "paragraph") block.lines.forEach(walk);
      else block.items.forEach(walk);
    }
    expect([...seen].sort()).toEqual(["bold", "text"]);
    const joined = JSON.stringify(parse(hostile));
    expect(joined).toContain("<script>alert(1)</script>"); // preserved as inert text
  });

  it("copes with a pathological amount of markers quickly", () => {
    const text = "**a** ".repeat(5_000) + "[S1]".repeat(5_000);
    const start = Date.now();
    parse(text);
    expect(Date.now() - start).toBeLessThan(1_000);
  });
});
