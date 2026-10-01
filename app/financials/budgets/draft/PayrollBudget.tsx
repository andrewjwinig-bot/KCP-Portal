"use client";

// THE 2010 LIK PAYROLL BUDGET — the owner's payroll workbook, as four tables
// in its own order: pay & taxes, health benefits, the allocation %, and where
// that lands building by building. Light blue = a cell you can type (click
// it); everything else is computed (`lib/financials/budgets/payrollBudget.ts`).
// Drew's and Alison's alone — the route refuses anyone else.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { StatPill, Pill, TONE_AMBER, TONE_NEUTRAL, TONE_BLUE } from "@/app/components/Pill";
import { th, thL, td, tdL } from "@/app/components/tableStyles";
import { HoverCard } from "@/app/components/HoverCard";
import LoadingState from "@/app/components/LoadingState";
import { STEP_LABEL } from "./stepStyles";
import { RaiseTestCard } from "./RaiseTestCard";
import {
  ALLOC_COLUMNS, FRINGE, GROUP_GL, allocatePayroll, employeeCost, allocTotal, monthly10,
  type PayrollBudgetDoc, type PayrollEmployee, type FundKey, type AllocKey, type FringeKey, type Rates,
} from "@/lib/financials/budgets/payrollBudget";

const money0 = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const num0 = (n: number) => (Math.abs(n) < 0.5 ? "–" : Math.round(n).toLocaleString("en-US"));
const num2 = (n: number) => (Math.abs(n) < 0.005 ? "–" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const pct = (n: number, d = 0) => (Math.abs(n) < 0.0005 ? "–" : `${n.toFixed(d)}%`);
const secLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" };
const INPUT_BG = "var(--input-cell)";
const totalRow: React.CSSProperties = { fontWeight: 800, borderTop: "2px solid var(--border)" };
const FRINGE_LABEL: Record<FringeKey, string> = { life: "Life", dental: "Dental", ltd: "LTD", std: "STD", vision: "Vision" };

/** A number you can type: shows formatted on light blue, a click opens it.
 *  Keeps the decimals as typed — UC, premiums and rates carry cents, and the
 *  grid's own editor rounds to whole dollars. */
function Cell({ value, show, onSave, width = 90 }: { value: number; show: string; onSave: (v: number) => void; width?: number }) {
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
      ) : show}
    </td>
  );
}

/** A percentage cell — the same editor, shown as a percent. */
function PctCell({ value, onSave, decimals = 1 }: { value: number; onSave: (v: number) => void; decimals?: number }) {
  return <Cell value={value} show={pct(value, decimals)} onSave={onSave} width={64} />;
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
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  // The health-benefits window: null closed, "" the whole list, else the employee opened from.
  const [healthFor, setHealthFor] = useState<string | null>(null);
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
      .then((j) => { setDoc(j.doc); setSeeded(!!j.seeded); })
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
      <div className="card" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 14px" }}>
        <Pill tone={TONE_BLUE}>Drew &amp; Alison only</Pill>
        <span className="small muted" style={{ flex: 1 }}>
          Per-employee pay, benefits and allocation — the salaries the Shopping Centers, JV III and NI LLC budgets allocate, and the table the Payroll Invoicer will read.
          {seeded && <> <b>Starting from {doc.seededFrom ?? "last year"}</b> — key each employee&rsquo;s {year} pay over it.</>}
        </span>
        <span className="small" style={{ color: saving === "failed" ? "#b91c1c" : "var(--muted)" }}>
          {saving === "saving" ? "Saving…" : saving === "failed" ? "Couldn't save — check your connection" : saving === "saved" ? "Saved" : doc.updatedAt ? `Saved ${new Date(doc.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}${doc.updatedBy ? ` by ${doc.updatedBy}` : ""}` : ""}
        </span>
      </div>

      <div className="pills">
        <StatPill label="Employees" value={String(doc.employees.length)} />
        <StatPill label={`${year} Salaries`} value={money0(a.totals.salary)} sub={`${money0(a.totals.perPay)} per pay`} />
        <StatPill label="Taxes & benefits" value={money0(benefits)} sub={`${a.totals.salary ? ((benefits / a.totals.salary) * 100).toFixed(1) : "0"}% on salary`} />
        <StatPill label="Gross payroll" value={money0(a.totals.gross)} total />
      </div>

      <RaiseTestCard doc={doc} onApply={(id, salary) => setEmp(id, { salary })} />

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
        <div style={STEP_LABEL}>Payroll allocation — % of each employee</div>
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
              return (
                <tr key={e.id}>
                  <td style={{ ...tdL, fontWeight: 600 }}>{e.name || <span className="muted">—</span>}</td>
                  <td style={td}>{num0(employeeCost(e, r).gross)}</td>
                  {ALLOC_COLUMNS.map((c) => (
                    <PctCell key={c.key} value={e.alloc?.[c.key] ?? 0} decimals={0}
                      onSave={(v) => setEmp(e.id, { alloc: { ...e.alloc, [c.key as AllocKey]: v } })} />
                  ))}
                  <td style={{ ...td, fontWeight: 800, color: Math.abs(tot - 100) > 0.05 ? "#b45309" : undefined }}>{pct(tot, Number.isInteger(tot) ? 0 : 1)}</td>
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
                    <td style={{ ...tdL, fontWeight: 700, color: "var(--brand)" }}>{b.code}</td>
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
                    {m.code && <b style={{ color: "var(--brand)", marginRight: 6 }}>{m.code}</b>}{m.label}
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
