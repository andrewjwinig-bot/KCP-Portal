"use client";

// Rent-roll check — the rental income line's suites lined up against what the
// rent roll says each of them owes.
//
// Two things are deliberately kept apart here, because conflating them is how
// a billing problem gets mistaken for a collection problem:
//   BILLED   — the GL's rental income. A charge posts whether or not the
//              cheque arrives, so the variance column is a BILLING variance:
//              a lease never keyed, last year's rate, a vacated tenant still
//              being charged.
//   OPEN A/R — from the Skyline statement import. That is the money question.
// Both sit on one row; neither is presented as the other.

import { useEffect, useState } from "react";
import { Pill, StatPill, rentCheckTone } from "@/app/components/Pill";
import { HoverCard } from "@/app/components/HoverCard";

type Row = {
  unitRef: string; suite: string; tenant: string | null; sqft: number | null;
  expected: number; billed: number; variance: number;
  openAr: number | null; pastDue: number | null;
  status: string; caveats: string[]; monthsCovered: number; monthsInScope: number;
};

type Result = {
  rows: Row[];
  totals: { expected: number; billed: number; variance: number; openAr: number | null; pastDue: number | null } | null;
  unplacedBilled: number;
  counts: Record<string, number>;
  arPeriod: string | null;
  arAsOf: string | null;
  noRentRoll?: boolean;
};

const STATUS_LABEL: Record<string, string> = {
  "not-billed": "NOT BILLED", short: "SHORT", over: "OVER", unexpected: "UNEXPECTED",
  partial: "PART MONTH", ok: "TIES", idle: "NO RENT DUE",
};

// The statuses that ARE a number. Carrying the figure in the pill retires the
// Δ column: "SHORT $143" says in one cell what a label and a signed column
// said in two. The rest are states, not amounts — "TIES $0" reads as a figure
// worth checking when the whole point is that there is nothing to check.
const STATUS_AMOUNT = new Set(["not-billed", "short", "over", "unexpected"]);

const statusLabel = (status: string, variance: number): string => {
  const label = STATUS_LABEL[status] ?? status.toUpperCase();
  if (!STATUS_AMOUNT.has(status)) return label;
  return `${label} $${Math.round(Math.abs(variance)).toLocaleString("en-US")}`;
};

const money0 = (v: number): string => {
  const s = Math.round(Math.abs(v)).toLocaleString("en-US");
  return v < 0 ? `(${s})` : s;
};

export function RentCheckTable({ viewKey, property, year, period, scope, mask, sign, version, monthLabel, refByUnit }: {
  viewKey: string; property: string; year: number; period: number;
  scope: "month" | "ytd"; mask: string; sign: 1 | -1; version?: string | null; monthLabel: string;
  /**
   * The GL reference for each suite's charge, when there is exactly one.
   *
   * Passed in rather than fetched: where rent posts one charge per suite a
   * month, the transaction list under this table repeats it row for row and is
   * hidden — and its Ref was the one column this table did not already carry.
   * A suite with two charges has no single ref, so it is left out of the map
   * and that is also the case where the transaction list stays.
   */
  refByUnit?: Record<string, string>;
}) {
  const [data, setData] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams({ key: viewKey, property, year: String(year), mask, period: String(period), scope, sign: String(sign) });
    if (version) qs.set("version", version);
    fetch(`/api/financials/operating-statements/rent-check?${qs}`)
      .then((r) => r.json()).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [viewKey, property, year, period, scope, mask, sign, version]);

  const th: React.CSSProperties = { textAlign: "left", fontSize: 11, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em", padding: "6px 10px", position: "sticky", top: 0, background: "var(--card)" };
  const thR: React.CSSProperties = { ...th, textAlign: "right" };
  const td: React.CSSProperties = { padding: "6px 10px", fontSize: 13, borderTop: "1px solid var(--border)" };
  const tdR: React.CSSProperties = { ...td, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };

  if (loading) return <div className="muted small" style={{ padding: 18 }}>Loading…</div>;
  if (!data) return <div className="muted small" style={{ padding: 18 }}>Could not load the rent-roll check.</div>;
  if (data.noRentRoll || !data.totals) {
    return <div className="muted small" style={{ padding: 18 }}>No rent roll has been imported, so there is nothing to compare against.</div>;
  }

  // Every suite, in one table. Sorted worst-first by the engine, so a suite
  // that was never billed leads and the calm rows fall in behind it — no
  // second view to switch into.
  const shown = data.rows;
  const t = data.totals;
  const window = scope === "month" ? monthLabel : `YTD through ${monthLabel}`;
  const hasAr = t.openAr !== null;
  const hasRef = !!refByUnit && shown.some((r) => refByUnit[r.unitRef]);

  return (
    <div style={{ paddingBottom: 14 }}>
      <div className="pills" style={{ marginBottom: 12 }}>
        <StatPill label={`Rent roll · ${window}`} value={money0(t.expected)} />
        <StatPill label="General ledger" value={money0(t.billed)} />
        <StatPill label="Billing variance" value={money0(t.variance)} accent={Math.abs(t.variance) > 1 ? "#b91c1c" : "#15803d"} />
        {hasAr && <StatPill label="Open A/R · statement" value={money0(t.openAr!)} />}
        {hasAr && <StatPill label="Past due" value={money0(t.pastDue!)} accent={(t.pastDue ?? 0) > 1 ? "#b45309" : undefined} />}
      </div>

      {Math.abs(data.unplacedBilled) > 1 && (
        <div className="muted small" style={{ marginBottom: 10 }}>
          {money0(data.unplacedBilled)} of rental income names no suite, so it isn&apos;t in the billed column above. It is still in the line&apos;s total.
        </div>
      )}

      {shown.length === 0 ? (
        <div className="muted small" style={{ padding: "10px 0" }}>No suites to compare for {window}.</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={th}>Suite</th>
            <th style={th}>Tenant</th>
            {hasRef && <th style={th}>Ref</th>}
            <th style={thR}>SF</th>
            <th style={thR}>Rent roll</th>
            <th style={thR}>GL</th>
            {hasAr && <th style={thR}>Open A/R</th>}
            <th style={th} />
          </tr></thead>
          <tbody>
            {shown.map((r) => {
              // A vacant suite is greyed WHOLE. Every figure on the row is
              // legitimately zero, so dimming it lets the eye fall straight to
              // the suites that carry rent — the same treatment a gross-lease
              // row gets on the CAM statements.
              const vacant = !r.tenant;
              return (
              <tr key={r.unitRef} style={vacant ? { opacity: 0.55 } : undefined}>
                <td style={{ ...td, whiteSpace: "nowrap" }}><code style={{ fontSize: 12 }}>{r.unitRef}</code></td>
                <td style={td}>{r.tenant || <span className="muted" style={{ fontWeight: 700, letterSpacing: "0.04em" }}>VACANT</span>}</td>
                {hasRef && <td style={{ ...td, whiteSpace: "nowrap", color: "var(--muted)" }}>{refByUnit?.[r.unitRef] || "—"}</td>}
                <td style={{ ...tdR, color: "var(--muted)" }}>{r.sqft ? r.sqft.toLocaleString("en-US") : "—"}</td>
                <td style={tdR}>{money0(r.expected)}</td>
                <td style={{ ...tdR, fontWeight: Math.abs(r.variance) > 1 ? 800 : undefined }}>{money0(r.billed)}</td>
                {hasAr && (
                  <td style={{ ...tdR, color: (r.pastDue ?? 0) > 1 ? "#b45309" : "var(--muted)", fontWeight: (r.pastDue ?? 0) > 1 ? 800 : undefined }}>
                    {r.openAr === null ? "—" : money0(r.openAr)}
                  </td>
                )}
                <td style={{ ...td, whiteSpace: "nowrap" }}>
                  <HoverCard
                    title={`${r.unitRef}${r.tenant ? ` · ${r.tenant}` : ""}`}
                    rows={[
                      { label: `Rent roll · ${window}`, value: money0(r.expected) },
                      { label: "Billed to the GL", value: money0(r.billed) },
                      { label: "Difference", value: money0(r.variance), color: r.variance < -1 ? "#b91c1c" : undefined },
                      { label: "Months of the window leased", value: `${r.monthsCovered} of ${r.monthsInScope}` },
                      ...(r.openAr !== null ? [{ label: "Open A/R", value: money0(r.openAr) }] : []),
                      ...(r.pastDue ? [{ label: "Past due", value: money0(r.pastDue), color: "#b45309" }] : []),
                    ]}
                    footer={r.caveats.length ? { label: "Note", value: r.caveats.join(" ") } : { label: "Difference", value: money0(r.variance) }}
                    width={300}
                  >
                    <Pill tone={rentCheckTone(r.status)}>{statusLabel(r.status, r.variance)}</Pill>
                  </HoverCard>
                </td>
              </tr>
            );})}
          </tbody>
          <tfoot><tr>
            <td colSpan={hasRef ? 4 : 3} style={{ ...td, fontWeight: 800, borderTop: "2px solid var(--border)" }}>
              {`Total · ${shown.length} suites`}
            </td>
            <td style={{ ...tdR, fontWeight: 900, borderTop: "2px solid var(--border)" }}>{money0(shown.reduce((s, r) => s + r.expected, 0))}</td>
            <td style={{ ...tdR, fontWeight: 900, borderTop: "2px solid var(--border)" }}>{money0(shown.reduce((s, r) => s + r.billed, 0))}</td>
            {hasAr && <td style={{ ...tdR, fontWeight: 900, borderTop: "2px solid var(--border)" }}>{money0(shown.reduce((s, r) => s + (r.openAr ?? 0), 0))}</td>}
            <td style={{ ...td, borderTop: "2px solid var(--border)" }} />
          </tr></tfoot>
        </table>
      )}

      <div className="muted small" style={{ marginTop: 12, lineHeight: 1.5 }}>
        <strong>Rent roll:</strong> contract base rent for the suite. <strong>GL:</strong> what was charged against it in the general ledger (a charge posts whether or not the cheque arrives).
        {hasAr
          ? <> <strong>Open A/R:</strong> open charges only{data.arPeriod ? `, from the ${data.arPeriod} Skyline statement import` : ""}.</>
          : <> Import a Skyline statement on Monthly Statements to see open A/R beside it.</>}
        {scope === "ytd" ? " The rent roll carries today's rate, so a mid-year escalation isn't in it and YTD is indicative." : ""}
      </div>
    </div>
  );
}
