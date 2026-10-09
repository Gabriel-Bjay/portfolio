import { GoogleGenAI } from "@google/genai";
import { MODEL, RATE_LIMIT } from "./config";
import { getDefaultKnowledge } from "./default-knowledge";
import { createGeminiStreamer, type ModelStreamer } from "./gemini";
import type { ChatDeps } from "./handler";
import { createRateLimiter } from "./rate-limit";

// One limiter per server instance. Serverless instances do not share memory, so the real
// limit there is per instance; see rate-limit.ts.
const limiter = createRateLimiter(RATE_LIMIT);

let cachedStreamer: { key: string; model: string; streamer: ModelStreamer } | undefined;

/** Builds the Gemini streamer from env on demand; null when there is no key. The key never
 *  leaves this module and is never sent to the browser. */
function getStreamer(): ModelStreamer | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return null;
  const model = process.env.GEMINI_MODEL?.trim() || MODEL.defaultName;
  if (cachedStreamer?.key !== key || cachedStreamer.model !== model) {
    cachedStreamer = { key, model, streamer: createGeminiStreamer(new GoogleGenAI({ apiKey: key }), model) };
  }
  return cachedStreamer.streamer;
}

export function getChatDeps(): ChatDeps {
  return {
    limiter,
    streamer: getStreamer(),
    defaultKnowledge: getDefaultKnowledge(),
    onUpstreamError: ({ name, status }) => {
      // Class and status only. Message text and prompts are never logged.
      console.error(`[chat] model call failed: ${name}${status ? ` (${status})` : ""}; using offline fallback`);
    },
  };
}
