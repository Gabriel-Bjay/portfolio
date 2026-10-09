"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  describeHttpError,
  INTERRUPTED_ERROR,
  modeAndSources,
  NETWORK_ERROR,
  readTextStream,
  toRequestMessages,
} from "./chat-client";
import type { ChatMode, ChatRole, Source } from "./types";

export type MessageStatus = "pending" | "streaming" | "done" | "stopped" | "error";

export type UiMessage = {
  id: string;
  role: ChatRole;
  content: string;
  status: MessageStatus;
  mode?: ChatMode;
  sources?: Source[];
  error?: string;
};

export type ModeState = ChatMode | "checking" | "unknown";

export function isBusy(messages: UiMessage[]): boolean {
  const last = messages.at(-1);
  return last?.status === "pending" || last?.status === "streaming";
}

/**
 * Conversation state and the streaming request. `knowledge` is the visitor's own FAQ (or null
 * for the default café); a parent changes the component `key` to start over when it changes.
 */
export function useChat({ knowledge }: { knowledge: string | null }) {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [mode, setMode] = useState<ModeState>("checking");
  // The ref is the source of truth inside async code; state mirrors it for rendering.
  const messagesRef = useRef<UiMessage[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const counterRef = useRef(0);
  const mountedRef = useRef(true);

  const commit = useCallback((next: UiMessage[]) => {
    messagesRef.current = next;
    if (mountedRef.current) setMessages(next);
  }, []);

  const patch = useCallback(
    (id: string, change: Partial<UiMessage> | ((m: UiMessage) => Partial<UiMessage>)) => {
      commit(
        messagesRef.current.map((m) => (m.id === id ? { ...m, ...(typeof change === "function" ? change(m) : change) } : m)),
      );
    },
    [commit],
  );

  useEffect(() => {
    mountedRef.current = true;
    const probe = new AbortController();
    fetch("/api/chat", { signal: probe.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((json: { mode?: unknown }) => setMode(json.mode === "ai" || json.mode === "fallback" ? json.mode : "unknown"))
      .catch(() => {
        if (!probe.signal.aborted) setMode("unknown");
      });
    return () => {
      mountedRef.current = false;
      probe.abort();
      abortRef.current?.abort();
    };
  }, []);

  const send = useCallback(
    async (raw: string): Promise<void> => {
      const text = raw.trim();
      if (!text || isBusy(messagesRef.current)) return;

      counterRef.current += 1;
      const userId = `u${counterRef.current}`;
      const replyId = `a${counterRef.current}`;
      const history = messagesRef.current
        .filter((m) => m.status === "done" || m.status === "stopped")
        .map(({ role, content }) => ({ role, content }));
      const body = {
        messages: toRequestMessages([...history, { role: "user", content: text }]),
        ...(knowledge ? { knowledge } : {}),
      };

      commit([
        ...messagesRef.current,
        { id: userId, role: "user", content: text, status: "done" },
        { id: replyId, role: "assistant", content: "", status: "pending" },
      ]);

      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!res.ok) {
          patch(replyId, { status: "error", error: describeHttpError(res.status, res.headers.get("retry-after")) });
          return;
        }
        const meta = modeAndSources(res.headers);
        if (meta.mode) setMode(meta.mode);
        patch(replyId, { mode: meta.mode ?? undefined, sources: meta.sources, status: "streaming" });

        const append = (chunk: string) => patch(replyId, (m) => ({ content: m.content + chunk, status: "streaming" }));
        if (res.body) await readTextStream(res.body, append);
        else append(await res.text());

        patch(replyId, (m) =>
          m.content.trim() ? { status: "done" } : { status: "error", error: "The assistant sent an empty reply." },
        );
      } catch {
        if (controller.signal.aborted) {
          patch(replyId, { status: "stopped" });
        } else {
          patch(replyId, (m) => ({ status: "error", error: m.content ? INTERRUPTED_ERROR : NETWORK_ERROR }));
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [commit, knowledge, patch],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const retry = useCallback(() => {
    const list = messagesRef.current;
    const failed = list.at(-1);
    const question = list.at(-2);
    if (failed?.role !== "assistant" || failed.status !== "error" || question?.role !== "user") return;
    commit(list.slice(0, -2));
    void send(question.content);
  }, [commit, send]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    commit([]);
  }, [commit]);

  return { messages, mode, busy: isBusy(messages), send, stop, retry, reset };
}
