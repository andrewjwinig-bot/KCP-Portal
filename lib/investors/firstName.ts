/**
 * How to address this owner on a button: "Email Judith", not "Email the
 * investor".
 *
 * A first name only works for a PERSON. Half this roster is companies and
 * trusts — Hyman Korman Co., The Korman Co, The Honickman Foundation, Berton E
 * Korman TUA — and reducing those to their first word gives "Email Hyman",
 * "Email The", "Email Berton", each of which names something that is not the
 * recipient. A trust in a dead man's name is the worst of them.
 *
 * So the reduction is only applied where the name reads as a person, and the
 * full name is used otherwise. Erring toward the full name is free: it is
 * merely longer, while the wrong short name is wrong.
 */
const ENTITY_WORDS = /\b(inc|llc|llp|lp|co|corp|corporation|company|trust|tua|tr|foundation|associates|assoc|partnership|jv|ventures?|management|gst|fbo|estate|u\/w|u\/i)\b/i;

/**
 * @param heldAs the trust / held-as line. A row can read as a person and be a
 *   TRUST — "Berton E. Korman" held as "Berton E Korman TUA Dtd 02232018" —
 *   and he has died, so "Email Berton" addresses the wrong party entirely.
 *   Where the held-as names a trust, the full name is used.
 */
export function addressAs(name: string, heldAs?: string | null): string {
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) return "";
  if (/^the\b/i.test(clean)) return clean;
  if (ENTITY_WORDS.test(clean)) return clean;
  if (heldAs && ENTITY_WORDS.test(heldAs)) return clean;
  const first = clean.split(" ")[0];
  // A single initial is not a name to address someone by.
  return first.replace(/\.$/, "").length > 1 ? first : clean;
}
