"use client";

// TEST A RAISE — pick an employee, key a raise (% or $) or a one-time bonus,
// and see what it does to every entity and building their allocation reaches.
// A sandbox: it re-runs the budget's own math (`raiseImpact` — the same
// FICA / Medicare / FUTA caps, the 401(k) match, the allocation % and each
// fund's PRS / Alt PRS basis) and saves NOTHING. A raise you like can be
// applied to the budget with one click; a bonus cannot (the budget carries
// salaries, not one-time pay).

import { useMemo, useState } from "react";
import { StatPill, Pill, TONE_NEUTRAL } from "@/app/components/Pill";
import { th, thL, td, tdL } from "@/app/components/tableStyles";
import { HoverCard } from "@/app/components/HoverCard";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import { ALLOC_COLUMNS, raiseImpact, type PayrollBudgetDoc, type RaiseTest, type RaiseImpactRow } from "@/lib/financials/budgets/payrollBudget";

const money0 = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const signed = (n: number) => (Math.abs(n) < 0.5 ? "–" : `${n > 0 ? "+" : "−"}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`);
const UP = "#b45309";
const NAME = new Map(PROPERTY_DEFS.map((p) => [p.id, p.name]));
const KIND_LABEL: Record<RaiseTest["kind"], string> = { pct: "Raise %", dollar: "Raise $", bonus: "Bonus $" };
const band: React.CSSProperties = { background: "rgba(11,74,125,0.07)", fontWeight: 800 };

export function RaiseTestCard({ doc, onApply }: { doc: PayrollBudgetDoc; onApply: (employeeId: string, salary: number) => void }) {
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState(doc.employees[0]?.id ?? "");
  const [kind, setKind] = useState<RaiseTest["kind"]>("pct");
  const [amountText, setAmountText] = useState("3");
  const amount = Number(amountText.replace(/[\s$,%]/g, "")) || 0;

  const impact = useMemo(
    () => (open && employeeId && amount ? raiseImpact(doc, { employeeId, kind, amount }) : null),
    [open, doc, employeeId, kind, amount],
  );
  const emp = doc.employees.find((e) => e.id === employeeId);

  // Group the moving rows by fund / misc, in the budget's own order.
  const groups = useMemo(() => {
    if (!impact) return [];
    const order = ["Shopping Centers", "NI LLC", "JV III", "Misc"];
    return order
      .map((g) => ({ g, rows: impact.rows.filter((r) => r.group === g).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)) }))
      .filter((x) => x.rows.length);
  }, [impact]);

  if (!open) {
    return (
      <div className="card" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px" }}>
        <span style={{ fontWeight: 800, fontSize: 15 }}>Test a Raise</span>
        <span className="muted small" style={{ flex: 1 }}>See what a raise or bonus for one employee does to every entity and building their allocation reaches. Nothing is saved.</span>
        <button type="button" className="btn sm" onClick={() => setOpen(true)}>Open ▸</button>
      </div>
    );
  }

  const e = impact?.employee;
  const dGross = e ? e.after.gross - e.before.gross : 0;
  const dTax = e ? (e.after.fica + e.after.medi + e.after.futa) - (e.before.fica + e.before.medi + e.before.futa) : 0;
  const d401 = e ? e.after.k401 - e.before.k401 : 0;
  const allocList = emp ? ALLOC_COLUMNS.filter((c) => (emp.alloc?.[c.key] || 0) > 0).map((c) => `${c.label} ${emp.alloc[c.key]}%`) : [];
  const label = (r: RaiseImpactRow) => (r.group === "Misc" ? r.label : NAME.get(r.code ?? "") ?? r.label);

  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 800, fontSize: 15 }}>Test a Raise</span>
        <Pill tone={TONE_NEUTRAL}>Nothing is saved</Pill>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn sm" onClick={() => setOpen(false)}>Close</button>
      </div>

      <div style={{ padding: "0 14px 12px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <select className="select-brand" value={employeeId} aria-label="Employee" onChange={(ev) => setEmployeeId(ev.target.value)}>
          {doc.employees.map((x) => <option key={x.id} value={x.id}>{x.name || "(unnamed)"}</option>)}
        </select>
        {(Object.keys(KIND_LABEL) as RaiseTest["kind"][]).map((k) => (
          <button key={k} type="button" className={kind === k ? "btn sm primary" : "btn sm"} aria-pressed={kind === k}
            onClick={() => { setKind(k); setAmountText(k === "pct" ? "3" : k === "dollar" ? "5,000" : "2,500"); }}>{KIND_LABEL[k]}</button>
        ))}
        <input value={amountText} inputMode="decimal" aria-label={KIND_LABEL[kind]} style={{ width: 110, textAlign: "right" }}
          onChange={(ev) => setAmountText(ev.target.value)} />
        <span className="muted small">{kind === "pct" ? "% of salary" : kind === "dollar" ? "a year" : "one time"}</span>
        {allocList.length > 0 && <span className="muted small" style={{ marginLeft: "auto" }}>Allocated: {allocList.join(" · ")}</span>}
      </div>

      {!impact || !e ? (
        <div className="muted small" style={{ padding: "0 14px 14px" }}>Key an amount to see the impact.</div>
      ) : (
        <>
          <div className="pills" style={{ padding: "0 14px 12px" }}>
            <StatPill label={kind === "bonus" ? "Bonus" : "Salary"}
              value={kind === "bonus" ? money0(e.after.bonus) : money0(e.after.salary)}
              sub={kind === "bonus" ? `on ${money0(e.before.salary)} salary` : `from ${money0(e.before.salary)} · ${signed(e.after.salary - e.before.salary)}`} />
            <StatPill label="Payroll taxes" value={signed(dTax)} sub="FICA · Medicare · FUTA" />
            {kind !== "bonus" && <StatPill label="401(k) match" value={signed(d401)} sub={`${emp?.k401Pct ?? 0}% of salary`} />}
            <StatPill label="Total cost" value={signed(dGross)} sub={`${signed(dGross / 12)} / mo`} total />
            <StatPill label="Gross payroll" value={money0(impact.totalAfter)} sub={`from ${money0(impact.totalBefore)}`} />
          </div>

          {impact.rows.length === 0 ? (
            <div className="muted small" style={{ padding: "0 14px 14px" }}>{emp?.name || "This employee"} has no allocation, so nothing lands anywhere.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  <th style={thL}>Where it lands</th><th style={th}>Budget now</th><th style={th}>With the {kind === "bonus" ? "bonus" : "raise"}</th>
                  <th style={th}>Change / yr</th><th style={th}>Change / mo</th><th style={th}>Allocation</th>
                </tr></thead>
                <tbody>
                  {groups.map(({ g, rows }) => {
                    const sub = rows.reduce((s, r) => s + r.delta, 0);
                    return [
                      <tr key={g} style={band}>
                        <td style={tdL}>{g === "Misc" ? "Other entities" : g}</td>
                        <td style={td} /><td style={td} />
                        <td style={{ ...td, color: UP }}>{signed(sub)}</td>
                        <td style={{ ...td, color: UP }}>{signed(sub / 12)}</td>
                        <td style={td}>{dGross ? `${((sub / dGross) * 100).toFixed(1)}%` : "–"}</td>
                      </tr>,
                      ...rows.map((r) => (
                        <tr key={`${g}-${r.label}`}>
                          <td style={tdL}>
                            {r.code && <code style={{ fontSize: 12, fontWeight: 700, color: "var(--brand)", marginRight: 6 }}>{r.code}</code>}
                            {r.group === "Misc" ? r.label : label(r)}
                          </td>
                          <td style={td}>{money0(r.before)}</td>
                          <td style={td}>{money0(r.after)}</td>
                          <td style={{ ...td, color: UP, fontWeight: 700 }}>
                            <HoverCard title={label(r)} rows={[
                              { label: "Budget now", value: money0(r.before) },
                              { label: `With the ${kind === "bonus" ? "bonus" : "raise"}`, value: money0(r.after) },
                            ]} footer={{ label: "Change", value: signed(r.delta), color: UP }}>{signed(r.delta)}</HoverCard>
                          </td>
                          <td style={{ ...td, color: UP }}>{signed(r.delta / 12)}</td>
                          <td style={{ ...td, color: "var(--muted)" }}>{dGross ? `${((r.delta / dGross) * 100).toFixed(1)}%` : "–"}</td>
                        </tr>
                      )),
                    ];
                  })}
                  <tr style={{ fontWeight: 800 }}>
                    <td style={{ ...tdL, borderTop: "2px solid var(--border)" }}>Total</td>
                    <td style={{ ...td, borderTop: "2px solid var(--border)" }} /><td style={{ ...td, borderTop: "2px solid var(--border)" }} />
                    <td style={{ ...td, borderTop: "2px solid var(--border)", color: UP }}>{signed(dGross)}</td>
                    <td style={{ ...td, borderTop: "2px solid var(--border)", color: UP }}>{signed(dGross / 12)}</td>
                    <td style={{ ...td, borderTop: "2px solid var(--border)" }}>100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", borderTop: "1px solid var(--border)" }}>
            {kind === "bonus" ? (
              <span className="muted small">A bonus is one-time pay — taxed as wages, no 401(k) match — so it is a what-if only; the budget carries salaries.</span>
            ) : (
              <>
                <button type="button" className="btn sm primary"
                  onClick={() => { if (window.confirm(`Set ${e.name || "this employee"}'s ${doc.year} salary to ${money0(e.after.salary)}?`)) onApply(e.id, e.after.salary); }}>
                  Apply to the {doc.year} budget
                </button>
                <span className="muted small">Sets {e.name || "the employee"}&rsquo;s salary to {money0(e.after.salary)}.</span>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
