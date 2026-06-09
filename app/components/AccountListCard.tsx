"use client";

// Collapsible list of GL accounts that fall outside the statement/reprojection
// lines — shared by Operating Statements ("Non-operating accounts") and
// Reprojections ("Unbudgeted Actuals") so the two read identically: a
// click-to-expand header (collapsed by default) over an Account / Name / Amount
// table with a total.

import { useState } from "react";

export type AccountListRow = { account: string; name?: string | null; amount: number };

export function AccountListCard({
  title,
  description,
  accent,
  rows,
  format,
  defaultOpen = false,
}: {
  title: string;
  description: string;
  accent: string;
  rows: AccountListRow[];
  format: (n: number) => string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const numCell: React.CSSProperties = { textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };

  return (
    <div className="card" style={{ borderColor: `${accent}66`, background: `${accent}0d`, padding: 0, overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
          width: "100%", padding: "12px 14px", background: "transparent", border: "none",
          cursor: "pointer", textAlign: "left", fontFamily: "inherit",
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: accent }}>
          {title} ({rows.length})
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: accent, fontVariantNumeric: "tabular-nums" }}>{format(total)}</span>
          <span style={{ color: accent, fontSize: 14 }}>{open ? "▲" : "▼"}</span>
        </span>
      </button>

      {open && (
        <div style={{ padding: "0 14px 12px" }}>
          <div className="muted small" style={{ marginBottom: 8 }}>{description}</div>
          <table style={{ width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", whiteSpace: "nowrap" }}>Account</th>
                <th style={{ textAlign: "left", width: "100%" }}>Name</th>
                <th style={numCell}>YTD Actual</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.account}>
                  <td style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}><code style={{ fontSize: 12 }}>{r.account}</code></td>
                  <td>{r.name || <span className="muted">—</span>}</td>
                  <td style={numCell}>{format(r.amount)}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 800 }}>
                <td>Total</td>
                <td />
                <td style={{ ...numCell, fontWeight: 900 }}>{format(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
