"use client";

// WHERE PAYROLL LANDS (owner: "worth doing a check that all payroll
// allocations flow correctly to their respective properties budgets"). Every
// dollar the payroll budget allocates, by property and account, beside the
// budget line it lands on — the draft's own rule (`payrollFlowCheck`). Amounts
// are read off the LIVE doc as it is edited; where each lands comes from the
// server (the statement mappings). Anything that reaches no budget is the
// exception, so only that is coloured.

import { useMemo } from "react";
import { Pill, TONE_AMBER, tiesTone } from "@/app/components/Pill";
import { th, thL, td, tdL } from "@/app/components/tableStyles";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import type { PayrollBudgetDoc } from "@/lib/financials/budgets/payrollBudget";
import { payrollTargetsOf } from "@/lib/financials/budgets/payrollFlow";

export type Landing = Record<string, { line: string | null; problem: "no-code" | "not-budgeted" | "no-line" | null }>;

const money0 = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const NAME = new Map(PROPERTY_DEFS.map((p) => [p.id, p.name]));
const PROBLEM: Record<string, string> = {
  "no-code": "No property code",
  "not-budgeted": "Property not budgeted",
  "no-line": "No line takes this account",
};

export function PayrollFlowCard({ doc, landing }: { doc: PayrollBudgetDoc; landing: Landing | null }) {
  const rows = useMemo(() => payrollTargetsOf(doc).map((t) => {
    const l = landing?.[`${t.code ?? ""}|${t.gl}`];
    return { ...t, line: l?.line ? (t.auto ? `${l.line} · Auto Allowance row` : l.line) : null, problem: l ? l.problem : landing ? "no-line" : null };
  }).sort((x, y) => String(x.code ?? "~").localeCompare(String(y.code ?? "~")) || x.gl.localeCompare(y.gl) || Number(!!x.auto) - Number(!!y.auto)), [doc, landing]);
  if (!landing) return null;
  const total = rows.reduce((s, r) => s + r.annual, 0);
  const missed = rows.filter((r) => !r.line);
  const missedTotal = missed.reduce((s, r) => s + r.annual, 0);

  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 800, fontSize: 15 }}>Where Payroll Lands</span>
        <span className="muted small" style={{ flex: 1 }}>Each property&rsquo;s budget carries these figures on the line shown — 2010&rsquo;s on Payroll &amp; Benefits (8000-9900).</span>
        {missed.length
          ? <Pill tone={TONE_AMBER}>{money0(missedTotal)} REACHES NO BUDGET</Pill>
          : <Pill tone={tiesTone(true)}>ALL {money0(total)} LANDS</Pill>}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={thL}>Property</th><th style={thL}>Account</th><th style={th}>Annual</th><th style={th}>Monthly</th><th style={thL}>Lands on</th>
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.code}-${r.gl}-${r.label}-${i}`}>
                <td style={tdL}>{r.code ? <><code style={{ fontSize: 12 }}>{r.code}</code> {NAME.get(r.code) ?? r.name}</> : r.name}</td>
                <td style={tdL}>{r.label} <span className="muted small">{r.gl}</span></td>
                <td style={td}>{money0(r.annual)}</td>
                <td style={{ ...td, color: "var(--muted)" }}>{money0(r.annual / 12)}</td>
                <td style={tdL}>{r.line ? r.line : <Pill tone={TONE_AMBER}>{PROBLEM[r.problem ?? "no-line"]}</Pill>}</td>
              </tr>
            ))}
            <tr>
              <td style={{ ...tdL, fontWeight: 700, borderTop: "2px solid var(--border)" }} colSpan={2}>Total allocated</td>
              <td style={{ ...td, fontWeight: 700, borderTop: "2px solid var(--border)" }}>{money0(total)}</td>
              <td style={{ ...td, color: "var(--muted)", borderTop: "2px solid var(--border)" }}>{money0(total / 12)}</td>
              <td style={{ ...tdL, borderTop: "2px solid var(--border)" }} />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
