import { describe, expect, it } from "vitest";
import { LIMITS } from "./config";
import { parseChatRequest } from "./schema";

const ok = { messages: [{ role: "user", content: "hi" }] };

describe("parseChatRequest", () => {
  it("accepts a minimal valid body", () => {
    const r = parseChatRequest(ok);
    expect(r.ok).toBe(true);
  });

  it("accepts a conversation and a custom knowledge base", () => {
    const r = parseChatRequest({
      messages: [
        { role: "user", content: "a" },
        { role: "assistant", content: "b" },
        { role: "user", content: "c" },
      ],
      knowledge: "## FAQ\nAnswer",
    });
    expect(r.ok).toBe(true);
  });

  it.each([
    ["null", null],
    ["a string", "hello"],
    ["an empty object", {}],
    ["messages not an array", { messages: "hi" }],
    ["no messages", { messages: [] }],
    ["unknown role", { messages: [{ role: "system", content: "x" }] }],
    ["missing content", { messages: [{ role: "user" }] }],
    ["non-string content", { messages: [{ role: "user", content: 5 }] }],
    ["empty content", { messages: [{ role: "user", content: "" }] }],
    ["whitespace-only content", { messages: [{ role: "user", content: "   \n " }] }],
    ["last message from assistant", { messages: [{ role: "user", content: "a" }, { role: "assistant", content: "b" }] }],
    ["non-string knowledge", { ...ok, knowledge: 42 }],
  ])("rejects %s", (_name, body) => {
    expect(parseChatRequest(body).ok).toBe(false);
  });

  it("enforces the per-message length limit exactly", () => {
    const at = { messages: [{ role: "user", content: "x".repeat(LIMITS.maxMessageChars) }] };
    const over = { messages: [{ role: "user", content: "x".repeat(LIMITS.maxMessageChars + 1) }] };
    expect(parseChatRequest(at).ok).toBe(true);
    expect(parseChatRequest(over).ok).toBe(false);
  });

  it("enforces the message-count limit exactly", () => {
    const make = (n: number) => ({
      messages: Array.from({ length: n }, (_v, i) => ({ role: i % 2 === 0 ? "user" : "assistant", content: "x" })),
    });
    expect(parseChatRequest(make(19)).ok).toBe(true); // 19 messages: ends with a user turn
    expect(parseChatRequest(make(21)).ok).toBe(false);
  });

  it("enforces the knowledge limit exactly", () => {
    expect(parseChatRequest({ ...ok, knowledge: "x".repeat(LIMITS.maxKnowledgeChars) }).ok).toBe(true);
    expect(parseChatRequest({ ...ok, knowledge: "x".repeat(LIMITS.maxKnowledgeChars + 1) }).ok).toBe(false);
  });

  it("reports readable paths and never echoes the offending input", () => {
    const secret = "TOP-SECRET-".repeat(200);
    const r = parseChatRequest({ messages: [{ role: "user", content: secret }] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues[0].path).toBe("messages.0.content");
      expect(JSON.stringify(r.issues)).not.toContain("TOP-SECRET");
    }
  });

  it("strips unknown keys", () => {
    const r = parseChatRequest({ ...ok, admin: true });
    expect(r.ok && "admin" in r.data).toBe(false);
  });
});
