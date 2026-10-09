import { afterEach, describe, expect, it, vi } from "vitest";
import { HEADERS, LIMITS, MODEL, RATE_LIMIT } from "./config";
import { getDefaultKnowledge } from "./default-knowledge";
import { FALLBACK_PREFIX } from "./fallback";
import type { ModelStreamer, StreamInput } from "./gemini";
import { currentMode, handleChat, type ChatDeps } from "./handler";
import { createRateLimiter } from "./rate-limit";
import type { Source } from "./types";

const defaultKnowledge = getDefaultKnowledge();

function makeDeps(overrides: Partial<ChatDeps> = {}): ChatDeps {
  return {
    limiter: createRateLimiter({ ...RATE_LIMIT }),
    streamer: null,
    defaultKnowledge,
    ...overrides,
  };
}

let counter = 0;
function post(body: unknown, headers: Record<string, string> = {}): Request {
  counter += 1;
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `192.0.2.${counter % 250}`, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const ask = (content: string, extra: Record<string, unknown> = {}) => ({
  messages: [{ role: "user", content }],
  ...extra,
});

function sourcesOf(res: Response): Source[] {
  return JSON.parse(decodeURIComponent(res.headers.get(HEADERS.sources) ?? "[]"));
}

/** A streamer that yields the given chunks and records what it was called with. */
function scripted(chunks: string[]) {
  const calls: StreamInput[] = [];
  const streamer: ModelStreamer = async function* (input) {
    calls.push(input);
    for (const chunk of chunks) yield chunk;
  };
  return { streamer, calls };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("offline mode (no API key)", () => {
  it("answers 'What time do you open on Sunday?' with the hours section and a source", async () => {
    const res = await handleChat(post(ask("What time do you open on Sunday?")), makeDeps());
    expect(res.status).toBe(200);
    expect(res.headers.get(HEADERS.mode)).toBe("fallback");
    expect(res.headers.get("content-type")).toContain("text/plain");
    const text = await res.text();
    expect(text.startsWith(FALLBACK_PREFIX)).toBe(true);
    expect(text).toContain("Sunday: opens at 8:00, closes at 20:00");
    expect(sourcesOf(res)).toEqual([{ id: "S1", title: "Opening hours and public holidays" }]);
  });

  it("answers Swahili questions from the English knowledge base", async () => {
    const res = await handleChat(post(ask("Mnafunga saa ngapi?")), makeDeps());
    expect(await res.text()).toContain("closes at 21:00");
    expect(sourcesOf(res)[0].title).toBe("Opening hours and public holidays");
  });

  it("admits when nothing matches, with no sources", async () => {
    const res = await handleChat(post(ask("zanzibar quantum")), makeDeps());
    expect(res.headers.get(HEADERS.mode)).toBe("fallback");
    expect(await res.text()).toContain("couldn't find anything");
    expect(sourcesOf(res)).toEqual([]);
  });

  it("reports its starting mode", () => {
    expect(currentMode({ streamer: null })).toBe("fallback");
    expect(currentMode({ streamer: scripted([]).streamer })).toBe("ai");
  });
});

describe("AI mode", () => {
  it("streams the model's chunks as they arrive, with mode and sources in headers", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const streamer: ModelStreamer = async function* () {
      yield "We open at 8 ";
      await gate; // the second chunk must not be needed to see the first
      yield "on Sunday [S2].";
    };
    const res = await handleChat(post(ask("When do you open on Sunday?")), makeDeps({ streamer }));
    expect(res.status).toBe(200);
    expect(res.headers.get(HEADERS.mode)).toBe("ai");

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    const first = await reader.read();
    expect(decoder.decode(first.value)).toBe("We open at 8 ");
    release();
    let rest = "";
    for (let r = await reader.read(); !r.done; r = await reader.read()) rest += decoder.decode(r.value);
    expect(rest).toBe("on Sunday [S2].");
  });

  it("numbers the sections it sent so the client can resolve [Sx] citations", async () => {
    const { streamer, calls } = scripted(["ok [S1]"]);
    const res = await handleChat(post(ask("When do you open?")), makeDeps({ streamer }));
    await res.text();
    const sources = sourcesOf(res);
    // The café's knowledge is small, so all sections are sent.
    expect(sources.length).toBeGreaterThanOrEqual(14);
    expect(sources[0]).toEqual({ id: "S1", title: "About Twiga Brew Café" });
    expect(sources.map((s) => s.id)).toEqual(sources.map((_s, i) => `S${i + 1}`));
    const prompt = calls[0].contents.at(-1)!.parts[0].text;
    expect(prompt).toContain('<section id="S2" title="Opening hours and public holidays">');
    expect(prompt).toContain("<user_question>\nWhen do you open?\n</user_question>");
  });

  it("passes the rules as the system instruction and the conversation as turns", async () => {
    const { streamer, calls } = scripted(["fine"]);
    const body = {
      messages: [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Habari!" },
        { role: "user", content: "Menu?" },
      ],
    };
    await (await handleChat(post(body), makeDeps({ streamer }))).text();
    expect(calls[0].system).toContain("ONLY from the sections");
    expect(calls[0].contents.map((c) => c.role)).toEqual(["user", "model", "user"]);
    expect(calls[0].signal).toBeInstanceOf(AbortSignal);
  });

  it("sends only the top 6 sections for a large custom knowledge base", async () => {
    const big = Array.from({ length: 30 }, (_v, i) => `## Topic ${i + 1}\n${i === 9 ? "unicornsparkle " : ""}${"filler ".repeat(80)}`).join("\n\n");
    expect(big.length).toBeGreaterThan(12_000);
    expect(big.length).toBeLessThanOrEqual(LIMITS.maxKnowledgeChars);
    const { streamer, calls } = scripted(["ok"]);
    const res = await handleChat(post(ask("tell me about unicornsparkle", { knowledge: big })), makeDeps({ streamer }));
    await res.text();
    const sources = sourcesOf(res);
    expect(sources.length).toBeLessThanOrEqual(6);
    expect(sources[0].title).toBe("Topic 10");
    expect(calls[0].contents.at(-1)!.parts[0].text.match(/<section /g)!.length).toBeLessThanOrEqual(6);
  });

  it("answers from the visitor's own FAQ and tells the model it is not the café", async () => {
    const { streamer, calls } = scripted(["ok"]);
    const faq = "## Returns\nReturns are accepted within 14 days.\n\n## Shipping\nWe ship worldwide.";
    const res = await handleChat(post(ask("returns?", { knowledge: faq })), makeDeps({ streamer }));
    await res.text();
    expect(sourcesOf(res).map((s) => s.title)).toEqual(["Returns", "Shipping"]);
    expect(calls[0].system).not.toContain("Twiga");
    expect(calls[0].contents.at(-1)!.parts[0].text).not.toContain("Twiga");
  });

  it("ignores a blank custom knowledge base and uses the café", async () => {
    const res = await handleChat(post(ask("What time do you open on Sunday?", { knowledge: "  \n " })), makeDeps());
    expect(sourcesOf(res)[0].title).toBe("Opening hours and public holidays");
  });

  it("answers from custom knowledge offline too", async () => {
    const faq = "## Returns\nReturns are accepted within 14 days.\n\n## Shipping\nWe ship worldwide.";
    const res = await handleChat(post(ask("do you ship abroad", { knowledge: faq })), makeDeps());
    expect(await res.text()).toContain("We ship worldwide.");
    expect(sourcesOf(res)).toEqual([{ id: "S1", title: "Shipping" }]);
  });
});

describe("upstream failures fall back to the best section", () => {
  const sunday = ask("What time do you open on Sunday?");

  it("when the model call throws (quota, 429, network)", async () => {
    const onUpstreamError = vi.fn();
    const streamer: ModelStreamer = async function* () {
      throw Object.assign(new Error("RESOURCE_EXHAUSTED: quota"), { name: "ApiError", status: 429 });
    };
    const res = await handleChat(post(sunday), makeDeps({ streamer, onUpstreamError }));
    expect(res.status).toBe(200);
    expect(res.headers.get(HEADERS.mode)).toBe("fallback");
    expect(await res.text()).toContain("Sunday: opens at 8:00");
    expect(onUpstreamError).toHaveBeenCalledWith({ name: "ApiError", status: 429 });
  });

  it("when the model returns nothing", async () => {
    const res = await handleChat(post(sunday), makeDeps({ streamer: scripted([]).streamer }));
    expect(res.headers.get(HEADERS.mode)).toBe("fallback");
  });

  it("when the model only returns empty chunks", async () => {
    const res = await handleChat(post(sunday), makeDeps({ streamer: scripted(["", ""]).streamer }));
    expect(res.headers.get(HEADERS.mode)).toBe("fallback");
  });

  it("when the model does not answer in time", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const streamer: ModelStreamer = async function* (input) {
      signal = input.signal;
      await new Promise<never>(() => undefined); // never answers
    };
    const pending = handleChat(post(sunday), makeDeps({ streamer }));
    await vi.advanceTimersByTimeAsync(MODEL.firstChunkTimeoutMs + 10);
    const res = await pending;
    expect(res.headers.get(HEADERS.mode)).toBe("fallback");
    expect(signal?.aborted).toBe(true);
  });

  it("ends the stream with an error if the model breaks after the first chunk", async () => {
    const streamer: ModelStreamer = async function* () {
      yield "partial ";
      throw new Error("boom");
    };
    const res = await handleChat(post(sunday), makeDeps({ streamer, onUpstreamError: () => undefined }));
    const reader = res.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe("partial ");
    await expect(reader.read()).rejects.toThrow("interrupted");
  });

  it("aborts the model call when the client cancels the stream", async () => {
    let signal: AbortSignal | undefined;
    const streamer: ModelStreamer = async function* (input) {
      signal = input.signal;
      yield "first ";
      await new Promise((resolve) => input.signal?.addEventListener("abort", resolve));
    };
    const res = await handleChat(post(sunday), makeDeps({ streamer }));
    const reader = res.body!.getReader();
    await reader.read();
    await reader.cancel();
    expect(signal?.aborted).toBe(true);
  });
});

describe("validation (400)", () => {
  const cases: [string, unknown][] = [
    ["invalid JSON", "{not json"],
    ["an empty body", ""],
    ["a JSON array", []],
    ["no messages", { messages: [] }],
    ["messages of the wrong type", { messages: "hi" }],
    ["an unknown role", { messages: [{ role: "system", content: "x" }] }],
    ["a last message from the assistant", { messages: [{ role: "user", content: "a" }, { role: "assistant", content: "b" }] }],
    ["a message over 1,000 characters", ask("x".repeat(1_001))],
    ["more than 20 messages", { messages: Array.from({ length: 21 }, (_v, i) => ({ role: i % 2 ? "assistant" : "user", content: "x" })) }],
    ["knowledge over 20,000 characters", ask("hi", { knowledge: "x".repeat(20_001) })],
    ["a body that is far too large", ask("hi", { padding: "x".repeat(LIMITS.maxBodyChars) })],
  ];

  it.each(cases)("rejects %s with a JSON error", async (_name, body) => {
    const res = await handleChat(post(body as string), makeDeps());
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("application/json");
    const json = await res.json();
    expect(typeof json.error).toBe("string");
  });

  it("lists which field was wrong without echoing its content", async () => {
    const secret = "PRIVATE-TEXT-".repeat(100);
    const res = await handleChat(post(ask(secret)), makeDeps());
    const raw = await res.text();
    expect(raw).toContain("messages.0.content");
    expect(raw).not.toContain("PRIVATE-TEXT");
  });

  it("accepts the boundary values", async () => {
    const body = ask("x".repeat(LIMITS.maxMessageChars), { knowledge: "## A\n" + "k".repeat(LIMITS.maxKnowledgeChars - 5) });
    expect((await handleChat(post(body), makeDeps())).status).toBe(200);
  });
});

describe("rate limiting (429)", () => {
  it("allows 10 requests a minute and rejects the 11th with Retry-After", async () => {
    let now = 0;
    const deps = makeDeps({ limiter: createRateLimiter({ ...RATE_LIMIT, now: () => now }) });
    const headers = { "x-forwarded-for": "198.51.100.9" };
    for (let i = 0; i < 10; i += 1) {
      const res = await handleChat(post(ask("hours?"), headers), deps);
      expect(res.status).toBe(200);
      now += 1_000;
    }
    const res = await handleChat(post(ask("hours?"), headers), deps);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("50");
    expect((await res.json()).error).toMatch(/too many/i);

    now += 60_000;
    expect((await handleChat(post(ask("hours?"), headers), deps)).status).toBe(200);
  });

  it("limits each client address separately", async () => {
    const deps = makeDeps({ limiter: createRateLimiter({ limit: 1, windowMs: 60_000 }) });
    expect((await handleChat(post(ask("a"), { "x-forwarded-for": "10.0.0.1" }), deps)).status).toBe(200);
    expect((await handleChat(post(ask("a"), { "x-forwarded-for": "10.0.0.2" }), deps)).status).toBe(200);
    expect((await handleChat(post(ask("a"), { "x-forwarded-for": "10.0.0.1" }), deps)).status).toBe(429);
  });

  it("counts invalid requests too, so bad input cannot be used to hammer the endpoint", async () => {
    const deps = makeDeps({ limiter: createRateLimiter({ limit: 2, windowMs: 60_000 }) });
    const headers = { "x-forwarded-for": "10.0.0.3" };
    expect((await handleChat(post("nope", headers), deps)).status).toBe(400);
    expect((await handleChat(post("nope", headers), deps)).status).toBe(400);
    expect((await handleChat(post("nope", headers), deps)).status).toBe(429);
  });
});

describe("privacy", () => {
  it("never writes message contents to the console, even when the model fails", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    const streamer: ModelStreamer = async function* () {
      throw new Error("upstream said: SECRET-QUESTION-TEXT");
    };
    const onUpstreamError = vi.fn();
    await handleChat(post(ask("SECRET-QUESTION-TEXT")), makeDeps({ streamer, onUpstreamError }));
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    // The reporter gets the error class and status, not the message.
    expect(JSON.stringify(onUpstreamError.mock.calls)).not.toContain("SECRET");
  });

  it("never echoes the API key or any env value in responses", async () => {
    const res = await handleChat(post(ask("hours")), makeDeps());
    const everything = `${[...res.headers.entries()].join("\n")}\n${await res.text()}`;
    expect(everything).not.toMatch(/api[_-]?key/i);
  });
});
