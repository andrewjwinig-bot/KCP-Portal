"use client";

// The tenant CAM/RET statement view — shared by the standalone public page
// (/statement/[token]) and the (hidden, WIP) tenant portal shell's CAM tab.
// Given a token it fetches the statement itself; pass `data` to skip the fetch.

import { useEffect, useState } from "react";

export const BRAND = "#0b4a7d";
export const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
export const money2 = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

const Clip = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
);

// Compact, uniform backup control. A single file links directly; multiple files
// collapse to one "N invoices ▾" chip that expands the list on demand — so a
// line with 7 invoices no longer balloons its row and breaks the table's rhythm.
function BackupCell({ backup, fileUrl }: { backup: Backup[]; fileUrl: (id: string) => string }) {
  const [open, setOpen] = useState(false);
  if (backup.length === 0) return <span className="muted" style={{ fontSize: 12 }}>—</span>;
  const chip: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, border: "1px solid var(--border)", borderRadius: 6, padding: "3px 9px", fontSize: 12, fontWeight: 600, color: BRAND, textDecoration: "none", background: "rgba(11,74,125,0.05)", cursor: "pointer", fontFamily: "inherit" };
  if (backup.length === 1) {
    const b = backup[0];
    return <a href={fileUrl(b.id)} target="_blank" rel="noopener noreferrer" title={`${b.name} · ${fmtSize(b.size)}`} style={chip}><Clip /> Invoice</a>;
  }
  return (
    <div>
      <button onClick={() => setOpen((o) => !o)} style={chip} aria-expanded={open}>
        <Clip /> {backup.length} invoices <span style={{ fontSize: 9 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 5 }}>
          {backup.map((b) => (
            <a key={b.id} href={fileUrl(b.id)} target="_blank" rel="noopener noreferrer" title={`${b.name} · ${fmtSize(b.size)}`}
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: BRAND, textDecoration: "none", maxWidth: "100%" }}>
              <span style={{ flexShrink: 0, display: "inline-flex" }}><Clip /></span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.name}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/** Render the statement. `header` shows the branded letterhead + Download button
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

  // The property-total schedule, styled to mirror the statement PDF: a tinted
  // section bar carrying the title + column heads, a leading GL-account column,
  // zebra rows, and a navy-ruled total. No recovery math — just the totals + the
  // compact invoice control.
  const GRID = "84px 1fr 118px 168px"; // Acct | Expense | Amount | Invoices
  type SchedRow = { acct?: string; label: string; amount: number; backup: Backup[]; bold?: boolean };
  const cellPad = "8px 14px";
  const acctPad = "8px 8px 8px 14px"; // less right pad so the GL code clears the label
  const Schedule = ({ title, rows, totalLabel }: { title: string; rows: SchedRow[]; totalLabel?: string }) => (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
      {/* Section bar: title + column heads, like the PDF's tinted band */}
      <div style={{ display: "grid", gridTemplateColumns: GRID, alignItems: "baseline", gap: 0, background: "rgba(11,74,125,0.09)", borderBottom: "1px solid var(--border)", padding: "9px 14px" }}>
        <div style={{ gridColumn: "1 / 3", fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: BRAND }}>{title}</div>
        <div style={{ textAlign: "right", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--muted)" }}>Amount</div>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--muted)", paddingLeft: 4 }}>Invoices</div>
      </div>
      {rows.map((r, i) => (
        <div key={r.label + i} style={{ display: "grid", gridTemplateColumns: GRID, alignItems: "start", borderTop: i === 0 ? "none" : "1px solid var(--border)", background: i % 2 === 1 ? "rgba(15,23,42,0.02)" : undefined, fontSize: 14 }}>
          <div style={{ padding: acctPad, color: "var(--muted)", fontSize: 12, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{r.acct ?? ""}</div>
          <div style={{ padding: cellPad, fontWeight: r.bold ? 700 : 400 }}>{r.label}</div>
          <div style={{ padding: cellPad, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: r.bold ? 700 : 400 }}>{money(r.amount)}</div>
          <div style={{ padding: cellPad, paddingLeft: 4 }}><BackupCell backup={r.backup} fileUrl={fileUrl} /></div>
        </div>
      ))}
      {totalLabel && (
        <div style={{ display: "grid", gridTemplateColumns: GRID, alignItems: "baseline", borderTop: `2px solid ${BRAND}`, background: "rgba(11,74,125,0.06)", fontWeight: 800 }}>
          <div style={{ gridColumn: "1 / 3", padding: cellPad }}>{totalLabel}</div>
          <div style={{ padding: cellPad, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{money(rows.reduce((s, r) => s + r.amount, 0))}</div>
          <div />
        </div>
      )}
    </div>
  );

  // Header meta line — Base Year · Share · (Admin) · Occupancy — like the PDF's.
  const metaParts: string[] = [];
  if (data.basis === "base-year" && t.baseYear) metaParts.push(`Base Year ${t.baseYear}`);
  metaParts.push(`${t.camPrs.toFixed(2)}% Share`);
  if (data.basis === "pro-rata" && t.adminFeePct) metaParts.push(`${t.adminFeePct}% Admin Fee`);
  if (t.grossLease) metaParts.push("Gross Lease");
  const occDisplay = t.occPct > 0 ? (t.occPct <= 1 ? t.occPct * 100 : t.occPct) : 0;
  if (occDisplay > 0) metaParts.push(`${occDisplay.toFixed(1)}% Occupancy`);

  const DownloadBtn = () => (
    <a href={`/api/statement/${token}/pdf`} style={{ display: "inline-flex", alignItems: "center", gap: 7, background: BRAND, color: "#fff", textDecoration: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
      Download PDF
    </a>
  );

  // Net true-up callout, green (credit) / amber (due), mirroring the PDF box.
  const credit = totalBalance < -0.5, due = totalBalance > 0.5;
  const theme = credit ? "#15803d" : due ? "#b45309" : BRAND;
  const calloutBg = credit ? "rgba(21,128,61,0.08)" : due ? "rgba(180,83,9,0.08)" : "rgba(11,74,125,0.06)";

  return (
    <div>
      {header && (
        <>
          {/* Letterhead band — Korman wordmark + statement title, like the PDF */}
          <div style={{ background: BRAND, color: "#fff", borderRadius: 12, padding: "18px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ fontFamily: "'Arial Black', Arial, sans-serif", fontWeight: 900, fontSize: 26, letterSpacing: "-0.5px", lineHeight: 1 }}>KORMAN</div>
              <div style={{ width: 1, height: 34, background: "rgba(255,255,255,0.45)" }} />
              <div style={{ fontSize: 10, letterSpacing: "0.16em", lineHeight: 1.55 }}>COMMERCIAL<br />PROPERTIES</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>CAM / RET Reconciliation</div>
              <div style={{ fontSize: 12.5, opacity: 0.85, marginTop: 2 }}>{data.year} Year-End Statement</div>
            </div>
          </div>

          {/* Tenant block — name, property·suite, meta line, download */}
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", borderBottom: `2px solid ${BRAND}`, padding: "16px 2px 14px", marginTop: 4 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 22 }}>{t.name}</h1>
              <div className="muted" style={{ fontSize: 13.5, marginTop: 3 }}>{data.propertyName} · Suite {t.suite}</div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>{metaParts.join("   ·   ")}</div>
            </div>
            <DownloadBtn />
          </div>
        </>
      )}

      {!header && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <DownloadBtn />
        </div>
      )}

      <section style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: header ? 20 : 0 }}>
        <Card label="CAM" due={t.camDue} escrow={t.camEscrow} balance={t.camBalance} />
        {data.ins && <Card label="Insurance" due={t.insDue} escrow={t.insEscrow} balance={t.insBalance} />}
        <Card label="Real Estate Tax" due={t.retDue} escrow={t.retEscrow} balance={t.retBalance} />
      </section>
      <div style={{ marginTop: 14, border: `1.5px solid ${theme}`, background: calloutBg, borderRadius: 12, padding: "15px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 13.5, letterSpacing: "0.05em", textTransform: "uppercase", color: theme }}>{credit ? "Net credit to you" : due ? "Net balance due" : "Settled — nothing due"}</div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>CAM {money(t.camBalance)}{data.ins ? ` · INS ${money(t.insBalance)}` : ""} · RET {money(t.retBalance)}</div>
        </div>
        <span style={{ fontWeight: 900, fontSize: 26, color: theme }}>{money2(Math.abs(totalBalance))}</span>
      </div>

      <section style={{ marginTop: 26 }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 10 }}>Supporting Detail</div>
        <Schedule
          title="Schedule of Operating Expenses"
          rows={[
            ...data.lines.filter((l) => l.amount || l.backup.length).map((l) => ({ acct: l.account, label: l.label, amount: l.amount, backup: l.backup })),
            ...(data.ins ? [{ acct: undefined, label: data.ins.label, amount: data.ins.amount, backup: data.ins.backup, bold: true }] : []),
          ]}
          totalLabel="Total Operating Expenses"
        />
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Amounts shown are the property totals; your statement above bills your share. Invoices available on any line above, or upon request.</p>
      </section>

      {/* Real estate taxes — its own section, mirroring the PDF. */}
      <section style={{ marginTop: 22 }}>
        <Schedule title="Real Estate Taxes" rows={[{ acct: undefined, label: data.ret.label, amount: data.ret.amount, backup: data.ret.backup, bold: true }]} />
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
