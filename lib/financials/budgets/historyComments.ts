// The line-history popup's COMMENTS — what the monthly table says about the
// budget being set, each with the thing to do about it. They read the SAME
// numbers the table shows (the draft's months, this year's reprojection and
// budget, prior actuals), so a comment can always be checked against the row
// above it. The history's own reading (`lineInsight` notes) comes first; the
// rest compare the draft against it. Scarce by design: every comparison has a
// dollar floor, as every flag in this app does.

import type { LineHistory, LineYear } from "./lineHistory";
import type { LineInsight } from "./lineInsight";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const money0 = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const sum = (a: number[]) => a.reduce((s, n) => s + (n || 0), 0);
const median = (xs: number[]) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
/** A gap worth a sentence: at least $250 and 3% of the larger side. */
const worth = (a: number, b: number) => Math.abs(a - b) >= Math.max(250, 0.03 * Math.max(Math.abs(a), Math.abs(b)));

export function historyComments(h: LineHistory, ins: LineInsight | null | undefined, budgetYear: number, draftMonths: number[] | null): string[] {
  const out: string[] = [...(ins?.notes ?? [])];
  const basis: LineYear | undefined = h.years.find((y) => y.year === budgetYear - 1);
  const draft = draftMonths ? sum(draftMonths) : null;

  // This year so far against its own budget — the run-rate the draft follows.
  if (basis?.months && basis.budgetMonths && basis.monthsCovered > 0 && basis.monthsCovered < 12) {
    const n = basis.monthsCovered;
    const act = sum(basis.months.slice(0, n)), bud = sum(basis.budgetMonths.slice(0, n));
    if (worth(act, bud) && Math.abs(bud) > 0.5) {
      const p = Math.round(((act - bud) / Math.abs(bud)) * 100);
      out.push(`${basis.year} is running ${money0(Math.abs(act - bud))} (${Math.abs(p)}%) ${act > bud ? "over" : "under"} budget through ${MONTHS[n - 1]} — ${act > bud ? "the reprojection's remaining months may be light." : "check whether the rest of the year will catch up."}`);
    }
  }

  // A month that stood out this year — worth opening before it is budgeted again.
  if (basis?.months && basis.monthsCovered > 2) {
    const posted = basis.months.slice(0, basis.monthsCovered);
    posted.forEach((v, i) => {
      const others = posted.filter((_, j) => j !== i);
      const med = median(others);
      if (v >= 500 && med > 0 && v >= 2 * med && v - med >= 500) {
        out.push(`${MONTHS[i]} ${basis.year} ran ${money0(v)}, ${Math.round((v / med) * 10) / 10}× a normal month — open it to see whether it was a one-off before it shapes ${budgetYear}.`);
      }
    });
  }

  if (draft != null) {
    // The draft against this year's reprojection.
    if (basis) {
      const covered = basis.months ? basis.monthsCovered : 0;
      const reproj = sum(Array.from({ length: 12 }, (_, i) => (i < covered ? basis.months?.[i] ?? 0 : basis.budgetMonths?.[i] ?? 0)));
      if (Math.abs(reproj) > 0.5 && worth(draft, reproj)) {
        const p = Math.round(((draft - reproj) / Math.abs(reproj)) * 100);
        out.push(`The ${budgetYear} budget is ${money0(Math.abs(draft - reproj))} (${Math.abs(p)}%) ${draft > reproj ? "above" : "below"} the ${basis.year} reprojection.`);
      }
    }
    // The draft against what the history supports.
    if (ins?.suggestion && worth(draft, ins.suggestion.amount)) {
      out.push(`History supports about ${money0(ins.suggestion.amount)} (${ins.suggestion.basis}); the draft is ${money0(Math.abs(draft - ins.suggestion.amount))} ${draft > ins.suggestion.amount ? "above" : "below"} that.`);
    }
    // Shape: the history posts in a few months but the draft spreads evenly.
    const active = ins?.activeMonths ?? [];
    const draftActive = draftMonths!.filter((v) => Math.abs(v) > 0.5).length;
    if (active.length > 0 && active.length <= 8 && draftActive === 12) {
      out.push(`It has only posted in ${active.map((m) => MONTHS[m - 1] ?? m).join(", ")} — spread the ${budgetYear} budget over those months rather than evenly.`);
    }
  }
  // The insight's own "posts in N months" note says the same as the shape
  // comment above; keep one.
  return out.filter((c, i) => !(c.startsWith("Posts in ") && out.some((o, j) => j !== i && o.startsWith("It has only posted in"))));
}
