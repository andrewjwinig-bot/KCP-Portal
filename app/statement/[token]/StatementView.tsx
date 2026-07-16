"use client";

// The tenant CAM/RET statement view — shared by the standalone public page
// (/statement/[token]) and the (hidden, WIP) tenant portal shell's CAM tab.
// Given a token it fetches the statement itself; pass `data` to skip the fetch.

import { useEffect, useState } from "react";

export const BRAND = "#0b4a7d";
export const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
export const money2 = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number) => `${n.toFixed(2)}%`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtSize = (n: number) => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);

export type Backup = { id: string; name: string; size: number; contentType: string };
export type Line = { account: string; label: string; amount: number; backup: Backup[] };
export type Statement = {
  ok: true; property: string; propertyName: string; year: number;
  basis: "pro-rata" | "base-year"; notes: string[];
  tenant: {
    unitRef: string; suite: string; name: string; camPrs: number; insPrs: number; retPrs: number; adminFeePct: number;
    grossLease: boolean; occPct: number; baseYear: number | null;
    camDue: number; camEscrow: number; camBalance: number;
    insDue: number; insEscrow: number; insBalance: number;
    retDue: number; retEscrow: number; retBalance: number;
  };
  lines: Line[]; ins: { label: string; amount: number; backup: Backup[] } | null; ret: { label: string; amount: number; backup: Backup[] };
  escrowMonthly: { month: number; cam: number; ret: number }[];
};

export function Centered({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 24 }}>{children}</div>;
}

/** Fetch a statement by token. Returns { data, error }. */
export function useStatement(token: string): { data: Statement | null; error: string | null } {
  const [data, setData] = useState<Statement | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/statement/${token}`)
      .then(async (r) => ({ ok: r.ok, j: await r.json().catch(() => ({})) }))
      .then(({ ok, j }) => { if (!alive) return; if (ok && j.ok) setData(j); else setError(j.error ?? "This statement could not be loaded."); })
      .catch(() => { if (alive) setError("This statement could not be loaded."); });
    return () => { alive = false; };
  }, [token]);
  return { data, error };
}

/** Render the statement. `header` shows the branded header + Download button
 *  (the standalone page); the portal shell hides it (it has its own chrome). */
export function TenantStatementView({ token, data, header = true }: { token: string; data: Statement; header?: boolean }) {
  const [escrowOpen, setEscrowOpen] = useState(false);
  const t = data.tenant;
  const totalBalance = t.camBalance + t.insBalance + t.retBalance;
  const camEscrowTotal = data.escrowMonthly.reduce((a, m) => a + m.cam, 0);
  const retEscrowTotal = data.escrowMonthly.reduce((a, m) => a + m.ret, 0);
  const fileUrl = (id: string) => `/api/statement/${token}/file?id=${id}`;

  const Card = ({ label, due, escrow, balance }: { label: string; due: number; escrow: number; balance: number }) => (
    <div style={{ flex: 1, minWidth: 180, border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", background: "var(--card)" }}>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: BRAND }}>{label}</div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 13 }}><span className="muted">Your share</span><span style={{ fontWeight: 600 }}>{money(due)}</span></div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span className="muted">Paid (escrow)</span><span>{money(-escrow)}</span></div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--border)", fontWeight: 800 }}>
        <span>{balance >= 0 ? "Balance due" : "Credit"}</span>
        <span style={{ color: balance > 0.5 ? "#b45309" : balance < -0.5 ? "#15803d" : "var(--text)" }}>{money2(Math.abs(balance))}</span>
      </div>
    </div>
  );

  const BackupChips = ({ backup }: { backup: Backup[] }) => (
    backup.length === 0 ? <span className="muted" style={{ fontSize: 12 }}>—</span> : (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {backup.map((b) => (
          <a key={b.id} href={fileUrl(b.id)} target="_blank" rel="noopener noreferrer" title={`${b.name} · ${fmtSize(b.size)}`}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid var(--border)`, borderRadius: 6, padding: "3px 8px", fontSize: 12, fontWeight: 600, color: BRAND, textDecoration: "none", background: "rgba(11,74,125,0.05)" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
            {b.name.length > 26 ? b.name.slice(0, 24) + "…" : b.name}
          </a>
        ))}
      </div>
    )
  );

  // A section that mirrors the internal statement's schedule: a header bar, the
  // per-line expenses, and (for operating expenses) a total row. Kept tenant-
  // friendly — the property total + its backup, without the recovery math.
  const th: React.CSSProperties = { padding: "7px 14px", fontSize: 11, letterSpacing: "0.04em", color: "var(--muted)", fontWeight: 700 };
  const ExpenseTable = ({ title, rows, totalLabel }: { title: string; rows: { label: string; amount: number; backup: Backup[]; bold?: boolean }[]; totalLabel?: string }) => (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ background: "rgba(11,74,125,0.07)", padding: "10px 14px", fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: BRAND, borderBottom: "1px solid var(--border)" }}>{title}</div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: "left" }}>
            <th style={th}>Expense</th>
            <th style={{ ...th, textAlign: "right", width: 120 }}>Total</th>
            <th style={th}>Backup</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.label + i} style={{ borderTop: "1px solid var(--border)" }}>
              <td style={{ padding: "9px 14px", fontWeight: r.bold ? 700 : 400 }}>{r.label}</td>
              <td style={{ padding: "9px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: r.bold ? 700 : 400 }}>{money(r.amount)}</td>
              <td style={{ padding: "9px 14px" }}><BackupChips backup={r.backup} /></td>
            </tr>
          ))}
        </tbody>
        {totalLabel && (
          <tfoot>
            <tr style={{ fontWeight: 800, borderTop: "2px solid var(--border)", background: "rgba(15,23,42,0.02)" }}>
              <td style={{ padding: "9px 14px" }}>{totalLabel}</td>
              <td style={{ padding: "9px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{money(rows.reduce((s, r) => s + r.amount, 0))}</td>
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );

  return (
    <div>
      {header && (
        <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", borderBottom: `2px solid ${BRAND}`, paddingBottom: 16 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)" }}>CAM / RET Statement · {data.year}</div>
            <h1 style={{ margin: "4px 0 0", fontSize: 24 }}>{t.name}</h1>
            <div className="muted" style={{ fontSize: 14, marginTop: 2 }}>{data.propertyName} · Suite {t.suite}</div>
          </div>
          <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
            <div>
              <div style={{ fontFamily: "'Arial Black', Arial, sans-serif", fontWeight: 900, fontSize: 22, letterSpacing: "-0.5px" }}>KORMAN</div>
              <div style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--muted)" }}>COMMERCIAL PROPERTIES</div>
            </div>
            <a href={`/api/statement/${token}/pdf`} style={{ display: "inline-flex", alignItems: "center", gap: 7, background: BRAND, color: "#fff", textDecoration: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
              Download statement
            </a>
          </div>
        </header>
      )}

      {!header && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <a href={`/api/statement/${token}/pdf`} style={{ display: "inline-flex", alignItems: "center", gap: 7, background: BRAND, color: "#fff", textDecoration: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            Download statement
          </a>
        </div>
      )}

      <section style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: header ? 20 : 0 }}>
        <Card label="CAM" due={t.camDue} escrow={t.camEscrow} balance={t.camBalance} />
        {data.ins && <Card label="Insurance" due={t.insDue} escrow={t.insEscrow} balance={t.insBalance} />}
        <Card label="Real Estate Tax" due={t.retDue} escrow={t.retEscrow} balance={t.retBalance} />
      </section>
      <div style={{ marginTop: 14, padding: "14px 18px", borderRadius: 12, background: BRAND, color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>{totalBalance >= 0 ? "Total balance due" : "Total credit"}</span>
        <span style={{ fontWeight: 800, fontSize: 22 }}>{money2(Math.abs(totalBalance))}</span>
      </div>

      <section style={{ marginTop: 26 }}>
        <p className="muted" style={{ fontSize: 13, margin: "0 0 10px" }}>
          Your CAM share is <b>{pct(t.camPrs)}</b>
          {data.basis === "pro-rata"
            ? (t.adminFeePct ? <> plus a {t.adminFeePct}% administrative fee</> : null)
            : (t.baseYear ? <>, recovered on the increase over your <b>{t.baseYear}</b> base year</> : null)}
          . Click any backup to view or download the supporting invoices.
        </p>
        <ExpenseTable
          title="Schedule of Operating Expenses"
          rows={[
            ...data.lines.filter((l) => l.amount || l.backup.length).map((l) => ({ label: l.label, amount: l.amount, backup: l.backup })),
            ...(data.ins ? [{ label: data.ins.label, amount: data.ins.amount, backup: data.ins.backup, bold: true }] : []),
          ]}
          totalLabel="Total Operating Expenses"
        />
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Amounts shown are the property totals; your statement above bills your pro-rata share.</p>
      </section>

      {/* Real estate taxes — its own section, mirroring the internal statement. */}
      <section style={{ marginTop: 22 }}>
        <ExpenseTable title="Real Estate Taxes" rows={[{ label: data.ret.label, amount: data.ret.amount, backup: data.ret.backup, bold: true }]} />
      </section>

      {data.escrowMonthly.length > 0 && (
        <section style={{ marginTop: 22 }}>
          <button onClick={() => setEscrowOpen((o) => !o)} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
            <h2 style={{ fontSize: 16, margin: 0 }}>Your Escrow Payments</h2>
            <span className="muted" style={{ fontSize: 13 }}>{money(camEscrowTotal + retEscrowTotal)} across {data.escrowMonthly.length} months</span>
            <span style={{ color: "var(--muted)" }}>{escrowOpen ? "▲" : "▼"}</span>
          </button>
          {escrowOpen && (
            <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", marginTop: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead><tr style={{ background: "rgba(11,74,125,0.05)", textAlign: "left" }}>
                  <th style={{ padding: "8px 14px", fontSize: 11, color: "var(--muted)" }}>MONTH</th>
                  <th style={{ padding: "8px 14px", fontSize: 11, color: "var(--muted)", textAlign: "right" }}>CAM</th>
                  <th style={{ padding: "8px 14px", fontSize: 11, color: "var(--muted)", textAlign: "right" }}>RET</th>
                </tr></thead>
                <tbody>
                  {data.escrowMonthly.map((m) => (
                    <tr key={m.month} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "8px 14px" }}>{MONTHS[m.month - 1]} {data.year}</td>
                      <td style={{ padding: "8px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{money(m.cam)}</td>
                      <td style={{ padding: "8px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{money(m.ret)}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 800 }}>
                    <td style={{ padding: "8px 14px" }}>Total paid</td>
                    <td style={{ padding: "8px 14px", textAlign: "right" }}>{money(camEscrowTotal)}</td>
                    <td style={{ padding: "8px 14px", textAlign: "right" }}>{money(retEscrowTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {data.notes.length > 0 && (
        <section style={{ marginTop: 22 }}>
          {data.notes.map((n, i) => <p key={i} className="muted" style={{ fontSize: 12.5, margin: "4px 0" }}>* {n}</p>)}
        </section>
      )}
    </div>
  );
}
