// Pure resolution of a GL header property code → the canonical statement
// mapping key. Kept free of server-only deps so it's unit-testable.

import type { StatementMapping } from "./types";

// GL header property codes that match neither a mapping key nor a mapping's
// propertyCode — the fund-level ledgers export their own fund codes.
const KEY_ALIASES: Record<string, string> = {
  FJVIII: "PJV3",   // Lincoln JV III fund GL → PJV3 mapping
  FNIPLX: "PNIPLX", // Neshaminy Interplex LLC fund GL → PNIPLX mapping
  FIIICO: "CONDO",  // Neshaminy III Condo fund GL → CONDO mapping
};

/** Resolve a GL header property code to its canonical mapping key, or null.
 *  Handles: the code IS a key; the code matches a mapping's propertyCode (e.g.
 *  "PIIICO" → "CONDO", "PHOMES" → "KORMAN HOMES"); or a fund-code alias
 *  (FJVIII → PJV3). */
export function resolveKeyIn(all: Record<string, StatementMapping>, code: string): string | null {
  if (all[code]) return code;
  const byProp = Object.entries(all).find(([, m]) => m.propertyCode === code);
  if (byProp) return byProp[0];
  const alias = KEY_ALIASES[code];
  return alias && all[alias] ? alias : null;
}
