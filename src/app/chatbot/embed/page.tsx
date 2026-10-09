import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Suspense } from "react";
import { ChatPanel } from "@/features/chatbot/ChatPanel";
import { EmbedBridge } from "@/features/chatbot/EmbedBridge";
import { cleanLabel, normalizeHexColor, readableForeground } from "@/features/chatbot/embed-params";
import { SUGGESTIONS } from "@/features/chatbot/suggestions";

export const metadata: Metadata = {
  title: "Jibu chat",
  robots: { index: false },
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// searchParams are request-time data, so they are read inside a Suspense boundary and the
// rest of the page stays in the static shell.
async function EmbeddedChat({ searchParams }: { searchParams: PageProps<"/chatbot/embed">["searchParams"] }) {
  const params = await searchParams;
  const title = cleanLabel(firstParam(params.title), "Twiga Brew");
  const color = normalizeHexColor(firstParam(params.color));
  // The widget host picks the accent colour. Only a validated #rrggbb value is ever used.
  const style = color
    ? ({
        "--accent": color,
        "--accent-hover": color,
        "--accent-fg": readableForeground(color),
      } as CSSProperties)
    : undefined;

  return (
    <div style={style}>
      <EmbedBridge />
      <ChatPanel
        variant="embed"
        title={title}
        subtitle="Fictional demo business · powered by Jibu"
        knowledge={null}
        suggestions={SUGGESTIONS.slice(0, 3)}
        emptyText="Karibu! Ask me about our menu, hours, delivery or payments, in English or Swahili."
      />
    </div>
  );
}

export default function EmbedPage({ searchParams }: PageProps<"/chatbot/embed">) {
  return (
    <main id="main" data-jibu-embed className="flex-1">
      <Suspense
        fallback={
          <p role="status" className="p-4 text-sm text-muted">
            Loading chat…
          </p>
        }
      >
        <EmbeddedChat searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
