"use client";

// Master Cash Sheet (DRAFT) — the one comprehensive view, per the plan:
//   • Top: Available Cash (weekly) — the Cash Position snapshot (operating, A/P,
//     escrows, reserves, money market → Net Available), with the bank tie-out.
//   • Bottom: Cash Flow (monthly) — the GL-bucketed walk (Opening → movements →
//     Ending), drill-down to GL accounts, and the debt-not-posted guard.
// Each section keeps its own as-of date because the two cadences differ. Built
// alongside the current Cash Sheet; it will replace it once verified.

import CashPositionPage from "@/app/financials/cash-position/page";
import CashAnalysisPage from "@/app/financials/cash-analysis/page";

export default function MasterCashSheetPage() {
  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div>
        <div style={{ display: "inline-block", fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", color: "#b45309", background: "rgba(180,83,9,0.12)", border: "1px solid rgba(180,83,9,0.35)", borderRadius: 999, padding: "2px 10px", marginBottom: 6 }}>DRAFT — building the master</div>
        <h1 style={{ margin: 0 }}>Cash Sheet</h1>
        <p className="muted small" style={{ margin: "4px 0 0" }}>
          One comprehensive view: this week&apos;s <b>available cash</b> on top, the GL-driven <b>monthly cash flow</b> (with drill-down + debt checks) below. Each section is dated for its own cadence.
        </p>
      </div>

      <CashPositionPage embedded />

      <div style={{ height: 1, background: "var(--border)" }} />

      <CashAnalysisPage embedded />
    </main>
  );
}
