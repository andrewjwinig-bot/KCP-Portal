"use client";

// THE CASH POSITION AT A GLANCE — Alison's dashboard (owner, 11/2026: "can
// alisons dashboard get like a bank balances summary as well? she likes to
// look at that"). The Bank Balances page's own tiles and its groups, read
// through the SAME `balanceSummary`, so the card and the page always agree.
// The card opens the page; nothing is edited here.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { StatPill } from "@/app/components/Pill";
import { th, thL, td, tdL } from "@/app/components/tableStyles";
import { balanceSummary, type SummaryView } from "@/lib/financials/bank-balances/summary";

const money0 = (n: number | null | undefined) => {
  if (n == null) return "—";
  const r = Math.round(n);
  if (r === 0) return "—";
  const s = Math.abs(r).toLocaleString("en-US");
  return r < 0 ? `(${s})` : s;
};
const dollars = (n: number) => (n < 0 ? `($${Math.abs(Math.round(n)).toLocaleString("en-US")})` : `$${Math.round(n).toLocaleString("en-US")}`);
const shortDate = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—");

function Change({ n }: { n: number | null }) {
  if (n == null || Math.round(n) === 0) return <span className="muted">—</span>;
  return <span style={{ color: n > 0 ? "var(--c-067647)" : "var(--c-b42318)", fontWeight: 600 }}>{n > 0 ? "Up " : "Down "}{money0(Math.abs(n))}</span>;
}

export default function BankBalancesCard({ order = -2 }: { order?: number }) {
  const [view, setView] = useState<SummaryView | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch("/api/financials/bank-balances", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (j?.rows ? setView(j) : setFailed(true)))
      .catch(() => setFailed(true));
  }, []);
  if (failed || !view || !(view.byBank ?? []).length) return null;
  const s = balanceSummary(view);

  return (
    <section className="card" style={{ gridColumn: "1 / -1", order, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span>
          <span style={{ fontSize: 17, fontWeight: 700 }}>Bank Balances</span>
          <span className="muted" style={{ fontSize: "var(--fs-14)", marginLeft: 10 }}>As of {shortDate(s.asOf)}</span>
        </span>
        <Link className="text-link" href="/financials/cash-analysis">Bank Balances<ChevronRight size={16} strokeWidth={1.75} aria-hidden /></Link>
      </div>
      <div className="pills">
        <StatPill label="Cash in bank" value={dollars(s.totalCash)}
          sub={s.wow.change != null ? `${s.wow.change >= 0 ? "Up" : "Down"} ${dollars(Math.abs(s.wow.change))} since ${shortDate(s.wow.priorAsOf)}` : undefined} />
        <StatPill label="Reserves" value={dollars(s.reserves)} sub={s.tenantCredits > 0 ? `Incl. ${dollars(s.tenantCredits)} tenant credits` : "Big Projects, next 3 months"} />
        <StatPill label="Security deposits" value={dollars(s.deposits)} sub="Tenants' money" />
        <StatPill label="Net available" value={dollars(s.net)} total />
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
          <thead><tr><th style={thL}>Group</th><th style={th}>Cash in bank</th><th style={th}>Net available</th><th style={th}>vs last week</th></tr></thead>
          <tbody>
            {s.groups.map((g) => (
              <tr key={g.group} style={{ borderBottom: "1px solid var(--hairline)" }}>
                <td style={{ ...tdL, fontWeight: 600 }}>{g.group}</td>
                <td style={td}>{money0(g.cash)}</td>
                <td style={td}>{g.restricted ? <span className="muted">Held</span> : money0(g.net)}</td>
                <td style={td}><Change n={g.change} /></td>
              </tr>
            ))}
            <tr style={{ borderTop: "2px solid var(--border)" }}>
              <td style={{ ...tdL, fontWeight: 700 }}>Total</td>
              <td style={{ ...td, fontWeight: 700 }}>{dollars(s.totalCash)}</td>
              <td style={{ ...td, fontWeight: 700 }}>{dollars(s.net)}</td>
              <td style={{ ...td, fontWeight: 700 }}><Change n={s.wow.change} /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
