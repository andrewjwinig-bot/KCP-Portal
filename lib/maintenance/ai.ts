// Single-shot Claude Haiku triage for inbound maintenance emails: produces a
// 1-2 sentence summary + 0-3 categories chosen from the portal's REQUEST_CATEGORIES.
// Used by the inbound webhook (auto) and the manual "Summarize" action on
// individual emails.

import "server-only";
import { REQUEST_CATEGORIES, type RequestCategory } from "@/lib/maintenance/requests";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5";

const SYSTEM_PROMPT = `You triage maintenance emails for a commercial property management company.
Given an email's subject and body, respond with a single JSON object of the form:
{
  "summary": "one or two sentence summary of the maintenance issue",
  "categories": ["Category1", "Category2"]
}
The "categories" array must contain 0-3 values picked exclusively from this list (use exact spelling):
${REQUEST_CATEGORIES.join(", ")}
If the email is not a maintenance issue (spam, marketing, general inquiry, etc.) return summary="" and categories=[].
Output only the JSON object — no preamble, no markdown fences.`;

export type AITriage = {
  summary: string;
  categories: RequestCategory[];
};

export const EMPTY_TRIAGE: AITriage = { summary: "", categories: [] };

export function isAIConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export async function summarizeEmail(subject: string, body: string): Promise<AITriage> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return EMPTY_TRIAGE;

  // Cap user content so a giant signature/quote chain doesn't blow up the request.
  const trimmedBody = body.slice(0, 4000);
  const userMessage = `Subject: ${subject || "(no subject)"}\n\nBody:\n${trimmedBody}`;

  let res: Response;
  try {
    res = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });
  } catch {
    return EMPTY_TRIAGE;
  }
  if (!res.ok) return EMPTY_TRIAGE;

  let data: { content?: { type: string; text?: string }[] };
  try {
    data = await res.json();
  } catch {
    return EMPTY_TRIAGE;
  }

  const text = (data.content ?? []).find((b) => b.type === "text")?.text ?? "";
  return parseTriage(text);
}

function parseTriage(text: string): AITriage {
  // The model is told to emit bare JSON, but be defensive against stray prose
  // or markdown fences.
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return EMPTY_TRIAGE;
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return EMPTY_TRIAGE;
  }
  if (!parsed || typeof parsed !== "object") return EMPTY_TRIAGE;
  const obj = parsed as { summary?: unknown; categories?: unknown };
  const summary = typeof obj.summary === "string" ? obj.summary.trim() : "";
  const validCats = new Set<string>(REQUEST_CATEGORIES);
  const categories = Array.isArray(obj.categories)
    ? obj.categories
        .filter((c): c is RequestCategory => typeof c === "string" && validCats.has(c))
        .slice(0, 3)
    : [];
  return { summary, categories };
}
