// Week over week: each account's balance against the one it carried about a
// week earlier. Every import writes a dated snapshot (`snap-YYYY-MM-DD`), so
// the comparison is the account's NEWEST snapshot at least `MIN_GAP_DAYS`
// before its current as-of date — a second import mid-week does not become
// the baseline, and a weekend's slop (Mon one week, Wed the next) still finds
// last week. No snapshot that old → no change shown, never a guess.

export const MIN_GAP_DAYS = 5;

export type SnapBalance = { balance: number; asOf: string };
export type Snapshot = { date: string; accounts: Record<string, SnapBalance> };

const dayNum = (iso: string) => Math.round(Date.parse(`${iso}T12:00:00Z`) / 86_400_000);

/** The baseline for one account, or null when no snapshot is old enough. */
export function priorFor(id: string, currentAsOf: string, snapshots: Snapshot[]): SnapBalance | null {
  const cutoff = dayNum(currentAsOf) - MIN_GAP_DAYS;
  let best: SnapBalance | null = null;
  for (const s of snapshots) {
    const rec = s.accounts?.[id];
    if (!rec || dayNum(rec.asOf) > cutoff) continue;
    if (!best || rec.asOf > best.asOf) best = rec;
  }
  return best;
}
