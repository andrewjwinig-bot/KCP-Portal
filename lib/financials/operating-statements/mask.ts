// GL account-mask matcher for operating statements.
//
// Skyline accounts are two segments — a numeric root and a cost-center —
// joined by a hyphen, e.g. "4230-8501". Statement lines carry a MASK in
// column A that says which accounts roll into the line. The grammar, taken
// straight from the workbook:
//
//   • comma-separated OR list:   "6510-8501,6510-8502"
//   • exact:                     "6030-8502"
//   • full-segment wildcard:     "4230-*"        (any cost-center)
//   • prefix wildcard in a seg:  "6*-8503"       (root starts "6", CC 8503)
//                                "8190-8501,89*-*"
//                                "8*-85*"        (root starts "8", CC starts "85")
//   • numeric range on the root: "4980..4999-*"  (root in [4980,4999])
//
// Pure + dependency-free so it runs identically on client and server and is
// easy to unit-test (mask.test.ts is the guardrail).

/** Split an account or mask token into [root, costCenter]. A token without a
 *  hyphen is treated as a root with a wildcard cost-center. */
function splitToken(token: string): [string, string] {
  const i = token.indexOf("-");
  if (i < 0) return [token.trim(), "*"];
  return [token.slice(0, i).trim(), token.slice(i + 1).trim()];
}

/** Does one segment pattern match one segment value?
 *  Supports: "*" (any), "85*" / "6*" (prefix), "8501" (exact), and
 *  "4980..4999" (inclusive numeric range — root only, but applied uniformly). */
function segmentMatches(pattern: string, value: string): boolean {
  if (pattern === "*" || pattern === "") return true;
  // Numeric range a..b
  const range = pattern.match(/^(\d+)\.\.(\d+)$/);
  if (range) {
    const n = Number(value);
    if (!Number.isFinite(n)) return false;
    const lo = Number(range[1]);
    const hi = Number(range[2]);
    return n >= lo && n <= hi;
  }
  // Prefix wildcard, e.g. "89*", "8*"
  if (pattern.endsWith("*")) return value.startsWith(pattern.slice(0, -1));
  // Exact
  return pattern === value;
}

/** Match a single (non-comma) mask token against an account. */
function tokenMatches(token: string, account: string): boolean {
  const [mRoot, mCc] = splitToken(token);
  const [aRoot, aCc] = splitToken(account);
  return segmentMatches(mRoot, aRoot) && segmentMatches(mCc, aCc);
}

/** Does an account match a mask? Splits the mask on commas (OR) and tests
 *  each token. Whitespace around tokens is tolerated. */
export function accountMatchesMask(mask: string, account: string): boolean {
  const tokens = mask.split(",").map((t) => t.trim()).filter(Boolean);
  return tokens.some((t) => tokenMatches(t, account));
}

/** Of a set of accounts, return those matching the mask. Useful for building
 *  a line's drill-down account list. */
export function accountsMatchingMask(mask: string, accounts: string[]): string[] {
  return accounts.filter((a) => accountMatchesMask(mask, a));
}
