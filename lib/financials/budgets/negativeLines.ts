import type { BudgetDraft } from "./draft";

/** Lines whose months or total go negative — the grid's own sections, not
 *  its subtotals, NOI or cash flow (which can), and not Debt Service (loan
 *  proceeds are a credit). */
export function negativeLines(draft: BudgetDraft): { section: string; label: string }[] {
  const out: { section: string; label: string }[] = [];
  for (const sec of draft.sections) {
    if (sec.role === "debt-service") continue;
    for (const l of sec.lines) {
      const subs = (l.subLines ?? []).flatMap((x) => [x, ...(x.items ?? [])]);
      if ([l, ...subs].some((x) => x.total < -0.5 || x.months.some((v) => v < -0.5))) out.push({ section: sec.name, label: l.label });
    }
  }
  return out;
}

