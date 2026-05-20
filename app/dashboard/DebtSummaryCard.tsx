"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  MANAGED_LOANS,
  summarizeLoan,
  todayISO,
  type Loan,
  type LoanGroup,
} from "@/lib/debt/amortization";
import { StatPill, Pill, debtStatusTone } from "@/app/components/Pill";

function money(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}
function pct(n: number): string {
  return n.toFixed(2) + "%";
}
function monthYearShort(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso || "—";
  return `${m[2]}/${m[1].slice(2)}`;
}

const GROUP_ORDER: LoanGroup[] = ["Business Parks", "Shopping Centers"];

function groupTone(group: LoanGroup): { bg: string; fg: string; border: string } {
  return group === "Business Parks"
    ? { bg: "rgba(11,74,125,0.10)",  fg: "#0b4a7d", border: "rgba(11,74,125,0.35)" }
    : { bg: "rgba(13,148,136,0.10)", fg: "#0d9488", border: "rgba(13,148,136,0.35)" };
}

export default function DebtSummaryCard({ order = -1 }: { order?: number }) {
  const today = todayISO();

  const portfolio = useMemo(() => {
    let outstanding = 0, debtService = 0, annualInterest = 0, weightedRate = 0;
    for (const l of MANAGED_LOANS) {
      const s = summarizeLoan(l, today);
      outstanding += s.projectedBalance;
      debtService += s.monthlyDebtService;
      annualInterest += s.annualInterest;
      weightedRate += s.projectedBalance * l.annualRatePct;
    }
    return {
      count: MANAGED_LOANS.length,
      outstanding,
      debtService,
      annualInterest,
      avgRate: outstanding > 0 ? weightedRate / outstanding : 0,
    };
  }, [today]);

  const grouped = useMemo(() => {
    return GROUP_ORDER
      .map((group) => ({ group, rows: MANAGED_LOANS.filter((l) => l.group === group) }))
      .filter((g) => g.rows.length > 0);
  }, []);

  return (
    <div className="card" style={{ gridColumn: "1 / -1", order }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>
          Debt Summary
        </div>
        <Link href="/debt" style={{ fontSize: 12, fontWeight: 600, color: "#0b4a7d", textDecoration: "none" }}>
          Debt tracker →
        </Link>
      </div>

      <div className="pills" style={{ marginTop: 0 }}>
        <StatPill label="Total Outstanding" value={money(portfolio.outstanding)} />
        <StatPill label="Monthly Debt Service" value={money(portfolio.debtService)} />
        <StatPill label="Interest (next 12 mo)" value={money(portfolio.annualInterest)} accent="#b45309" />
        <StatPill label="Wtd. Avg Rate" value={pct(portfolio.avgRate)} />
      </div>

      <div className="tableWrap" style={{ marginTop: 14 }}>
        <table>
          <thead>
            <tr>
              <th>Property / Partnership</th>
              <th>Lender</th>
              <th style={{ textAlign: "right" }}>Rate</th>
              <th style={{ textAlign: "right" }}>Current Balance</th>
              <th style={{ textAlign: "right" }}>Monthly Pmt</th>
              <th>Maturity</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map(({ group, rows }, gi) => (
              <GroupBlock key={group} group={group} rows={rows} today={today} firstGroup={gi === 0} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GroupBlock({
  group, rows, today, firstGroup,
}: {
  group: LoanGroup; rows: Loan[]; today: string; firstGroup: boolean;
}) {
  const tone = groupTone(group);
  return (
    <>
      <tr>
        <td colSpan={7} style={{
          paddingTop: firstGroup ? 4 : 18, paddingBottom: 6,
          background: "transparent", borderBottom: "none",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{
              fontSize: 12, fontWeight: 800, letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: tone.fg, background: tone.bg,
              border: `1px solid ${tone.border}`,
              padding: "3px 10px", borderRadius: 999,
            }}>{group}</span>
            <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>{rows.length}</span>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>
        </td>
      </tr>
      {rows.map((l) => {
        const s = summarizeLoan(l, today);
        return (
          <tr key={l.id}>
            <td>
              <Link href="/debt" style={{ textDecoration: "none", color: "inherit" }}>
                <div style={{ fontWeight: 700 }}>{l.partnership}</div>
                <div className="small muted">
                  {l.property ? `#${l.property} · ` : ""}{l.collateral}
                </div>
              </Link>
            </td>
            <td className="small">{l.lender}</td>
            <td style={{ textAlign: "right" }}>{pct(l.annualRatePct)}</td>
            <td style={{ textAlign: "right", fontWeight: 700 }}>{money(s.projectedBalance)}</td>
            <td style={{ textAlign: "right" }}>{money(s.monthlyDebtService)}</td>
            <td className="small">{monthYearShort(l.maturityDate)}</td>
            <td><Pill tone={debtStatusTone(s.status)}>{s.status}</Pill></td>
          </tr>
        );
      })}
    </>
  );
}
