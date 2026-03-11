"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { money } from "../../lib/utils";

type PeriodMeta = {
  id: string;
  name: string;
  payDate?: string | null;
  savedAt: string;
  total: number;
  employeeCount: number;
};

type EmpSummary = {
  name: string;
  recoverable: boolean;
  salaryAmt: number;
  overtimeAmt: number;
  holAmt: number;
  er401kAmt: number;
  otherAmt: number;
  taxesErAmt: number;
  total: number;
};

function toTitleCase(s: string): string {
  if (!s) return s;
  return s.toLowerCase().replace(/(?:^|[\s-])(\S)/g, (m) => m.toUpperCase());
}

export default function HistoryPage() {
  const router = useRouter();
  const [periods, setPeriods] = useState<PeriodMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [details, setDetails] = useState<Record<string, { employees: EmpSummary[] }>>({});
  const [detailsLoading, setDetailsLoading] = useState<Set<string>>(new Set());

  useEffect(() => { loadPeriods(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadPeriods() {
    setLoading(true);
    try {
      const res = await fetch("/api/periods");
      const j = await res.json().catch(() => ({}));
      setPeriods(j.periods ?? []);
    } catch { setPeriods([]); } finally { setLoading(false); }
  }

  async function toggleExpand(id: string) {
    if (expanded.has(id)) {
      setExpanded((prev) => { const s = new Set(prev); s.delete(id); return s; });
      return;
    }
    if (!details[id]) {
      setDetailsLoading((prev) => new Set(prev).add(id));
      try {
        const res = await fetch(`/api/periods/${id}`);
        const d = await res.json();
        setDetails((prev) => ({ ...prev, [id]: d }));
      } catch { /* leave detail empty */ } finally {
        setDetailsLoading((prev) => { const s = new Set(prev); s.delete(id); return s; });
      }
    }
    setExpanded((prev) => new Set(prev).add(id));
  }

  async function deletePeriod(id: string) {
    if (!confirm("Delete this saved period? This cannot be undone.")) return;
    try {
      await fetch(`/api/periods/${id}`, { method: "DELETE" });
      setExpanded((prev) => { const s = new Set(prev); s.delete(id); return s; });
      setDetails((prev) => { const d = { ...prev }; delete d[id]; return d; });
      await loadPeriods();
    } catch { /* ignore */ }
  }

  return (
    <main style={{ display: "grid", gap: 14 }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <h1>Payroll Invoicer</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <span style={{ fontFamily: "'Arial Black', 'Arial Bold', Arial, sans-serif", fontWeight: 900, fontSize: 30, letterSpacing: "-0.5px", lineHeight: 1 }}>KORMAN</span>
          <div style={{ width: 1, height: 36, background: "#000", flexShrink: 0 }} />
          <div style={{ fontSize: 11, letterSpacing: "0.22em", lineHeight: 1.7, fontFamily: "Arial, Helvetica, sans-serif" }}>
            <div>COMMERCIAL</div>
            <div>PROPERTIES</div>
          </div>
        </div>
      </header>

      <div className="card">
        <b style={{ fontSize: 17 }}>Pay Period History</b>
        <p className="muted small" style={{ margin: "4px 0 16px" }}>
          Saved pay periods for reference. Use &ldquo;Save Pay Period&rdquo; on the Payroll Invoicer page to archive each period.
        </p>

        {loading ? (
          <div className="muted small">Loading…</div>
        ) : periods.length === 0 ? (
          <div className="muted small">No saved periods yet.</div>
        ) : (
          periods.map((p) => {
            const isExpanded = expanded.has(p.id);
            const isLoading = detailsLoading.has(p.id);
            const emps: EmpSummary[] = details[p.id]?.employees ?? [];

            const showOT    = emps.some((e) => e.overtimeAmt > 0);
            const showHol   = emps.some((e) => e.holAmt     > 0);
            const show401k  = emps.some((e) => e.er401kAmt  > 0);
            const showOther = emps.some((e) => e.otherAmt   > 0);
            const showTaxes = emps.some((e) => e.taxesErAmt > 0);

            return (
              <div key={p.id} style={{ border: "1px solid var(--border)", borderRadius: 10, marginBottom: 12, overflow: "hidden" }}>
                {/* Card header */}
                <div style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{p.name}</div>
                    <div className="muted small" style={{ marginTop: 3 }}>
                      Saved {new Date(p.savedAt).toLocaleDateString()} &nbsp;·&nbsp; {p.employeeCount} employees &nbsp;·&nbsp; {money(p.total)}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button
                      className="btn"
                      style={{ fontSize: 12, padding: "4px 12px" }}
                      onClick={() => toggleExpand(p.id)}
                    >
                      {isExpanded ? "Collapse" : "Expand"}
                    </button>
                    <button
                      className="btn"
                      style={{ fontSize: 12, padding: "4px 12px" }}
                      onClick={() => router.push(`/?load=${p.id}`)}
                    >
                      Load
                    </button>
                    <button
                      className="btn"
                      style={{ fontSize: 12, padding: "4px 12px", color: "#b42318" }}
                      onClick={() => deletePeriod(p.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Expanded employee table */}
                {isExpanded && (
                  <div style={{ borderTop: "1px solid var(--border)" }}>
                    {isLoading ? (
                      <div className="muted small" style={{ padding: 16 }}>Loading…</div>
                    ) : emps.length === 0 ? (
                      <div className="muted small" style={{ padding: 16 }}>No employee data.</div>
                    ) : (
                      <div className="tableWrap" style={{ margin: 0 }}>
                        <table>
                          <thead>
                            <tr>
                              <th>Employee</th>
                              <th>REC/NR</th>
                              <th style={{ textAlign: "right" }}>Salary</th>
                              {showOT    && <th style={{ textAlign: "right" }}>Overtime</th>}
                              {showHol   && <th style={{ textAlign: "right" }}>HOL</th>}
                              {show401k  && <th style={{ textAlign: "right" }}>401K (ER)</th>}
                              {showOther && <th style={{ textAlign: "right" }}>Other</th>}
                              {showTaxes && <th style={{ textAlign: "right" }}>Taxes (ER)</th>}
                              <th style={{ textAlign: "right" }}>Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {emps.map((e, i) => (
                              <tr key={i}>
                                <td>{toTitleCase(e.name)}</td>
                                <td><span className={e.recoverable ? "tag rec" : "tag nr"}>{e.recoverable ? "REC" : "NR"}</span></td>
                                <td style={{ textAlign: "right" }}>{money(e.salaryAmt)}</td>
                                {showOT    && <td style={{ textAlign: "right" }}>{money(e.overtimeAmt)}</td>}
                                {showHol   && <td style={{ textAlign: "right" }}>{money(e.holAmt)}</td>}
                                {show401k  && <td style={{ textAlign: "right" }}>{money(e.er401kAmt)}</td>}
                                {showOther && <td style={{ textAlign: "right" }}>{money(e.otherAmt)}</td>}
                                {showTaxes && <td style={{ textAlign: "right" }}>{money(e.taxesErAmt)}</td>}
                                <td style={{ textAlign: "right" }}><b>{money(e.total)}</b></td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr>
                              <td>Totals</td>
                              <td></td>
                              <td style={{ textAlign: "right" }}>{money(emps.reduce((s, e) => s + e.salaryAmt,   0))}</td>
                              {showOT    && <td style={{ textAlign: "right" }}>{money(emps.reduce((s, e) => s + e.overtimeAmt, 0))}</td>}
                              {showHol   && <td style={{ textAlign: "right" }}>{money(emps.reduce((s, e) => s + e.holAmt,      0))}</td>}
                              {show401k  && <td style={{ textAlign: "right" }}>{money(emps.reduce((s, e) => s + e.er401kAmt,   0))}</td>}
                              {showOther && <td style={{ textAlign: "right" }}>{money(emps.reduce((s, e) => s + e.otherAmt,    0))}</td>}
                              {showTaxes && <td style={{ textAlign: "right" }}>{money(emps.reduce((s, e) => s + e.taxesErAmt,  0))}</td>}
                              <td style={{ textAlign: "right" }}>{money(emps.reduce((s, e) => s + e.total,       0))}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </main>
  );
}
