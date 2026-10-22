// How the By Investor roster orders itself: people by SURNAME, companies and
// foundations gathered at the end.
//
// Sorted on the full name, "Alison Korman Feldman" filed under A and "Carolyn
// Korman Jacobs" under C, so a family reads in first-name order and nobody can
// be found the way a contact list is read. Companies interleaved among them
// made it worse — "The Korman Co" between Susan and Steven is not a person you
// are looking for.

/** Marks a name as a company, trust or foundation rather than a person. */
const ENTITY_WORDS = /\b(inc|llc|llp|lp|co|corp|corporation|company|foundation|associates|assoc|partnership|jv|ventures?|management|trust)\b/i;

export function isEntityName(name: string): boolean {
  const clean = name.trim();
  if (!clean) return false;
  // "The Honickman Foundation", "The Korman Co" — an article never starts a
  // person's name here.
  if (/^the\b/i.test(clean)) return true;
  return ENTITY_WORDS.test(clean);
}

/**
 * The word to file a person under.
 *
 * The last alphabetic word of two letters or more, so middle initials and the
 * trailing punctuation of "Joan R. Sohn" or "Steven H. Korman" don't become
 * the surname. Names carrying a maiden or family name in the middle —
 * "Shirley Honickman Hahn", "Sidney Jacobs Glass" — file under the last, which
 * is how they are addressed.
 */
export function surnameKey(name: string): string {
  const words = name.toUpperCase().replace(/[^A-Z ]/g, " ").split(/\s+/).filter((w) => w.length > 1);
  return words.length ? words[words.length - 1] : name.toUpperCase().trim();
}

/**
 * People first, by surname then full name; entities last, alphabetically.
 *
 * The full name breaks a surname tie so two Kormans keep a stable order rather
 * than depending on the input's.
 */
export function compareInvestors(a: string, b: string): number {
  const ae = isEntityName(a), be = isEntityName(b);
  if (ae !== be) return ae ? 1 : -1;
  if (ae) return a.localeCompare(b);
  return surnameKey(a).localeCompare(surnameKey(b)) || a.localeCompare(b);
}
