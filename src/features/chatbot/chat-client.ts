import { HEADERS, LIMITS } from "./config";
import type { ChatMessage, ChatMode, Source } from "./types";

/** Pure helpers for the browser side of the chat. Kept out of React so they can be tested. */

export function parseMode(value: string | null): ChatMode | null {
  return value === "ai" || value === "fallback" ? value : null;
}

/** Decodes the X-Jibu-Sources header. Anything malformed yields no sources, never an error. */
export function parseSourcesHeader(value: string | null): Source[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(value));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (s): s is Source =>
          typeof s === "object" && s !== null && typeof s.id === "string" && typeof s.title === "string",
      )
      .slice(0, 60)
      .map((s) => ({ id: s.id, title: s.title }));
  } catch {
    return [];
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  // Do not leave half of a surrogate pair (an emoji) at the end.
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}

/**
 * Turns the on-screen conversation into an API request body: no empty or failed turns, each
 * turn within the per-message limit (long answers are cut), at most 20 turns, starting and
 * ending with the user.
 */
export function toRequestMessages(history: ChatMessage[]): ChatMessage[] {
  const cleaned = history
    .map((m) => ({ role: m.role, content: truncate(m.content.trim(), LIMITS.maxMessageChars) }))
    .filter((m) => m.content.length > 0)
    .slice(-LIMITS.maxMessages);
  while (cleaned.length > 0 && cleaned[0].role !== "user") cleaned.shift();
  return cleaned;
}

/** Reads a streamed text body, calling `onText` for each decoded piece. Multi-byte characters
 *  split across network chunks are reassembled. */
export async function readTextStream(body: ReadableStream<Uint8Array>, onText: (text: string) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      if (text) onText(text);
    }
    const tail = decoder.decode();
    if (tail) onText(tail);
  } finally {
    reader.releaseLock();
  }
}

/** A message a person can act on, for a non-OK response. */
export function describeHttpError(status: number, retryAfter: string | null): string {
  if (status === 429) {
    const seconds = Number(retryAfter);
    const wait = Number.isFinite(seconds) && seconds > 0 ? `${Math.ceil(seconds)} seconds` : "a moment";
    return `You're asking a bit too fast. Please try again in ${wait}.`;
  }
  if (status === 400) return "That message couldn't be sent. Try a shorter one.";
  if (status >= 500) return "Something went wrong on our side. Please try again.";
  return "Something went wrong. Please try again.";
}

export const NETWORK_ERROR = "Couldn't reach the server. Check your connection and try again.";
export const INTERRUPTED_ERROR = "The reply was interrupted. Try again.";

export function modeAndSources(headers: Headers): { mode: ChatMode | null; sources: Source[] } {
  return { mode: parseMode(headers.get(HEADERS.mode)), sources: parseSourcesHeader(headers.get(HEADERS.sources)) };
}
