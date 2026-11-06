"use client";

// What September 2026's invoices billed, split (`/api/allocation/september-check`):
// September's own charges, balances carried in from earlier months, and the
// part of that carry the 10/19 import created from 2025 months — billed twice.
// Read off the PDFs as sent. Read-only; collapsible.

import { useEffect, useState } from "react";
import { StatPill, Pill, TONE_AMBER } from "@/app/components/Pill";
import { th, thL, td, tdL } from "@/app/components/tableStyles";
import { HoverCard } from "@/app/components/HoverCard";

type Acct = { code: string; name: string; carried: number; from2025: number };
type Row = { code: string; name: string; billed: number; carried: number; from2025: number; september: number; accounts: Acct[] };
type Check = { rows: Row[]; billed: number; carried: number; from2025: number; september: number; invoices: number };
const money = (n: number | null | undefined) => n == null ? "—" : "$" + (Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function SeptemberCheckCard() {
  const [data, setData] = useState<Check | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  useEffect(() => {
    fetch("/api/allocation/september-check", { cache: "no-store" }).then((r) => r.json())
      .then((j) => { if (j?.rows) setData(j as Check); else if (j?.error) setErr(j.error); }).catch(() => {});
  }, []);
  if (err) return <div className="card small" style={{ color: "#b91c1c", fontWeight: 600 }}>September check: {err}</div>;
  if (!data) return null;
  return (
    <div className="card" style={{ padding: 0, borderColor: data.from2025 > 0 ? "rgba(217,119,6,0.45)" : undefined }}>
      <div style={{ padding: "14px 16px 4px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", cursor: "pointer" }} onClick={() => setOpen(!open)}>
        <span style={{ width: 12, color: "var(--muted)" }}>{open ? "▾" : "▸"}</span>
        <span style={{ fontSize: 16, fontWeight: 800 }}>September 2026 — What Was Billed</span>
        {data.from2025 > 0 && <Pill tone={TONE_AMBER}>{money(data.from2025)} FROM 2025</Pill>}
      </div>
      {open && (
        <>
          <div className="small" style={{ padding: "0 16px", color: "var(--muted)", lineHeight: 1.5 }}>
            Read off the {data.invoices} September invoices as sent. Each bills September&rsquo;s own charges plus any balance held under $100 that crossed it
            (&ldquo;carried forward&rdquo; on the PDF). The 10/19 import ran Oct–Nov 2025 just before September, so part of the carry came from months already billed in 2025 —
            that part was billed twice and is the amount to credit in AvidXchange.
          </div>
          <div className="pills" style={{ padding: "12px 16px 0" }}>
            <StatPill label="Billed" value={money(data.billed)} sub={`${data.invoices} invoices`} />
            <StatPill label="September charges" value={money(data.september)} />
            <StatPill label="Carried forward" value={money(data.carried)} sub="held from earlier months" />
            <StatPill label="Of which 2025" value={money(data.from2025)} sub="billed twice — credit" total />
          </div>
          <div style={{ padding: "12px 0 4px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={thL}>Property</th><th style={th}>Billed</th><th style={th}>September</th><th style={th}>Carried Forward</th><th style={th}>Of Which 2025</th></tr></thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.code}>
                    <td style={tdL}><code style={{ fontSize: 12, fontWeight: 700, color: "var(--brand)", marginRight: 6 }}>{r.code}</code>{r.name}</td>
                    <td style={td}>{money(r.billed)}</td>
                    <td style={td}>{money(r.september)}</td>
                    <td style={td}>
                      {r.accounts.length ? (
                        <HoverCard title={`${r.name} — carried forward`} rows={r.accounts.map((a) => ({ label: `${a.code} ${a.name}`, value: `${money(a.carried)}${a.from2025 ? ` (2025 ${money(a.from2025)})` : ""}` }))} footer={{ label: "Total carried", value: money(r.carried) }}>
                          <span>{money(r.carried)}</span>
                        </HoverCard>
                      ) : "—"}
                    </td>
                    <td style={{ ...td, fontWeight: r.from2025 ? 700 : 400, color: r.from2025 ? "#b45309" : "var(--muted)" }}>{r.from2025 ? money(r.from2025) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
