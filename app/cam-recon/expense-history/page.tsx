"use client";

// Full operating-expense history for a retail center — every year on file for
// each CAM line plus the Property Insurance and Real Estate Taxes pools. The
// Final Expense Summary on the recon page shows only the most recent 3 years;
// the "Full Expense History" button lands here for the whole series.
//
// Display-only over the code seed (lib/cam/retail/expenseHistory.ts), the same
// way the office Operating Expense History page reads baseYearExpenses.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RETAIL_EXPENSE_HISTORY } from "@/lib/cam/retail/expenseHistory";
import { PROPERTY_DEFS } from "@/lib/properties/data";

const NAME = new Map(PROPERTY_DEFS.map((p) => [p.id.toUpperCase(), p.name]));

function money(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n === 0) return "$0";
  return "$" + Math.round(n).toLocaleString("en-US");
}

export default function RetailExpenseHistoryPage() {
  // Properties that have history on file (more appear as data is seeded).
  const codes = Object.keys(RETAIL_EXPENSE_HISTORY).sort();
  const [property, setProperty] = useState<string>(codes[0] ?? "");

  useEffect(() => {
    try {
      const want = new URLSearchParams(window.location.search).get("property");
      if (want) setProperty(want);
    } catch { /* ignore */ }
  }, []);

  const hist = RETAIL_EXPENSE_HISTORY[property] ?? null;

  const { years, rows, totals } = useMemo(() => {
    if (!hist) return { years: [] as number[], rows: [] as { label: string; values: Record<string, number> }[], totals: {} as Record<string, number> };
    const yearSet = new Set<number>();
    const collect = (m: Record<string, number>) => Object.keys(m).forEach((y) => yearSet.add(Number(y)));
    Object.values(hist.lines).forEach(collect);
    collect(hist.ins);
    collect(hist.ret);
    const ys = [...yearSet].sort((a, b) => b - a); // newest first
    const lineRows = Object.entries(hist.lines).map(([label, values]) => ({ label, values }));
    // CAM-line totals per year.
    const t: Record<string, number> = {};
    for (const y of ys) t[String(y)] = lineRows.reduce((a, r) => a + (r.values[String(y)] ?? 0), 0);
    return { years: ys, rows: lineRows, totals: t };
  }, [hist]);

  const num: React.CSSProperties = { textAlign: "right", padding: "6px 12px", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
  const head: React.CSSProperties = { ...num, fontSize: 12, fontWeight: 800, color: "var(--muted)", borderBottom: "1px solid var(--border)" };

  return (
    <main style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Retail Operating Expense History</h1>
          <div className="muted small">Full year-by-year actuals per expense line for each shopping center.</div>
        </div>
        <Link href="/cam-recon" className="btn" style={{ fontSize: 13, padding: "8px 14px", fontWeight: 700, textDecoration: "none" }}>← CAM / RET Reconciliation</Link>
      </header>

      <div className="card" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>Property</span>
        <select
          value={property}
          onChange={(e) => setProperty(e.target.value)}
          style={{ fontSize: 15, fontWeight: 700, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)" }}
        >
          {!codes.includes(property) && property && <option value={property}>{property} — {NAME.get(property.toUpperCase()) ?? ""}</option>}
          {codes.map((c) => <option key={c} value={c}>{c} — {NAME.get(c.toUpperCase()) ?? ""}</option>)}
        </select>
      </div>

      {!hist ? (
        <div className="card">
          <p style={{ fontWeight: 700, marginBottom: 6 }}>No expense history on file for {property}{NAME.get(property.toUpperCase()) ? ` — ${NAME.get(property.toUpperCase())}` : ""}.</p>
          <p className="muted small" style={{ margin: 0 }}>Add this center&rsquo;s prior-year actuals to <code>lib/cam/retail/expenseHistory.ts</code> and they&rsquo;ll appear here and in the recon&rsquo;s Final Expense Summary.</p>
        </div>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{property} — {NAME.get(property.toUpperCase()) ?? ""}</div>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12, minWidth: 480 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "6px 12px", borderBottom: "1px solid var(--border)", fontSize: 12, fontWeight: 800, color: "var(--muted)" }}>Expense</th>
                {years.map((y) => <th key={y} style={head}>{y}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ textAlign: "left", padding: "6px 12px" }}>{r.label}</td>
                  {years.map((y) => <td key={y} style={num}>{money(r.values[String(y)])}</td>)}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 800, borderTop: "2px solid var(--border)" }}>
                <td style={{ textAlign: "left", padding: "6px 12px" }}>Total Operating Expenses</td>
                {years.map((y) => <td key={y} style={num}>{money(totals[String(y)])}</td>)}
              </tr>
              <tr style={{ borderTop: "2px solid var(--border)" }}>
                <td style={{ textAlign: "left", padding: "6px 12px" }}>Property Insurance</td>
                {years.map((y) => <td key={y} style={num}>{money(hist.ins[String(y)])}</td>)}
              </tr>
              <tr>
                <td style={{ textAlign: "left", padding: "6px 12px" }}>Real Estate Taxes</td>
                {years.map((y) => <td key={y} style={num}>{money(hist.ret[String(y)])}</td>)}
              </tr>
            </tfoot>
          </table>
          <p className="muted small" style={{ marginTop: 8, marginBottom: 0 }}>
            The recon&rsquo;s Final Expense Summary highlights the most recent 3 years; this is the full series.
          </p>
        </div>
      )}
    </main>
  );
}
