// A deliberately tiny formatter for model output: **bold**, "- " / "1. " lists, line breaks and
// [S1] citation chips. It produces a plain data structure that React renders as text nodes, so
// there is no HTML string anywhere and nothing the model writes can become markup.

export type CiteNode = { kind: "cite"; number: number };
export type TextNode = { kind: "text"; text: string };
export type BoldNode = { kind: "bold"; children: (TextNode | CiteNode)[] };
export type Inline = TextNode | CiteNode | BoldNode;

export type Block =
  | { kind: "paragraph"; lines: Inline[][] }
  | { kind: "list"; ordered: boolean; items: Inline[][] };

// A citation group such as [S1], [S1, S3] or [S2][S3] (the latter is two groups).
const CITE_GROUP = String.raw`\[\s*(S\d{1,3}(?:\s*[,;&]\s*S\d{1,3})*)\s*\]`;
const INLINE = new RegExp(String.raw`\*\*(.+?)\*\*|${CITE_GROUP}`, "gi");
const CITE_ONLY = new RegExp(CITE_GROUP, "gi");
const BULLET = /^ {0,3}[-*•][ \t]+(.*)$/;
const NUMBERED = /^ {0,3}\d{1,3}[.)][ \t]+(.*)$/;
const HEADING = /^ {0,3}#{1,6}[ \t]+(.*)$/;

function citeNodes(group: string, sourceCount: number): CiteNode[] {
  const nodes: CiteNode[] = [];
  for (const m of group.matchAll(/S(\d{1,3})/gi)) {
    const number = Number(m[1]);
    // A model can invent [S9]; showing a chip for a source that does not exist would mislead.
    if (number >= 1 && number <= sourceCount) nodes.push({ kind: "cite", number });
  }
  return nodes;
}

function parseCitesAndText(text: string, sourceCount: number): (TextNode | CiteNode)[] {
  const out: (TextNode | CiteNode)[] = [];
  let last = 0;
  for (const m of text.matchAll(CITE_ONLY)) {
    if (m.index > last) out.push({ kind: "text", text: text.slice(last, m.index) });
    out.push(...citeNodes(m[1], sourceCount));
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

function parseInline(line: string, sourceCount: number): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of line.matchAll(INLINE)) {
    if (m.index > last) out.push({ kind: "text", text: line.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ kind: "bold", children: parseCitesAndText(m[1], sourceCount) });
    else out.push(...citeNodes(m[2], sourceCount));
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ kind: "text", text: line.slice(last) });
  return out;
}

/** `sourceCount` is how many sources this answer has; citations beyond it are dropped. */
export function parseFormatted(text: string, { sourceCount }: { sourceCount: number }): Block[] {
  const blocks: Block[] = [];
  let paragraph: Inline[][] | null = null;
  let list: { ordered: boolean; items: Inline[][] } | null = null;

  const flush = () => {
    if (paragraph) blocks.push({ kind: "paragraph", lines: paragraph });
    if (list) blocks.push({ kind: "list", ordered: list.ordered, items: list.items });
    paragraph = null;
    list = null;
  };

  for (const rawLine of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (!rawLine.trim()) {
      flush();
      continue;
    }
    const bullet = BULLET.exec(rawLine);
    const numbered = bullet ? null : NUMBERED.exec(rawLine);
    const item = bullet ?? numbered;
    if (item) {
      const ordered = numbered !== null;
      if (list && list.ordered !== ordered) flush();
      if (paragraph) flush();
      list ??= { ordered, items: [] };
      list.items.push(parseInline(item[1].trim(), sourceCount));
      continue;
    }
    if (list) flush();
    const heading = HEADING.exec(rawLine);
    // Headings are not part of the allowed output; show them as bold lines.
    const line = heading ? `**${heading[1].trim().replace(/\*+/g, "")}**` : rawLine.trim();
    paragraph ??= [];
    paragraph.push(parseInline(line, sourceCount));
  }
  flush();
  return blocks;
}
