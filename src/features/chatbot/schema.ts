import { z } from "zod";
import { LIMITS } from "./config";

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z
    .string()
    .max(LIMITS.maxMessageChars)
    .refine((s) => s.trim().length > 0, "Message must not be empty"),
});

export const chatRequestSchema = z.object({
  messages: z
    .array(messageSchema)
    .min(1)
    .max(LIMITS.maxMessages)
    .refine((m) => m.at(-1)?.role === "user", "The last message must be from the user"),
  knowledge: z.string().max(LIMITS.maxKnowledgeChars).optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export type ValidationIssue = { path: string; message: string };

export type ParseResult =
  | { ok: true; data: ChatRequest }
  | { ok: false; issues: ValidationIssue[] };

/** Validates an already-parsed JSON body. Issue messages describe limits, never echo input. */
export function parseChatRequest(input: unknown): ParseResult {
  const result = chatRequestSchema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    issues: result.error.issues.slice(0, 5).map((issue) => ({
      path: issue.path.join(".") || "(body)",
      message: issue.message,
    })),
  };
}
