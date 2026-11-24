// A partnership's code, as its stored DOCUMENTS may spell it.
//
// A K-1 (or a partnership tax document) carries the property code it was
// uploaded with. Owner ids are stable by rule — they are the upload target, so
// renaming one orphans the document attached to it — but a CODE is a label and
// can be corrected. When it is, every reader that compares a stored code to the
// roster's code stops matching, and each one fails DIFFERENTLY:
//
//   • the collection count reads "0 of 24" while every row shows VIEW, because
//     the count is per-property and the rows are per-owner;
//   • `k1sFor` / `k1YearsFor` return nothing for the year;
//   • `partnershipName` falls through to the raw code, so an investor's
//     document reads "HKC" instead of "Hyman Korman Company".
//
// The portal itself is safe by construction — it resolves a document's
// partnership through the OWNER's roster entry rather than through the stored
// code — which is exactly why a mismatch is easy to miss: the investor sees the
// right thing while staff see an empty roster.
//
// So the alias lives in ONE place and every code-based reader goes through it.
//
// Hyman Korman Company shipped briefly as "HKC" before being corrected to
// "HKCo". Safe to delete this entry once nothing is stored under the old
// spelling.
export const PROPERTY_CODE_ALIASES: Record<string, string[]> = {
  HKCo: ["HKC"],
};

const norm = (c: string) => (c ?? "").trim().toUpperCase();

/** Every code a roster entry's documents may be filed under, itself included. */
export function codesFor(rosterCode: string): string[] {
  const hit = Object.entries(PROPERTY_CODE_ALIASES)
    .find(([canonical]) => norm(canonical) === norm(rosterCode));
  return [rosterCode, ...(hit ? hit[1] : [])];
}

/** Does a stored document belong to this roster entry? */
export function isSameProperty(docCode: string, rosterCode: string): boolean {
  return codesFor(rosterCode).some((c) => norm(c) === norm(docCode));
}

/** The code a stored one has since been corrected to — itself when unaliased. */
export function canonicalPropertyCode(docCode: string): string {
  const hit = Object.entries(PROPERTY_CODE_ALIASES)
    .find(([, olds]) => olds.some((o) => norm(o) === norm(docCode)));
  return hit ? hit[0] : docCode;
}
