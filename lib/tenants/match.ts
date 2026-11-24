// Fuzzy matching of a free-text company name (typed by a tenant on the
// public /submit or /reserve forms) against the canonical rent-roll
// occupant names. Staff use this to "resolve" a request to a real tenant
// without having to hand-pick from the dropdown every time.

export type TenantMatch = { name: string; score: number };

// Legal-entity boilerplate that adds no signal — "Acme LLC" and "Acme"
// are the same tenant. Stripped before scoring.
const NOISE = new Set([
  "the", "llc", "llc.", "inc", "inc.", "incorporated", "corp", "corp.",
  "corporation", "co", "co.", "company", "ltd", "ltd.", "limited", "lp",
  "llp", "plc", "pllc", "group", "holdings", "enterprises", "associates",
  "partners", "and", "&", "of",
]);

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function meaningfulTokens(s: string): string[] {
  const all = tokens(s);
  const kept = all.filter((t) => !NOISE.has(t));
  // If stripping noise left nothing (e.g. name was "The Co"), fall back
  // to the raw tokens so we still have something to score.
  return kept.length > 0 ? kept : all;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const curr = [i + 1];
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      curr.push(Math.min(curr[j] + 1, prev[j + 1] + 1, prev[j] + cost));
    }
    prev = curr;
  }
  return prev[b.length];
}

function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - levenshtein(a, b) / max;
}

// Score how well a typed name matches a candidate rent-roll name. 1 is a
// perfect match (ignoring case, punctuation, and legal suffixes); 0 is
// nothing in common.
export function scoreTenant(input: string, candidate: string): number {
  const ai = meaningfulTokens(input);
  const ac = meaningfulTokens(candidate);
  if (ai.length === 0 || ac.length === 0) return 0;

  const joinedA = ai.join(" ");
  const joinedB = ac.join(" ");
  if (joinedA === joinedB) return 1;

  // Whole-string edit distance — catches typos and minor word changes.
  const editScore = similarity(joinedA, joinedB);

  // Token overlap (Jaccard) — catches reordering and extra/missing words.
  const setA = new Set(ai);
  const setB = new Set(ac);
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;
  const jaccard = intersection / (setA.size + setB.size - intersection);

  // Per-token best match — handles a typo inside one word of a multi-word
  // name (e.g. "Acme Widgts" vs "Acme Widgets").
  let tokenSum = 0;
  for (const t of setA) {
    let best = 0;
    for (const c of setB) best = Math.max(best, similarity(t, c));
    tokenSum += best;
  }
  const tokenScore = tokenSum / setA.size;

  // One name fully contains the other's meaningful tokens — strong signal
  // even if lengths differ a lot ("Acme" typed for "Acme Widgets Inc").
  const aInB = [...setA].every((t) => setB.has(t));
  const bInA = [...setB].every((t) => setA.has(t));
  const containment = aInB || bInA ? 0.9 : 0;

  return Math.max(editScore, jaccard, tokenScore, containment);
}

// Pick the closest rent-roll name to a typed company name. Returns null
// when nothing clears the confidence threshold, so callers can fall back
// to leaving the free-text value as-is.
export function bestTenantMatch(
  input: string,
  candidates: string[],
  threshold = 0.55,
): TenantMatch | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  let best: TenantMatch | null = null;
  for (const name of candidates) {
    const score = scoreTenant(trimmed, name);
    if (!best || score > best.score) best = { name, score };
  }
  return best && best.score >= threshold ? best : null;
}

// True when the typed name already matches a candidate well enough that
// no resolution prompt is worth showing.
export function isResolvedTenant(input: string, candidates: string[]): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  return candidates.some((c) => scoreTenant(trimmed, c) >= 0.97);
}
