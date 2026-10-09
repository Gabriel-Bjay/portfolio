"use client";

import { useRef, useState, useSyncExternalStore } from "react";

const subscribeNever = () => () => undefined;

type CopyState = "idle" | "copied" | "failed";

/** The one-line install snippet with a copy button. Uses the real host once mounted. */
export function WidgetSnippet() {
  // The server cannot know the host, so it renders a placeholder and the browser swaps in
  // window.location.origin after hydration without a mismatch.
  const origin = useSyncExternalStore(
    subscribeNever,
    () => window.location.origin,
    () => "https://your-site.com",
  );
  const snippet = `<script src="${origin}/chat-widget.js" data-title="Twiga Brew" data-color="#0f766e" async></script>`;
  const [copy, setCopy] = useState<CopyState>("idle");
  const codeRef = useRef<HTMLElement>(null);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopy("copied");
      window.setTimeout(() => setCopy("idle"), 2_000);
    } catch {
      // Clipboard access can be blocked (insecure origin, permissions). Select the text so
      // Ctrl+C works.
      if (codeRef.current) window.getSelection()?.selectAllChildren(codeRef.current);
      setCopy("failed");
    }
  }

  return (
    <section aria-labelledby="widget-heading" className="space-y-3">
      <div>
        <h2 id="widget-heading" className="text-lg font-semibold">
          Add it to your website
        </h2>
        <p className="text-sm text-muted">
          Paste one script tag before the closing body tag. A chat button appears bottom-right, just like the one on
          this page.
        </p>
      </div>
      <pre className="rounded-xl border border-line bg-surface-2 p-3 text-xs leading-relaxed text-fg">
        <code ref={codeRef} className="whitespace-pre-wrap break-all font-mono">
          {snippet}
        </code>
      </pre>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onCopy}
          className="rounded-xl border border-line px-4 py-2 text-sm font-medium hover:bg-surface-2 active:scale-95"
        >
          {copy === "copied" ? "Copied" : "Copy snippet"}
        </button>
        <p role="status" className="text-sm text-muted">
          {copy === "copied" && "Snippet copied to your clipboard."}
          {copy === "failed" && "Couldn't copy automatically. The snippet is selected, press Ctrl+C."}
        </p>
      </div>
    </section>
  );
}
