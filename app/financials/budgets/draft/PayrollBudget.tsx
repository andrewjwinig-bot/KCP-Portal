"use client";

// THE 2010 LIK PAYROLL BUDGET — the owner's payroll workbook, as four tables
// in its own order: pay & taxes, health benefits, the allocation %, and where
// that lands building by building. Light blue = a cell you can type (click
// it); everything else is computed (`lib/financials/budgets/payrollBudget.ts`).
// Drew's and Alison's alone — the route refuses anyone else.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { StatPill, Pill, TONE_AMBER, TONE_NEUTRAL } from "@/app/components/Pill";
import { th, thL, td, tdL } from "@/app/components/tableStyles";
import { HoverCard } from "@/app/components/HoverCard";
import LoadingState from "@/app/components/LoadingState";
import { STEP_LABEL } from "./stepStyles";
import { RaisePlanCard } from "./RaisePlanCard";
import type { BuildingContext } from "@/lib/financials/budgets/payrollContext";
import {
  ALLOC_COLUMNS, FRINGE, GROUP_GL, allocatePayroll, employeeCost, allocTotal, monthly10, entityDollars, fundShares, employeesForBuilding,
  type PayrollBudgetDoc, type PayrollEmployee, type FundKey, type AllocKey, type FringeKey, type Rates,
} from "@/lib/financials/budgets/payrollBudget";

const money0 = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const num0 = (n: number) => (Math.abs(n) < 0.5 ? "–" : Math.round(n).toLocaleString("en-US"));
const num2 = (n: number) => (Math.abs(n) < 0.005 ? "–" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const pct = (n: number, d = 0) => (Math.abs(n) < 0.0005 ? "–" : `${n.toFixed(d)}%`);
const secLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" };
const INPUT_BG = "var(--input-cell)";
const codeBtn: React.CSSProperties = { background: "none", border: 0, padding: 0, font: "inherit", fontWeight: 700, color: "var(--brand)", cursor: "pointer", textDecoration: "underline dotted", textUnderlineOffset: 3 };
const totalRow: React.CSSProperties = { fontWeight: 800, borderTop: "2px solid var(--border)" };
const FRINGE_LABEL: Record<FringeKey, string> = { life: "Life", dental: "Dental", ltd: "LTD", std: "STD", vision: "Vision" };

/** A number you can type: shows formatted on light blue, a click opens it.
 *  Keeps the decimals as typed — UC, premiums and rates carry cents, and the
 *  grid's own editor rounds to whole dollars. */
type Tip = { title: string; rows: { label: string; value: string; color?: string }[]; footer?: { label: string; value: string } };

function Cell({ value, show, onSave, width = 90, tip }: { value: number; show: string; onSave: (v: number) => void; width?: number; tip?: Tip }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState("");
  const commit = () => {
    setOpen(false);
    const t = v.trim();
    const n = Number(t.replace(/[\s$,%()]/g, ""));
    if (Number.isFinite(n)) onSave(/^\(.*\)$/.test(t) || t.startsWith("-") ? -Math.abs(n) : n);
  };
  return (
    <td style={{ ...td, background: INPUT_BG, cursor: "text", minWidth: width }} onClick={() => { if (!open) { setV(value ? String(Math.round(value * 100) / 100) : ""); setOpen(true); } }}>
      {open ? (
        <input autoFocus value={v} inputMode="decimal" style={{ width: "100%", minWidth: 56, textAlign: "right" }}
          onFocus={(e) => e.currentTarget.select()} onChange={(e) => setV(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Tab") (e.currentTarget as HTMLInputElement).blur(); if (e.key === "Escape") { setV(String(value)); setOpen(false); } }} />
      ) : tip ? <HoverCard title={tip.title} rows={tip.rows} footer={tip.footer}>{show}</HoverCard> : show}
    </td>
  );
}

/** A percentage cell — the same editor, shown as a percent. */
function PctCell({ value, onSave, decimals = 1, tip }: { value: number; onSave: (v: number) => void; decimals?: number; tip?: Tip }) {
  return <Cell value={value} show={pct(value, decimals)} onSave={onSave} width={64} tip={tip} />;
}

function TextCell({ value, onSave, placeholder }: { value: string; onSave: (v: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(value);
  return (
    <td style={{ ...tdL, background: INPUT_BG, cursor: "text", fontWeight: 600, minWidth: 200 }} onClick={() => { if (!open) { setV(value); setOpen(true); } }}>
      {open ? (
        <input autoFocus value={v} style={{ width: "100%" }} onChange={(e) => setV(e.target.value)}
          onBlur={() => { setOpen(false); onSave(v.trim()); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); if (e.key === "Escape") setOpen(false); }} />
      ) : (value || <span className="muted">{placeholder}</span>)}
    </td>
  );
}

const newId = () => `emp-${Date.now().toString(36)}`;

export function PayrollBudget({ year }: { year: number }) {
  const [doc, setDoc] = useState<PayrollBudgetDoc | null>(null);
  const [seeded, setSeeded] = useState(false);
  const [context, setContext] = useState<Record<string, BuildingContext>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  // The allocation table reads as % (typed) or $ (gross × %, read-only).
  const [allocView, setAllocView] = useState<"pct" | "dollar">("pct");
  // The health-benefits window: null closed, "" the whole list, else the employee opened from.
  const [healthFor, setHealthFor] = useState<string | null>(null);
  /** A building / entity whose employees are open in the modal. */
  const [buildingFor, setBuildingFor] = useState<{ code: string; label: string } | null>(null);
  useEffect(() => {
    if (healthFor === null) return;
    const onKey = (ev: KeyboardEvent) => { if (ev.key === "Escape" && !(ev.target instanceof HTMLInputElement)) setHealthFor(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [healthFor]);

  useEffect(() => {
    setDoc(null); setError(null);
    fetch(`/api/financials/budgets/payroll?year=${year}`, { cache: "no-store" })
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j?.error ?? "Couldn't load the payroll budget."); return j; })
      .then((j) => { setDoc(j.doc); setSeeded(!!j.seeded); setContext(j.context ?? {}); })
      .catch((e) => setError(e.message));
  }, [year]);

  // Saves go out ONE AT A TIME, a moment after the last edit: the store keeps
  // the whole year as one document, so two in flight would overwrite each other.
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<PayrollBudgetDoc | null>(null);
  const persist = useCallback((next: PayrollBudgetDoc) => {
    latest.current = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const body = latest.current;
      setSaving("saving");
      chain.current = chain.current.then(async () => {
        const r = await fetch("/api/financials/budgets/payroll", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ doc: body }) }).catch(() => null);
        if (!r?.ok) { setSaving("failed"); return; }
        setSaving("saved"); setSeeded(false);
      });
    }, 600);
  }, []);
  const update = (f: (d: PayrollBudgetDoc) => PayrollBudgetDoc) => setDoc((d) => { if (!d) return d; const n = f(d); persist(n); return n; });
  const setEmp = (id: string, patch: Partial<PayrollEmployee>) =>
    update((d) => ({ ...d, employees: d.employees.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));

  const a = useMemo(() => (doc ? allocatePayroll(doc) : null), [doc]);

  if (error) return <div className="card" style={{ color: "#b91c1c" }}>{error}</div>;
  if (!doc || !a) return <LoadingState status={`Loading the ${year} payroll budget…`} columns={4} rows={6} />;
  const r = doc.rates;
  const setRate = (k: keyof Rates, v: number) => update((d) => ({ ...d, rates: { ...d.rates, [k]: v } }));
  const benefits = a.totals.gross - a.totals.salary;
  const off100 = a.employees.filter((e) => Math.abs(e.allocTotal - 100) > 0.05);
  const tie = Math.abs(a.allocated - a.totals.gross) < 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* No header card (owner): only a first-year note or a failed save is worth a line. */}
      {(seeded || saving === "failed") && (
        <div className="small" style={{ color: saving === "failed" ? "#b91c1c" : "var(--muted)" }}>
          {saving === "failed" ? "Couldn't save — check your connection" : <><b>Starting from {doc.seededFrom ?? "last year"}</b> — key each employee&rsquo;s {year} pay over it.</>}
        </div>
      )}

      <div className="pills">
        <StatPill label="Employees" value={String(doc.employees.length)} />
        <StatPill label={`${year} Salaries`} value={money0(a.totals.salary)} sub={`${money0(a.totals.perPay)} per pay`} />
        <StatPill label="Taxes & benefits" value={money0(benefits)} sub={`${a.totals.salary ? ((benefits / a.totals.salary) * 100).toFixed(1) : "0"}% on salary`} />
        <StatPill label="Gross payroll" value={money0(a.totals.gross)} total />
      </div>

      <RaisePlanCard doc={doc} context={context}
        onPlan={(raisePlan) => update((d) => ({ ...d, raisePlan }))}
        onApply={(index, id, salary) => update((d) => ({
          ...d,
          employees: d.employees.map((e) => (e.id === id ? { ...e, salary } : e)),
          raisePlan: d.raisePlan ? { ...d.raisePlan, raises: d.raisePlan.raises.filter((_, i) => i !== index) } : d.raisePlan,
        }))} />

      {/* The statutory rates — typed once, used on every row. */}
      <div className="card" style={{ padding: "10px 14px" }}>
        <div style={{ ...secLabel, marginBottom: 6 }}>Rates</div>
        <table style={{ borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={th}>Pays / yr</th><th style={th}>FICA %</th><th style={th}>FICA wage base</th><th style={th}>Medicare %</th><th style={th}>Medicare cap</th><th style={th}>FUTA %</th><th style={th}>FUTA wage base</th>
          </tr></thead>
          <tbody><tr>
            <Cell value={r.pays} show={String(r.pays)} onSave={(v) => setRate("pays", v)} width={70} />
            <PctCell value={r.ficaPct} decimals={2} onSave={(v) => setRate("ficaPct", v)} />
            <Cell value={r.ficaBase} show={money0(r.ficaBase)} onSave={(v) => setRate("ficaBase", v)} />
            <PctCell value={r.mediPct} decimals={2} onSave={(v) => setRate("mediPct", v)} />
            <Cell value={r.mediBase} show={money0(r.mediBase)} onSave={(v) => setRate("mediBase", v)} />
            <PctCell value={r.futaPct} decimals={2} onSave={(v) => setRate("futaPct", v)} />
            <Cell value={r.futaBase} show={money0(r.futaBase)} onSave={(v) => setRate("futaBase", v)} />
          </tr></tbody>
        </table>
      </div>

      {/* 1 — PAY & TAXES */}
      <div style={STEP_LABEL}>Gross payroll — pay &amp; taxes</div>
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={thL}>#</th><th style={thL}>Employee</th><th style={{ ...th, textAlign: "center" }}>
              <HoverCard title="REC — recoverable" width={300} rows={[
                { label: "Ticked", value: `Maint. Salaries ${GROUP_GL.maintenance}` },
                { label: "Unticked", value: `Salaries & Wages ${GROUP_GL.office}` },
              ]} footer={{ label: "-8502 is the recoverable (CAM) account", value: "" }}>REC</HoverCard>
            </th>
            <th style={th}>Per pay</th><th style={th}>Annual salary</th><th style={th}>FICA</th><th style={th}>Medicare</th>
            <th style={th}>UC</th><th style={th}>FUTA</th><th style={th}>Work. comp</th><th style={th}><button type="button" className="btn sm" onClick={() => setHealthFor("")}>Medical ▸</button></th>
            <th style={th}>401(k) %</th><th style={th}>401(k)</th><th style={th}>Gross annual</th><th style={th} />
          </tr></thead>
          <tbody>
            {doc.employees.map((e, i) => {
              const c = employeeCost(e, r);
              return (
                <tr key={e.id}>
                  <td style={{ ...tdL, color: "var(--muted)" }}>{i + 1}</td>
                  <TextCell value={e.name} placeholder="Name (Last, First)" onSave={(v) => setEmp(e.id, { name: v })} />
                  <td style={{ ...td, textAlign: "center", background: INPUT_BG }}>
                    <input type="checkbox" checked={e.group === "maintenance"} aria-label={`${e.name} recoverable (${GROUP_GL.maintenance})`}
                      onChange={(ev) => setEmp(e.id, { group: ev.target.checked ? "maintenance" : "office" })} />
                  </td>
                  {/* Per pay comes off the payroll report; the annual follows (× pays),
                      and keying the annual sets per pay (÷ pays). One figure stored. */}
                  <Cell value={c.perPay} show={num0(c.perPay)} onSave={(v) => setEmp(e.id, { salary: v * r.pays })} />
                  <Cell value={e.salary} show={num0(e.salary)} onSave={(v) => setEmp(e.id, { salary: v })} />
                  <td style={td}>{num0(c.fica)}</td>
                  <td style={td}>{num0(c.medi)}</td>
                  <Cell value={e.uc} show={num2(e.uc)} onSave={(v) => setEmp(e.id, { uc: v })} width={70} />
                  <td style={{ ...td, background: INPUT_BG }}>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                      <input type="checkbox" checked={e.futa} onChange={(ev) => setEmp(e.id, { futa: ev.target.checked })} />
                      {num0(c.futa)}
                    </label>
                  </td>
                  <Cell value={e.workComp} show={num0(e.workComp)} onSave={(v) => setEmp(e.id, { workComp: v })} width={70} />
                  <td style={{ ...td, cursor: "pointer", textDecoration: "underline dotted", textUnderlineOffset: 3 }} onClick={() => setHealthFor(e.id)}>{num0(c.medical)}</td>
                  <PctCell value={e.k401Pct} onSave={(v) => setEmp(e.id, { k401Pct: v })} />
                  <td style={td}>{num0(c.k401)}</td>
                  <td style={{ ...td, fontWeight: 800 }}>{num0(c.gross)}</td>
                  <td style={td}>
                    <button type="button" className="btn sm" aria-label={`Remove ${e.name}`}
                      onClick={() => { if (window.confirm(`Remove ${e.name || "this employee"} from the ${year} payroll budget?`)) update((d) => ({ ...d, employees: d.employees.filter((x) => x.id !== e.id) })); }}>✕</button>
                  </td>
                </tr>
              );
            })}
            <tr style={totalRow}>
              <td style={tdL} /><td style={{ ...tdL, fontWeight: 800 }}>Total</td><td style={tdL} />
              <td style={td}>{num0(a.totals.perPay)}</td><td style={td}>{num0(a.totals.salary)}</td>
              <td style={td}>{num0(a.totals.fica)}</td><td style={td}>{num0(a.totals.medi)}</td>
              <td style={td}>{num0(a.totals.uc)}</td><td style={td}>{num0(a.totals.futa)}</td>
              <td style={td}>{num0(a.totals.workComp)}</td><td style={td}>{num0(a.totals.medical)}</td>
              <td style={td} /><td style={td}>{num0(a.totals.k401)}</td>
              <td style={{ ...td, fontWeight: 900 }}>{num0(a.totals.gross)}</td><td style={td} />
            </tr>
          </tbody>
        </table>
        <div style={{ padding: "8px 12px" }}>
          <button type="button" className="btn sm" onClick={() => update((d) => ({ ...d, employees: [...d.employees, {
            id: newId(), name: "", group: "office", salary: 0, uc: 0, futa: true, workComp: 0,
            fringe: { life: 0, dental: 0, ltd: 0, std: 0, vision: 0 }, medicalMonthly: 0, k401Pct: 0, alloc: {},
          }] }))}>+ Add employee</button>
        </div>
      </div>

      {/* A BUILDING'S EMPLOYEES — click a code under Allocation by building
          (or Misc) for every employee's dollars landing there, by account. */}
      {buildingFor && typeof document !== "undefined" && (() => {
        const rows = employeesForBuilding(doc, buildingFor.code);
        const tot = (k: "office" | "maintenance" | "marketing" | "total") => rows.reduce((s, x) => s + x[k], 0);
        const has = { office: tot("office") >= 0.5, maintenance: tot("maintenance") >= 0.5, marketing: tot("marketing") >= 0.5 };
        const all = tot("total");
        const isCode = /^[0-9A-Z]{4}$/.test(buildingFor.code);
        return createPortal(
          <div onClick={() => setBuildingFor(null)} style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "60px 16px", overflowY: "auto" }}>
            <div onClick={(ev) => ev.stopPropagation()} role="dialog" aria-label="Employees allocated"
              style={{ background: "var(--card)", borderRadius: 12, width: "100%", maxWidth: 900, boxShadow: "0 20px 60px rgba(0,0,0,0.35)", borderTop: "3px solid var(--brand)" }}>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <div style={secLabel}>{year} Payroll budget · {buildingFor.label}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, marginTop: 2 }}>{isCode ? buildingFor.code : buildingFor.label} · {money0(all)} a year</div>
                  <div className="muted small" style={{ marginTop: 2 }}>{rows.length} employee{rows.length === 1 ? "" : "s"} allocated here · {money0(monthly10(all))} a month</div>
                </div>
                <button type="button" className="btn sm" onClick={() => setBuildingFor(null)}>Close</button>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>
                    <th style={thL}>Employee</th>
                    {has.office && <th style={th}>{GROUP_GL.office}</th>}
                    {has.maintenance && <th style={th}>{GROUP_GL.maintenance}</th>}
                    {has.marketing && <th style={th}>Marketing</th>}
                    <th style={th}>Annual</th><th style={th}>Monthly</th><th style={th}>Share</th>
                  </tr></thead>
                  <tbody>
                    {rows.length === 0 && <tr><td colSpan={7} style={{ ...tdL, color: "var(--muted)" }}>No employee is allocated here.</td></tr>}
                    {rows.map((x) => (
                      <tr key={x.id}>
                        <td style={{ ...tdL, fontWeight: 600 }}>{x.name || <span className="muted">—</span>}</td>
                        {has.office && <td style={td}>{num0(x.office)}</td>}
                        {has.maintenance && <td style={td}>{num0(x.maintenance)}</td>}
                        {has.marketing && <td style={td}>{num0(x.marketing)}</td>}
                        <td style={{ ...td, fontWeight: 800 }}>{num0(x.total)}</td>
                        <td style={{ ...td, color: "var(--muted)" }}>{num0(monthly10(x.total))}</td>
                        <td style={{ ...td, color: "var(--muted)" }}>{all ? pct(x.total / all * 100, 1) : "–"}</td>
                      </tr>
                    ))}
                    {rows.length > 0 && (
                      <tr style={totalRow}>
                        <td style={{ ...tdL, fontWeight: 800 }}>Total</td>
                        {has.office && <td style={td}>{num0(tot("office"))}</td>}
                        {has.maintenance && <td style={td}>{num0(tot("maintenance"))}</td>}
                        {has.marketing && <td style={td}>{num0(tot("marketing"))}</td>}
                        <td style={{ ...td, fontWeight: 900 }}>{num0(all)}</td>
                        <td style={td}>{num0(monthly10(all))}</td>
                        <td style={td}>100%</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>,
          document.body,
        );
      })()}

      {/* HEALTH BENEFITS — the detail behind the Medical column, opened from it
          (owner: it only feeds that column, so it does not need its own card). */}
      {healthFor !== null && typeof document !== "undefined" && createPortal(
        <div onClick={() => setHealthFor(null)} style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "60px 16px", overflowY: "auto" }}>
          <div onClick={(ev) => ev.stopPropagation()} role="dialog" aria-label="Health benefits"
            style={{ background: "var(--card)", borderRadius: 12, width: "100%", maxWidth: 1280, boxShadow: "0 20px 60px rgba(0,0,0,0.35)", borderTop: "3px solid var(--brand)" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
              <div>
                <div style={secLabel}>{year} Payroll budget · Medical column</div>
                <div style={{ fontSize: 17, fontWeight: 800, marginTop: 2 }}>Health benefits · {money0(a.totals.medical)}</div>
                <div className="muted small" style={{ marginTop: 2 }}>Life, Dental, LTD, STD and Vision are annual premiums; medical is monthly × 12. Light blue cells are typed.</div>
              </div>
              <button type="button" className="btn sm" onClick={() => setHealthFor(null)}>Close</button>
            </div>
            <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={thL}>#</th><th style={thL}>Employee</th>
            {FRINGE.map((k) => <th key={k} style={th}>{FRINGE_LABEL[k]}</th>)}
            <th style={th}>Other fringe</th><th style={th}>Medical / mo</th><th style={th}>Medical / yr</th><th style={th}>Benefits total</th>
          </tr></thead>
          <tbody>
            {doc.employees.map((e, i) => {
              const c = employeeCost(e, r);
              return (
                <tr key={e.id} style={{ background: healthFor === e.id ? "rgba(11,74,125,0.07)" : undefined }}>
                  <td style={{ ...tdL, color: "var(--muted)" }}>{i + 1}</td>
                  <td style={{ ...tdL, fontWeight: 600 }}>{e.name || <span className="muted">—</span>}</td>
                  {FRINGE.map((k) => (
                    <Cell key={k} value={e.fringe?.[k] ?? 0} show={num2(e.fringe?.[k] ?? 0)} width={70}
                      onSave={(v) => setEmp(e.id, { fringe: { ...e.fringe, [k]: v } })} />
                  ))}
                  <td style={td}>{num2(c.fringe)}</td>
                  <Cell value={e.medicalMonthly} show={num2(e.medicalMonthly)} onSave={(v) => setEmp(e.id, { medicalMonthly: v })} />
                  <td style={td}>{num0(c.medicalAnnual)}</td>
                  <td style={{ ...td, fontWeight: 800 }}>{num0(c.medical)}</td>
                </tr>
              );
            })}
            <tr style={totalRow}>
              <td style={tdL} /><td style={{ ...tdL, fontWeight: 800 }}>Total</td>
              {FRINGE.map((k) => <td key={k} style={td}>{num2(doc.employees.reduce((s, e) => s + (e.fringe?.[k] || 0), 0))}</td>)}
              <td style={td}>{num2(a.totals.fringe)}</td>
              <td style={td}>{num2(doc.employees.reduce((s, e) => s + (e.medicalMonthly || 0), 0))}</td>
              <td style={td}>{num0(a.totals.medicalAnnual)}</td>
              <td style={{ ...td, fontWeight: 900 }}>{num0(a.totals.medical)}</td>
            </tr>
          </tbody>
        </table>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* 3 — ALLOCATION % */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={STEP_LABEL}>Payroll allocation — {allocView === "pct" ? "% of each employee" : "$ to each entity, per year"}</div>
        <div style={{ display: "inline-flex" }} role="group" aria-label="Show the allocation as">
          {(["pct", "dollar"] as const).map((v, i) => (
            <button key={v} type="button" className="btn sm" onClick={() => setAllocView(v)}
              style={{ borderRadius: i === 0 ? "999px 0 0 999px" : "0 999px 999px 0", marginLeft: i ? -1 : 0,
                ...(allocView === v ? { background: "var(--brand)", color: "#fff", borderColor: "var(--brand)" } : {}) }}>
              {v === "pct" ? "%" : "$"}
            </button>
          ))}
        </div>
        {off100.length > 0 && (
          <HoverCard title="Allocations that don't total 100%" rows={off100.map((e) => ({ label: e.name || "(unnamed)", value: pct(e.allocTotal, 1), color: "#b45309" }))}>
            <Pill tone={TONE_AMBER}>{off100.length} not 100%</Pill>
          </HoverCard>
        )}
      </div>
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thL} /><th style={th} />
              <th style={{ ...th, textAlign: "center" }} colSpan={2}>LIK</th>
              <th style={th} colSpan={3} />
              <th style={{ ...th, textAlign: "center" }} colSpan={2}>Office Works</th>
              <th style={th} colSpan={5} />
            </tr>
            <tr>
              <th style={thL}>Employee</th><th style={th}>Gross annual</th>
              {ALLOC_COLUMNS.map((c) => <th key={c.key} style={th}>{c.label}</th>)}
              <th style={th}>Total</th>
            </tr>
          </thead>
          <tbody>
            {doc.employees.map((e) => {
              const tot = allocTotal(e);
              const gross = employeeCost(e, r).gross;
              const dollars = entityDollars(e, r);
              // Hover a % for the dollars it sends there — and, for a fund,
              // on to each building on the fund's basis for this employee's account.
              const tipFor = (key: AllocKey, label: string): Tip | undefined => {
                const d = dollars[key] ?? 0;
                if (!(Math.abs(d) >= 0.5)) return undefined;
                const rows = [
                  { label: "Gross annual", value: money0(gross) },
                  { label: "Allocation", value: pct(e.alloc?.[key] ?? 0, 1) },
                ];
                const fund = (["sc", "niLlc", "jv3"] as string[]).includes(key) ? doc.funds[key as FundKey] : null;
                if (fund) {
                  const shares = fundShares(fund, e.group === "maintenance" ? fund.basis.maintenance : fund.basis.office);
                  for (const b of fund.buildings) {
                    const v = d * (shares[b.code] ?? 0);
                    if (Math.abs(v) >= 0.5) rows.push({ label: `  ${b.code}`, value: `${money0(v)} · ${money0(v / 12)}/mo` });
                  }
                }
                return { title: `${e.name || "Employee"} · ${label}`, rows,
                  footer: { label: "To " + label, value: `${money0(d)}/yr · ${money0(d / 12)}/mo` } };
              };
              return (
                <tr key={e.id}>
                  <td style={{ ...tdL, fontWeight: 600 }}>{e.name || <span className="muted">—</span>}</td>
                  <td style={td}>{num0(employeeCost(e, r).gross)}</td>
                  {allocView === "dollar" ? ALLOC_COLUMNS.map((c) => {
                    const d = dollars[c.key as AllocKey] ?? 0;
                    const tip = tipFor(c.key as AllocKey, c.label);
                    return <td key={c.key} style={td}>{tip ? <HoverCard title={tip.title} rows={tip.rows} footer={tip.footer}>{num0(d)}</HoverCard> : num0(d)}</td>;
                  }) : ALLOC_COLUMNS.map((c) => (
                    <PctCell key={c.key} value={e.alloc?.[c.key] ?? 0} decimals={0} tip={tipFor(c.key as AllocKey, c.label)}
                      onSave={(v) => setEmp(e.id, { alloc: { ...e.alloc, [c.key as AllocKey]: v } })} />
                  ))}
                  <td style={{ ...td, fontWeight: 800, color: Math.abs(tot - 100) > 0.05 ? "#b45309" : undefined }}>{allocView === "dollar" ? num0(Object.values(dollars).reduce((x, y) => x + y, 0)) : pct(tot, Number.isInteger(tot) ? 0 : 1)}</td>
                </tr>
              );
            })}
            <tr style={totalRow}>
              <td style={{ ...tdL, fontWeight: 800 }}>Total $</td>
              <td style={td}>{num0(a.totals.gross)}</td>
              {ALLOC_COLUMNS.map((c) => <td key={c.key} style={td}>{num0(a.byEntity[c.key].total)}</td>)}
              <td style={td} />
            </tr>
          </tbody>
        </table>
      </div>

      {/* 4 — BY BUILDING */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={STEP_LABEL}>Allocation by building</div>
        {!tie && <Pill tone={TONE_AMBER}>{money0(a.totals.gross - a.allocated)} not allocated</Pill>}
        <span className="muted small">Salaries &amp; Wages {GROUP_GL.office} and Maintenance Salaries {GROUP_GL.maintenance}, each on the fund&rsquo;s own basis · monthly rounded to $10, as the workbook does</span>
      </div>
      {a.funds.map((fa) => {
        const t = doc.funds[fa.fund];
        const setFund = (patch: Partial<typeof t>) => update((d) => ({ ...d, funds: { ...d.funds, [fa.fund]: { ...d.funds[fa.fund], ...patch } } }));
        const setB = (code: string, patch: Partial<(typeof t.buildings)[number]>) => setFund({ buildings: t.buildings.map((b) => (b.code === code ? { ...b, ...patch } : b)) });
        const basisSel = (k: "office" | "maintenance" | "marketing") => (
          <select className="select-sm" value={t.basis[k]} aria-label={`${fa.label} ${k} basis`}
            onChange={(ev) => setFund({ basis: { ...t.basis, [k]: ev.target.value === "alt" ? "alt" : "prs" } })}>
            <option value="prs">by PRS</option><option value="alt">by Alt PRS</option>
          </select>
        );
        const altTot = t.buildings.reduce((s, b) => s + b.altPct, 0);
        const sqTot = t.buildings.reduce((s, b) => s + b.sqft, 0);
        return (
          <div key={fa.fund} className="card" style={{ padding: 0, overflowX: "auto" }}>
            <div style={{ padding: "10px 14px 4px", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontWeight: 800, fontSize: 15 }}>{fa.label}</span>
              <span className="muted small">{money0(fa.office + fa.maintenance + fa.marketing)} a year</span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>
                <th style={thL}>Building</th><th style={th}>Sq ft</th><th style={th}>PRS</th><th style={th}>Alt PRS</th>
                <th style={th}>{GROUP_GL.office} {basisSel("office")}</th><th style={th}>Monthly</th>
                <th style={th}>{GROUP_GL.maintenance} {basisSel("maintenance")}</th><th style={th}>Monthly</th>
                <th style={th}>Marketing {basisSel("marketing")}</th><th style={th}>Total</th>
              </tr></thead>
              <tbody>
                {fa.rows.map((b) => (
                  <tr key={b.code} style={{ opacity: b.total < 0.5 ? 0.55 : 1 }}>
                    <td style={{ ...tdL, fontWeight: 700 }}><button type="button" onClick={() => setBuildingFor({ code: b.code, label: fa.label })} style={codeBtn} title="Employees allocated here">{b.code}</button></td>
                    <Cell value={b.sqft} show={num0(b.sqft)} onSave={(v) => setB(b.code, { sqft: v })} width={80} />
                    <td style={td}>{pct(b.prs * 100, 2)}</td>
                    <PctCell value={b.altPct} decimals={2} onSave={(v) => setB(b.code, { altPct: v })} />
                    <td style={td}>{num0(b.office)}</td>
                    <td style={{ ...td, color: "var(--muted)" }}>{num0(monthly10(b.office))}</td>
                    <td style={td}>{num0(b.maintenance)}</td>
                    <td style={{ ...td, color: "var(--muted)" }}>{num0(monthly10(b.maintenance))}</td>
                    <td style={td}>{num0(b.marketing)}</td>
                    <td style={{ ...td, fontWeight: 800 }}>{num0(b.total)}</td>
                  </tr>
                ))}
                <tr style={totalRow}>
                  <td style={{ ...tdL, fontWeight: 800 }}>Total</td>
                  <td style={td}>{num0(sqTot)}</td><td style={td}>100%</td>
                  <td style={{ ...td, color: Math.abs(altTot - 100) > 0.05 ? "#b45309" : undefined }}>{pct(altTot, 2)}</td>
                  <td style={td}>{num0(fa.office)}</td><td style={td}>{num0(fa.rows.reduce((s, b) => s + monthly10(b.office), 0))}</td>
                  <td style={td}>{num0(fa.maintenance)}</td><td style={td}>{num0(fa.rows.reduce((s, b) => s + monthly10(b.maintenance), 0))}</td>
                  <td style={td}>{num0(fa.marketing)}</td>
                  <td style={{ ...td, fontWeight: 900 }}>{num0(fa.office + fa.maintenance + fa.marketing)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: "10px 14px 4px", fontWeight: 800, fontSize: 15 }}>Misc allocation</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={thL}>Entity</th><th style={th}>Annual</th><th style={th}>Monthly</th></tr></thead>
            <tbody>
              {a.misc.map((m) => (
                <tr key={m.key}>
                  <td style={tdL}>
                    <button type="button" onClick={() => setBuildingFor({ code: m.code ?? m.key, label: m.label })} style={{ ...codeBtn, fontWeight: m.code ? 700 : 400, color: m.code ? "var(--brand)" : "inherit" }} title="Employees allocated here">{m.code ? <><b style={{ marginRight: 6 }}>{m.code}</b><span style={{ color: "var(--text)", fontWeight: 400 }}>{m.label}</span></> : m.label}</button>
                    {m.parts.filter((p) => Math.abs(p.annual) >= 0.5).length > 1 && (
                      <div className="muted small">{m.parts.filter((p) => Math.abs(p.annual) >= 0.5).map((p) => `${p.label} ${money0(p.annual)}`).join(" · ")}</div>
                    )}
                    {!m.code && <div className="muted small"><Pill tone={TONE_NEUTRAL}>No property code</Pill></div>}
                  </td>
                  <td style={td}>{num0(m.annual)}</td>
                  <td style={{ ...td, color: "var(--muted)" }}>{num0(monthly10(m.annual))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: "10px 14px 4px", fontWeight: 800, fontSize: 15 }}>Marketing <span className="muted small" style={{ fontWeight: 400 }}>{money0(a.marketing.total)} a year</span></div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={thL}>Fund</th><th style={th}>Split</th><th style={th}>Annual</th><th style={th}>Monthly</th></tr></thead>
            <tbody>
              {(["sc", "niLlc", "jv3"] as FundKey[]).map((k) => (
                <tr key={k}>
                  <td style={tdL}>{a.funds.find((x) => x.fund === k)!.label}</td>
                  <PctCell value={doc.marketingSplit[k]} decimals={0} onSave={(v) => update((d) => ({ ...d, marketingSplit: { ...d.marketingSplit, [k]: v } }))} />
                  <td style={td}>{num0(a.marketing.byFund[k])}</td>
                  <td style={{ ...td, color: "var(--muted)" }}>{num0(monthly10(a.marketing.byFund[k]))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
