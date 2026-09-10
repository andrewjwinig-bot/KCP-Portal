// Standing preferences for the search assistant — the mechanism that lets it
// "learn" from feedback. Staff teach it once ("keep answers to one sentence",
// "always whole dollars", "don't add page links") and every future answer
// follows, because these instructions are injected into the system prompt.
//
// Deliberately simple + transparent (not opaque fine-tuning): the list is
// visible and editable, and applies team-wide (this is a small shared tool).
import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";

const NS = "assistant-prefs";
const KEY = "global";
const MAX = 20;

export type AssistantPrefs = { instructions: string[]; updatedAt: string };

export async function getAssistantPrefs(): Promise<AssistantPrefs> {
  const raw = (await getJSON(NS, KEY).catch(() => null)) as AssistantPrefs | null;
  return raw && Array.isArray(raw.instructions) ? raw : { instructions: [], updatedAt: "" };
}

export async function addAssistantPref(text: string): Promise<AssistantPrefs> {
  const t = text.trim().replace(/\s+/g, " ").slice(0, 200);
  const cur = await getAssistantPrefs();
  if (!t) return cur;
  // De-dupe (case-insensitive), newest last, cap the list.
  const kept = cur.instructions.filter((x) => x.toLowerCase() !== t.toLowerCase());
  const next: AssistantPrefs = { instructions: [...kept, t].slice(-MAX), updatedAt: new Date().toISOString() };
  await storeJSON(NS, KEY, next);
  return next;
}

export async function removeAssistantPref(text: string): Promise<AssistantPrefs> {
  const cur = await getAssistantPrefs();
  const next: AssistantPrefs = { instructions: cur.instructions.filter((x) => x !== text), updatedAt: new Date().toISOString() };
  await storeJSON(NS, KEY, next);
  return next;
}

export async function clearAssistantPrefs(): Promise<AssistantPrefs> {
  const next: AssistantPrefs = { instructions: [], updatedAt: new Date().toISOString() };
  await storeJSON(NS, KEY, next);
  return next;
}
