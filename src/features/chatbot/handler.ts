import { buildFallback } from "./fallback";
import { chunkKnowledge } from "./chunk";
import { HEADERS, LIMITS, MODEL } from "./config";
import type { ModelStreamer } from "./gemini";
import { buildContents, buildSystemInstruction, toSources } from "./prompt";
import { clientKey, type RateLimiter } from "./rate-limit";
import { selectSections } from "./retrieve";
import { parseChatRequest } from "./schema";
import type { ChatMode, Source } from "./types";

export type ChatDeps = {
  limiter: RateLimiter;
  /** null when no API key is configured: every answer is then the offline fallback. */
  streamer: ModelStreamer | null;
  /** Markdown knowledge base used when the request does not bring its own. */
  defaultKnowledge: string;
  /** Called with the error class and HTTP status only, never with message content. */
  onUpstreamError?: (info: { name: string; status?: number }) => void;
};

const TEXT_HEADERS = {
  "Content-Type": "text/plain; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  // Ask reverse proxies not to buffer, so chunks reach the browser as they are produced.
  "X-Accel-Buffering": "no",
} as const;

function errorResponse(status: number, error: string, extra: HeadersInit = {}, issues?: unknown): Response {
  return Response.json(issues ? { error, issues } : { error }, {
    status,
    headers: { "Cache-Control": "no-store", ...extra },
  });
}

function textResponse(body: BodyInit, mode: ChatMode, sources: Source[]): Response {
  return new Response(body, {
    headers: {
      ...TEXT_HEADERS,
      [HEADERS.mode]: mode,
      [HEADERS.sources]: encodeURIComponent(JSON.stringify(sources)),
    },
  });
}

/** Mode the endpoint will start in: "ai" when a key is configured, otherwise "fallback". */
export function currentMode(deps: Pick<ChatDeps, "streamer">): ChatMode {
  return deps.streamer ? "ai" : "fallback";
}

type OpenStream = { first: string; rest: AsyncGenerator<string, void, undefined>; abort: () => void };

function describeError(error: unknown): { name: string; status?: number } {
  const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : undefined;
  return { name: error instanceof Error ? error.name : "UnknownError", status: Number.isFinite(status) ? status : undefined };
}

/** Starts the model and waits for its first text. Returns null on any failure or an empty
 *  answer, which is the caller's cue to fall back. */
async function openModelStream(
  streamer: ModelStreamer,
  input: { system: string; contents: ReturnType<typeof buildContents> },
  clientSignal: AbortSignal,
  report: ChatDeps["onUpstreamError"],
): Promise<OpenStream | null> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  clientSignal.addEventListener("abort", abort, { once: true });
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(MODEL.totalTimeoutMs)]);

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const rest = streamer({ ...input, signal });
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error("The AI did not answer in time.")), MODEL.firstChunkTimeoutMs);
    });
    for (;;) {
      const next = rest.next();
      next.catch(() => undefined); // if the timeout wins, do not leave this rejection unhandled
      const step = await Promise.race([next, timeout]);
      if (step.done) {
        abort();
        return null;
      }
      if (step.value) return { first: step.value, rest, abort };
    }
  } catch (error) {
    report?.(describeError(error));
    abort();
    return null;
  } finally {
    clearTimeout(timer);
    clientSignal.removeEventListener("abort", abort);
  }
}

function toResponseStream(open: OpenStream, report: ChatDeps["onUpstreamError"]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let sentFirst = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!sentFirst) {
        sentFirst = true;
        controller.enqueue(encoder.encode(open.first));
        return;
      }
      try {
        const step = await open.rest.next();
        if (step.done) controller.close();
        else controller.enqueue(encoder.encode(step.value));
      } catch (error) {
        // Headers are already sent, so all we can do is end the stream with an error; the
        // client keeps what arrived and offers a retry.
        report?.(describeError(error));
        controller.error(new Error("The AI stream was interrupted."));
      }
    },
    cancel() {
      open.abort();
      open.rest.return(undefined).catch(() => undefined);
    },
  });
}

async function readJson(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
  const declared = Number(request.headers.get("content-length"));
  if (declared > LIMITS.maxBodyChars) return { ok: false, error: "Request body is too large." };
  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, error: "Could not read the request body." };
  }
  if (text.length > LIMITS.maxBodyChars) return { ok: false, error: "Request body is too large." };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, error: "Request body must be valid JSON." };
  }
}

/** POST /api/chat. Pure of Next.js so it can be unit-tested with plain Requests. */
export async function handleChat(request: Request, deps: ChatDeps): Promise<Response> {
  const verdict = deps.limiter.check(clientKey(request.headers));
  if (!verdict.allowed) {
    return errorResponse(429, "Too many requests. Please wait a moment and try again.", {
      "Retry-After": String(verdict.retryAfterSeconds),
    });
  }

  const body = await readJson(request);
  if (!body.ok) return errorResponse(400, body.error);

  const parsed = parseChatRequest(body.value);
  if (!parsed.ok) return errorResponse(400, "Invalid request.", {}, parsed.issues);

  const { messages, knowledge } = parsed.data;
  const custom = knowledge !== undefined && knowledge.trim().length > 0;
  const sections = chunkKnowledge(custom ? knowledge : deps.defaultKnowledge);

  const offline = () => {
    const { text, sources } = buildFallback(sections, messages);
    return textResponse(text, "fallback", sources);
  };
  if (!deps.streamer || sections.length === 0) return offline();

  const selected = selectSections(sections, messages);
  const open = await openModelStream(
    deps.streamer,
    { system: buildSystemInstruction({ custom }), contents: buildContents(messages, selected) },
    request.signal,
    deps.onUpstreamError,
  );
  if (!open) return offline();

  return textResponse(toResponseStream(open, deps.onUpstreamError), "ai", toSources(selected));
}
