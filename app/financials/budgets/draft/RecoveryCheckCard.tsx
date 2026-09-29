"use client";

// THE RECOVERY CHECK, every property in the book on one screen (the "All …"
// tab). Per property: what tenants are budgeted to recover against the
// recoverable pool they recover it from — CAM + INS together, RET alone — and
// the recon year's own ratio beside it (`recoveryCheck.ts`). Over the ceiling
// is over-billing and overstated NOI; a group the engine had to scale back
// says so. Click a property's tab to see its tenants.

import { Pill, TONE_AMBER, TONE_RED, TONE_GREEN } from "@/app/components/Pill";
import { HoverCard } from "@/app/components/HoverCard";
import { th, td, thL, tdL } from "@/app/components/tableStyles";
import type { BudgetDraft } from "@/lib/financials/budgets/draft";
import type { GroupCheck } from "@/lib/financials/budgets/recoveryCheck";

const money0 = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const pct = (r: number | null | undefined) => (r == null ? "–" : `${(r * 100).toFixed(1)}%`);

export function RecoveryCheckCard({ checks, year }: { checks: NonNullable<BudgetDraft["recoveryChecks"]>; year: number }) {
  if (!checks.length) return null;
  const over = checks.filter((p) => p.checks.some((c) => c.over)).length;
  const capped = checks.filter((p) => p.checks.some((c) => c.capped)).length;
  const cells = (c?: GroupCheck) => {
    if (!c || !(c.pool > 0)) return <><td style={td}>–</td><td style={td}>–</td><td style={td}>–</td></>;
    const color = c.over ? "#b91c1c" : c.capped ? "#b45309" : undefined;
    return (
      <>
        <td style={td}>{money0(c.recovered)}</td>
        <td style={td}>{money0(c.pool)}</td>
        <td style={{ ...td, fontWeight: 800, color }}>
          <HoverCard title={`${c.label} · recovery ratio`} width={320} rows={[
            { label: `${year} recoveries`, value: money0(c.recovered) },
            { label: `${year} budget pool`, value: money0(c.pool) },
            ...(c.reconRatio != null ? [{ label: "Recon year's ratio", value: pct(c.reconRatio) }] : []),
            { label: "Ceiling", value: money0(c.ceiling) },
            ...(c.capped ? [{ label: "Methodology came to", value: `${money0(c.capped.before)} — capped`, color: "#b45309" }] : []),
          ]}>
            <span>{pct(c.ratio)}</span>
          </HoverCard>
          {c.reconRatio != null && <span className="muted small" style={{ fontWeight: 400 }}> · {pct(c.reconRatio)}</span>}
        </td>
      </>
    );
  };
  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 16, fontWeight: 800 }}>Recovery check</span>
        {over > 0 ? <Pill tone={TONE_RED}>{over} over-recovering</Pill>
          : capped > 0 ? <Pill tone={TONE_AMBER}>{capped} capped to the pool</Pill>
          : <Pill tone={TONE_GREEN}>No property over its pool</Pill>}
        <span className="muted small">Each property&apos;s {year} recoveries ÷ the recoverable pool they come from, beside the recon year&apos;s ratio. Over 100% (or last year&apos;s ratio, where admin fees took it higher) is over-billing.</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thL} />
              <th style={{ ...th, textAlign: "center" }} colSpan={3}>CAM + INS</th>
              <th style={{ ...th, textAlign: "center" }} colSpan={3}>RET</th>
            </tr>
            <tr>
              <th style={thL}>Property</th>
              <th style={th}>Recovered</th><th style={th}>Pool</th><th style={th}>Ratio · recon</th>
              <th style={th}>Recovered</th><th style={th}>Pool</th><th style={th}>Ratio · recon</th>
            </tr>
          </thead>
          <tbody>
            {checks.map((p) => (
              <tr key={p.code}>
                <td style={tdL}><span style={{ fontWeight: 600 }}>{p.name}</span> <code style={{ fontSize: 12 }}>{p.code}</code></td>
                {cells(p.checks.find((c) => c.group === "camIns"))}
                {cells(p.checks.find((c) => c.group === "ret"))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
