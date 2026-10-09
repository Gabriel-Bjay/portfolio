import { describe, expect, it } from "vitest";
import {
  describeHttpError,
  modeAndSources,
  parseMode,
  parseSourcesHeader,
  readTextStream,
  toRequestMessages,
} from "./chat-client";
import type { ChatMessage } from "./types";

const user = (content: string): ChatMessage => ({ role: "user", content });
const bot = (content: string): ChatMessage => ({ role: "assistant", content });

describe("parseSourcesHeader", () => {
  const encode = (v: unknown) => encodeURIComponent(JSON.stringify(v));

  it("decodes the URI-encoded JSON list", () => {
    const sources = [
      { id: "S1", title: "Opening hours" },
      { id: "S2", title: "Café & Wi-Fi: “quiet” zone ☕" },
    ];
    expect(parseSourcesHeader(encode(sources))).toEqual(sources);
  });

  it.each([null, "", "%E0%A4%A", "not json", encode({ id: "S1" }), encode("x")])("returns [] for %j", (v) => {
    expect(parseSourcesHeader(v)).toEqual([]);
  });

  it("drops malformed entries and extra fields", () => {
    const value = encode([{ id: "S1", title: "A", extra: 1 }, { id: 2, title: "B" }, null, "x"]);
    expect(parseSourcesHeader(value)).toEqual([{ id: "S1", title: "A" }]);
  });
});

describe("parseMode / modeAndSources", () => {
  it("accepts only the two known modes", () => {
    expect(parseMode("ai")).toBe("ai");
    expect(parseMode("fallback")).toBe("fallback");
    expect(parseMode("other")).toBeNull();
    expect(parseMode(null)).toBeNull();
  });

  it("reads both from response headers", () => {
    const headers = new Headers({
      "X-Jibu-Mode": "fallback",
      "X-Jibu-Sources": encodeURIComponent(JSON.stringify([{ id: "S1", title: "Hours" }])),
    });
    expect(modeAndSources(headers)).toEqual({ mode: "fallback", sources: [{ id: "S1", title: "Hours" }] });
  });
});

describe("toRequestMessages", () => {
  it("keeps a normal conversation", () => {
    const history = [user("a"), bot("b"), user("c")];
    expect(toRequestMessages(history)).toEqual(history);
  });

  it("trims, and drops empty turns (for example a failed or stopped reply)", () => {
    expect(toRequestMessages([user("  hi  "), bot(""), bot("   "), user("again")])).toEqual([user("hi"), user("again")]);
  });

  it("cuts long replies to the per-message limit without splitting an emoji", () => {
    const long = `${"a".repeat(999)}😀 and more`;
    const [first] = toRequestMessages([bot("x"), user(long)]);
    expect(first.content).toBe("a".repeat(999));
    expect(toRequestMessages([user("b".repeat(5_000))])[0].content).toHaveLength(1_000);
  });

  it("keeps only the latest 20 turns and starts with a user turn", () => {
    const history: ChatMessage[] = Array.from({ length: 30 }, (_v, i) => (i % 2 === 0 ? user(`u${i}`) : bot(`b${i}`)));
    history.push(user("last"));
    const out = toRequestMessages(history);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out[0].role).toBe("user");
    expect(out.at(-1)).toEqual(user("last"));
  });

  it("drops a leading assistant turn (for example the greeting)", () => {
    expect(toRequestMessages([bot("Karibu!"), user("hi")])).toEqual([user("hi")]);
  });

  it("returns nothing for an empty history", () => {
    expect(toRequestMessages([])).toEqual([]);
  });
});

describe("readTextStream", () => {
  it("delivers chunks in order", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(encoder.encode("Hel"));
        c.enqueue(encoder.encode("lo"));
        c.close();
      },
    });
    const parts: string[] = [];
    await readTextStream(body, (t) => parts.push(t));
    expect(parts).toEqual(["Hel", "lo"]);
  });

  it("reassembles a multi-byte character split across chunks", async () => {
    const bytes = new TextEncoder().encode("Habari 😀 ☕");
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < bytes.length; i += 1) c.enqueue(bytes.slice(i, i + 1)); // one byte at a time
        c.close();
      },
    });
    let text = "";
    await readTextStream(body, (t) => (text += t));
    expect(text).toBe("Habari 😀 ☕");
  });

  it("propagates a stream error after delivering what arrived", async () => {
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        pulls += 1;
        if (pulls === 1) c.enqueue(new TextEncoder().encode("partial"));
        else c.error(new Error("reset"));
      },
    });
    let text = "";
    await expect(readTextStream(body, (t) => (text += t))).rejects.toThrow("reset");
    expect(text).toBe("partial");
  });
});

describe("describeHttpError", () => {
  it("tells people how long to wait on 429", () => {
    expect(describeHttpError(429, "42")).toContain("42 seconds");
    expect(describeHttpError(429, null)).toContain("a moment");
    expect(describeHttpError(429, "abc")).toContain("a moment");
  });

  it("has friendly text for other statuses", () => {
    expect(describeHttpError(400, null)).toMatch(/shorter/);
    expect(describeHttpError(502, null)).toMatch(/our side/);
    expect(describeHttpError(418, null)).toMatch(/try again/i);
  });
});
