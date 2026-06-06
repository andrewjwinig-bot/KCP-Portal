"use client";

// Operating Statements — the actuals twin of Operating Budgets. The pure
// engine (lib/financials/operating-statements) is built and tested; this page
// is a placeholder until the GL/Trial-Balance import + API are wired (the
// statement view will mirror the Operating Budgets layout: period + property
// selectors, the same section ladder, and Actual / Budget / Variance columns).

export default function OperatingStatementsPage() {
  return (
    <main style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <h1>Operating Statements</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <span style={{ fontFamily: "'Arial Black', 'Arial Bold', Arial, sans-serif", fontWeight: 900, fontSize: 30, letterSpacing: "-0.5px", lineHeight: 1 }}>KORMAN</span>
          <div style={{ width: 1, height: 36, background: "#000", flexShrink: 0 }} />
          <div style={{ fontSize: 11, letterSpacing: "0.22em", lineHeight: 1.7, fontFamily: "Arial, Helvetica, sans-serif" }}><div>COMMERCIAL</div><div>PROPERTIES</div></div>
        </div>
      </header>

      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Coming soon</div>
        <div className="muted small" style={{ lineHeight: 1.6 }}>
          The operating-statement engine is in place — per-property GL line
          mappings, the account-mask matcher, and the compute (Actual / Budget /
          Variance, current period + YTD, with a trial-balance tie-out). This
          view turns on once the monthly GL / Trial-Balance import is wired; it
          will mirror the Operating Budgets layout for consistency.
        </div>
      </div>
    </main>
  );
}
