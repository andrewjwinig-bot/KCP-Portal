"use client";

import { useMemo } from "react";
import { UNIQUE_BANK_ACCOUNTS, type BankGroup } from "../../lib/bank-rec/accounts";

// Group banks in spreadsheet order, not alphabetical.
const BANK_ORDER: BankGroup[] = ["M&T", "JPM-Chase", "Liberty Bank"];

export default function BankRecTrackerPage() {
  const grouped = useMemo(() => {
    const byBank = new Map<BankGroup, typeof UNIQUE_BANK_ACCOUNTS>();
    for (const a of UNIQUE_BANK_ACCOUNTS) {
      if (!byBank.has(a.bank)) byBank.set(a.bank, []);
      byBank.get(a.bank)!.push(a);
    }
    return BANK_ORDER
      .filter((b) => byBank.has(b))
      .map((b) => ({ bank: b, rows: byBank.get(b)! }));
  }, []);

  const totalAccounts = UNIQUE_BANK_ACCOUNTS.length;

  return (
    <main style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <h1 style={{ margin: 0 }}>Bank Rec Tracker</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <span style={{ fontFamily: "'Arial Black', 'Arial Bold', Arial, sans-serif", fontWeight: 900, fontSize: 30, letterSpacing: "-0.5px", lineHeight: 1 }}>KORMAN</span>
          <div style={{ width: 1, height: 36, background: "#000", flexShrink: 0 }} />
          <div style={{ fontSize: 11, letterSpacing: "0.22em", lineHeight: 1.7, fontFamily: "Arial, Helvetica, sans-serif" }}>
            <div>COMMERCIAL</div><div>PROPERTIES</div>
          </div>
        </div>
      </header>

      <div className="card">
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <b style={{ fontSize: 17 }}>Linked Bank Accounts</b>
          <span className="muted small">
            {totalAccounts} unique account{totalAccounts === 1 ? "" : "s"} across {grouped.length} institution{grouped.length === 1 ? "" : "s"}
          </span>
        </div>
        <p className="muted small" style={{ marginTop: 4 }}>
          One row per account, grouped by banking institution.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 16 }}>
          {grouped.map(({ bank, rows }) => (
            <div key={bank} style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 14px",
                background: "rgba(11,74,125,0.05)",
                borderBottom: "1px solid var(--border)",
              }}>
                <span style={{ fontWeight: 800, fontSize: 14, letterSpacing: "0.02em" }}>{bank}</span>
                <span className="muted small">{rows.length} account{rows.length === 1 ? "" : "s"}</span>
              </div>

              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 11, letterSpacing: "0.04em" }}>
                    <th style={{ padding: "8px 14px", fontWeight: 700, width: "30%" }}>BANK ACCOUNT KEY</th>
                    <th style={{ padding: "8px 14px", fontWeight: 700, width: "15%" }}>ACCOUNT</th>
                    <th style={{ padding: "8px 14px", fontWeight: 700, width: "55%" }}>ACCOUNT NAME</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.last4 + r.key} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "10px 14px", fontWeight: 600 }}>{r.key}</td>
                      <td style={{ padding: "10px 14px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{r.last4}</td>
                      <td style={{ padding: "10px 14px" }}>{r.accountName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
