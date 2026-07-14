"use client";

// Bank Reconciliation — reconciles a bank statement (imported CSV) against the
// GL cash account already stored from Operating Statements. Flags-to-Investigate
// style: it ties out automatically and calls out only what needs a human.

import { useEffect, useMemo, useState } from "react";
import { recAccounts, type RecAccount } from "@/lib/financials/bank-rec/roster";
import type { ReconResult } from "@/lib/financials/bank-rec/reconcile";

const BRAND = "#0b4a7d";
const RED = "#b91c1c";
const GREEN = "#15803d";
const AMBER = "#b45309";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const money = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inputStyle: React.CSSProperties = { border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontSize: 14, background: "var(--card)", color: "var(--text)", fontFamily: "inherit" };

type RunResponse = {
  result: ReconResult;
  book: { opening: number; ending: number; cashAccounts: { code: string; name: string }[]; coverageStartMonth: number; coverageEnd: number };
  csvEndingBalance: number | null;
  statementEnd: number;
  bankCount: number;
  error?: string;
};

export default function BankReconcilePage() {
  const accounts = useMemo(() => recAccounts(), []);
  const banks = useMemo(() => [...new Set(accounts.map((a) => a.bank))], [accounts]);

  const now = new Date();
  // Bank recs are done for the just-closed (trailing) month — in July you
  // reconcile June — so default to the prior month (and its year).
  const prior = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const [sel, setSel] = useState<RecAccount | null>(null);
  const [year, setYear] = useState(prior.getFullYear());
  const [month, setMonth] = useState(prior.getMonth());
  const [cashAccount, setCashAccount] = useState("0110-0000");
  const [cashAccounts, setCashAccounts] = useState<{ code: string; name: string }[]>([]);
  const [hasGl, setHasGl] = useState<boolean | null>(null);
  const [statementEnd, setStatementEnd] = useState("");
  const [bankCsv, setBankCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [run, setRun] = useState<RunResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the GL cash accounts available for the selected account's property.
  useEffect(() => {
    if (!sel?.propertyKey) { setCashAccounts([]); setHasGl(null); return; }
    setRun(null); setError(null);
    fetch(`/api/bank-rec/reconcile?key=${encodeURIComponent(sel.propertyKey)}&year=${year}`)
      .then((r) => r.json())
      .then((j) => {
        setHasGl(!!j.hasGl);
        setCashAccounts(j.cashAccounts ?? []);
        const codes: string[] = (j.cashAccounts ?? []).map((c: { code: string }) => c.code);
        setCashAccount(sel.cashHint && codes.includes(sel.cashHint) ? sel.cashHint : codes.includes("0110-0000") ? "0110-0000" : codes[0] ?? "0110-0000");
      })
      .catch(() => { setHasGl(false); setCashAccounts([]); });
  }, [sel, year]);

  function pickFile(f: File | null) {
    if (!f) return;
    setFileName(f.name);
    f.text().then((t) => setBankCsv(t));
  }

  async function doRun() {
    if (!sel?.propertyKey || busy) return;
    setBusy(true); setError(null); setRun(null);
    try {
      const res = await fetch("/api/bank-rec/reconcile", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: sel.propertyKey, year, month: month + 1, cashAccount, statementEnd, bankCsv }),
      });
      const j: RunResponse = await res.json();
      if (j.error) setError(j.error); else setRun(j);
    } catch (e: any) { setError(e?.message ?? "Failed to reconcile"); }
    finally { setBusy(false); }
  }

  const r = run?.result;
  const outMag = r ? -r.outstandingChecks.reduce((s, o) => s + o.amount, 0) : 0;
  const ditMag = r ? r.depositsInTransit.reduce((s, o) => s + o.amount, 0) : 0;

  return (
    <main style={{ maxWidth: 1180 }}>
      <header style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: BRAND }}>Banking</div>
        <h1 style={{ margin: "2px 0 0", fontSize: 40 }}>Bank Reconciliation</h1>
        <div className="muted small" style={{ marginTop: 4 }}>Reconciles the bank statement against the GL cash account already imported to Operating Statements. Pick an account, choose the month, and import the bank CSV.</div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 300px) minmax(0, 1fr)", gap: 18, alignItems: "start" }}>
        {/* ── Account roster ── */}
        <div className="card" style={{ padding: 12, maxHeight: "80vh", overflow: "auto" }}>
          <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", marginBottom: 8 }}>Accounts · {accounts.length}</div>
          {banks.map((bank) => (
            <div key={bank} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: BRAND, margin: "6px 2px" }}>{bank}</div>
              {accounts.filter((a) => a.bank === bank).map((a) => {
                const active = sel?.last4 === a.last4 && sel?.key === a.key;
                return (
                  <button key={a.key + a.last4} onClick={() => setSel(a)} style={{
                    display: "block", width: "100%", textAlign: "left", border: "1px solid", borderColor: active ? BRAND : "transparent",
                    background: active ? "rgba(11,74,125,0.06)" : "transparent", borderRadius: 8, padding: "7px 9px", cursor: "pointer", fontFamily: "inherit", marginBottom: 2,
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{a.name}</div>
                    <div className="muted small">{a.propertyKey ? `${a.propertyKey} · ` : ""}{a.last4}</div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* ── Workspace ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {!sel ? (
            <div className="card muted" style={{ textAlign: "center", padding: 40 }}>Select an account to reconcile.</div>
          ) : (
            <>
              <div className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>{sel.name} <span className="muted" style={{ fontWeight: 500, fontSize: 14 }}>· {sel.bank} {sel.last4}</span></div>
                  {hasGl === false && <span className="small" style={{ color: AMBER, fontWeight: 700 }}>No GL imported for {sel.propertyKey} {year}</span>}
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginTop: 12 }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span className="muted small" style={{ fontWeight: 700 }}>Year</span>
                    <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={inputStyle}>
                      {[now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2].map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span className="muted small" style={{ fontWeight: 700 }}>Statement month</span>
                    <select value={month} onChange={(e) => setMonth(Number(e.target.value))} style={inputStyle}>
                      {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
                    </select>
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span className="muted small" style={{ fontWeight: 700 }}>GL cash account</span>
                    <select value={cashAccount} onChange={(e) => setCashAccount(e.target.value)} style={inputStyle}>
                      {(cashAccounts.length ? cashAccounts : [{ code: "0110-0000", name: "Cash-Operating" }]).map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
                    </select>
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span className="muted small" style={{ fontWeight: 700 }}>Statement ending balance</span>
                    <input value={statementEnd} onChange={(e) => setStatementEnd(e.target.value)} placeholder="auto from CSV" inputMode="decimal" style={{ ...inputStyle, width: 150 }} />
                  </label>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
                  <label className="btn" style={{ fontWeight: 700, cursor: "pointer" }}>
                    {fileName ? `📄 ${fileName}` : "Choose bank CSV…"}
                    <input type="file" accept=".csv,text/csv" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} style={{ display: "none" }} />
                  </label>
                  <button className="btn primary" onClick={doRun} disabled={busy || !bankCsv.trim()} style={{ fontWeight: 700 }}>{busy ? "Reconciling…" : "Reconcile"}</button>
                  {bankCsv && !fileName && <span className="muted small">CSV pasted</span>}
                </div>
                <details style={{ marginTop: 10 }}>
                  <summary className="muted small" style={{ cursor: "pointer" }}>…or paste CSV</summary>
                  <textarea value={bankCsv} onChange={(e) => setBankCsv(e.target.value)} rows={4} placeholder="Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #…" style={{ ...inputStyle, width: "100%", marginTop: 6, fontFamily: "monospace", fontSize: 12 }} />
                </details>
              </div>

              {error && <div className="card" style={{ borderColor: "rgba(220,38,38,0.35)", color: RED, fontWeight: 700 }}>{error}</div>}

              {r && (
                <>
                  {/* Tie-out summary */}
                  <div className="card" style={{ borderLeft: `4px solid ${r.inBalance ? GREEN : AMBER}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: BRAND }}>{MONTHS[month]} {year} · Reconciliation</div>
                      <span style={{ fontWeight: 800, fontSize: 14, color: r.inBalance ? GREEN : AMBER }}>{r.inBalance ? "✓ In Balance" : `⚠ Off by ${money(r.difference)}`}</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, flexWrap: "wrap" }}>
                      <div>
                        <Line label="Statement ending balance" value={r.statementEnd} strong />
                        <Line label={`− Outstanding checks (${r.outstandingChecks.length})`} value={-outMag} />
                        {ditMag > 0 && <Line label={`+ Deposits in transit (${r.depositsInTransit.length})`} value={ditMag} />}
                        <Line label="Adjusted bank balance" value={r.adjustedBank} strong divider />
                      </div>
                      <div>
                        <Line label="GL cash ending (book)" value={run!.book.ending} strong />
                        {r.bankOnly.length > 0 && <Line label={`± Bank-only items (${r.bankOnly.length})`} value={r.adjustedBook - run!.book.ending} />}
                        <Line label="Adjusted book balance" value={r.adjustedBook} strong divider />
                        <div className="muted small" style={{ marginTop: 8 }}>Cross-check: this GL ending is the figure that feeds your <b>Cash Sheet</b> starting cash for {MONTHS[(month + 1) % 12]}.</div>
                      </div>
                    </div>
                  </div>

                  {/* Exceptions to investigate */}
                  {r.bankOnly.length > 0 && (
                    <Section title={`Exceptions to investigate (${r.bankOnly.length})`} accent={RED} note="On the bank statement but not in the GL — book these (fees, interest, ACH) or investigate.">
                      {r.bankOnly.map((b, i) => (
                        <RowLine key={i} left={b.description} mid={b.date} right={money(b.amount)} rightColor={b.amount < 0 ? RED : GREEN} />
                      ))}
                    </Section>
                  )}

                  {/* Outstanding checks */}
                  {r.outstandingChecks.length > 0 && (
                    <Section title={`Outstanding checks (${r.outstandingChecks.length})`} accent={AMBER} note="Issued in the GL, not yet cleared the bank.">
                      {r.outstandingChecks.map((o) => <RowLine key={o.key} left={o.label} mid={`#${o.checkNo ?? "—"} · ${o.date ?? ""}`} right={money(o.amount)} rightColor={RED} />)}
                    </Section>
                  )}

                  {r.depositsInTransit.length > 0 && (
                    <Section title={`Deposits in transit (${r.depositsInTransit.length})`} accent={BRAND} note="In the GL, not yet on the statement.">
                      {r.depositsInTransit.map((o) => <RowLine key={o.key} left={o.label} mid={o.date ?? ""} right={money(o.amount)} rightColor={GREEN} />)}
                    </Section>
                  )}

                  {/* Matched (collapsed) */}
                  <details className="card">
                    <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: GREEN }}>Cleared &amp; matched ({r.matched.length})</summary>
                    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
                      {r.matched.map((m, i) => <RowLine key={i} left={m.book.label} mid={`#${m.book.checkNo ?? "—"} · cleared ${m.bank.date}`} right={money(m.book.amount)} rightColor={m.book.amount < 0 ? "var(--text)" : GREEN} />)}
                    </div>
                  </details>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}

function Line({ label, value, strong, divider }: { label: string; value: number; strong?: boolean; divider?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "5px 0", borderTop: divider ? "1px solid var(--border)" : undefined, marginTop: divider ? 4 : 0 }}>
      <span className={strong ? "" : "muted small"} style={{ fontWeight: strong ? 700 : 400 }}>{label}</span>
      <span style={{ fontWeight: strong ? 800 : 600, fontVariantNumeric: "tabular-nums" }}>{money(value)}</span>
    </div>
  );
}

function Section({ title, accent, note, children }: { title: string; accent: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: accent }}>{title}</div>
      {note && <div className="muted small" style={{ marginTop: 2, marginBottom: 8 }}>{note}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{children}</div>
    </div>
  );
}

function RowLine({ left, mid, right, rightColor }: { left: string; mid?: string; right: string; rightColor?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, fontSize: 13, padding: "3px 0" }}>
      <span style={{ fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{left}</span>
      {mid && <span className="muted small" style={{ flexShrink: 0 }}>{mid}</span>}
      <span style={{ flexShrink: 0, fontWeight: 700, color: rightColor, fontVariantNumeric: "tabular-nums" }}>{right}</span>
    </div>
  );
}
