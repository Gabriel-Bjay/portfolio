import type { Metadata } from "next";
import { chunkKnowledge } from "@/features/chatbot/chunk";
import { ChatbotDemo } from "@/features/chatbot/ChatbotDemo";
import { getDefaultKnowledge } from "@/features/chatbot/default-knowledge";

export const metadata: Metadata = {
  title: "Jibu: AI support chatbot",
  description:
    "Jibu answers customer questions from a business's own FAQ, in English or Swahili, and drops onto any website with one script tag. Try the live demo.",
};

const STEPS = [
  {
    title: "Retrieve",
    text: "Jibu searches the business's own FAQ and picks the sections that match the question.",
  },
  {
    title: "Answer with sources",
    text: "Gemini replies using only those sections, in the customer's language, and shows which sections it used.",
  },
  {
    title: "Hand off when unsure",
    text: "If the answer isn't in the FAQ, Jibu says so and points the customer to staff instead of guessing.",
  },
] as const;

export default function ChatbotPage() {
  // Read from disk at build time; the knowledge base is the same for every visitor.
  const sections = chunkKnowledge(getDefaultKnowledge());

  return (
    <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-10 sm:pt-14">
      <ChatbotDemo
        defaultSections={sections}
        intro={
          <>
            <p className="text-sm font-medium text-accent">Project 2 · AI support assistant</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight">Jibu</h1>
            <p className="mt-3 max-w-xl text-lg text-muted">
              <em>Jibu</em> is Swahili for &ldquo;answer&rdquo;. It answers customers using only your business&apos;s own
              information, in English or Swahili, and it fits on any website with one script tag.
            </p>
            <p className="mt-3 max-w-xl text-sm text-muted">
              The demo business is <strong className="font-semibold text-fg">Twiga Brew Café</strong>, a fictional
              demo business. Ask it anything, or paste your own FAQ below.
            </p>
          </>
        }
        howItWorks={
          <section aria-labelledby="how-heading">
            <h2 id="how-heading" className="text-lg font-semibold">
              How it works
            </h2>
            <ol className="mt-3 grid gap-3 sm:grid-cols-3">
              {STEPS.map((step, i) => (
                <li key={step.title} className="rounded-xl border border-line bg-surface p-4">
                  <span className="flex size-7 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-fg">
                    {i + 1}
                  </span>
                  <p className="mt-2 font-medium">{step.title}</p>
                  <p className="mt-1 text-sm text-muted">{step.text}</p>
                </li>
              ))}
            </ol>
          </section>
        }
      />
    </main>
  );
}
