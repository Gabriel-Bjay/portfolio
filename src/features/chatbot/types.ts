/** One retrievable piece of the knowledge base. */
export type Section = {
  /** Stable id within one parsed knowledge base, e.g. "sec-3". Not the [S1] label. */
  id: string;
  title: string;
  /** Text shown to people and sent to the model. */
  body: string;
  /** Extra search terms (e.g. Swahili synonyms). Indexed for retrieval, never displayed. */
  keywords: string;
};

/** A section as numbered for one request: the "S1" the model cites. */
export type Source = { id: string; title: string };

export type ChatRole = "user" | "assistant";
export type ChatMessage = { role: ChatRole; content: string };

/** "ai" = answered by the model, "fallback" = best-matching section without the model. */
export type ChatMode = "ai" | "fallback";
