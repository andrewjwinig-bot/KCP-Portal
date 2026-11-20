// How an allocated send READS. Pure — pinned by billedLabel.test.ts.

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
}
export const shortMonth = (ym: string) => { const [y, m] = ym.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "short" }); };

/** What a send BILLS, as it should read (owner: "its generally just the last
 *  month's GL that we need to label it as"). The 2000 GL is imported a full
 *  year at a time so late postings to finalized months are caught, but the
 *  months already finalized are not re-billed — so a Jan–Jul GL bills July:
 *  "July 2026", and "+ late charges (Mar, Jun)" when the catch-up carries any. */
export function billedOf(res: { months: { statementMonth: string }[]; catchup: { sourceMonths?: string[] } | null }): { billedLabel: string; billedMonths: string[] } {
  const fresh = res.months.map((m) => m.statementMonth).sort();
  const late = [...new Set(res.catchup?.sourceMonths ?? [])].sort();
  const lateText = late.length ? `late charges (${late.map(shortMonth).join(", ")})` : "";
  let base = "";
  if (fresh.length === 1) base = monthLabel(fresh[0]);
  else if (fresh.length > 1) base = `${shortMonth(fresh[0])}${fresh[0].slice(0, 4) !== fresh[fresh.length - 1].slice(0, 4) ? ` ${fresh[0].slice(0, 4)}` : ""} – ${monthLabel(fresh[fresh.length - 1])}`;
  const billedLabel = base ? (lateText ? `${base} + ${lateText}` : base) : (lateText ? `Late charges (${late.map(shortMonth).join(", ")} ${late[late.length - 1].slice(0, 4)})` : "");
  return { billedLabel, billedMonths: fresh };
}
