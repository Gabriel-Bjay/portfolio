/** Limits shared by the API validation, the UI counters and the tests. */
export const LIMITS = {
  maxMessages: 20,
  maxMessageChars: 1_000,
  maxKnowledgeChars: 20_000,
  /** Request bodies above this (in characters) are rejected before JSON parsing. Roughly the
   *  largest valid body (20 messages + 20,000 knowledge characters) with room for escaping. */
  maxBodyChars: 160_000,
} as const;

export const RATE_LIMIT = { limit: 10, windowMs: 60_000 } as const;

export const RETRIEVAL = {
  /** At or below this many characters every section goes to the model, so a Swahili
   *  question can still match English text. */
  sendAllMaxChars: 12_000,
  /** Keeps the X-Jibu-Sources header small when someone pastes a pile of tiny sections. */
  sendAllMaxSections: 40,
  topK: 6,
  /** Sections longer than this are split on paragraph boundaries. */
  maxSectionChars: 1_800,
  /** Target chunk size when the knowledge has no headings. */
  paragraphChunkChars: 600,
} as const;

export const MODEL = {
  defaultName: "gemini-flash-latest",
  maxOutputTokens: 400,
  temperature: 0.2,
  firstChunkTimeoutMs: 15_000,
  totalTimeoutMs: 40_000,
} as const;

export const HEADERS = {
  mode: "X-Jibu-Mode",
  sources: "X-Jibu-Sources",
} as const;

export const BUSINESS_NAME = "Twiga Brew Café";
