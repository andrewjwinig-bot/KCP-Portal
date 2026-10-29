"use client";

import Link from "next/link";
import {
  MANAGED_LOANS,
  summarizeLoan,
  todayISO,
  type Loan,
} from "@/lib/debt/amortization";

function compactMoney(n: number): string {
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2) + "M";
  if (n >= 1_000) return "$" + Math.round(n / 1000) + "K";
  return "$" + Math.round(n);
}
function monthYearShort(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso || "—";
  return `${m[2]}/${m[1].slice(2)}`;
}

// Compact partnership labels for tile headers.
const SHORT_LABEL: Record<string, string> = {
  loan_jv3:        "JV III",
  loan_nillc:      "NI LLC",
  loan_brookwood:  "Brookwood",
  loan_graysferry: "Grays Ferry",
  loan_parkwood:   "Parkwood",
};

export default function DebtSummaryCard({ order = -1 }: { order?: number }) {
  const today = todayISO();
  return (
    <div className="card" style={{ gridColumn: "1 / -1", order }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>
          Debt Summary
        </div>
        <Link href="/debt" style={{ fontSize: 12, fontWeight: 600, color: "#0b4a7d", textDecoration: "none" }}>
          Debt tracker →
        </Link>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${MANAGED_LOANS.length}, minmax(0, 1fr))`,
        gap: 10,
      }}>
        {MANAGED_LOANS.map((loan) => (
          <DebtTile key={loan.id} loan={loan} today={today} />
        ))}
      </div>
    </div>
  );
}

function DebtTile({ loan, today }: { loan: Loan; today: string }) {
  const s = summarizeLoan(loan, today);
  return (
    <Link
      href={`/debt?openId=${encodeURIComponent(loan.id)}`}
      style={{
        display: "flex", flexDirection: "column", gap: 4,
        padding: "12px 14px",
        border: "1px solid var(--border)",
        borderRadius: 12,
        background: "var(--card)",
        textDecoration: "none", color: "inherit",
        transition: "box-shadow 0.15s, border-color 0.15s, transform 0.1s",
        minWidth: 0,
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.boxShadow = "0 4px 14px rgba(15,23,42,0.08)";
        el.style.borderColor = "rgba(11,74,125,0.35)";
        el.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.boxShadow = "";
        el.style.borderColor = "var(--border)";
        el.style.transform = "";
      }}
    >
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
        textTransform: "uppercase", color: "var(--muted)",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {SHORT_LABEL[loan.id] ?? loan.partnership}
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, color: "var(--text)", lineHeight: 1.1 }}>
        {compactMoney(s.projectedBalance)}
      </div>
      <div style={{
        fontSize: 12, color: "var(--muted)",
        display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2,
      }}>
        <span><strong style={{ color: "var(--text)", fontWeight: 700 }}>{compactMoney(s.monthlyDebtService)}</strong>/mo</span>
        <span>·</span>
        <span>matures {monthYearShort(loan.maturityDate)}</span>
      </div>
    </Link>
  );
}
