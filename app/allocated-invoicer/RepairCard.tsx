"use client";

// The 10/19/26 repair, as a review-then-apply card at the top of the
// invoicer (`/api/allocation/repair`). It shows what it will do before it
// does it — September kept, the 2025 invoices voided in the record, and the
// balances held through August put back on hold — and disappears once applied.

import { useEffect, useState } from "react";
import { StatPill, Pill, TONE_AMBER } from "@/app/components/Pill";
import { th, thL, td, tdL } from "@/app/components/tableStyles";
import { HoverCard } from "@/app/components/HoverCard";

type Plan = {
  applied: false; period: string; sentAt: string | null;
  invoicesKept: number; invoicesVoided: number; keptTotal: number | null;
  restore: { code: string; name: string; amount: number; accounts: { code: string; name: string; amount: number }[] }[];
  restoreTotal: number; heldNow: number; runsToRemove: number;
};
const money = (n: number | null | undefined) => n == null ? "—" : "$" + (Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function RepairCard({ onApplied }: { onApplied?: () => void }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/allocation/repair", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j && j.applied === false && !j.none) setPlan(j as Plan); }).catch(() => {});
  }, []);

  async function apply() {
    setBusy(true);
    try {
      const r = await fetch("/api/allocation/repair", { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg({ ok: false, text: j.error || `Repair failed (${r.status}).` }); return; }
      setMsg({ ok: true, text: `Repaired — ${money(j.restoreTotal)} back on hold. The ledger was backed up first.` });
      setPlan(null);
      onApplied?.();
    } finally { setBusy(false); setConfirming(false); }
  }

  if (msg?.ok) return <div className="card small" style={{ color: "#15803d", fontWeight: 700 }}>{msg.text}</div>;
  if (!plan) return null;
  return (
    <div className="card" style={{ padding: 0, borderColor: "rgba(217,119,6,0.45)" }}>
      <div style={{ padding: "14px 16px 4px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <Pill tone={TONE_AMBER}>REPAIR</Pill>
        <span style={{ fontSize: 16, fontWeight: 800 }}>The October 19 send</span>
      </div>
      <div className="small" style={{ padding: "0 16px", color: "var(--muted)", lineHeight: 1.5 }}>
        The trailing-twelve GL billed Oct–Dec 2025 again, and December&rsquo;s year-end rule swept every balance held through August into those invoices.
        You deleted the 2025 invoices in AvidXchange and kept September&rsquo;s. This puts the swept balances back on hold and makes the record show September only.
        Oct–Dec 2025 stay closed. Nothing is emailed.
      </div>
      <div className="pills" style={{ padding: "12px 16px 0" }}>
        <StatPill label="September kept" value={money(plan.keptTotal)} sub={`${plan.invoicesKept} invoices`} />
        <StatPill label="Voided in the record" value={String(plan.invoicesVoided)} sub="2025 invoices deleted in Avid" />
        <StatPill label="Back on hold" value={money(plan.restoreTotal)} sub={`held through Aug · ${money(plan.heldNow)} held now`} total />
      </div>
      <div style={{ padding: "12px 0 4px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={thL}>Property</th><th style={th}>Accounts</th><th style={th}>Back on hold</th></tr></thead>
          <tbody>
            {plan.restore.map((r) => (
              <tr key={r.code}>
                <td style={tdL}><code style={{ fontSize: 12, fontWeight: 700, color: "var(--brand)", marginRight: 6 }}>{r.code}</code>{r.name}</td>
                <td style={td}>{r.accounts.length}</td>
                <td style={td}>
                  <HoverCard title={`${r.name} — held through August`} rows={r.accounts.map((a) => ({ label: `${a.code} ${a.name}`, value: money(a.amount) }))} footer={{ label: "Total", value: money(r.amount) }}>
                    <span>{money(r.amount)}</span>
                  </HoverCard>
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
            <button type="button" className="btn sm primary" disabled={busy} onClick={apply}>{busy ? "Repairing…" : "Apply repair"}</button>
          </>
        ) : (
          <button type="button" className="btn sm primary" onClick={() => setConfirming(true)}>Repair…</button>
        )}
      </div>
    </div>
  );
}
