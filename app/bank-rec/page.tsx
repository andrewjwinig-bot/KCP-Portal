"use client";

import { useMemo } from "react";
import { BANK_ACCOUNTS, PROPERTY_DEFS } from "../../lib/properties/data";

type Row = { bank: string; propertyCode: string; propertyName: string; label: string; last4: string };

function propertyName(code: string): string {
  return PROPERTY_DEFS.find((p) => p.id === code)?.name ?? code;
}

export default function BankRecTrackerPage() {
  // Flatten BANK_ACCOUNTS to one row per (property × account)
  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const [code, accounts] of Object.entries(BANK_ACCOUNTS)) {
      for (const a of accounts) {
        out.push({
          bank: a.bank,
          propertyCode: code,
          propertyName: propertyName(code),
          label: a.label,
          last4: a.last4,
        });
      }
    }
    return out;
  }, []);

  // Group by bank, sort banks alphabetically; within a bank, sort by property name
  const grouped = useMemo(() => {
    const byBank = new Map<string, Row[]>();
    for (const r of rows) {
      if (!byBank.has(r.bank)) byBank.set(r.bank, []);
      byBank.get(r.bank)!.push(r);
    }
    const sortedBanks = [...byBank.keys()].sort((a, b) => a.localeCompare(b));
    return sortedBanks.map((bank) => ({
      bank,
      rows: byBank.get(bank)!.sort((a, b) =>
        a.propertyName.localeCompare(b.propertyName) || a.last4.localeCompare(b.last4),
      ),
    }));
  }, [rows]);

  const totalAccounts = rows.length;

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
          <span className="muted small">{totalAccounts} account{totalAccounts === 1 ? "" : "s"} across {grouped.length} institution{grouped.length === 1 ? "" : "s"}</span>
        </div>
        <p className="muted small" style={{ marginTop: 4 }}>
          Bank accounts linked to each property, grouped by banking institution.
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
                    <th style={{ padding: "8px 14px", fontWeight: 700, width: "80%" }}>PROPERTY</th>
                    <th style={{ padding: "8px 14px", fontWeight: 700, width: "20%", textAlign: "right" }}>LAST 4</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={`${r.propertyCode}-${r.last4}-${i}`} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ fontWeight: 600 }}>{r.propertyName}</span>
                        <span className="muted small" style={{ marginLeft: 8 }}>· {r.propertyCode}</span>
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "right", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                        {r.last4}
                      </td>
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
