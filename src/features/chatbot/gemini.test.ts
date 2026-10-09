import type { GenerateContentParameters } from "@google/genai";
import { describe, expect, it } from "vitest";
import { createGeminiStreamer, type GeminiClient } from "./gemini";

async function* chunks(texts: (string | undefined)[]) {
  for (const text of texts) yield { text };
}

function fakeClient(texts: (string | undefined)[]) {
  const calls: GenerateContentParameters[] = [];
  const client: GeminiClient = {
    models: {
      generateContentStream: async (params) => {
        calls.push(params);
        return chunks(texts);
      },
    },
  };
  return { client, calls };
}

async function collect(iter: AsyncGenerator<string>) {
  const out: string[] = [];
  for await (const part of iter) out.push(part);
  return out;
}

describe("createGeminiStreamer", () => {
  it("yields each text chunk of the stream in order", async () => {
    const { client } = fakeClient(["Hello ", "from ", "Jibu [S1]."]);
    const stream = createGeminiStreamer(client, "gemini-test")({
      system: "rules",
      contents: [{ role: "user", parts: [{ text: "hi" }] }],
    });
    expect(await collect(stream)).toEqual(["Hello ", "from ", "Jibu [S1]."]);
  });

  it("skips chunks without text", async () => {
    const { client } = fakeClient(["a", undefined, "", "b"]);
    const stream = createGeminiStreamer(client, "m")({ system: "s", contents: [] });
    expect(await collect(stream)).toEqual(["a", "b"]);
  });

  it("sends the model, system prompt, contents and a small output budget", async () => {
    const { client, calls } = fakeClient(["x"]);
    const controller = new AbortController();
    const contents = [{ role: "user" as const, parts: [{ text: "q" }] }];
    await collect(createGeminiStreamer(client, "gemini-test")({ system: "rules", contents, signal: controller.signal }));
    expect(calls).toHaveLength(1);
    expect(calls[0].model).toBe("gemini-test");
    expect(calls[0].contents).toBe(contents);
    expect(calls[0].config?.systemInstruction).toBe("rules");
    expect(calls[0].config?.maxOutputTokens).toBe(400);
    expect(calls[0].config?.temperature).toBeLessThanOrEqual(0.3);
    expect(calls[0].config?.abortSignal).toBe(controller.signal);
  });

  it("rejects when the SDK call fails", async () => {
    const client: GeminiClient = {
      models: {
        generateContentStream: async () => {
          throw new Error("429");
        },
      },
    };
    const stream = createGeminiStreamer(client, "m")({ system: "s", contents: [] });
    await expect(stream.next()).rejects.toThrow("429");
  });

  it("rejects when the stream breaks part-way", async () => {
    const client: GeminiClient = {
      models: {
        generateContentStream: async () =>
          (async function* () {
            yield { text: "partial" };
            throw new Error("connection reset");
          })(),
      },
    };
    const stream = createGeminiStreamer(client, "m")({ system: "s", contents: [] });
    expect((await stream.next()).value).toBe("partial");
    await expect(stream.next()).rejects.toThrow("connection reset");
  });
});
