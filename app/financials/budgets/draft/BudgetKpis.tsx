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

  // NNN CHARGES PER SF (owner: "so we can quickly see how much each tenant will
  // pay in addition to their base rent"): the budget's recoverable pools —
  // CAM, INS, RET, the same pools the recoveries are figured on (non-CAM
  // parcels already out) — over the building's rentable SF. Before admin fees,
  // caps and exclusions, which are each lease's own. A property tab only: a
  // roll-up's SF spans buildings that bill separately.
  const est = draft.reimbursementEstimate;
  const gla = (draft.tenantRevenue ?? []).filter((t) => !t.recoveryOnly).reduce((a, t) => a + (t.sqft || 0), 0);
  const pools = est?.pools;
  const nnn = !draft.consolidated && pools && gla > 0
    ? { cam: pools.cam / gla, ins: pools.ins / gla, ret: pools.ret / gla }
    : null;
  const psf = (n: number) => `$${n.toFixed(2)}`;
  const office = est?.kind === "office";

  return (
    <div className="pills">
      <StatPill label={`${draft.budgetYear} Total revenue`} value={money0(rev.now)} sub={vs(rev)} />
      <StatPill label="Operating expenses" value={money0(opex.now)} sub={vs(opex)} />
      {nnn && (
        <StatPill label={office ? "Op Ex + RET / SF" : "NNN / SF"} value={psf(nnn.cam + nnn.ins + nnn.ret)}
          sub={`CAM ${psf(nnn.cam)}${office ? "" : ` · INS ${psf(nnn.ins)}`} · RET ${psf(nnn.ret)} · on ${Math.round(gla).toLocaleString("en-US")} SF${office ? " · before base-year stops" : " · before admin fees"}`} />
      )}
      <StatPill label="NOI" value={money0(noi.now)} sub={vs(noi)} accent={tone(noi.now) ?? "#15803d"} />
      <StatPill label="Net cash flow" value={money0(cf.now)} sub={`${vs(cf)} · after capital & debt`} accent={tone(cf.now)} />
    </div>
  );
}
