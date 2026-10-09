import { readFileSync } from "node:fs";
import path from "node:path";

// Server-side only (node:fs). A literal path under process.cwd() lets the bundler's file
// tracing include the markdown in serverless builds.
const KNOWLEDGE_FILE = path.join(process.cwd(), "src/features/chatbot/knowledge/twiga-brew.md");

let cached: string | undefined;

/** The Twiga Brew Café knowledge base, read once per server instance. */
export function getDefaultKnowledge(): string {
  cached ??= readFileSync(KNOWLEDGE_FILE, "utf8");
  return cached;
}
