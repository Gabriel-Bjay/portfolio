"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChatPanel } from "./ChatPanel";
import { chunkKnowledge } from "./chunk";
import { CustomFaq } from "./CustomFaq";
import { KnowledgeViewer } from "./KnowledgeViewer";
import { SUGGESTIONS } from "./suggestions";
import type { Section } from "./types";
import { WidgetLoader } from "./WidgetLoader";
import { WidgetSnippet } from "./WidgetSnippet";

type Props = {
  /** Server-rendered pitch (title and intro). */
  intro: ReactNode;
  /** Server-rendered "How it works". */
  howItWorks: ReactNode;
  defaultSections: Section[];
};

/** Holds the one piece of shared state: which knowledge base the chat answers from. */
export function ChatbotDemo({ intro, howItWorks, defaultSections }: Props) {
  const [faq, setFaq] = useState<string | null>(null);
  // Bumped on every change so the chat remounts and starts a fresh conversation.
  const [version, setVersion] = useState(0);
  const customSections = useMemo(() => (faq ? chunkKnowledge(faq) : null), [faq]);
  const sections = customSections ?? defaultSections;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-x-12">
      <WidgetLoader />
      <div className="lg:col-start-1">{intro}</div>

      <div className="lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
        <ChatPanel
          key={version}
          variant="page"
          title={faq ? "Your FAQ" : "Twiga Brew Café"}
          subtitle={faq ? "Answering from the FAQ you pasted" : "Fictional demo business in Westlands, Nairobi"}
          knowledge={faq}
          suggestions={faq ? [] : SUGGESTIONS}
          emptyText={
            faq
              ? "Your FAQ is loaded. Ask me anything it covers."
              : "Karibu! I'm Jibu, the assistant for Twiga Brew Café. Ask me about the menu, hours, delivery or payments, in English or Swahili."
          }
          className="h-[min(36rem,80dvh)] lg:h-[min(44rem,calc(100dvh-3rem))]"
        />
      </div>

      <div className="min-w-0 space-y-10 lg:col-start-1">
        {howItWorks}
        <KnowledgeViewer
          sections={sections}
          owner={faq ? "Your FAQ" : "Twiga Brew Café (fictional demo business)"}
        />
        <CustomFaq
          active={faq}
          sectionCount={customSections?.length ?? 0}
          onApply={(text) => {
            setFaq(text.trim());
            setVersion((v) => v + 1);
          }}
          onReset={() => {
            setFaq(null);
            setVersion((v) => v + 1);
          }}
        />
        <WidgetSnippet />
      </div>
    </div>
  );
}
