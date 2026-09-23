"use client";

// The property's budget at a glance, at the top of the draft: revenue,
// operating expenses, NOI and net cash flow (after capital and debt service),
// each against THIS year's forecast — the reprojection the draft grew from —
// so "is this budget up or down on this year, and why" reads before any table.

import { StatPill } from "@/app/components/Pill";
import type { BudgetDraft } from "@/lib/financials/budgets/draft";
import { EXPENSE_ROLES, type SectionRole } from "@/lib/financials/operating-statements/types";

const money0 = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");

export function BudgetKpis({ draft }: { draft: BudgetDraft }) {
  const sum = (roles: SectionRole[], pick: "total" | "basis") =>
    draft.sections.filter((s) => roles.includes(s.role))
      .reduce((a, s) => a + s.lines.reduce((b, l) => b + (pick === "total" ? l.total : l.basisTotal), 0), 0);
  const rev = { now: sum(["revenue", "reimbursement"], "total"), was: sum(["revenue", "reimbursement"], "basis") };
  const opex = { now: sum(EXPENSE_ROLES, "total"), was: sum(EXPENSE_ROLES, "basis") };
  const cap = { now: sum(["capital"], "total"), was: sum(["capital"], "basis") };
  const debt = { now: sum(["debt-service"], "total"), was: sum(["debt-service"], "basis") };
  const noi = { now: rev.now - opex.now, was: rev.was - opex.was };
  const cf = { now: noi.now - cap.now - debt.now, was: noi.was - cap.was - debt.was };

  const vs = (x: { now: number; was: number }) => {
    const d = x.now - x.was;
    if (Math.abs(x.was) < 0.5) return `${d >= 0 ? "+" : "−"}${money0(Math.abs(d)).replace("-", "")} vs ${draft.basisYear} reproj.`;
    const pct = (d / Math.abs(x.was)) * 100;
    return `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}% vs ${draft.basisYear} reproj. (${money0(x.was)})`;
  };
  const tone = (n: number) => (n < 0 ? "#b91c1c" : undefined);

  return (
    <div className="pills">
      <StatPill label={`${draft.budgetYear} Total revenue`} value={money0(rev.now)} sub={vs(rev)} />
      <StatPill label="Operating expenses" value={money0(opex.now)} sub={vs(opex)} />
      <StatPill label="NOI" value={money0(noi.now)} sub={vs(noi)} accent={tone(noi.now) ?? "#15803d"} />
      <StatPill label="Net cash flow" value={money0(cf.now)} sub={`${vs(cf)} · after capital & debt`} accent={tone(cf.now)} />
    </div>
  );
}
