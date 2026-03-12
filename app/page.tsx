"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { money, num, pct as fmtPct } from "../lib/utils";

function toTitleCase(s: string): string {
  if (!s) return s;
  return s
    .toLowerCase()
    .replace(/(?:^|[\s-])(\S)/g, (match) => match.toUpperCase());
}

function formatDateForZip(payDate: string): string {
  if (!payDate) return "";
  const mdy = payDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const [, m, d, y] = mdy;
    return `${d.padStart(2, "0")}-${m.padStart(2, "0")}-${y.slice(2)} `;
  }
  const dt = new Date(payDate);
  if (!isNaN(dt.getTime())) {
    const dd = String(dt.getDate()).padStart(2, "0");
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const yy = String(dt.getFullYear()).slice(2);
    return `${dd}-${mm}-${yy} `;
  }
  return "";
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("Failed to read file"));
    r.onload = () => {
      const v = r.result;
      if (typeof v !== "string") return reject(new Error("Unexpected FileReader result"));
      const i = v.indexOf(",");
      if (i === -1) return reject(new Error("Invalid data URL"));
      resolve(v.slice(i + 1));
    };
    r.readAsDataURL(file);
  });
}

type DrillRow = { employee: string; amount: number; allocPct?: number; baseAmount?: number; category?: string };
type DrillState = { title: string; total: number; rows: DrillRow[]; isTotal: boolean };

type EmployeeSummary = {
  name: string;
  employeeNumber?: string;
  payrollIndex?: number;
  recoverable: boolean;
  salaryAmt: number;
  overtimeAmt: number;
  overtimeHours: number;
  holAmt: number;
  holHours: number;
  er401kAmt: number;
  otherAmt: number;
  otherBreakdown?: Array<{ label: string; amount: number }>;
  taxesErAmt: number;
  taxesErBreakdown?: Array<{ label: string; amount: number }>;
  total: number;
  allocations: Record<string, number>;
  exclusions?: Array<{ label: string; amount: number }>;
};

type PropAllocRow = {
  employee: string; allocPct: number;
  salary: number; overtime: number; hol: number; er401k: number; other: number; taxesEr: number; total: number;
};
type PropAllocModal = { propertyKey: string; propertyLabel: string; rows: PropAllocRow[]; showOther: boolean; showTaxesEr: boolean };

type EmpModalRow = {
  propertyKey: string;
  propertyName: string;
  allocPct?: number;
  salary: number;
  overtime: number;
  hol: number;
  er401k: number;
  other: number;
  taxesEr: number;
  total: number;
  isSubtotal?: boolean;
};

type EmpModal = {
  employee: EmployeeSummary;
  rows: EmpModalRow[];
  colTotals: { salary: number; overtime: number; hol: number; er401k: number; other: number; taxesEr: number; total: number; allocPct: number };
  showOther: boolean;
  showTaxesEr: boolean;
};

type PeriodMeta = { id: string; name: string; payDate?: string | null; savedAt: string; total: number; employeeCount: number };
type EmpHistoryRow = { id: string; name: string; payDate?: string | null; salary: number; overtime: number; hol: number; er401k: number; other: number; taxesEr: number; total: number };

// Group membership: which properties roll up into each group subtotal
const GROUP_PROPS: Record<string, string[]> = {
  "JV III": ["3610", "3620", "3640"],
  "NI LLC": ["4050", "4060", "4070", "4080", "40A0", "40B0", "40C0"],
  SC: ["1100", "1500", "2300", "4500", "5600", "7010", "7200", "7300", "8200", "9510"],
};
const PROP_TO_GROUP: Record<string, string> = {};
for (const [g, props] of Object.entries(GROUP_PROPS)) {
  for (const p of props) PROP_TO_GROUP[p] = g;
}
const GROUP_ORDER = ["JV III", "NI LLC", "SC"];

export default function Page() {
  const [payroll, setPayroll] = useState<any>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drill, setDrill] = useState<DrillState | null>(null);
  const [empModal, setEmpModal] = useState<EmpModal | null>(null);
  const [propAllocModal, setPropAllocModal] = useState<PropAllocModal | null>(null);
  const [invoicesOpen, setInvoicesOpen] = useState(true);
  const [employeesOpen, setEmployeesOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  const [empTab, setEmpTab] = useState<"breakdown" | "history">("breakdown");
  const [empHistory, setEmpHistory] = useState<EmpHistoryRow[] | null>(null);
  const [empHistoryLoading, setEmpHistoryLoading] = useState(false);

  const totals = useMemo(() => {
    const t = { salaryREC: 0, salaryNR: 0, overtime: 0, holREC: 0, holNR: 0, er401k: 0, other: 0, taxesEr: 0, total: 0 };
    for (const i of invoices) {
      t.salaryREC += i.salaryREC ?? 0;
      t.salaryNR  += i.salaryNR  ?? 0;
      t.overtime  += i.overtime  ?? 0;
      t.holREC    += i.holREC    ?? 0;
      t.holNR     += i.holNR     ?? 0;
      t.er401k    += i.er401k    ?? 0;
      t.other     += i.other     ?? 0;
      t.taxesEr   += i.taxesEr   ?? 0;
      t.total     += i.total     ?? 0;
    }
    return t;
  }, [invoices]);

  // Dynamic column visibility for Invoices card — hide any column whose total is $0
  const showInvSalaryREC = totals.salaryREC > 0;
  const showInvSalaryNR  = totals.salaryNR  > 0;
  const showInvOvertime  = totals.overtime  > 0;
  const showInvHolREC    = totals.holREC    > 0;
  const showInvHolNR     = totals.holNR     > 0;
  const showInvEr401k    = totals.er401k    > 0;
  const showInvOther     = totals.other     > 0;
  const showInvTaxesEr   = totals.taxesEr   > 0;
  const invColCount = 3 + [showInvSalaryREC, showInvSalaryNR, showInvOvertime, showInvHolREC, showInvHolNR, showInvEr401k, showInvOther, showInvTaxesEr].filter(Boolean).length;

  const employeeTotals = useMemo(() => {
    const t = { salary: 0, overtime: 0, hol: 0, er401k: 0, other: 0, taxesEr: 0, total: 0 };
    for (const e of employees) {
      t.salary   += e.salaryAmt   ?? 0;
      t.overtime += e.overtimeAmt ?? 0;
      t.hol      += e.holAmt      ?? 0;
      t.er401k   += e.er401kAmt   ?? 0;
      t.other    += e.otherAmt    ?? 0;
      t.taxesEr  += e.taxesErAmt  ?? 0;
      t.total    += e.total       ?? 0;
    }
    return t;
  }, [employees]);

  // Dynamic column visibility for Employees card — hide any column whose total is $0
  const showEmpSalary   = employeeTotals.salary   > 0;
  const showEmpOvertime = employeeTotals.overtime  > 0;
  const showEmpHol      = employeeTotals.hol       > 0;
  const showEmpEr401k   = employeeTotals.er401k    > 0;
  const showEmpOther    = employeeTotals.other     > 0;
  const showEmpTaxesEr  = employeeTotals.taxesEr   > 0;
  const empColCount = 3 + [showEmpSalary, showEmpOvertime, showEmpHol, showEmpEr401k, showEmpOther, showEmpTaxesEr].filter(Boolean).length;

  // Auto-load a period from ?load=id URL param (set by the History page)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("load");
    if (id) {
      window.history.replaceState({}, "", "/");
      loadPeriod(id);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function savePeriod() {
    const name = payroll?.payDate ?? new Date().toLocaleDateString();
    setSaving(true);
    try {
      // Strip drilldown from invoices before saving to reduce payload size
      const invoicesSlim = (invoices ?? []).map(({ drilldown: _d, ...rest }) => rest);
      const res = await fetch("/api/periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, payroll, invoices: invoicesSlim, employees }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        let msg = `Save failed (${res.status})`;
        try { const j = JSON.parse(text); if (j?.error) msg = j.error; } catch { if (text) msg += ": " + text.slice(0, 200); }
        throw new Error(msg);
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to save period");
    } finally { setSaving(false); }
  }

  async function loadPeriod(id: string) {
    setBusy("Loading period…");
    try {
      const res = await fetch(`/api/periods/${id}`);
      if (!res.ok) throw new Error("Period not found");
      const j = await res.json();
      setPayroll(j.payroll);
      setInvoices(j.invoices ?? []);
      setEmployees((j.employees ?? []).slice().sort(
        (a: EmployeeSummary, b: EmployeeSummary) => (a.payrollIndex ?? 9999) - (b.payrollIndex ?? 9999)
      ));
    } catch (e: any) {
      setError(e?.message ?? "Failed to load period");
    } finally { setBusy(null); }
  }

  async function loadEmpHistory(empName: string, empNumber?: string) {
    setEmpHistoryLoading(true);
    setEmpHistory(null);
    try {
      const res = await fetch("/api/periods");
      const j = await res.json().catch(() => ({}));
      const allPeriods: PeriodMeta[] = (j.periods ?? []).slice().reverse(); // oldest first
      const rows = (await Promise.all(
        allPeriods.map(async (meta): Promise<EmpHistoryRow | null> => {
          try {
            const pr = await fetch(`/api/periods/${meta.id}`);
            const pd = await pr.json();
            const emps: any[] = pd.employees ?? [];
            let emp = empNumber ? emps.find((e: any) => e.employeeNumber === empNumber) : null;
            if (!emp) emp = emps.find((e: any) => String(e.name).toLowerCase() === empName.toLowerCase());
            if (!emp) return null;
            return {
              id: meta.id, name: meta.name, payDate: meta.payDate,
              salary: emp.salaryAmt ?? 0, overtime: emp.overtimeAmt ?? 0,
              hol: emp.holAmt ?? 0, er401k: emp.er401kAmt ?? 0,
              other: emp.otherAmt ?? 0, taxesEr: emp.taxesErAmt ?? 0,
              total: emp.total ?? 0,
            };
          } catch { return null; }
        })
      )).filter((r): r is EmpHistoryRow => r !== null);
      setEmpHistory(rows);
    } catch { setEmpHistory([]); } finally { setEmpHistoryLoading(false); }
  }

  async function importPayroll(file: File) {
    setError(null);
    setBusy("Parsing…");
    try {
      const fileBase64 = await fileToBase64(file);
      const res = await fetch("/api/parse-payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileBase64, filename: file.name }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? "Failed to parse payroll");
      setPayroll(j.payroll);
      setInvoices(j.invoices ?? []);
      // Sort by position in payroll register so the table matches the report order
      setEmployees((j.employees ?? []).slice().sort(
        (a: EmployeeSummary, b: EmployeeSummary) => (a.payrollIndex ?? 9999) - (b.payrollIndex ?? 9999)
      ));
    } catch (e: any) {
      setPayroll(null);
      setInvoices([]);
      setEmployees([]);
      setError(e?.message ?? "Failed to parse payroll");
    } finally {
      setBusy(null);
    }
  }

  async function generateAll() {
    if (!payroll) return;
    setError(null);
    setBusy("Generating PDFs…");
    try {
      const res = await fetch("/api/generate-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payroll, invoices, employees }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? "Failed to generate PDFs");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${formatDateForZip(payroll?.payDate ?? "")}payroll-invoices.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e?.message ?? "Failed to generate PDFs");
    } finally {
      setBusy(null);
    }
  }

  function openDrill(inv: any, field: string, label: string) {
    const isTotal = field === "total";
    const rows: DrillRow[] = inv?.drilldown?.[field] ?? [];
    setDrill({
      title: `${toTitleCase(inv.propertyLabel ?? inv.propertyKey)} — ${label}`,
      total: inv?.[field] ?? 0,
      rows: [...rows].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)),
      isTotal,
    });
  }

  /** Open drill modal showing a simple label→amount breakdown (employee's own Other or TaxesEr). */
  function openBreakdownDrill(title: string, total: number, breakdown: Array<{ label: string; amount: number }>) {
    const rows: DrillRow[] = breakdown.map((b) => ({
      employee: b.label,
      amount: b.amount,
    }));
    setDrill({ title, total, rows, isTotal: true });
  }

  function openPillDrill(label: string, total: number, field: keyof Pick<EmployeeSummary, "salaryAmt" | "overtimeAmt" | "holAmt" | "er401kAmt" | "otherAmt" | "taxesErAmt" | "total">) {
    const rows: DrillRow[] = employees
      .filter((e) => (e[field] as number) !== 0)
      .map((e) => ({ employee: e.name, amount: e[field] as number }));
    setDrill({ title: `${label} — All Employees`, total, rows, isTotal: true });
  }

  function openPropAlloc(inv: any) {
    const empMap = new Map<string, PropAllocRow>();
    const drilldown: Record<string, DrillRow[]> = inv.drilldown ?? {};
    for (const [field, rows] of Object.entries(drilldown)) {
      if (field === "total") continue;
      for (const row of rows) {
        if (!empMap.has(row.employee)) {
          empMap.set(row.employee, { employee: row.employee, allocPct: row.allocPct ?? 0, salary: 0, overtime: 0, hol: 0, er401k: 0, other: 0, taxesEr: 0, total: 0 });
        }
        const e = empMap.get(row.employee)!;
        if (e.allocPct === 0 && row.allocPct) e.allocPct = row.allocPct;
        const amt = row.amount ?? 0;
        if (field === "salaryREC" || field === "salaryNR") e.salary += amt;
        else if (field === "overtime") e.overtime += amt;
        else if (field === "holREC" || field === "holNR") e.hol += amt;
        else if (field === "er401k") e.er401k += amt;
        else if (field === "other") e.other += amt;
        else if (field === "taxesEr") e.taxesEr += amt;
        e.total += amt;
      }
    }
    const rows = Array.from(empMap.values()).sort((a, b) => b.total - a.total);
    const showOther   = rows.some((r) => r.other   > 0);
    const showTaxesEr = rows.some((r) => r.taxesEr > 0);
    setPropAllocModal({ propertyKey: inv.propertyKey, propertyLabel: inv.propertyLabel ?? inv.propertyKey, rows, showOther, showTaxesEr });
  }

  function openEmployee(e: EmployeeSummary) {
    const eName = e.name.toLowerCase();

    type PropData = {
      propertyKey: string; propertyName: string; allocPct: number;
      salary: number; overtime: number; hol: number; er401k: number; other: number; taxesEr: number; total: number;
    };
    const propMap = new Map<string, PropData>();

    for (const inv of invoices) {
      const drilldown: Record<string, DrillRow[]> = inv.drilldown ?? {};
      let found = false;
      const row: PropData = { propertyKey: inv.propertyKey, propertyName: inv.propertyLabel ?? "", allocPct: 0, salary: 0, overtime: 0, hol: 0, er401k: 0, other: 0, taxesEr: 0, total: 0 };

      for (const [field, rows] of Object.entries(drilldown)) {
        if (field === "total") continue;
        for (const r of rows) {
          if (String(r.employee).toLowerCase() !== eName) continue;
          found = true;
          const amt = r.amount ?? 0;
          if (field === "salaryREC" || field === "salaryNR") row.salary += amt;
          else if (field === "overtime") row.overtime += amt;
          else if (field === "holREC" || field === "holNR") row.hol += amt;
          else if (field === "er401k") row.er401k += amt;
          else if (field === "other") row.other += amt;
          else if (field === "taxesEr") row.taxesEr += amt;
          row.total += amt;
          // Use allocPct from any non-category row (category rows share the same allocPct)
          if (!row.allocPct && r.allocPct) row.allocPct = r.allocPct;
        }
      }

      if (found) propMap.set(inv.propertyKey, row);
    }

    // Partition into groups and standalone
    const byGroup: Record<string, PropData[]> = {};
    const standalone: PropData[] = [];
    for (const row of propMap.values()) {
      const g = PROP_TO_GROUP[row.propertyKey];
      if (g) (byGroup[g] = byGroup[g] ?? []).push(row);
      else standalone.push(row);
    }

    // Build display rows: grouped sections first, then standalone
    const displayRows: EmpModalRow[] = [];
    for (const groupName of GROUP_ORDER) {
      const rows = byGroup[groupName];
      if (!rows?.length) continue;
      rows.sort((a, b) => a.propertyKey.localeCompare(b.propertyKey));
      for (const r of rows) displayRows.push(r);
      displayRows.push({
        propertyKey: groupName,
        propertyName: `Total: ${groupName}`,
        allocPct: rows.reduce((s, r) => s + r.allocPct, 0),
        salary:   rows.reduce((s, r) => s + r.salary,   0),
        overtime: rows.reduce((s, r) => s + r.overtime, 0),
        hol:      rows.reduce((s, r) => s + r.hol,      0),
        er401k:   rows.reduce((s, r) => s + r.er401k,   0),
        other:    rows.reduce((s, r) => s + r.other,    0),
        taxesEr:  rows.reduce((s, r) => s + r.taxesEr,  0),
        total:    rows.reduce((s, r) => s + r.total,    0),
        isSubtotal: true,
      });
    }
    standalone.sort((a, b) => a.propertyKey.localeCompare(b.propertyKey));
    for (const r of standalone) displayRows.push(r);

    // Column totals and grand-total allocPct (sum non-subtotal rows only)
    const nonSub = displayRows.filter((r) => !r.isSubtotal);
    const colTotals = {
      salary:   nonSub.reduce((s, r) => s + r.salary,   0),
      overtime: nonSub.reduce((s, r) => s + r.overtime, 0),
      hol:      nonSub.reduce((s, r) => s + r.hol,      0),
      er401k:   nonSub.reduce((s, r) => s + r.er401k,   0),
      other:    nonSub.reduce((s, r) => s + r.other,    0),
      taxesEr:  nonSub.reduce((s, r) => s + r.taxesEr,  0),
      total:    nonSub.reduce((s, r) => s + r.total,    0),
      allocPct: nonSub.reduce((s, r) => s + (r.allocPct ?? 0), 0),
    };

    const showOther   = nonSub.some((r) => r.other   > 0);
    const showTaxesEr = nonSub.some((r) => r.taxesEr > 0);

    setEmpModal({ employee: e, rows: displayRows, colTotals, showOther, showTaxesEr });
    setEmpTab("breakdown");
    setEmpHistory(null);
  }

  return (
    <main style={{ display: "grid", gap: 14 }}>
      <header>
        <h1>Payroll Invoicer</h1>
      </header>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <b>Import Payroll Register</b>
            <span className="muted small" style={{ marginLeft: 12 }}>{payroll?.payDate ? `Pay Date: ${payroll.payDate}` : ""}</span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {invoices.length > 0 && (
              <button className="btn large" disabled={saving} onClick={savePeriod}>
                {saving ? "Saving…" : "Save Pay Period"}
              </button>
            )}
            <button className="btn primary large" disabled={!payroll || !!busy} onClick={generateAll}>Generate All PDFs</button>
          </div>
        </div>
        <p className="muted small" style={{ marginTop: 8 }}>
          Import the <b>Payroll Register</b> Excel file (.xls or .xlsx). Allocation is fixed on the backend.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
          <div style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            border: "1px solid var(--border)",
            borderRadius: 999,
            padding: "6px 14px 6px 6px",
            background: "#fff",
            minWidth: 0,
          }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importPayroll(f);
              }}
              style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", fontSize: 14 }}
            />
          </div>
          <button
            className="btn"
            style={{ borderRadius: 999, fontWeight: 700, whiteSpace: "nowrap" }}
            onClick={() => {
              if (fileInputRef.current) fileInputRef.current.value = "";
              setPayroll(null);
              setInvoices([]);
              setEmployees([]);
            }}
          >
            Clear
          </button>
        </div>
        {employees.length > 0 && (
          <div className="pills">
            {employeeTotals.salary   > 0 && <span className="pill" style={{ cursor: "pointer" }} title="Click to see employee breakdown" onClick={() => openPillDrill("Salary",      employeeTotals.salary,   "salaryAmt"  )}><b>{money(employeeTotals.salary)}</b><span className="muted small">Salary</span></span>}
            {employeeTotals.overtime > 0 && <span className="pill" style={{ cursor: "pointer" }} title="Click to see employee breakdown" onClick={() => openPillDrill("Overtime",    employeeTotals.overtime, "overtimeAmt")}><b>{money(employeeTotals.overtime)}</b><span className="muted small">Overtime</span></span>}
            {employeeTotals.hol      > 0 && <span className="pill" style={{ cursor: "pointer" }} title="Click to see employee breakdown" onClick={() => openPillDrill("HOL",         employeeTotals.hol,      "holAmt"     )}><b>{money(employeeTotals.hol)}</b><span className="muted small">HOL</span></span>}
            {employeeTotals.er401k   > 0 && <span className="pill" style={{ cursor: "pointer" }} title="Click to see employee breakdown" onClick={() => openPillDrill("401K (ER)",   employeeTotals.er401k,   "er401kAmt"  )}><b>{money(employeeTotals.er401k)}</b><span className="muted small">401K (ER)</span></span>}
            {employeeTotals.other    > 0 && <span className="pill" style={{ cursor: "pointer" }} title="Click to see employee breakdown" onClick={() => openPillDrill("Other",        employeeTotals.other,    "otherAmt"   )}><b>{money(employeeTotals.other)}</b><span className="muted small">Other</span></span>}
            {employeeTotals.taxesEr  > 0 && <span className="pill" style={{ cursor: "pointer" }} title="Click to see employee breakdown" onClick={() => openPillDrill("Taxes (ER)",  employeeTotals.taxesEr,  "taxesErAmt" )}><b>{money(employeeTotals.taxesEr)}</b><span className="muted small">Taxes (ER)</span></span>}
            {employeeTotals.total    > 0 && <span className="pill pill-total" style={{ cursor: "pointer" }} title="Click to see employee breakdown" onClick={() => openPillDrill("Total", employeeTotals.total, "total")}><b>{money(employeeTotals.total)}</b><span className="muted small">Total</span></span>}
          </div>
        )}
      </div>

      {/* ── Invoices card ── */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              className="btn"
              style={{ padding: "2px 8px", fontSize: 13 }}
              onClick={() => setInvoicesOpen((o) => !o)}
              title={invoicesOpen ? "Collapse" : "Expand"}
            >
              {invoicesOpen ? "▲" : "▼"}
            </button>
            <div>
              <b>Invoices</b>
              <div className="small muted" style={{ marginTop: 4 }}>
                Summary by property. Click any amount to see employee detail.
              </div>
            </div>
          </div>
        </div>

        {error && <div style={{ marginTop: 10, color: "#b42318", fontWeight: 800 }}>{error}</div>}
        {busy && <div style={{ marginTop: 10, color: "#a15c00", fontWeight: 800 }}>{busy}</div>}

        {invoicesOpen && (
          <>
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Property Name</th>
                    <th>Property</th>
                    {showInvSalaryREC && <th style={{ textAlign: "right" }}>Salary REC</th>}
                    {showInvSalaryNR  && <th style={{ textAlign: "right" }}>Salary NR</th>}
                    {showInvOvertime  && <th style={{ textAlign: "right" }}>Overtime</th>}
                    {showInvHolREC    && <th>HOL REC</th>}
                    {showInvHolNR     && <th>HOL NR</th>}
                    {showInvEr401k    && <th style={{ textAlign: "right" }}>401K (ER)</th>}
                    {showInvOther     && <th style={{ textAlign: "right" }}>Other</th>}
                    {showInvTaxesEr   && <th style={{ textAlign: "right" }}>Taxes (ER)</th>}
                    <th style={{ textAlign: "right" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.length === 0 ? (
                    <tr><td colSpan={invColCount} className="muted">Import a payroll file to see invoice summaries.</td></tr>
                  ) : (
                    invoices.map((r) => (
                      <tr key={r.propertyKey}>
                        <td>
                          <button className="linkBtn left" onClick={() => openPropAlloc(r)}>
                            {r.propertyLabel || r.propertyKey}
                          </button>
                        </td>
                        <td>{r.propertyCode || r.propertyKey}</td>
                        {showInvSalaryREC && <td><button className="linkBtn" onClick={() => openDrill(r, "salaryREC", "Salary REC")}>{money(r.salaryREC)}</button></td>}
                        {showInvSalaryNR  && <td><button className="linkBtn" onClick={() => openDrill(r, "salaryNR", "Salary NR")}>{money(r.salaryNR)}</button></td>}
                        {showInvOvertime  && <td><button className="linkBtn" onClick={() => openDrill(r, "overtime", "Overtime")}>{money(r.overtime)}</button></td>}
                        {showInvHolREC    && <td><button className="linkBtn" onClick={() => openDrill(r, "holREC", "HOL REC")}>{money(r.holREC)}</button></td>}
                        {showInvHolNR     && <td><button className="linkBtn" onClick={() => openDrill(r, "holNR", "HOL NR")}>{money(r.holNR)}</button></td>}
                        {showInvEr401k    && <td><button className="linkBtn" onClick={() => openDrill(r, "er401k", "401K (ER)")}>{money(r.er401k)}</button></td>}
                        {showInvOther     && <td style={{ textAlign: "right" }}><button className="linkBtn" onClick={() => openDrill(r, "other", "Other Pay")}>{money(r.other)}</button></td>}
                        {showInvTaxesEr   && <td><button className="linkBtn" onClick={() => openDrill(r, "taxesEr", "Taxes (ER)")}>{money(r.taxesEr)}</button></td>}
                        <td><button className="linkBtn" onClick={() => openDrill(r, "total", "Total")}><b>{money(r.total)}</b></button></td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Totals</td>
                    <td></td>
                    {showInvSalaryREC && <td>{money(totals.salaryREC)}</td>}
                    {showInvSalaryNR  && <td>{money(totals.salaryNR)}</td>}
                    {showInvOvertime  && <td>{money(totals.overtime)}</td>}
                    {showInvHolREC    && <td>{money(totals.holREC)}</td>}
                    {showInvHolNR     && <td>{money(totals.holNR)}</td>}
                    {showInvEr401k    && <td>{money(totals.er401k)}</td>}
                    {showInvOther     && <td style={{ textAlign: "right" }}>{money(totals.other)}</td>}
                    {showInvTaxesEr   && <td>{money(totals.taxesEr)}</td>}
                    <td>{money(totals.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <hr />
            <div className="small muted">Allocation is read from <code>/data/allocation.xlsx</code> on the server. <span style={{ color: "#888" }}>(Data\LIK Management\Payroll)</span></div>
          </>
        )}
      </div>

      {/* ── Employees card ── */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              className="btn"
              style={{ padding: "2px 8px", fontSize: 13 }}
              onClick={() => setEmployeesOpen((o) => !o)}
              title={employeesOpen ? "Collapse" : "Expand"}
            >
              {employeesOpen ? "▲" : "▼"}
            </button>
            <div>
              <b>Employees</b>
              <div className="small muted" style={{ marginTop: 4 }}>Every employee from the allocation workbook. Click a name to see their property breakdown.</div>
            </div>
          </div>
        </div>

        {employeesOpen && (
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>REC/NR</th>
                  {showEmpSalary   && <th style={{ textAlign: "right" }}>Salary *</th>}
                  {showEmpOvertime && <th style={{ textAlign: "right" }}>Overtime</th>}
                  {showEmpHol      && <th style={{ textAlign: "right" }}>HOL</th>}
                  {showEmpEr401k   && <th style={{ textAlign: "right" }}>401K (ER)</th>}
                  {showEmpOther    && <th style={{ textAlign: "right" }}>Other</th>}
                  {showEmpTaxesEr  && <th style={{ textAlign: "right" }}>Taxes (ER)</th>}
                  <th style={{ textAlign: "right" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {employees.length === 0 ? (
                  <tr><td colSpan={empColCount} className="muted">Import a payroll file to see employees.</td></tr>
                ) : (
                  employees.map((e) => (
                    <tr key={e.name}>
                      <td>
                        <button className="linkBtn left" onClick={() => openEmployee(e)}>{toTitleCase(e.name)}</button>
                      </td>
                      <td><span className={e.recoverable ? "tag rec" : "tag nr"}>{e.recoverable ? "REC" : "NR"}</span></td>
                      {showEmpSalary   && <td style={{ textAlign: "right" }}>{money(e.salaryAmt)}</td>}
                      {showEmpOvertime && <td style={{ textAlign: "right" }}>{money(e.overtimeAmt)}</td>}
                      {showEmpHol      && <td style={{ textAlign: "right" }}>{money(e.holAmt)}</td>}
                      {showEmpEr401k   && <td style={{ textAlign: "right" }}>{money(e.er401kAmt)}</td>}
                      {showEmpOther && (
                        <td style={{ textAlign: "right" }}>
                          {e.otherAmt > 0
                            ? <button className="linkBtn" onClick={() => openBreakdownDrill(`${toTitleCase(e.name)} — Other Pay`, e.otherAmt, e.otherBreakdown ?? [])}>{money(e.otherAmt)}</button>
                            : money(0)}
                        </td>
                      )}
                      {showEmpTaxesEr && (
                        <td style={{ textAlign: "right" }}>
                          {e.taxesErAmt > 0
                            ? <button className="linkBtn" onClick={() => openBreakdownDrill(`${toTitleCase(e.name)} — Taxes (ER)`, e.taxesErAmt, e.taxesErBreakdown ?? [])}>{money(e.taxesErAmt)}</button>
                            : money(0)}
                        </td>
                      )}
                      <td style={{ textAlign: "right" }}><b>{money(e.total)}</b></td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td>Totals</td>
                  <td></td>
                  {showEmpSalary   && <td style={{ textAlign: "right" }}>{money(employeeTotals.salary)}</td>}
                  {showEmpOvertime && <td style={{ textAlign: "right" }}>{money(employeeTotals.overtime)}</td>}
                  {showEmpHol      && <td style={{ textAlign: "right" }}>{money(employeeTotals.hol)}</td>}
                  {showEmpEr401k   && <td style={{ textAlign: "right" }}>{money(employeeTotals.er401k)}</td>}
                  {showEmpOther    && <td style={{ textAlign: "right" }}>{money(employeeTotals.other)}</td>}
                  {showEmpTaxesEr  && <td style={{ textAlign: "right" }}>{money(employeeTotals.taxesEr)}</td>}
                  <td style={{ textAlign: "right" }}>{money(employeeTotals.total)}</td>
                </tr>
                <tr>
                  <td colSpan={empColCount} className="muted" style={{ fontSize: "0.78em", paddingTop: "4px", fontWeight: 400 }}>
                    * Salary includes Regular, Salary, and VAC pay.
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── Property allocation modal ── */}
      {propAllocModal && (
        <div className="modalOverlay" onClick={() => setPropAllocModal(null)}>
          <div className="modal wide" onClick={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div>
                <div className="modalTitle">{toTitleCase(propAllocModal.propertyLabel)}</div>
                <div className="muted small">Employee allocations to this property</div>
              </div>
              <button className="btn" onClick={() => setPropAllocModal(null)}>Close</button>
            </div>
            {propAllocModal.rows.length === 0 ? (
              <div className="muted" style={{ marginTop: 12 }}>No allocation data — upload a payroll file first.</div>
            ) : (
              <table className="modalTable">
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>Employee</th>
                    <th style={{ textAlign: "right" }}>Alloc %</th>
                    <th style={{ textAlign: "right" }}>Salary</th>
                    <th style={{ textAlign: "right" }}>Overtime</th>
                    <th style={{ textAlign: "right" }}>HOL</th>
                    <th style={{ textAlign: "right" }}>401K (ER)</th>
                    {propAllocModal.showOther   && <th style={{ textAlign: "right" }}>Other</th>}
                    {propAllocModal.showTaxesEr && <th style={{ textAlign: "right" }}>Taxes (ER)</th>}
                    <th style={{ textAlign: "right" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {propAllocModal.rows.map((r, i) => (
                    <tr key={i}>
                      <td>
                        {(() => {
                          const emp = employees.find((e) => e.name.toLowerCase() === r.employee.toLowerCase());
                          return emp
                            ? <button className="linkBtn left" onClick={() => { setPropAllocModal(null); openEmployee(emp); }}>{toTitleCase(r.employee)}</button>
                            : toTitleCase(r.employee);
                        })()}
                      </td>
                      <td style={{ textAlign: "right" }}>{fmtPct(r.allocPct)}</td>
                      <td style={{ textAlign: "right" }}>{money(r.salary)}</td>
                      <td style={{ textAlign: "right" }}>{money(r.overtime)}</td>
                      <td style={{ textAlign: "right" }}>{money(r.hol)}</td>
                      <td style={{ textAlign: "right" }}>{money(r.er401k)}</td>
                      {propAllocModal.showOther   && <td style={{ textAlign: "right" }}>{money(r.other)}</td>}
                      {propAllocModal.showTaxesEr && <td style={{ textAlign: "right" }}>{money(r.taxesEr)}</td>}
                      <td style={{ textAlign: "right" }}><b>{money(r.total)}</b></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 700 }}>
                    <td colSpan={2}>Totals</td>
                    <td style={{ textAlign: "right" }}>{money(propAllocModal.rows.reduce((s, r) => s + r.salary, 0))}</td>
                    <td style={{ textAlign: "right" }}>{money(propAllocModal.rows.reduce((s, r) => s + r.overtime, 0))}</td>
                    <td style={{ textAlign: "right" }}>{money(propAllocModal.rows.reduce((s, r) => s + r.hol, 0))}</td>
                    <td style={{ textAlign: "right" }}>{money(propAllocModal.rows.reduce((s, r) => s + r.er401k, 0))}</td>
                    {propAllocModal.showOther   && <td style={{ textAlign: "right" }}>{money(propAllocModal.rows.reduce((s, r) => s + r.other, 0))}</td>}
                    {propAllocModal.showTaxesEr && <td style={{ textAlign: "right" }}>{money(propAllocModal.rows.reduce((s, r) => s + r.taxesEr, 0))}</td>}
                    <td style={{ textAlign: "right" }}>{money(propAllocModal.rows.reduce((s, r) => s + r.total, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── Invoice drilldown modal ── */}
      {drill && (
        <div className="modalOverlay" onClick={() => setDrill(null)}>
          <div className="modal" style={{ maxHeight: "80vh", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div>
                <div className="modalTitle">{drill.title}</div>
                <div className="muted">Total: <b>{money(drill.total)}</b></div>
              </div>
              <button className="btn" onClick={() => setDrill(null)}>Close</button>
            </div>

            <div style={{ overflowY: "auto", flex: 1 }}>
            {(() => {
              const hasCategory = drill.rows.some((r) => r.category);
              return (
                <table className="modalTable">
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left" }}>Employee</th>
                      {hasCategory && <th style={{ textAlign: "left" }}>Type</th>}
                      {!drill.isTotal && <th style={{ textAlign: "right" }}>Base $</th>}
                      {!drill.isTotal && <th style={{ textAlign: "right" }}>Alloc %</th>}
                      <th style={{ textAlign: "right" }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drill.rows.map((row, idx) => (
                      <tr key={idx}>
                        <td>{toTitleCase(row.employee)}</td>
                        {hasCategory && <td style={{ color: "#555" }}>{row.category ?? ""}</td>}
                        {!drill.isTotal && <td style={{ textAlign: "right" }}>{row.baseAmount == null ? "—" : money(row.baseAmount)}</td>}
                        {!drill.isTotal && <td style={{ textAlign: "right" }}>{row.allocPct == null ? "—" : fmtPct(row.allocPct)}</td>}
                        <td style={{ textAlign: "right" }}>{money(row.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })()}
            </div>
          </div>
        </div>
      )}

      {/* ── Employee detail modal ── */}
      {empModal && (
        <div className="modalOverlay" onClick={() => setEmpModal(null)}>
          <div className="modal wide" style={{ maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div>
                <div className="modalTitle">
                  {toTitleCase(empModal.employee.name)}
                  {empModal.employee.employeeNumber && (
                    <span className="muted" style={{ fontSize: 13, fontWeight: 400, marginLeft: 8 }}>
                      Employee #{empModal.employee.employeeNumber}
                    </span>
                  )}
                </div>
                <div className="muted">
                  Salary {money(empModal.employee.salaryAmt)} · Overtime {money(empModal.employee.overtimeAmt)} · HOL {money(empModal.employee.holAmt)} · 401K (ER) {money(empModal.employee.er401kAmt)}
                </div>
              </div>
              <button className="btn" onClick={() => setEmpModal(null)}>Close</button>
            </div>

            {/* Tab bar */}
            <div style={{ display: "flex", gap: 0, marginTop: 14, borderBottom: "2px solid #e5e7eb" }}>
              {(["breakdown", "history"] as const).map((tab) => (
                <button
                  key={tab}
                  className="btn"
                  style={{
                    borderRadius: 0, padding: "5px 16px", fontSize: 13, fontWeight: empTab === tab ? 700 : 400,
                    borderBottom: empTab === tab ? "2px solid #0b4a7d" : "2px solid transparent",
                    marginBottom: -2, color: empTab === tab ? "#0b4a7d" : undefined,
                  }}
                  onClick={() => {
                    setEmpTab(tab);
                    if (tab === "history" && !empHistory && !empHistoryLoading) {
                      loadEmpHistory(empModal!.employee.name, empModal!.employee.employeeNumber);
                    }
                  }}
                >
                  {tab === "breakdown" ? "Current Period" : "History"}
                </button>
              ))}
            </div>

            {empTab === "breakdown" ? (
              <>
                {empModal.employee.exclusions?.length ? (
                  <div style={{ margin: "10px 0 6px", fontSize: 12, color: "#555" }}>
                    {empModal.employee.exclusions.map((exc, i) => (
                      <div key={i}>* Salary does not include <b>{money(exc.amount)}</b> in {exc.label} paid during this period.</div>
                    ))}
                  </div>
                ) : null}
                {empModal.rows.length === 0 ? (
                  <div className="muted" style={{ marginTop: 12 }}>No property data — amounts may not yet be parsed from the payroll file.</div>
                ) : (
                  <table className="modalTable" style={{ marginTop: 12 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left" }}>Property</th>
                        <th style={{ textAlign: "left" }}>Name</th>
                        <th style={{ textAlign: "right" }}>Alloc %</th>
                        <th style={{ textAlign: "right" }}>Salary</th>
                        <th style={{ textAlign: "right" }}>Overtime</th>
                        <th style={{ textAlign: "right" }}>HOL</th>
                        <th style={{ textAlign: "right" }}>401K (ER)</th>
                        {empModal.showOther   && <th style={{ textAlign: "right" }}>Other</th>}
                        {empModal.showTaxesEr && <th style={{ textAlign: "right" }}>Taxes (ER)</th>}
                        <th style={{ textAlign: "right" }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {empModal.rows.map((r, i) => (
                        <tr key={i} style={r.isSubtotal ? { fontWeight: 700, borderTop: "1px solid #ccc" } : {}}>
                          <td style={r.isSubtotal ? { color: "#0b4a7d" } : {}}>{r.isSubtotal ? "" : r.propertyKey}</td>
                          <td style={r.isSubtotal ? { color: "#0b4a7d" } : { color: "#666" }}>{r.isSubtotal ? r.propertyName : toTitleCase(r.propertyName)}</td>
                          <td style={{ textAlign: "right" }}>{r.allocPct ? fmtPct(r.allocPct) : ""}</td>
                          <td style={{ textAlign: "right" }}>{money(r.salary)}</td>
                          <td style={{ textAlign: "right" }}>{money(r.overtime)}</td>
                          <td style={{ textAlign: "right" }}>{money(r.hol)}</td>
                          <td style={{ textAlign: "right" }}>{money(r.er401k)}</td>
                          {empModal.showOther   && <td style={{ textAlign: "right" }}>{money(r.other)}</td>}
                          {empModal.showTaxesEr && <td style={{ textAlign: "right" }}>{money(r.taxesEr)}</td>}
                          <td style={{ textAlign: "right" }}><b>{money(r.total)}</b></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ fontWeight: 700 }}>
                        <td colSpan={2}>Grand Total</td>
                        <td style={{ textAlign: "right" }}>{fmtPct(empModal.colTotals.allocPct)}</td>
                        <td style={{ textAlign: "right" }}>{money(empModal.colTotals.salary)}</td>
                        <td style={{ textAlign: "right" }}>{money(empModal.colTotals.overtime)}</td>
                        <td style={{ textAlign: "right" }}>{money(empModal.colTotals.hol)}</td>
                        <td style={{ textAlign: "right" }}>{money(empModal.colTotals.er401k)}</td>
                        {empModal.showOther   && <td style={{ textAlign: "right" }}>{money(empModal.colTotals.other)}</td>}
                        {empModal.showTaxesEr && <td style={{ textAlign: "right" }}>{money(empModal.colTotals.taxesEr)}</td>}
                        <td style={{ textAlign: "right" }}>{money(empModal.colTotals.total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </>
            ) : (
              /* History tab */
              <div style={{ marginTop: 12 }}>
                {empHistoryLoading ? (
                  <div className="muted">Loading history…</div>
                ) : empHistory === null ? null : empHistory.length === 0 ? (
                  <div className="muted">No saved pay periods found for this employee.</div>
                ) : (() => {
                  const showHOther   = empHistory.some((r) => r.other   > 0);
                  const showHTaxesEr = empHistory.some((r) => r.taxesEr > 0);
                  return (
                    <table className="modalTable">
                      <thead>
                        <tr>
                          <th style={{ textAlign: "left" }}>Period</th>
                          <th style={{ textAlign: "left" }}>Pay Date</th>
                          <th style={{ textAlign: "right" }}>Salary</th>
                          <th style={{ textAlign: "right" }}>Overtime</th>
                          <th style={{ textAlign: "right" }}>HOL</th>
                          <th style={{ textAlign: "right" }}>401K (ER)</th>
                          {showHOther   && <th style={{ textAlign: "right" }}>Other</th>}
                          {showHTaxesEr && <th style={{ textAlign: "right" }}>Taxes (ER)</th>}
                          <th style={{ textAlign: "right" }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {empHistory.map((r) => (
                          <tr key={r.id}>
                            <td>{r.name}</td>
                            <td className="muted">{r.payDate ?? "—"}</td>
                            <td style={{ textAlign: "right" }}>{money(r.salary)}</td>
                            <td style={{ textAlign: "right" }}>{money(r.overtime)}</td>
                            <td style={{ textAlign: "right" }}>{money(r.hol)}</td>
                            <td style={{ textAlign: "right" }}>{money(r.er401k)}</td>
                            {showHOther   && <td style={{ textAlign: "right" }}>{money(r.other)}</td>}
                            {showHTaxesEr && <td style={{ textAlign: "right" }}>{money(r.taxesEr)}</td>}
                            <td style={{ textAlign: "right" }}><b>{money(r.total)}</b></td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ fontWeight: 700 }}>
                          <td colSpan={2}>Total ({empHistory.length} {empHistory.length === 1 ? "period" : "periods"})</td>
                          <td style={{ textAlign: "right" }}>{money(empHistory.reduce((s, r) => s + r.salary,   0))}</td>
                          <td style={{ textAlign: "right" }}>{money(empHistory.reduce((s, r) => s + r.overtime, 0))}</td>
                          <td style={{ textAlign: "right" }}>{money(empHistory.reduce((s, r) => s + r.hol,      0))}</td>
                          <td style={{ textAlign: "right" }}>{money(empHistory.reduce((s, r) => s + r.er401k,   0))}</td>
                          {showHOther   && <td style={{ textAlign: "right" }}>{money(empHistory.reduce((s, r) => s + r.other,   0))}</td>}
                          {showHTaxesEr && <td style={{ textAlign: "right" }}>{money(empHistory.reduce((s, r) => s + r.taxesEr, 0))}</td>}
                          <td style={{ textAlign: "right" }}>{money(empHistory.reduce((s, r) => s + r.total,    0))}</td>
                        </tr>
                      </tfoot>
                    </table>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
