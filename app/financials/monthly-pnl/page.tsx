"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "../../components/UserProvider";
import type { MonthlyPnlStatement, PnlKind, PnlSubtotal } from "../../../lib/financials/monthly-pnl/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmt(v: number): string {
  const n = Math.round(v || 0);
  if (n === 0) return "—";
  const s = Math.abs(n).toLocaleString("en-US");
  return n < 0 ? `(${s})` : s;
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

type Row = { label: string; monthly: number[] | null; total: number | null; kind: "header" | "line" | "subtotal" | "noi" };

// Reconstruct the income-statement waterfall in reading order from the stored
// lines + named subtotals.
function orderedRows(s: MonthlyPnlStatement): Row[] {
  const rows: Row[] = [];
  const sub = (k: keyof MonthlyPnlStatement["subtotals"], label: string, noi = false) => {
    const v = s.subtotals[k] as PnlSubtotal | undefined;
    if (v) rows.push({ label, monthly: v.monthly, total: v.total, kind: noi ? "noi" : "subtotal" });
  };
  const linesIn = (sec: string) => s.lines.filter((l) => l.section === sec);
  const section = (title: string, sec: string) => {
    const ls = linesIn(sec);
    if (!ls.length) return;
    rows.push({ label: title, monthly: null, total: null, kind: "header" });
    for (const l of ls) rows.push({ label: l.label, monthly: l.monthly, total: l.total, kind: "line" });
  };

  section("Revenues", "revenues");
  sub("totalRevenueAndOther", "Total Revenue & Other");
  section("Reimbursements", "reimbursements");
  sub("totalReimbursements", "Total Reimbursements");
  sub("totalRevenues", "TOTAL REVENUES");
  section("Reimbursable Expenses", "reimbursable expenses");
  sub("totalReimbursableExpenses", "Total Reimbursable Expenses");
  section("Non-Reimbursable Expenses", "non-reimbursable expenses");
  sub("totalNonReimbursableExpenses", "Total Non-Reimbursable Expenses");
  sub("totalOperatingExpenses", "TOTAL OPERATING EXPENSES");
  sub("netOperatingIncome", "NET OPERATING INCOME", true);
  section("Below NOI (Capital / TI / Other)", "below-noi");
  section("Debt Service", "debt service");
  sub("totalDebtService", "Total Debt Service");
  sub("cashFlowBeforeDebtService", "Cash Flow Before Debt Service");
  sub("cashFlowAfterDebtService", "Cash Flow After Debt Service");
  return rows;
}

export default function MonthlyPnlPage() {
  const { user } = useUser();
  const [statements, setStatements] = useState<MonthlyPnlStatement[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [propCode, setPropCode] = useState("");
  const [year, setYear] = useState<number | null>(null);
  const [kind, setKind] = useState<PnlKind>("actual");

  function load() {
    fetch("/api/financials/monthly-pnl", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setStatements(j.statements ?? []))
      .catch(() => setStatements([]))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  async function onFile(file: File) {
    setUploading(true); setErr(null); setNote(null);
    try {
      const fileBase64 = await fileToBase64(file);
      const res = await fetch("/api/financials/monthly-pnl", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileBase64, fileName: file.name, uploadedBy: user.label }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Import failed");
      setNote(`Imported ${j.count} building${j.count === 1 ? "" : "s"} — ${j.fund ?? ""} ${j.year} ${j.kind}.`);
      load();
    } catch (e: any) {
      setErr(e?.message ?? "Import failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // ── Coverage: fund → property → available (year, kind) ──
  const coverage = useMemo(() => {
    const funds = new Map<string, Map<string, { name: string; entries: Set<string> }>>();
    for (const s of statements) {
      const f = s.fund ?? "—";
      if (!funds.has(f)) funds.set(f, new Map());
      const props = funds.get(f)!;
      if (!props.has(s.propertyCode)) props.set(s.propertyCode, { name: s.propertyName || s.propertyCode, entries: new Set() });
      props.get(s.propertyCode)!.entries.add(`${s.year} ${s.kind === "actual" ? "A" : "B"}`);
    }
    return funds;
  }, [statements]);

  const propsList = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of statements) if (!m.has(s.propertyCode)) m.set(s.propertyCode, `${s.propertyCode} — ${s.propertyName || s.propertyCode}`);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [statements]);

  const yearsForProp = useMemo(() =>
    [...new Set(statements.filter((s) => s.propertyCode === propCode).map((s) => s.year))].sort((a, b) => b - a),
    [statements, propCode]);
  const kindsForSel = useMemo(() =>
    new Set(statements.filter((s) => s.propertyCode === propCode && s.year === year).map((s) => s.kind)),
    [statements, propCode, year]);

  // keep selection valid
  useEffect(() => {
    if (!propCode && propsList.length) setPropCode(propsList[0][0]);
  }, [propsList, propCode]);
  useEffect(() => {
    if (yearsForProp.length && !yearsForProp.includes(year as number)) setYear(yearsForProp[0]);
  }, [yearsForProp, year]);
  useEffect(() => {
    if (kindsForSel.size && !kindsForSel.has(kind)) setKind([...kindsForSel][0] as PnlKind);
  }, [kindsForSel, kind]);

  const current = useMemo(() =>
    statements.find((s) => s.propertyCode === propCode && s.year === year && s.kind === kind) ?? null,
    [statements, propCode, year, kind]);
  const budgetPeer = useMemo(() =>
    statements.find((s) => s.propertyCode === propCode && s.year === year && s.kind === "budget") ?? null,
    [statements, propCode, year]);
  const actualPeer = useMemo(() =>
    statements.find((s) => s.propertyCode === propCode && s.year === year && s.kind === "actual") ?? null,
    [statements, propCode, year]);

  const rows = current ? orderedRows(current) : [];

  // NOI by year (both kinds) for the selected property
  const noiByYear = useMemo(() => {
    const m = new Map<number, { actual?: number; budget?: number }>();
    for (const s of statements.filter((s) => s.propertyCode === propCode)) {
      const e = m.get(s.year) ?? {};
      e[s.kind] = s.subtotals.netOperatingIncome?.total ?? 0;
      m.set(s.year, e);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [statements, propCode]);

  const avb = actualPeer && budgetPeer; // both present → variance strip
  const keyLine = (s: MonthlyPnlStatement | null, k: keyof MonthlyPnlStatement["subtotals"]) => s?.subtotals[k]?.total ?? 0;

  return (
    <main style={{ display: "grid", gap: 14 }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1>Income Statement History</h1>
          <div className="small muted" style={{ marginTop: 2 }}>Actual &amp; budget monthly P&amp;L (income, expenses, NOI) imported from the by-month reporting workbooks.</div>
        </div>
        <span style={{ fontFamily: "'Arial Black', Arial, sans-serif", fontWeight: 900, fontSize: 26, letterSpacing: "-0.5px" }}>KORMAN</span>
      </header>

      {/* Import */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div>
            <b>Import by-month workbook</b>
            <div className="muted small" style={{ marginTop: 4 }}>Upload an “Actual by Month” or “Budget by Month” .xlsm/.xlsx. Every building tab is parsed and filed by property, year, and actual/budget.</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input ref={fileRef} type="file" accept=".xlsm,.xlsx,.xls" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
            <button className="btn large" onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? "Importing…" : "Choose workbook…"}</button>
          </div>
        </div>
        {note && <div className="small" style={{ marginTop: 10, color: "#15803d", fontWeight: 600 }}>✅ {note}</div>}
        {err && <div className="small" style={{ marginTop: 10, color: "#b91c1c", fontWeight: 600 }}>⚠ {err}</div>}
      </div>

      {/* Coverage */}
      <div className="card">
        <b>Loaded coverage</b>
        {loading ? <div className="muted small" style={{ marginTop: 8 }}>Loading…</div> :
          coverage.size === 0 ? <div className="muted small" style={{ marginTop: 8 }}>Nothing imported yet — upload a by-month workbook above.</div> :
          <div style={{ marginTop: 8, display: "grid", gap: 10 }}>
            {[...coverage.entries()].sort().map(([fund, props]) => (
              <div key={fund}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#0b4a7d" }}>{fund}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                  {[...props.entries()].sort().map(([code, info]) => (
                    <span key={code} style={{ fontSize: 11, background: "rgba(15,23,42,0.05)", borderRadius: 8, padding: "3px 8px" }}>
                      <b>{code}</b> {[...info.entries].sort().join(", ")}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>}
      </div>

      {/* Viewer */}
      {statements.length > 0 && (
        <div className="card">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
            <select value={propCode} onChange={(e) => setPropCode(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8 }}>
              {propsList.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </select>
            <select value={year ?? ""} onChange={(e) => setYear(Number(e.target.value))} style={{ padding: "6px 10px", borderRadius: 8 }}>
              {yearsForProp.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              {(["actual", "budget"] as PnlKind[]).map((k) => (
                <button key={k} onClick={() => setKind(k)} disabled={!kindsForSel.has(k)}
                  style={{ padding: "6px 12px", border: 0, cursor: kindsForSel.has(k) ? "pointer" : "not-allowed",
                    background: kind === k ? "#0b4a7d" : "transparent", color: kind === k ? "#fff" : (kindsForSel.has(k) ? "var(--text)" : "var(--muted)"),
                    fontWeight: 700, fontSize: 12, textTransform: "capitalize", opacity: kindsForSel.has(k) ? 1 : 0.5 }}>
                  {k}
                </button>
              ))}
            </div>
          </div>

          {/* Actual vs Budget snapshot (when both exist) */}
          {avb && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
              {([["Total Revenues", "totalRevenues"], ["Operating Expenses", "totalOperatingExpenses"], ["NOI", "netOperatingIncome"]] as const).map(([lbl, key]) => {
                const a = keyLine(actualPeer, key), b = keyLine(budgetPeer, key), v = a - b;
                return (
                  <div key={key} style={{ flex: "1 1 200px", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px" }}>
                    <div className="small muted" style={{ fontWeight: 700 }}>{lbl} · {year}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 13 }}><span>Actual</span><b>{fmt(a)}</b></div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span className="muted">Budget</span><span className="muted">{fmt(b)}</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 2, color: v >= 0 ? "#15803d" : "#b91c1c", fontWeight: 700 }}><span>Variance</span><span>{fmt(v)}</span></div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Statement table */}
          <div className="tableWrap" style={{ overflowX: "auto" }}>
            <table style={{ fontSize: 12, minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", position: "sticky", left: 0, background: "var(--card)" }}>{current?.propertyCode} — {current?.propertyName} · {year} {kind}</th>
                  {MONTHS.map((m) => <th key={m} style={{ textAlign: "right" }}>{m}</th>)}
                  <th style={{ textAlign: "right" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const isHead = r.kind === "header", isSub = r.kind === "subtotal", isNoi = r.kind === "noi";
                  const bg = isNoi ? "rgba(11,74,125,0.08)" : isSub ? "rgba(15,23,42,0.03)" : undefined;
                  const fw = isHead || isSub || isNoi ? 700 : 400;
                  return (
                    <tr key={i} style={{ background: bg }}>
                      <td style={{ textAlign: "left", fontWeight: fw, paddingLeft: r.kind === "line" ? 20 : 8, color: isHead ? "#0b4a7d" : undefined, textTransform: isNoi ? "uppercase" : undefined, position: "sticky", left: 0, background: bg ?? "var(--card)" }}>{r.label}</td>
                      {MONTHS.map((_, m) => <td key={m} style={{ textAlign: "right", fontWeight: fw }}>{r.monthly ? fmt(r.monthly[m]) : ""}</td>)}
                      <td style={{ textAlign: "right", fontWeight: 700 }}>{r.total != null ? fmt(r.total) : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* NOI by year */}
          {noiByYear.length > 1 && (
            <div style={{ marginTop: 16 }}>
              <b className="small">NOI by year — {propCode}</b>
              <div className="tableWrap" style={{ marginTop: 6 }}>
                <table style={{ fontSize: 12 }}>
                  <thead><tr><th style={{ textAlign: "left" }}>Year</th><th style={{ textAlign: "right" }}>Actual NOI</th><th style={{ textAlign: "right" }}>Budget NOI</th><th style={{ textAlign: "right" }}>Variance</th></tr></thead>
                  <tbody>
                    {noiByYear.map(([y, e]) => (
                      <tr key={y}>
                        <td style={{ textAlign: "left" }}>{y}</td>
                        <td style={{ textAlign: "right" }}>{e.actual != null ? fmt(e.actual) : "—"}</td>
                        <td style={{ textAlign: "right" }} className="muted">{e.budget != null ? fmt(e.budget) : "—"}</td>
                        <td style={{ textAlign: "right", fontWeight: 700, color: e.actual != null && e.budget != null ? (e.actual - e.budget >= 0 ? "#15803d" : "#b91c1c") : undefined }}>{e.actual != null && e.budget != null ? fmt(e.actual - e.budget) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
