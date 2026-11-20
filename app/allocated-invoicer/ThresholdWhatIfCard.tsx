"use client";

// The hold threshold as a what-if (owner: "would $250 cut a big chunk of
// invoices? … there is a small fee to send each invoice to avid"). This year's
// imported 2000 G&A GL replayed from January at each threshold — the invoices
// each month would have sent. Read-only; the live hold is $250 (from 11/13/26).

import { useEffect, useState } from "react";
import { th, thL, td, tdL } from "@/app/components/tableStyles";
import { StatPill } from "@/app/components/Pill";

type WhatIf = {
  thresholds: number[];
  months: { month: string; invoices: number[]; billed: number[] }[];
  totals: { invoices: number[]; billed: number[]; heldAtEnd: number[] };
};

const money0 = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const monthName = (m: string) => new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1).toLocaleDateString("en-US", { month: "short" });

export function ThresholdWhatIfCard() {
  const [data, setData] = useState<WhatIf | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || data || error) return;
    fetch("/api/allocation/invoices/threshold?t=100,250,500")
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j?.error || `Failed (${r.status})`); setData(j); })
      .catch((e) => setError(e.message));
  }, [open, data, error]);

  const base = data?.totals.invoices[0] ?? 0;
  return (
    <div className="card" style={{ padding: 0 }}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "baseline", gap: 10, padding: "12px 14px", width: "calc(100% - 28px)" }}>
        <span style={{ fontSize: 16, fontWeight: 800 }}>Hold Threshold · What If</span>
        <span className="muted small">How many invoices this year at a $100, $250 or $500 hold. The live hold is $250.</span>
      </button>
      {open && (
        <div style={{ padding: "0 14px 14px" }}>
          {error && <div className="muted small">{error}</div>}
          {!data && !error && <div className="muted small">Replaying this year's 2000 G&A GL…</div>}
          {data && (
            <>
              <div className="pills" style={{ marginBottom: 12 }}>
                {data.thresholds.map((t, j) => (
                  <StatPill key={t} value={String(data.totals.invoices[j])}
                    label={`Invoices at $${t}${j ? ` · ${base - data.totals.invoices[j]} fewer` : ""}`} />
                ))}
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={thL}>Month</th>
                      {data.thresholds.map((t) => <th key={t} style={th}>${t} hold</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {data.months.map((m) => (
                      <tr key={m.month}>
                        <td style={tdL}>{monthName(m.month)} {m.month.slice(0, 4)}</td>
                        {m.invoices.map((n, j) => <td key={j} style={td}>{n}</td>)}
                      </tr>
                    ))}
                    <tr style={{ fontWeight: 800 }}>
                      <td style={{ ...tdL, borderTop: "2px solid var(--border)" }}>Invoices</td>
                      {data.totals.invoices.map((n, j) => <td key={j} style={{ ...td, borderTop: "2px solid var(--border)" }}>{n}</td>)}
                    </tr>
                    <tr>
                      <td style={tdL}>Held at the last month</td>
                      {data.totals.heldAtEnd.map((n, j) => <td key={j} style={td}>{money0(n)}</td>)}
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="muted small" style={{ marginTop: 8 }}>
                Replayed from January on the imported GL at each threshold, per account, with December billing everything — the same rule the send uses. Late-charge true-ups and the shared office line are left out, so actual counts run slightly higher.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
