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

/** Literal (non-wildcard) character count of a single mask token — a
 *  specificity proxy: more literal characters ⇒ narrower match. */
function tokenLiterals(token: string): number {
  return token.replace(/\.\.\d+/g, "0").replace(/[*\-\s]/g, "").length;
}

/** For an account matched by `mask`, the specificity of its best-matching token
 *  (−1 when no token matches). */
function maskSpecificityFor(mask: string, account: string): number {
  let best = -1;
  for (const tok of mask.split(",").map((t) => t.trim()).filter(Boolean)) {
    if (tokenMatches(tok, account)) best = Math.max(best, tokenLiterals(tok));
  }
  return best;
}

/** Assign each account to exactly ONE mask — the one that matches it most
 *  specifically. A specific mask ("8210-8501") beats a catch-all ("8*-*") in
 *  the same section, so a catch-all never re-counts an account that already has
 *  its own line (which would double-count it in the section subtotal). Ties go
 *  to the earlier mask. Returns, per input-mask index, the accounts it owns.
 *
 *  Every account matched by at least one mask is claimed by exactly one, so the
 *  union of the returned lists equals `accountsMatchingMask` over all masks —
 *  the trial-balance / unmapped tie-out is unaffected. */
export function claimAccounts(masks: string[], accounts: string[]): string[][] {
  const owned: string[][] = masks.map(() => []);
  for (const acct of accounts) {
    let bestIdx = -1;
    let bestSpec = -1;
    for (let i = 0; i < masks.length; i++) {
      const s = maskSpecificityFor(masks[i], acct);
      if (s > bestSpec) { bestSpec = s; bestIdx = i; }
    }
    if (bestIdx >= 0) owned[bestIdx].push(acct);
  }
  return owned;
}
