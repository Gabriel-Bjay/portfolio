import { connection } from "next/server";
import { currentMode, handleChat } from "@/features/chatbot/handler";
import { getChatDeps } from "@/features/chatbot/server";

export async function POST(request: Request) {
  return handleChat(request, getChatDeps());
}

/** Lets the UI show which mode it starts in ("AI" or offline) before the first question.
 *  Reveals only whether a key exists, never the key. */
export async function GET() {
  await connection(); // env is read per request, not frozen at build time
  return Response.json({ mode: currentMode(getChatDeps()) }, { headers: { "Cache-Control": "no-store" } });
}
