"use client";

import { useMemo, useState } from "react";
import { money, num, pct as fmtPct } from "../lib/utils";

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

type DrillRow = { employee: string; amount: number; allocPct?: number; baseAmount?: number };
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
  total: number;
  allocations: Record<string, number>;
};

type PropAllocRow = { employee: string; allocPct: number; salary: number; overtime: number; hol: number; er401k: number; total: number };
type PropAllocModal = { propertyKey: string; propertyLabel: string; rows: PropAllocRow[] };

type EmpModalRow = {
  propertyKey: string;
  propertyName: string;
  salary: number;
  overtime: number;
  hol: number;
  er401k: number;
  total: number;
  isSubtotal?: boolean;
};

type EmpModal = {
  employee: EmployeeSummary;
  rows: EmpModalRow[];
  colTotals: { salary: number; overtime: number; hol: number; er401k: number; total: number };
};

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
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drill, setDrill] = useState<DrillState | null>(null);
  const [empModal, setEmpModal] = useState<EmpModal | null>(null);
  const [propAllocModal, setPropAllocModal] = useState<PropAllocModal | null>(null);
  const [invoicesOpen, setInvoicesOpen] = useState(true);
  const [employeesOpen, setEmployeesOpen] = useState(true);

  const totals = useMemo(() => {
    const t = { salaryREC: 0, salaryNR: 0, overtime: 0, holREC: 0, holNR: 0, er401k: 0, total: 0 };
    for (const i of invoices) {
      t.salaryREC += i.salaryREC ?? 0;
      t.salaryNR += i.salaryNR ?? 0;
      t.overtime += i.overtime ?? 0;
      t.holREC += i.holREC ?? 0;
      t.holNR += i.holNR ?? 0;
      t.er401k += i.er401k ?? 0;
      t.total += i.total ?? 0;
    }
    return t;
  }, [invoices]);

  const employeeTotals = useMemo(() => {
    const t = { salary: 0, overtime: 0, hol: 0, er401k: 0, total: 0 };
    for (const e of employees) {
      t.salary += e.salaryAmt ?? 0;
      t.overtime += e.overtimeAmt ?? 0;
      t.hol += e.holAmt ?? 0;
      t.er401k += e.er401kAmt ?? 0;
      t.total += e.total ?? 0;
    }
    return t;
  }, [employees]);

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
        body: JSON.stringify({ payroll }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? "Failed to generate PDFs");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "payroll-invoices.zip";
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
      title: `${inv.propertyLabel ?? inv.propertyKey} — ${label}`,
      total: inv?.[field] ?? 0,
      rows: [...rows].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)),
      isTotal,
    });
  }

  function openPropAlloc(inv: any) {
    // Aggregate per-employee amounts across all drilldown fields for this property
    const empMap = new Map<string, PropAllocRow>();
    const drilldown: Record<string, DrillRow[]> = inv.drilldown ?? {};
    for (const [field, rows] of Object.entries(drilldown)) {
      if (field === "total") continue;
      for (const row of rows) {
        if (!empMap.has(row.employee)) {
          empMap.set(row.employee, { employee: row.employee, allocPct: row.allocPct ?? 0, salary: 0, overtime: 0, hol: 0, er401k: 0, total: 0 });
        }
        const e = empMap.get(row.employee)!;
        if (e.allocPct === 0 && row.allocPct) e.allocPct = row.allocPct;
        const amt = row.amount ?? 0;
        if (field === "salaryREC" || field === "salaryNR") e.salary += amt;
        else if (field === "overtime") e.overtime += amt;
        else if (field === "holREC" || field === "holNR") e.hol += amt;
        else if (field === "er401k") e.er401k += amt;
        e.total += amt;
      }
    }
    const rows = Array.from(empMap.values()).sort((a, b) => b.total - a.total);
    setPropAllocModal({ propertyKey: inv.propertyKey, propertyLabel: inv.propertyLabel ?? inv.propertyKey, rows });
  }

  function openEmployee(e: EmployeeSummary) {
    const eName = e.name.toLowerCase();

    // Collect per-property amounts from invoice drilldowns (includes group allocations
    // already resolved to individual properties by buildInvoices).
    type PropData = { propertyKey: string; propertyName: string; salary: number; overtime: number; hol: number; er401k: number; total: number };
    const propMap = new Map<string, PropData>();

    for (const inv of invoices) {
      const drilldown: Record<string, DrillRow[]> = inv.drilldown ?? {};
      let found = false;
      const row: PropData = { propertyKey: inv.propertyKey, propertyName: inv.propertyLabel ?? "", salary: 0, overtime: 0, hol: 0, er401k: 0, total: 0 };

      for (const [field, rows] of Object.entries(drilldown)) {
        if (field === "total") continue;
        const empRow = rows.find((r) => String(r.employee).toLowerCase() === eName);
        if (!empRow) continue;
        found = true;
        const amt = empRow.amount ?? 0;
        if (field === "salaryREC" || field === "salaryNR") row.salary += amt;
        else if (field === "overtime") row.overtime += amt;
        else if (field === "holREC" || field === "holNR") row.hol += amt;
        else if (field === "er401k") row.er401k += amt;
        row.total += amt;
      }

      if (found) propMap.set(inv.propertyKey, row);
    }

    // Partition into groups and standalone
    const byGroup: Record<string, PropData[]> = {};
    const standalone: PropData[] = [];
    for (const row of propMap.values()) {
      const g = PROP_TO_GROUP[row.propertyKey];
      if (g) {
        (byGroup[g] = byGroup[g] ?? []).push(row);
      } else {
        standalone.push(row);
      }
    }

    // Build display rows: grouped sections first, then standalone
    const displayRows: EmpModalRow[] = [];
    for (const groupName of GROUP_ORDER) {
      const rows = byGroup[groupName];
      if (!rows?.length) continue;
      rows.sort((a, b) => a.propertyKey.localeCompare(b.propertyKey));
      for (const r of rows) displayRows.push(r);
      // Bold subtotal row for the group
      displayRows.push({
        propertyKey: groupName,
        propertyName: `Total: ${groupName}`,
        salary: rows.reduce((s, r) => s + r.salary, 0),
        overtime: rows.reduce((s, r) => s + r.overtime, 0),
        hol: rows.reduce((s, r) => s + r.hol, 0),
        er401k: rows.reduce((s, r) => s + r.er401k, 0),
        total: rows.reduce((s, r) => s + r.total, 0),
        isSubtotal: true,
      });
    }
    standalone.sort((a, b) => a.propertyKey.localeCompare(b.propertyKey));
    for (const r of standalone) displayRows.push(r);

    // Column totals (sum non-subtotal rows only)
    const nonSub = displayRows.filter((r) => !r.isSubtotal);
    const colTotals = {
      salary: nonSub.reduce((s, r) => s + r.salary, 0),
      overtime: nonSub.reduce((s, r) => s + r.overtime, 0),
      hol: nonSub.reduce((s, r) => s + r.hol, 0),
      er401k: nonSub.reduce((s, r) => s + r.er401k, 0),
      total: nonSub.reduce((s, r) => s + r.total, 0),
    };

    setEmpModal({ employee: e, rows: displayRows, colTotals });
  }

  return (
    <main style={{ display: "grid", gap: 14 }}>
      <header style={{ display: "grid", gap: 6 }}>
        <h1>Payroll Invoicer</h1>
        <p className="muted">
          Import the <b>Payroll Register</b> Excel file (.xls or .xlsx). Allocation is fixed on the backend.
        </p>
      </header>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
          <b>Import Payroll Register</b>
          <span className="muted small">{payroll?.payDate ? `Pay Date: ${payroll.payDate}` : ""}</span>
        </div>
        <input
          className="input"
          type="file"
          accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importPayroll(f);
          }}
        />
        {payroll && (
          <div className="pills">
            <span className="pill"><span className="muted">Salary</span><b>{money(payroll.totals?.salaryAmt ?? 0)}</b></span>
            <span className="pill"><span className="muted">Overtime</span><b>{money(payroll.totals?.overtimeAmt ?? 0)}</b></span>
            <span className="pill"><span className="muted">HOL</span><b>{money(payroll.totals?.holAmt ?? 0)}</b></span>
            <span className="pill"><span className="muted">401K ER</span><b>{money(payroll.totals?.er401kAmt ?? 0)}</b></span>
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
          <button className="btn primary" disabled={!payroll || !!busy} onClick={generateAll}>Generate All PDFs</button>
        </div>

        {error && <div style={{ marginTop: 10, color: "#b42318", fontWeight: 800 }}>{error}</div>}
        {busy && <div style={{ marginTop: 10, color: "#a15c00", fontWeight: 800 }}>{busy}</div>}

        {invoicesOpen && (
          <>
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Property</th>
                    <th>Property Name</th>
                    <th>Salary REC</th>
                    <th>Salary NR</th>
                    <th>Overtime</th>
                    <th>HOL REC</th>
                    <th>HOL NR</th>
                    <th>401K ER</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.length === 0 ? (
                    <tr><td colSpan={9} className="muted">Import a payroll file to see invoice summaries.</td></tr>
                  ) : (
                    invoices.map((r) => (
                      <tr key={r.propertyKey}>
                        <td>{r.propertyCode || r.propertyKey}</td>
                        <td>
                          <button className="linkBtn left" onClick={() => openPropAlloc(r)}>
                            {r.propertyLabel || r.propertyKey}
                          </button>
                        </td>
                        <td><button className="linkBtn" onClick={() => openDrill(r, "salaryREC", "Salary REC")}>{money(r.salaryREC)}</button></td>
                        <td><button className="linkBtn" onClick={() => openDrill(r, "salaryNR", "Salary NR")}>{money(r.salaryNR)}</button></td>
                        <td><button className="linkBtn" onClick={() => openDrill(r, "overtime", "Overtime")}>{money(r.overtime)}</button></td>
                        <td><button className="linkBtn" onClick={() => openDrill(r, "holREC", "HOL REC")}>{money(r.holREC)}</button></td>
                        <td><button className="linkBtn" onClick={() => openDrill(r, "holNR", "HOL NR")}>{money(r.holNR)}</button></td>
                        <td><button className="linkBtn" onClick={() => openDrill(r, "er401k", "401K ER")}>{money(r.er401k)}</button></td>
                        <td><button className="linkBtn" onClick={() => openDrill(r, "total", "Total")}><b>{money(r.total)}</b></button></td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Totals</td>
                    <td></td>
                    <td>{money(totals.salaryREC)}</td>
                    <td>{money(totals.salaryNR)}</td>
                    <td>{money(totals.overtime)}</td>
                    <td>{money(totals.holREC)}</td>
                    <td>{money(totals.holNR)}</td>
                    <td>{money(totals.er401k)}</td>
                    <td>{money(totals.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <hr />
            <div className="small muted">Allocation is read from <code>/data/allocation.xlsx</code> on the server.</div>
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
          <div className="small muted">Total: <b>{money(employeeTotals.total)}</b></div>
        </div>

        {employeesOpen && (
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>REC/NR</th>
                  <th>Salary</th>
                  <th>Overtime</th>
                  <th>HOL</th>
                  <th>401K ER</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {employees.length === 0 ? (
                  <tr><td colSpan={7} className="muted">Import a payroll file to see employees.</td></tr>
                ) : (
                  employees.map((e) => (
                    <tr key={e.name}>
                      <td>
                        <button className="linkBtn left" onClick={() => openEmployee(e)}>{e.name}</button>
                      </td>
                      <td><span className={e.recoverable ? "tag rec" : "tag nr"}>{e.recoverable ? "REC" : "NR"}</span></td>
                      <td style={{ textAlign: "right" }}>{money(e.salaryAmt)}</td>
                      <td style={{ textAlign: "right" }}>{money(e.overtimeAmt)}</td>
                      <td style={{ textAlign: "right" }}>{money(e.holAmt)}</td>
                      <td style={{ textAlign: "right" }}>{money(e.er401kAmt)}</td>
                      <td style={{ textAlign: "right" }}><b>{money(e.total)}</b></td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td>Totals</td>
                  <td></td>
                  <td style={{ textAlign: "right" }}>{money(employeeTotals.salary)}</td>
                  <td style={{ textAlign: "right" }}>{money(employeeTotals.overtime)}</td>
                  <td style={{ textAlign: "right" }}>{money(employeeTotals.hol)}</td>
                  <td style={{ textAlign: "right" }}>{money(employeeTotals.er401k)}</td>
                  <td style={{ textAlign: "right" }}>{money(employeeTotals.total)}</td>
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
                <div className="modalTitle">{propAllocModal.propertyLabel}</div>
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
                    <th style={{ textAlign: "right" }}>401K ER</th>
                    <th style={{ textAlign: "right" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {propAllocModal.rows.map((r, i) => (
                    <tr key={i}>
                      <td>{r.employee}</td>
                      <td style={{ textAlign: "right" }}>{fmtPct(r.allocPct)}</td>
                      <td style={{ textAlign: "right" }}>{money(r.salary)}</td>
                      <td style={{ textAlign: "right" }}>{money(r.overtime)}</td>
                      <td style={{ textAlign: "right" }}>{money(r.hol)}</td>
                      <td style={{ textAlign: "right" }}>{money(r.er401k)}</td>
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
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div>
                <div className="modalTitle">{drill.title}</div>
                <div className="muted">Total: <b>{money(drill.total)}</b></div>
              </div>
              <button className="btn" onClick={() => setDrill(null)}>Close</button>
            </div>

            <table className="modalTable">
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Employee</th>
                  {!drill.isTotal && <th style={{ textAlign: "right" }}>Base $</th>}
                  {!drill.isTotal && <th style={{ textAlign: "right" }}>Alloc %</th>}
                  <th style={{ textAlign: "right" }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {drill.rows.map((row, idx) => (
                  <tr key={idx}>
                    <td>{row.employee}</td>
                    {!drill.isTotal && <td style={{ textAlign: "right" }}>{row.baseAmount == null ? "—" : money(row.baseAmount)}</td>}
                    {!drill.isTotal && <td style={{ textAlign: "right" }}>{row.allocPct == null ? "—" : fmtPct(row.allocPct)}</td>}
                    <td style={{ textAlign: "right" }}>{money(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Employee detail modal ── */}
      {empModal && (
        <div className="modalOverlay" onClick={() => setEmpModal(null)}>
          <div className="modal wide" onClick={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div>
                <div className="modalTitle">
                  {empModal.employee.name}
                  {empModal.employee.employeeNumber && (
                    <span className="muted" style={{ fontSize: 13, fontWeight: 400, marginLeft: 8 }}>
                      Employee #{empModal.employee.employeeNumber}
                    </span>
                  )}
                </div>
                <div className="muted">
                  Salary {money(empModal.employee.salaryAmt)} · Overtime {money(empModal.employee.overtimeAmt)} · HOL {money(empModal.employee.holAmt)} · 401K ER {money(empModal.employee.er401kAmt)}
                </div>
              </div>
              <button className="btn" onClick={() => setEmpModal(null)}>Close</button>
            </div>

            {empModal.rows.length === 0 ? (
              <div className="muted" style={{ marginTop: 12 }}>No property data — amounts may not yet be parsed from the payroll file.</div>
            ) : (
              <table className="modalTable">
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>Property</th>
                    <th style={{ textAlign: "left" }}>Name</th>
                    <th style={{ textAlign: "right" }}>Salary</th>
                    <th style={{ textAlign: "right" }}>Overtime</th>
                    <th style={{ textAlign: "right" }}>HOL</th>
                    <th style={{ textAlign: "right" }}>401K ER</th>
                    <th style={{ textAlign: "right" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {empModal.rows.map((r, i) => (
                    <tr key={i} style={r.isSubtotal ? { fontWeight: 700, borderTop: "1px solid #ccc" } : {}}>
                      <td style={r.isSubtotal ? { color: "#0b4a7d" } : {}}>{r.isSubtotal ? "" : r.propertyKey}</td>
                      <td style={r.isSubtotal ? { color: "#0b4a7d" } : { color: "#666" }}>{r.propertyName}</td>
                      <td style={{ textAlign: "right" }}>{money(r.salary)}</td>
                      <td style={{ textAlign: "right" }}>{money(r.overtime)}</td>
                      <td style={{ textAlign: "right" }}>{money(r.hol)}</td>
                      <td style={{ textAlign: "right" }}>{money(r.er401k)}</td>
                      <td style={{ textAlign: "right" }}><b>{money(r.total)}</b></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 700 }}>
                    <td colSpan={2}>Totals</td>
                    <td style={{ textAlign: "right" }}>{money(empModal.colTotals.salary)}</td>
                    <td style={{ textAlign: "right" }}>{money(empModal.colTotals.overtime)}</td>
                    <td style={{ textAlign: "right" }}>{money(empModal.colTotals.hol)}</td>
                    <td style={{ textAlign: "right" }}>{money(empModal.colTotals.er401k)}</td>
                    <td style={{ textAlign: "right" }}>{money(empModal.colTotals.total)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
