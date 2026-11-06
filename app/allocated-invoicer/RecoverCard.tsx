"use client";

// Recover the held balances after the 10/19 repair doubled them
// (`/api/allocation/recover-held`). Shows each property's open balance now
// beside what the recovery leaves — the pre-repair backup without the 2025
// entries the 10/19 import re-created — and bills all of it with the next
// month's invoices. Disappears once applied.

import { useEffect, useState } from "react";
import { StatPill, Pill, TONE_AMBER } from "@/app/components/Pill";
import { th, thL, td, tdL } from "@/app/components/tableStyles";
import { HoverCard } from "@/app/components/HoverCard";

type Row = { code: string; name: string; now: number; recovered: number; dropped2025: number; accounts: { code: string; name: string; recovered: number }[] };
type Plan = { applied: false; rows: Row[]; now: number; recovered: number; dropped2025: number };
const money = (n: number | null | undefined) => n == null ? "—" : "$" + (Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function RecoverCard({ onApplied }: { onApplied?: () => void }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/allocation/recover-held", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j && j.applied === false && !j.none) setPlan(j as Plan); }).catch(() => {});
  }, []);

  async function apply() {
    setBusy(true);
    try {
      const r = await fetch("/api/allocation/recover-held", { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg({ ok: false, text: j.error || `Recovery failed (${r.status}).` }); return; }
      setMsg({ ok: true, text: `Recovered — ${money(j.recovered)} held, billed in full with next month's invoices. The ledger was backed up first.` });
      setPlan(null);
      onApplied?.();
    } finally { setBusy(false); setConfirming(false); }
  }

  if (msg?.ok) return <div className="card small" style={{ color: "#15803d", fontWeight: 700 }}>{msg.text}</div>;
  if (!plan) return null;
  return (
    <div className="card" style={{ padding: 0, borderColor: "rgba(217,119,6,0.45)" }}>
      <div style={{ padding: "14px 16px 4px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <Pill tone={TONE_AMBER}>FIX</Pill>
        <span style={{ fontSize: 16, fontWeight: 800 }}>Recover the Held Balances</span>
      </div>
      <div className="small" style={{ padding: "0 16px", color: "var(--muted)", lineHeight: 1.5 }}>
        The October 19 repair added back balances the ledger still had, so they are counted twice.
        This puts every account back to what was held just before the repair, drops the October–November 2025 entries the 10/19 import re-created (those months were billed in 2025),
        and bills everything still held with next month&rsquo;s invoices. Months already billed are not touched. Nothing is emailed now.
      </div>
      <div className="pills" style={{ padding: "12px 16px 0" }}>
        <StatPill label="Held now" value={money(plan.now)} sub="doubled" />
        <StatPill label="2025 entries dropped" value={money(plan.dropped2025)} sub="billed in 2025" />
        <StatPill label="Recovered" value={money(plan.recovered)} sub="bills with next month" total />
      </div>
      <div style={{ padding: "12px 0 4px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={thL}>Property</th><th style={th}>Held Now</th><th style={th}>2025 Dropped</th><th style={th}>Recovered</th></tr></thead>
          <tbody>
            {plan.rows.map((r) => (
              <tr key={r.code}>
                <td style={tdL}><code style={{ fontSize: 12, fontWeight: 700, color: "var(--brand)", marginRight: 6 }}>{r.code}</code>{r.name}</td>
                <td style={{ ...td, color: "var(--muted)" }}>{money(r.now)}</td>
                <td style={{ ...td, color: "var(--muted)" }}>{r.dropped2025 ? money(r.dropped2025) : "—"}</td>
                <td style={{ ...td, fontWeight: 700 }}>
                  {r.accounts.length ? (
                    <HoverCard title={`${r.name} — recovered`} rows={r.accounts.map((a) => ({ label: `${a.code} ${a.name}`, value: money(a.recovered) }))} footer={{ label: "Bills with next month", value: money(r.recovered) }}>
                      <span>{money(r.recovered)}</span>
                    </HoverCard>
                  ) : money(r.recovered)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ padding: "10px 16px 14px", display: "flex", justifyContent: "flex-end", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {msg && !msg.ok && <span className="small" style={{ color: "#b91c1c", fontWeight: 700, marginRight: "auto" }}>{msg.text}</span>}
        {confirming ? (
          <>
            <span className="small" style={{ fontWeight: 600 }}>Rewrite the carryover ledger (backed up first)?</span>
            <button type="button" className="btn sm" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
            <button type="button" className="btn sm primary" disabled={busy} onClick={apply}>{busy ? "Recovering…" : "Apply recovery"}</button>
          </>
        ) : (
          <button type="button" className="btn sm primary" onClick={() => setConfirming(true)}>Recover…</button>
        )}
      </div>
    </div>
  );
}
