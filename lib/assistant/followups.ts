// SUGGESTED FOLLOW-UPS under an answer (owner: "make it as smart and intuitive
// as it can"). Two or three next questions the user is likely to ask, rendered
// as chips that ask them in one click — the cheapest way to show what the
// assistant can do without a manual. Validated like everything else the model
// returns: short, distinct, never a repeat of the question just asked.

const MAX = 3;

export function validateFollowups(raw: unknown, asked = ""): string[] {
  if (!Array.isArray(raw)) return [];
  const askedKey = asked.trim().toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const f of raw) {
    const q = String(f ?? "").replace(/\s+/g, " ").trim().slice(0, 90);
    const key = q.toLowerCase();
    if (q.length < 8 || seen.has(key) || key === askedKey) continue;
    seen.add(key);
    out.push(q);
    if (out.length === MAX) break;
  }
  return out;
}
