// Merge several uploaded GLs for the same property + year into one continuous
// series, so every month that has been uploaded is visible — whether staff
// upload one cumulative year-to-date file or one file per month.
//
// Each file covers a contiguous range of months. We infer that range from the
// data (the first → last month with activity) so it works on existing uploads
// without re-importing. Within a covered month, the newest upload wins.
//
// Pure (operates on plain GL-shaped objects) so it's unit-tested.

export type AssembleInput = {
  uploadedAt: string;
  maxPeriodInFile: number;
  monthly: Record<string, number[]>;
  beginning?: Record<string, number>;
  ytdTotal?: Record<string, number>;
  names?: Record<string, string>;
};

/** A GL upload plus its per-account transactions (each carrying a reporting
 *  month 1–12), for merging transactions across uploads. */
export type TxnVersion<T extends { month: number }> = AssembleInput & {
  transactions: Record<string, T[]>;
};

/**
 * Merge several uploads' transactions for one property/year, applying the same
 * coverage rule as {@link assembleGls}: each upload owns the months it covers
 * (its first active month → its max period), and a newer upload's months
 * supersede an older one's. Returns account → transactions. Pure, so the
 * drill-down's "every month" behavior is unit-tested.
 */
export function mergeTransactions<T extends { month: number }>(versions: TxnVersion<T>[]): Record<string, T[]> {
  const ordered = [...versions].sort((a, b) => (a.uploadedAt < b.uploadedAt ? -1 : 1)); // oldest → newest
  const byAccount: Record<string, T[]> = {};
  for (const v of ordered) {
    const start = coverageStart(v);
    const end = Math.min(12, v.maxPeriodInFile || 0);
    for (const acct of Object.keys(byAccount)) {
      byAccount[acct] = byAccount[acct].filter((t) => t.month < start || t.month > end);
    }
    for (const [acct, list] of Object.entries(v.transactions)) {
      const keep = list.filter((t) => t.month >= start && t.month <= end);
      if (keep.length) (byAccount[acct] ??= []).push(...keep);
    }
  }
  for (const acct of Object.keys(byAccount)) if (!byAccount[acct].length) delete byAccount[acct];
  return byAccount;
}

/** First month (1–12) with any activity in a file = where its coverage starts. */
export function coverageStart(g: AssembleInput): number {
  const max = Math.max(1, Math.min(12, g.maxPeriodInFile || 12));
  for (let m = 1; m <= max; m++) {
    if (Object.values(g.monthly).some((nets) => Math.abs(nets?.[m - 1] ?? 0) > 0.005)) return m;
  }
  return max;
}

/**
 * Merge GLs (same key + year). Newer uploads overwrite older ones for the
 * months they cover; beginning balance comes from the file that starts earliest
 * (the year opening); YTD Total + max period come from the furthest-reaching
 * file. Returns null for an empty list. Preserves all extra fields of the
 * newest file (id, key, fileName, …).
 */
export function assembleGls<T extends AssembleInput>(gls: T[]): T | null {
  if (!gls.length) return null;
  const ordered = [...gls].sort((a, b) => (a.uploadedAt < b.uploadedAt ? -1 : 1)); // oldest → newest

  const monthly: Record<string, number[]> = {};
  const names: Record<string, string> = {};
  let beginning: Record<string, number> | undefined;
  let beginningStart = Infinity;
  let ytdTotal: Record<string, number> | undefined;
  let maxRangeEnd = 0;
  let uploadedAt = ordered[0].uploadedAt;

  for (const g of ordered) {
    const start = coverageStart(g);
    const end = Math.min(12, g.maxPeriodInFile || 0);
    for (const [acct, nets] of Object.entries(g.monthly)) {
      const arr = (monthly[acct] ??= new Array(12).fill(0));
      for (let m = start; m <= end; m++) arr[m - 1] = nets?.[m - 1] ?? 0;
    }
    if (g.names) for (const [a, n] of Object.entries(g.names)) if (n && !names[a]) names[a] = n;
    if (g.beginning && start < beginningStart) { beginning = g.beginning; beginningStart = start; }
    if (end >= maxRangeEnd) { maxRangeEnd = end; if (g.ytdTotal) ytdTotal = g.ytdTotal; }
    if (g.uploadedAt > uploadedAt) uploadedAt = g.uploadedAt;
  }

  // "Actuals through" = the last month of the CONTIGUOUS run of active months
  // from the first active month — NOT the report-range end, and not a stray
  // later entry (e.g. a year-end balance-sheet line posted to December). That
  // way a GL run for the whole year with only Jan–Feb posted reports Feb, so the
  // reprojection fills Mar–Dec from budget.
  const monthActive = (m: number) =>
    Object.values(monthly).some((nets) => Math.abs(nets[m - 1] ?? 0) > 0.005);
  let firstActive = 0;
  for (let m = 1; m <= 12 && firstActive === 0; m++) if (monthActive(m)) firstActive = m;
  let through = firstActive;
  for (let m = firstActive + 1; m <= 12; m++) {
    if (monthActive(m)) through = m;
    else break;
  }
  const maxPeriodInFile = through || maxRangeEnd;

  const base = ordered[ordered.length - 1]; // newest, for id/key/fileName/etc.
  return { ...base, monthly, beginning, ytdTotal, names, maxPeriodInFile, uploadedAt };
}
