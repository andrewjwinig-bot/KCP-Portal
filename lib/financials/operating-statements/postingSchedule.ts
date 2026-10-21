// Which month each operating statement's GL is OWED through. Client-safe: the
// Operating Statements page's "Time to post" banner, the dashboard's GL
// coverage, the weekly digest and the Review all read it.
//
// Most statements are imported monthly — owed through the prior month. The
// land holdings are imported QUARTERLY (owner, 10/2026: "i dont think we need to
// do the land properties every month but every quarter, since there is a lot
// less activity"): Interstate (0800), Lincoln (0900), Kosano (2070) and the two
// Nockamixon holding partnerships around it (2040, 2080) owe a GL through the
// last completed quarter. They stay in the statement picker, Reprojections and
// the flags; only what is owed changes.

export const QUARTERLY_STATEMENTS = new Set(["0800", "0900", "2070", "2040", "2080"]);
export const isQuarterlyStatement = (keyOrCode: string | null | undefined) => QUARTERLY_STATEMENTS.has(String(keyOrCode ?? "").toUpperCase());

/** The month a monthly statement's GL should be posted through (prior month). */
export function expectedPostedThrough(now = new Date()): { year: number; period: number } {
  return now.getMonth() === 0
    ? { year: now.getFullYear() - 1, period: 12 }          // January → prior December
    : { year: now.getFullYear(), period: now.getMonth() }; // else prior month (getMonth() is already 1-behind, 1-indexed)
}

/** What one statement owes: the prior month, or — for a quarterly (land)
 *  statement — the end of the last completed quarter (in October, November and
 *  December still September; January–March the prior December). */
export function expectedPostedThroughFor(keyOrCode: string | null | undefined, now = new Date()): { year: number; period: number } {
  const m = expectedPostedThrough(now);
  if (!isQuarterlyStatement(keyOrCode)) return m;
  const q = m.period - (m.period % 3);
  return q > 0 ? { year: m.year, period: q } : { year: m.year - 1, period: 12 };
}
