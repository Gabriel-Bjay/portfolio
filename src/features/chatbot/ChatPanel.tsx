"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { citedSources } from "./citations";
import { LIMITS } from "./config";
import { FormattedText } from "./FormattedText";
import { ModeBadge } from "./ModeBadge";
import type { Suggestion } from "./suggestions";
import type { Source } from "./types";
import { useChat, type UiMessage } from "./useChat";

type Props = {
  /** "page" is a card on the demo page; "embed" fills an iframe. */
  variant: "page" | "embed";
  /** Business name shown in the header. */
  title: string;
  /** Short line under the title, e.g. the fictional-demo label. */
  subtitle: string;
  /** The visitor's own FAQ, or null for the built-in café. */
  knowledge: string | null;
  suggestions: Suggestion[];
  /** What to say in the empty state. */
  emptyText: string;
  className?: string;
};

const NEAR_BOTTOM_PX = 48;
const REPLY_TOP_MARGIN_PX = 12;

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-1 py-1.5" role="status">
      <span className="sr-only">Jibu is typing</span>
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          aria-hidden="true"
          className="size-2 animate-bounce rounded-full bg-muted"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  );
}

function sourcesToShow(message: UiMessage): Source[] {
  const sources = message.sources ?? [];
  // Offline answers are one whole section, so all sources apply. For AI answers only the
  // sections the model actually cited are shown.
  return message.mode === "fallback" ? sources : citedSources(message.content, sources);
}

function Message({ message, isLast, onRetry }: { message: UiMessage; isLast: boolean; onRetry: () => void }) {
  const isUser = message.role === "user";
  const shown = isUser ? [] : sourcesToShow(message);
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className="min-w-0 max-w-[88%]" data-reply={isUser ? undefined : message.id}>
        <p className="sr-only">{isUser ? "You said:" : "Jibu said:"}</p>
        <div
          className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
            isUser ? "rounded-br-md bg-accent text-accent-fg" : "rounded-bl-md bg-surface-2 text-fg"
          }`}
        >
          {message.status === "pending" ? (
            <TypingIndicator />
          ) : isUser ? (
            <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{message.content}</p>
          ) : (
            <FormattedText text={message.content} sources={message.sources} />
          )}
          {message.status === "stopped" && <p className="mt-1 text-xs italic opacity-80">Stopped</p>}
          {message.status === "error" && (
            <div className="mt-2 border-t border-line pt-2">
              <p className="text-danger">{message.error ?? "Something went wrong."}</p>
              {isLast && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="mt-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-fg hover:bg-surface-2"
                >
                  Retry
                </button>
              )}
            </div>
          )}
        </div>
        {shown.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted">Sources:</span>
            <ul className="contents" aria-label="Sources">
              {shown.map((s) => (
                <li
                  key={s.id}
                  className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs text-muted [overflow-wrap:anywhere]"
                >
                  {s.title}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export function ChatPanel({ variant, title, subtitle, knowledge, suggestions, emptyText, className = "" }: Props) {
  const { messages, mode, busy, send, stop, retry, reset } = useChat({ knowledge });
  const [input, setInput] = useState("");
  const [atBottom, setAtBottom] = useState(true);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Whether new content should pull the view down. False once the reader scrolls up.
  const stickRef = useRef(true);
  const lastShownRef = useRef({ id: "", length: 0 });
  const headingId = useId();
  const inputId = useId();
  const hintId = useId();
  const embed = variant === "embed";

  // A layout effect, not a passive one: the scroll must happen before the browser dispatches
  // the scroll event of the previous adjustment, or that handler sees the new, taller content
  // against the old position and wrongly decides the reader has scrolled up.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    const last = messages.at(-1);
    // The moment a reply first has text. If it lands whole (offline mode) and is taller than the
    // view, show it from its first line instead of scrolling past most of it.
    const replyAppeared =
      last?.role === "assistant" &&
      last.content.length > 0 &&
      (lastShownRef.current.id !== last.id || lastShownRef.current.length === 0);
    lastShownRef.current = { id: last?.id ?? "", length: last?.content.length ?? 0 };
    if (!el || !stickRef.current) return;

    let target = el.scrollHeight - el.clientHeight;
    if (replyAppeared) {
      const reply = el.querySelector<HTMLElement>(`[data-reply="${last.id}"]`);
      if (reply) {
        const replyTop = reply.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop;
        target = Math.min(target, replyTop - REPLY_TOP_MARGIN_PX);
      }
    }
    el.scrollTop = Math.max(0, target);
  }, [messages]);

  // In the widget's iframe the question box takes focus on load and whenever the host page
  // focuses the frame (it does so each time the chat is opened).
  useEffect(() => {
    if (!embed) return;
    const focusInput = () => inputRef.current?.focus();
    focusInput();
    window.addEventListener("focus", focusInput);
    return () => window.removeEventListener("focus", focusInput);
  }, [embed]);

  function onScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    stickRef.current = near;
    setAtBottom(near);
  }

  function jumpToLatest() {
    const el = scrollerRef.current;
    if (!el) return;
    stickRef.current = true;
    el.scrollTop = el.scrollHeight;
    setAtBottom(true);
  }

  function resizeInput() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    stickRef.current = true;
    setAtBottom(true);
    void send(trimmed);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter inserts a newline. Ignore Enter that confirms an IME composition.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit(input);
    }
  }

  const lastId = messages.at(-1)?.id;
  const counterClass =
    input.length >= LIMITS.maxMessageChars ? "text-danger" : input.length >= 900 ? "text-warning" : "text-muted";

  return (
    <section
      aria-labelledby={headingId}
      className={`flex min-h-0 flex-col overflow-hidden bg-surface ${
        embed ? "h-dvh" : "rounded-2xl border border-line shadow-sm"
      } ${className}`}
    >
      <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0 space-y-1">
          {embed ? (
            <h1 id={headingId} className="truncate font-semibold">
              {title}
            </h1>
          ) : (
            <h2 id={headingId} className="font-semibold">
              Chat with Jibu
              <span className="font-normal text-muted"> · {title}</span>
            </h2>
          )}
          <p className="text-xs text-muted">{subtitle}</p>
          <ModeBadge mode={mode} />
        </div>
        <button
          type="button"
          onClick={() => {
            reset();
            inputRef.current?.focus();
          }}
          disabled={messages.length === 0}
          className="shrink-0 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          New chat
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollerRef}
          onScroll={onScroll}
          tabIndex={0}
          role="region"
          aria-label="Chat messages"
          className="min-h-0 flex-1 overflow-y-auto px-4 py-4 focus-visible:outline-offset-[-2px]"
        >
          {messages.length === 0 && (
            <div className="space-y-4">
              <p className="rounded-2xl rounded-bl-md bg-surface-2 px-3.5 py-2.5 text-sm text-fg">{emptyText}</p>
              {suggestions.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-muted">Try asking</p>
                  <ul aria-label="Suggested questions" className="flex flex-wrap gap-2">
                    {suggestions.map((s) => (
                      <li key={s.text}>
                        <button
                          type="button"
                          lang={s.lang}
                          onClick={() => submit(s.text)}
                          className="rounded-full border border-line bg-surface px-3 py-1.5 text-left text-sm text-fg hover:border-accent hover:bg-surface-2"
                        >
                          {s.text}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <div role="log" aria-live="polite" aria-relevant="additions text" aria-busy={busy} className="space-y-4">
            {messages.map((m) => (
              <Message key={m.id} message={m} isLast={m.id === lastId} onRetry={retry} />
            ))}
          </div>
        </div>
        {!atBottom && messages.length > 0 && (
          <button
            type="button"
            onClick={jumpToLatest}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-fg shadow-md hover:bg-surface-2"
          >
            Jump to latest
          </button>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        className="border-t border-line p-3"
      >
        <div className="flex items-end gap-2">
          <label htmlFor={inputId} className="sr-only">
            Your message
          </label>
          <textarea
            id={inputId}
            ref={inputRef}
            rows={1}
            value={input}
            maxLength={LIMITS.maxMessageChars}
            placeholder="Type your question…"
            aria-describedby={hintId}
            onChange={(e) => {
              setInput(e.target.value);
              resizeInput();
            }}
            onKeyDown={onKeyDown}
            className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border border-line bg-bg px-3 py-2 text-sm text-fg placeholder:text-muted"
          />
          {busy ? (
            <button
              type="button"
              onClick={stop}
              className="h-10 shrink-0 rounded-xl border border-line bg-surface-2 px-4 text-sm font-medium text-fg hover:bg-line"
            >
              Stop
              <span className="sr-only"> generating</span>
            </button>
          ) : (
            <button
              type="submit"
              disabled={input.trim().length === 0}
              className="h-10 shrink-0 rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 active:scale-95"
            >
              Send
            </button>
          )}
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-3 text-xs">
          <span id={hintId} className="text-muted">
            Enter to send, Shift+Enter for a new line
          </span>
          <span className={counterClass}>
            <span className="sr-only">Characters used: </span>
            {input.length}/{LIMITS.maxMessageChars}
            {input.length >= LIMITS.maxMessageChars && <span role="status"> Limit reached</span>}
          </span>
        </div>
      </form>
    </section>
  );
}
