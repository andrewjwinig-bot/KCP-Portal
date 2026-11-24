"use client";
import { ChevronDown, ChevronUp } from "lucide-react";

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
  amountLabel = "YTD Actual",
  action,
  actionLabel = "",
}: {
  title: string;
  description: string;
  accent: string;
  rows: AccountListRow[];
  format: (n: number) => string;
  defaultOpen?: boolean;
  amountLabel?: string;
  /** Optional control rendered in a trailing column — the balance sheet uses
   *  it to reassign an account it could not place. Read-only callers omit it
   *  and the column does not appear. */
  action?: (row: AccountListRow) => React.ReactNode;
  actionLabel?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const numCell: React.CSSProperties = { textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };

  return (
    <div className="card" style={{ borderColor: `color-mix(in srgb, ${accent} 40%, transparent)`, background: `color-mix(in srgb, ${accent} 5%, transparent)`, padding: 0, overflow: "hidden" }}>
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
        <span style={{ fontSize: "var(--fs-12)", fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: accent }}>
          {title} ({rows.length})
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: "var(--fs-12)", fontWeight: 700, color: accent, fontVariantNumeric: "tabular-nums" }}>{format(total)}</span>
          <span style={{ color: accent, fontSize: "var(--fs-14)" }}>{open ? <ChevronUp size={16} strokeWidth={1.75} aria-hidden style={{ verticalAlign: "-3px", flexShrink: 0 }} /> : <ChevronDown size={16} strokeWidth={1.75} aria-hidden style={{ verticalAlign: "-3px", flexShrink: 0 }} />}</span>
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
                <th style={numCell}>{amountLabel}</th>
                {action && <th style={{ textAlign: "right", whiteSpace: "nowrap" }}>{actionLabel}</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.account}-${i}`}>
                  <td style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}><code style={{ fontSize: "var(--fs-12)" }}>{r.account}</code></td>
                  <td>{r.name || <span className="muted">—</span>}</td>
                  <td style={numCell}>{format(r.amount)}</td>
                  {action && <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{action(r)}</td>}
                </tr>
              ))}
              <tr style={{ fontWeight: 800 }}>
                <td>Total</td>
                <td />
                <td style={{ ...numCell, fontWeight: 900 }}>{format(total)}</td>
                {action && <td />}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
