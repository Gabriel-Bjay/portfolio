import type { GenerateContentParameters } from "@google/genai";
import { MODEL } from "./config";
import type { GeminiContent } from "./prompt";

export type StreamInput = { system: string; contents: GeminiContent[]; signal?: AbortSignal };

/** Yields the answer as text chunks. Rejects on any upstream failure. */
export type ModelStreamer = (input: StreamInput) => AsyncGenerator<string, void, undefined>;

/** The slice of the SDK client this module uses, so tests can pass a fake. A real
 *  `GoogleGenAI` instance satisfies it. */
export type GeminiClient = {
  models: {
    generateContentStream: (params: GenerateContentParameters) => Promise<AsyncIterable<{ text?: string }>>;
  };
};

export function createGeminiStreamer(client: GeminiClient, model: string): ModelStreamer {
  return async function* stream({ system, contents, signal }) {
    const response = await client.models.generateContentStream({
      model,
      contents,
      config: {
        systemInstruction: system,
        maxOutputTokens: MODEL.maxOutputTokens,
        temperature: MODEL.temperature,
        // Thinking tokens would count against the small output budget and add latency.
        thinkingConfig: { thinkingBudget: 0 },
        // One attempt: on failure the handler falls back at once rather than waiting on backoff.
        httpOptions: { retryOptions: { attempts: 1 } },
        abortSignal: signal,
      },
    });
    for await (const chunk of response) {
      if (chunk.text) yield chunk.text;
    }
  };
}
