// Pure decision for the annual Statement-of-Values dashboard reminder. Kept in a
// plain module (no React) so it's unit-testable. Target = March 1 (finalize the
// values before K-1 financials are due); the tile is seasonal — it only appears
// in the run-up window and turns green once this season's estimates are set.

export type ReminderTone = "paid" | "soon" | "action" | "neutral";
export type AnnualStatementState = { id: string; tone: ReminderTone; title: string; sub: string } | null;

const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export function annualStatementReminderState(today: Date, asOf: string): AnnualStatementState {
  const t0 = new Date(today); t0.setHours(0, 0, 0, 0);
  const y = t0.getFullYear();
  const targetYear = t0.getMonth() > 2 ? y + 1 : y; // April or later → next year's run
  const target = new Date(targetYear, 2, 1); target.setHours(0, 0, 0, 0); // Mar 1
  const daysUntil = Math.round((target.getTime() - t0.getTime()) / 86400000);
  if (daysUntil > 60 || daysUntil < -31) return null; // out of season

  const asOfYear = /^(\d{4})-/.exec(asOf)?.[1];
  const finalized = !!asOfYear && Number(asOfYear) === targetYear;
  const runYear = targetYear - 1; // the year-end being circulated
  if (finalized) {
    return { id: `done:${targetYear}`, tone: "paid", title: "Statement of values finalized",
      sub: `${runYear} values set ${fmt(new Date(asOf + "T00:00:00"))} · ready to circulate for K-1s` };
  }
  if (daysUntil <= 0) {
    return { id: `late:${targetYear}`, tone: "action", title: "Finalize statement of values",
      sub: `${runYear} K-1 statements — was due ${fmt(target)} (${-daysUntil} day${daysUntil === -1 ? "" : "s"} ago)` };
  }
  return { id: `soon:${targetYear}`, tone: daysUntil <= 21 ? "soon" : "neutral", title: "Annual statement of values",
    sub: `Finalize ${runYear} values before K-1s · due ${fmt(target)} · in ${daysUntil} day${daysUntil === 1 ? "" : "s"}` };
}
