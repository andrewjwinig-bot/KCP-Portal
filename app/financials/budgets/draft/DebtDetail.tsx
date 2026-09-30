"use client";

// DEBT SERVICE, FROM THE LOANS — the working behind the Interest and Mortgage
// Amortization lines, which are LOCKED: they are the lender's terms run
// through the Debt Tracker's schedule (`debtBudget.ts`), not a figure anyone
// should key. The same shape as the real estate taxes' dialog: the
// calculation as KPI tiles, then the loans, then where the terms live.
// Rendered by the lines' ⓘ (hover a summary, click for this) and inside the
// line's history popup.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { HoverCard } from "@/app/components/HoverCard";
import { Pill, StatPill, TONE_AMBER, TONE_NEUTRAL } from "@/app/components/Pill";
import { th, thL, td, tdL } from "@/app/components/tableStyles";
import type { BudgetDraft } from "@/lib/financials/budgets/draft";
import { SourceIconButton } from "./SourceIcon";

type Debt = NonNullable<BudgetDraft["debt"]>;

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const secLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" };

export function DebtDetail({ debt, year }: { debt: Debt; year: number }) {
  const start = debt.loans.reduce((s, l) => s + l.balanceStart * (l.share ?? 1), 0);
  const end = debt.loans.reduce((s, l) => s + l.balanceEnd * (l.share ?? 1), 0);
  const op: React.CSSProperties = { fontSize: 22, fontWeight: 800, color: "var(--muted)", padding: "0 2px", alignSelf: "center" };
  const shared = debt.loans.some((l) => l.share != null);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="pills" style={{ alignItems: "stretch" }}>
        <StatPill label={`Balance Jan 1, ${year}`} value={usd(start)} sub={`${debt.loans.length} loan${debt.loans.length === 1 ? "" : "s"}${shared ? " · this building's share" : ""}`} />
        <span style={op}>→</span>
        <StatPill label="Interest" value={usd(debt.interest)} sub="Interest line" />
        <span style={op}>+</span>
        <StatPill label="Principal" value={usd(debt.principal)} sub="Mortgage Amortization line" />
        <span style={op}>=</span>
        <StatPill label="Debt Service" value={usd(debt.interest + debt.principal)} sub={`Balance Dec 31: ${usd(end)}`} accent="var(--brand)" total />
      </div>

      <div>
        <div style={secLabel}>Loans</div>
        <div style={{ overflowX: "auto", marginTop: 6 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
            <thead>
              <tr>
                <th style={thL}>Lender</th>
                <th style={th}>Rate</th>
                <th style={th}>Maturity</th>
                <th style={th}>Balance Jan 1</th>
                <th style={th}>Interest</th>
                <th style={th}>Principal</th>
                <th style={th}>Balance Dec 31</th>
              </tr>
            </thead>
            <tbody>
              {debt.loans.map((l) => (
                <tr key={l.id}>
                  <td style={{ ...tdL, whiteSpace: "normal" }}>
                    <span style={{ fontWeight: 700 }}>{l.lender || "Loan"}</span>
                    {l.interestOnly && <span style={{ marginLeft: 6 }}><Pill tone={TONE_NEUTRAL}>Interest Only</Pill></span>}
                    {l.refinanceAssumed && <span style={{ marginLeft: 6 }}><Pill tone={TONE_AMBER}>Refinance Assumed</Pill></span>}
                    {l.share != null && (
                      <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                        The fund&rsquo;s loan — this building carries {(l.share * 100).toFixed(1)}% of its interest and principal
                        {debt.fundShare?.basis === "sqft" ? " (by square footage — no prior budget to follow)" : ", as last year's budget allocated it"}; balances are the whole loan.
                      </div>
                    )}
                  </td>
                  <td style={td}>{l.ratePct.toFixed(3)}%</td>
                  <td style={{ ...td, color: l.refinanceAssumed ? "#b45309" : undefined }}>{l.maturityDate}</td>
                  <td style={td}>{usd(l.balanceStart)}</td>
                  <td style={td}>{usd(l.interest)}</td>
                  <td style={td}>{usd(l.principal)}</td>
                  <td style={td}>{usd(l.balanceEnd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="muted small" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span>Each loan&apos;s amortization schedule from the Debt Tracker — the lender&apos;s own terms — run month by month through {year}. Change the terms there, not here.{debt.loans.some((l) => l.refinanceAssumed) ? " A loan maturing by year-end is assumed refinanced on the same terms, so the budget keeps paying it." : ""}</span>
        <a href="/debt" className="btn sm">Open the Debt Tracker</a>
      </div>
    </div>
  );
}

/** The ⓘ on the Interest / Mortgage Amortization lines. */
export function DebtIcon({ debt, year, part }: { debt: Debt; year: number; part: "interest" | "principal" }) {
  const [open, setOpen] = useState(false);
  const rows = debt.loans.map((l) => ({
    label: `${l.lender || "Loan"} · ${l.ratePct.toFixed(3)}%${l.interestOnly ? " · Interest Only" : ""}${l.share != null ? ` · ${(l.share * 100).toFixed(0)}% share` : ""}`,
    value: usd(part === "interest" ? l.interest : l.principal),
  }));
  return (
    <>
      <HoverCard title={part === "interest" ? "Interest · From the Loans" : "Principal · From the Loans"} width={360} help={false} rows={rows}
        footer={{ label: "Click for the schedule", value: usd(part === "interest" ? debt.interest : debt.principal), color: "var(--brand)" }}>
        <SourceIconButton kind="info" label="How Debt Service is figured" onClick={() => setOpen(true)} />
      </HoverCard>
      {open && <DebtDialog debt={debt} year={year} onClose={() => setOpen(false)} />}
    </>
  );
}

function DebtDialog({ debt, year, onClose }: { debt: Debt; year: number; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const body = (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "80px 16px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Debt Service"
        style={{ background: "var(--card)", borderRadius: 12, width: "100%", maxWidth: 820, boxShadow: "0 20px 60px rgba(0,0,0,0.35)", borderTop: "3px solid var(--brand)" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div>
            <div style={secLabel}>Debt Service · Source</div>
            <div style={{ fontSize: 17, fontWeight: 800, marginTop: 2 }}>{year} Debt Service from the Loans</div>
          </div>
          <button type="button" className="btn sm" onClick={onClose}>Close</button>
        </div>
        <div style={{ padding: "14px 18px 16px" }}><DebtDetail debt={debt} year={year} /></div>
      </div>
    </div>
  );
  return typeof document !== "undefined" ? createPortal(body, document.body) : null;
}
