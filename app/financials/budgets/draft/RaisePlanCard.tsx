"use client";

// THE RAISE PLAN — the year's raises tested against a POOL, before any of them
// touches the budget. Each raise is a % or $ of salary, or a one-time bonus;
// the plan re-runs the budget's own math (`raisePlanImpact` — the same FICA /
// Medicare / FUTA caps, 401(k) match, allocation % and fund basis) and shows:
//
//   • the pool, what the raises spend of it (PAY dollars) and what is left;
//   • the fully loaded cost (pay + taxes + 401(k));
//   • the NET cost after tenant recoveries — Maintenance Salaries (6030-8502)
//     are recoverable, so part of a maintenance raise comes back through CAM
//     (each building's budgeted recovery rate, `payrollContext.ts`);
//   • where it lands, building by building, against each one's budgeted NOI
//     and cash flow after debt service.
//
// The plan is SAVED with the payroll budget (so it can be worked over days)
// but is never in the budget's figures: a raise reaches the budget only when
// it is Applied, which sets the salary and takes it off the plan. A bonus is
// what-if only — the budget carries salaries.

import { useEffect, useMemo, useState } from "react";
import { StatPill, Pill, TONE_NEUTRAL, TONE_AMBER } from "@/app/components/Pill";
import { th, thL, td, tdL } from "@/app/components/tableStyles";
import { HoverCard } from "@/app/components/HoverCard";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import {
  ALLOC_COLUMNS, DEFAULT_POOL, GROUP_GL, poolDollars, raisePlanImpact,
  type PayrollBudgetDoc, type RaisePlan, type RaiseTest, type RaiseImpactRow,
} from "@/lib/financials/budgets/payrollBudget";
import type { BuildingContext } from "@/lib/financials/budgets/payrollContext";

const money0 = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const signed = (n: number) => (Math.abs(n) < 0.5 ? "–" : `${n > 0 ? "+" : "−"}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`);
const UP = "#b45309";
const NAME = new Map(PROPERTY_DEFS.map((p) => [p.id, p.name]));
const KIND_LABEL: Record<RaiseTest["kind"], string> = { pct: "Raise %", dollar: "Raise $", bonus: "Bonus $" };
const band: React.CSSProperties = { background: "rgba(11,74,125,0.07)", fontWeight: 800 };
const topRule: React.CSSProperties = { borderTop: "2px solid var(--border)" };

/** A number box that commits on blur / Enter — typing "3." never fights the parse. */
function Amount({ value, onSave, width = 90, ariaLabel }: { value: number; onSave: (v: number) => void; width?: number; ariaLabel: string }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  const commit = () => { const n = Number(v.replace(/[\s$,%]/g, "")); if (Number.isFinite(n) && n !== value) onSave(n); else setV(String(value)); };
  return <input value={v} inputMode="decimal" aria-label={ariaLabel} style={{ width, textAlign: "right" }}
    onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); }} />;
}

export function RaisePlanCard({ doc, context, onPlan, onApply }: {
  doc: PayrollBudgetDoc;
  context: Record<string, BuildingContext>;
  onPlan: (plan: RaisePlan) => void;
  /** Apply raise `index`: set the employee's salary and take it off the plan. */
  onApply: (index: number, employeeId: string, salary: number) => void;
}) {
  const plan: RaisePlan = doc.raisePlan ?? { pool: DEFAULT_POOL, raises: [] };
  const [open, setOpen] = useState(plan.raises.length > 0);
  const setRaise = (i: number, patch: Partial<RaiseTest>) => onPlan({ ...plan, raises: plan.raises.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const addRaise = () => {
    const free = doc.employees.find((e) => !plan.raises.some((r) => r.employeeId === e.id)) ?? doc.employees[0];
    if (free) onPlan({ ...plan, raises: [...plan.raises, { employeeId: free.id, kind: "pct", amount: 3 }] });
    setOpen(true);
  };

  const impact = useMemo(() => raisePlanImpact(doc, plan.raises), [doc, plan.raises]);
  const ctx = (code: string | null) => (code ? context[code.toUpperCase()] ?? null : null);
  /** What the building really bears: the change less what tenants reimburse. */
  const net = (r: RaiseImpactRow) => r.delta - r.deltaMaintenance * (ctx(r.code)?.recoveryRate ?? 0);
  const recovered = impact.rows.reduce((s, r) => s + (r.delta - net(r)), 0);

  const pool = poolDollars(doc, plan.pool);
  const pay = impact.employees.reduce((s, e) => s + e.pay, 0);
  const cost = impact.employees.reduce((s, e) => s + e.cost, 0);
  const left = pool - pay;
  const salaries = doc.employees.reduce((s, e) => s + (e.salary || 0), 0);

  const groups = useMemo(() => ["Shopping Centers", "NI LLC", "JV III", "Misc"]
    .map((g) => ({ g, rows: impact.rows.filter((r) => r.group === g).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)) }))
    .filter((x) => x.rows.length), [impact]);
  const label = (r: RaiseImpactRow) => (r.group === "Misc" ? r.label : NAME.get(r.code ?? "") ?? r.label);
  const ctxYears = [...new Set(Object.values(context).map((c) => c.year))].sort();

  /** A cost as a % of a budget figure; "–" where the figure is missing or not positive. */
  const impactCell = (c: number, base: number | null, what: string, title: string) => {
    if (base == null || !(base > 0)) return <td style={{ ...td, color: "var(--muted)" }}>–</td>;
    const p = (-c / base) * 100;
    return (
      <td style={{ ...td, color: UP }}>
        <HoverCard title={title} rows={[
          { label: `Budgeted ${what}`, value: money0(base) },
          { label: "With the raises", value: money0(base - c) },
        ]} footer={{ label: "Change", value: `${p.toFixed(2)}%`, color: UP }}>{Math.abs(p) < 0.005 ? "–" : `${p.toFixed(2)}%`}</HoverCard>
      </td>
    );
  };
  const sumCtx = (rows: RaiseImpactRow[], k: "noi" | "cashFlowAfterDebt") => {
    const withIt = rows.filter((r) => ctx(r.code)?.[k] != null);
    return withIt.length ? { base: withIt.reduce((s, r) => s + (ctx(r.code)![k] as number), 0), cost: withIt.reduce((s, r) => s + net(r), 0) } : null;
  };

  if (!open) {
    return (
      <div className="card" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", flexWrap: "wrap" }}>
        <span style={{ fontWeight: 800, fontSize: 15 }}>Raise Plan</span>
        <span className="muted small" style={{ flex: 1 }}>Test the year&rsquo;s raises against a pool — what they really cost after tenant recoveries, and where it lands. Nothing reaches the budget until you apply it.</span>
        <button type="button" className="btn sm" onClick={plan.raises.length ? () => setOpen(true) : addRaise}>{plan.raises.length ? `Open · ${plan.raises.length} raise${plan.raises.length === 1 ? "" : "s"} ▸` : "+ Plan a raise"}</button>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 800, fontSize: 15 }}>Raise Plan</span>
        <Pill tone={TONE_NEUTRAL}>Not in the budget until applied</Pill>
        <span style={{ flex: 1 }} />
        <span className="muted small">Pool</span>
        <select className="select-sm" value={plan.pool.kind} aria-label="Pool basis"
          onChange={(e) => onPlan({ ...plan, pool: e.target.value === "dollar" ? { kind: "dollar", amount: Math.round(pool) } : { kind: "pct", amount: salaries ? Math.round((pool / salaries) * 1000) / 10 : DEFAULT_POOL.amount } })}>
          <option value="pct">% of salaries</option><option value="dollar">$ amount</option>
        </select>
        <Amount value={plan.pool.amount} ariaLabel="Pool amount" width={90} onSave={(v) => onPlan({ ...plan, pool: { ...plan.pool, amount: v } })} />
        <button type="button" className="btn sm" onClick={() => setOpen(false)}>Close</button>
      </div>

      <div className="pills" style={{ padding: "0 14px 12px" }}>
        <StatPill label="Raise pool" value={money0(pool)} sub={plan.pool.kind === "pct" ? `${plan.pool.amount}% of ${money0(salaries)} salaries` : "set amount"} />
        <StatPill label="Raises" value={money0(pay)} sub={`${plan.raises.length} raise${plan.raises.length === 1 ? "" : "s"} · pay dollars`} />
        <StatPill label={left < 0 ? "Over the pool" : "Left in the pool"} value={money0(Math.abs(left))} sub={pool > 0 ? `${((pay / pool) * 100).toFixed(0)}% used` : ""} />
        <StatPill label="Fully loaded cost" value={money0(cost)} sub={`${money0(cost - pay)} taxes & 401(k)`} />
        <StatPill label="Net cost / yr" value={money0(cost - recovered)} sub={recovered >= 0.5 ? `after ${money0(recovered)} back from tenants` : "none recoverable"} total />
      </div>
      {left < -0.5 && <div style={{ padding: "0 14px 10px" }}><Pill tone={TONE_AMBER}>{money0(-left)} over the pool</Pill></div>}

      {/* The raises */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={thL}>Employee</th><th style={thL}>Raise</th><th style={th}>Amount</th>
            <th style={th}>Salary now</th><th style={th}>New salary</th><th style={th}>Pay</th>
            <th style={th}>Fully loaded</th><th style={th}>Net cost / yr</th><th style={th} />
          </tr></thead>
          <tbody>
            {plan.raises.map((t, i) => {
              const emp = doc.employees.find((e) => e.id === t.employeeId);
              // Several raises to one person stack in the plan; each row shows its OWN effect.
              const own = emp ? raisePlanImpact(doc, [t]) : null;
              const oe = own?.employees[0];
              const ownNet = own ? own.rows.reduce((s, r) => s + net(r), 0) : 0;
              const alloc = emp ? ALLOC_COLUMNS.filter((c) => (emp.alloc?.[c.key] || 0) > 0).map((c) => ({ label: c.label, value: `${emp.alloc[c.key]}%` })) : [];
              return (
                <tr key={i}>
                  <td style={tdL}>
                    <select value={t.employeeId} aria-label="Employee" onChange={(ev) => setRaise(i, { employeeId: ev.target.value })}>
                      {doc.employees.map((x) => <option key={x.id} value={x.id}>{x.name || "(unnamed)"}</option>)}
                    </select>
                    {emp && alloc.length > 0 && (
                      <HoverCard title={`${emp.name} · allocation`} rows={alloc}
                        footer={{ label: emp.group === "maintenance" ? `Maint. Salaries ${GROUP_GL.maintenance} · recoverable` : `Salaries & Wages ${GROUP_GL.office}`, value: "" }}>
                        <span className="muted small" style={{ marginLeft: 8, cursor: "default" }}>{emp.group === "maintenance" ? "REC" : "ⓘ"}</span>
                      </HoverCard>
                    )}
                  </td>
                  <td style={tdL}>
                    <select value={t.kind} aria-label="Raise type" onChange={(ev) => setRaise(i, { kind: ev.target.value as RaiseTest["kind"] })}>
                      {(Object.keys(KIND_LABEL) as RaiseTest["kind"][]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                    </select>
                  </td>
                  <td style={td}><Amount value={t.amount} ariaLabel={KIND_LABEL[t.kind]} width={80} onSave={(v) => setRaise(i, { amount: v })} /></td>
                  <td style={td}>{emp ? money0(emp.salary) : "–"}</td>
                  <td style={td}>{oe && t.kind !== "bonus" ? money0(oe.after.salary) : <span className="muted">bonus</span>}</td>
                  <td style={td}>{oe ? money0(oe.pay) : "–"}</td>
                  <td style={td}>{oe ? money0(oe.cost) : "–"}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{oe ? money0(ownNet) : "–"}</td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>
                    {oe && t.kind !== "bonus" && (
                      <button type="button" className="btn sm" title="Set the salary in the budget and take this off the plan"
                        onClick={() => { if (window.confirm(`Set ${emp!.name}'s ${doc.year} salary to ${money0(oe.after.salary)}?`)) onApply(i, t.employeeId, oe.after.salary); }}>Apply</button>
                    )}{" "}
                    <button type="button" className="btn sm" aria-label="Remove raise" onClick={() => onPlan({ ...plan, raises: plan.raises.filter((_, j) => j !== i) })}>✕</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ padding: "8px 14px" }}>
          <button type="button" className="btn sm" onClick={addRaise}>+ Add raise</button>
        </div>
      </div>

      {/* Where it lands */}
      {impact.rows.length > 0 && (
        <div style={{ overflowX: "auto", borderTop: "1px solid var(--border)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thL} colSpan={4} />
                <th style={{ ...th, textAlign: "center" }} colSpan={2}>Impact on</th>
                <th style={th} />
              </tr>
              <tr>
                <th style={thL}>Where it lands</th><th style={th}>Change / yr</th><th style={th}>Change / mo</th>
                <th style={th}>Net cost / yr</th><th style={th}>NOI</th><th style={th}>Cash flow</th><th style={th}>Allocation</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(({ g, rows }) => {
                const sub = rows.reduce((s, r) => s + r.delta, 0);
                const subNet = rows.reduce((s, r) => s + net(r), 0);
                const n = g === "Misc" ? null : sumCtx(rows, "noi");
                const c = g === "Misc" ? null : sumCtx(rows, "cashFlowAfterDebt");
                return [
                  <tr key={g} style={band}>
                    <td style={tdL}>{g === "Misc" ? "Other entities" : g}</td>
                    <td style={{ ...td, color: UP }}>{signed(sub)}</td>
                    <td style={{ ...td, color: UP }}>{signed(sub / 12)}</td>
                    <td style={{ ...td, color: UP }}>{signed(subNet)}</td>
                    {n ? impactCell(n.cost, n.base, "NOI", `${g} NOI`) : <td style={td} />}
                    {c ? impactCell(c.cost, c.base, "cash flow after debt", `${g} cash flow after debt service`) : <td style={td} />}
                    <td style={td}>{cost ? `${((sub / cost) * 100).toFixed(1)}%` : "–"}</td>
                  </tr>,
                  ...rows.map((r) => {
                    const k = ctx(r.code);
                    const back = r.delta - net(r);
                    return (
                      <tr key={`${g}-${r.label}`}>
                        <td style={tdL}>
                          {r.code && <code style={{ fontSize: 12, fontWeight: 700, color: "var(--brand)", marginRight: 6 }}>{r.code}</code>}
                          {label(r)}
                        </td>
                        <td style={{ ...td, color: UP, fontWeight: 700 }}>{signed(r.delta)}</td>
                        <td style={{ ...td, color: UP }}>{signed(r.delta / 12)}</td>
                        <td style={{ ...td, color: UP }}>
                          {back >= 0.5 ? (
                            <HoverCard title={`${label(r)} · recoveries`} rows={[
                              { label: "Change", value: signed(r.delta) },
                              { label: `Maint. Salaries ${GROUP_GL.maintenance}`, value: signed(r.deltaMaintenance) },
                              { label: "Budgeted recovery rate", value: `${((k?.recoveryRate ?? 0) * 100).toFixed(0)}%` },
                              { label: "Back from tenants", value: money0(back), color: "#15803d" },
                            ]} footer={{ label: "Net cost", value: signed(net(r)), color: UP }}>{signed(net(r))}</HoverCard>
                          ) : signed(net(r))}
                        </td>
                        {impactCell(net(r), k?.noi ?? null, "NOI", `${label(r)} NOI`)}
                        {impactCell(net(r), k?.cashFlowAfterDebt ?? null, "cash flow after debt", `${label(r)} cash flow after debt service`)}
                        <td style={{ ...td, color: "var(--muted)" }}>{cost ? `${((r.delta / cost) * 100).toFixed(1)}%` : "–"}</td>
                      </tr>
                    );
                  }),
                ];
              })}
              <tr style={{ fontWeight: 800 }}>
                <td style={{ ...tdL, ...topRule }}>Total</td>
                <td style={{ ...td, ...topRule, color: UP }}>{signed(cost)}</td>
                <td style={{ ...td, ...topRule, color: UP }}>{signed(cost / 12)}</td>
                <td style={{ ...td, ...topRule, color: UP }}>{signed(cost - recovered)}</td>
                <td style={{ ...td, ...topRule }} /><td style={{ ...td, ...topRule }} />
                <td style={{ ...td, ...topRule }}>100%</td>
              </tr>
            </tbody>
          </table>
          <div className="muted small" style={{ padding: "8px 14px" }}>
            Impact is the net cost ÷ each building&rsquo;s {ctxYears.length ? ctxYears.join(" / ") : doc.year} budgeted NOI and cash flow after debt service
            {ctxYears.length && !ctxYears.includes(doc.year) ? ` (no ${doc.year} budget published yet)` : ""}; a fund band is over its buildings combined.
            Recoveries apply only to Maintenance Salaries ({GROUP_GL.maintenance}), at each building&rsquo;s budgeted recovery rate — close for a NNN centre, rough for an office building on base-year stops.
          </div>
        </div>
      )}
    </div>
  );
}
