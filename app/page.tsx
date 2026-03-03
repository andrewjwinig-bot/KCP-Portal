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

type DrillRow = { employee: string; amount: number; allocPct?: number; pct?: number; baseAmount?: number };
type DrillState = { title: string; total: number; rows: DrillRow[] };

type EmployeeSummary = {
  name: string;
  recoverable: boolean;
  payrollName: string | null;
  salaryAmt: number;
  overtimeAmt: number;
  overtimeHours: number;
  holAmt: number;
  holHours: number;
  er401kAmt: number;
  total: number;
  allocations: Record<string, number>;
};

type EmpModal = {
  employee: EmployeeSummary;
  rows: {
    propertyKey: string;
    propertyName: string;
    pct: number;
    salary: number;
    overtime: number;
    hol: number;
    er401k: number;
    total: number;
  }[];
};

function pickPct(raw: any): number {
  const n = Number(raw ?? 0);
  if (!isFinite(n) || n <= 0) return 0;
  return n > 1.5 ? n / 100 : n;
}

export default function Page() {
  const [payroll, setPayroll] = useState<any>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drill, setDrill] = useState<DrillState | null>(null);
  const [empModal, setEmpModal] = useState<EmpModal | null>(null);

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
      setEmployees(j.employees ?? []);
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
    const rows: DrillRow[] = inv?.breakdown?.[field] ?? [];
    setDrill({
      title: `${inv.propertyLabel ?? inv.propertyKey} — ${label}`,
      total: inv?.[field] ?? 0,
      rows: [...rows].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)),
    });
  }

  function openEmployee(e: EmployeeSummary) {
    const invByKey = new Map<string, any>();
    for (const inv of invoices) invByKey.set(inv.propertyKey ?? inv.propertyLabel, inv);

    const rows = Object.entries(e.allocations ?? {})
      .map(([propertyKey, raw]) => {
        const pct = pickPct(raw);
        const inv = invByKey.get(propertyKey);
        const propertyName = inv?.propertyName ?? "";
        const salary = (e.salaryAmt ?? 0) * pct;
        const overtime = (e.overtimeAmt ?? 0) * pct;
        const hol = (e.holAmt ?? 0) * pct;
        const er401k = (e.er401kAmt ?? 0) * pct;
        const total = salary + overtime + hol + er401k;
        return { propertyKey, propertyName, pct, salary, overtime, hol, er401k, total };
      })
      .filter((r) => r.pct > 0);

    rows.sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
    setEmpModal({ employee: e, rows });
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
            <span className="pill"><span className="muted">Overtime</span><b>{num(payroll.totals?.overtimeHours ?? 0)} hrs</b><span className="muted small">({money(payroll.totals?.overtimeAmt ?? 0)})</span></span>
            <span className="pill"><span className="muted">HOL</span><b>{num(payroll.totals?.holHours ?? 0)} hrs</b><span className="muted small">({money(payroll.totals?.holAmt ?? 0)})</span></span>
            <span className="pill"><span className="muted">401K ER</span><b>{money(payroll.totals?.er401kAmt ?? 0)}</b></span>
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <b>Invoices</b>
            <div className="small muted" style={{ marginTop: 4 }}>
              Summary by property (matches the invoice PDF line items). Rows with $0 will be omitted on PDFs. Click any amount to see employee detail.
            </div>
          </div>
          <button className="btn primary" disabled={!payroll || !!busy} onClick={generateAll}>Generate All PDFs</button>
        </div>

        {error && <div style={{ marginTop: 10, color: "#b42318", fontWeight: 800 }}>{error}</div>}
        {busy && <div style={{ marginTop: 10, color: "#a15c00", fontWeight: 800 }}>{busy}</div>}

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
                    <td>{r.propertyLabel}</td>
                    <td className="muted">{r.propertyName || "—"}</td>
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
        <div className="small muted">Allocation is read from <code>/data/allocation.xlsx</code> on the server (no upload needed).</div>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
          <div>
            <b>Employees</b>
            <div className="small muted" style={{ marginTop: 4 }}>Every employee from the allocation workbook. Click an employee to see their allocations across properties.</div>
          </div>
          <div className="small muted">Total: <b>{money(employeeTotals.total)}</b></div>
        </div>

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
                      {e.payrollName && e.payrollName !== e.name ? <div className="muted small">Matched payroll: {e.payrollName}</div> : null}
                    </td>
                    <td><span className={e.recoverable ? "tag rec" : "tag nr"}>{e.recoverable ? "REC" : "NR"}</span></td>
                    <td style={{ textAlign: "right" }}>{money(e.salaryAmt)}</td>
                    <td style={{ textAlign: "right" }}>{money(e.overtimeAmt)} <span className="muted small">({num(e.overtimeHours)} hrs)</span></td>
                    <td style={{ textAlign: "right" }}>{money(e.holAmt)} <span className="muted small">({num(e.holHours)} hrs)</span></td>
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
      </div>

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
                  <th style={{ textAlign: "right" }}>Base</th>
                  <th style={{ textAlign: "right" }}>Alloc %</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {drill.rows.map((row, idx) => {
                  const p = row.allocPct ?? row.pct;
                  return (
                    <tr key={idx}>
                      <td>{row.employee}</td>
                      <td style={{ textAlign: "right" }}>{row.baseAmount == null ? "—" : money(row.baseAmount)}</td>
                      <td style={{ textAlign: "right" }}>{p == null ? "—" : fmtPct(p)}</td>
                      <td style={{ textAlign: "right" }}>{money(row.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="muted small" style={{ marginTop: 10 }}>Tip: if an employee should not appear here, check their name match + allocation %s.</div>
          </div>
        </div>
      )}

      {empModal && (
        <div className="modalOverlay" onClick={() => setEmpModal(null)}>
          <div className="modal wide" onClick={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div>
                <div className="modalTitle">{empModal.employee.name}</div>
                <div className="muted">Salary {money(empModal.employee.salaryAmt)} · Overtime {money(empModal.employee.overtimeAmt)} · HOL {money(empModal.employee.holAmt)} · 401K ER {money(empModal.employee.er401kAmt)}</div>
              </div>
              <button className="btn" onClick={() => setEmpModal(null)}>Close</button>
            </div>

            <table className="modalTable">
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Property</th>
                  <th style={{ textAlign: "left" }}>Name</th>
                  <th style={{ textAlign: "right" }}>Alloc %</th>
                  <th style={{ textAlign: "right" }}>Salary</th>
                  <th style={{ textAlign: "right" }}>Overtime</th>
                  <th style={{ textAlign: "right" }}>HOL</th>
                  <th style={{ textAlign: "right" }}>401K ER</th>
                  <th style={{ textAlign: "right" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {empModal.rows.map((r) => (
                  <tr key={r.propertyKey}>
                    <td>{r.propertyKey}</td>
                    <td className="muted">{r.propertyName || "—"}</td>
                    <td style={{ textAlign: "right" }}>{fmtPct(r.pct)}</td>
                    <td style={{ textAlign: "right" }}>{money(r.salary)}</td>
                    <td style={{ textAlign: "right" }}>{money(r.overtime)}</td>
                    <td style={{ textAlign: "right" }}>{money(r.hol)}</td>
                    <td style={{ textAlign: "right" }}>{money(r.er401k)}</td>
                    <td style={{ textAlign: "right" }}><b>{money(r.total)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="muted small" style={{ marginTop: 10 }}>Tip: if totals look off, check the allocation workbook percentages for this employee.</div>
          </div>
        </div>
      )}
    </main>
  );
}
