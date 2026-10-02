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
import { BASIS_LABEL, BASIS_SOURCE, type RentCheckBasis } from "@/lib/financials/operating-statements/rentCheck";
import { HoverCard } from "@/app/components/HoverCard";

type Row = {
  unitRef: string; suite: string; tenant: string | null; sqft: number | null;
  leaseFrom: string | null; leaseTo: string | null;
  expected: number; billed: number; variance: number;
  status: string; caveats: string[]; monthsCovered: number; monthsInScope: number;
};

type Result = {
  rows: Row[];
  totals: { expected: number; billed: number; variance: number } | null;
  unplacedBilled: number;
  counts: Record<string, number>;
  noRentRoll?: boolean;
  basis?: RentCheckBasis;
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

export function RentCheckTable({ viewKey, property, year, period, scope, mask, sign, version, monthLabel, label, refByUnit }: {
  viewKey: string; property: string; year: number; period: number;
  scope: "month" | "ytd"; mask: string; sign: 1 | -1; version?: string | null; monthLabel: string;
  /** The statement line's label — the API resolves the rent-roll column from it. */
  label?: string;
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
    if (label) qs.set("label", label);
    if (version) qs.set("version", version);
    fetch(`/api/financials/operating-statements/rent-check?${qs}`)
      .then((r) => r.json()).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [viewKey, property, year, period, scope, mask, sign, version, label]);

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
  const hasRef = !!refByUnit && shown.some((r) => refByUnit[r.unitRef]);
  // The column NAMES its source. A CAM line checked against base rent read a
  // six-figure "billing variance" on a month that ties to the dollar, and
  // nothing on the table said which column it had compared.
  const basis: RentCheckBasis = data.basis ?? "base";

  return (
    <div style={{ paddingBottom: 14 }}>
      <div className="pills" style={{ marginBottom: 12 }}>
        <StatPill label={`${BASIS_LABEL[basis]} · ${window}`} value={money0(t.expected)} />
        <StatPill label="General ledger" value={money0(t.billed)} />
        <StatPill label="Billing variance" value={money0(t.variance)} accent={Math.abs(t.variance) > 1 ? "#b91c1c" : "#15803d"} />
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
            <th style={thR}>{BASIS_LABEL[basis]}</th>
            <th style={thR}>GL</th>
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
                <td style={{ ...td, whiteSpace: "nowrap" }}>
                  <HoverCard
                    title={`${r.unitRef}${r.tenant ? ` · ${r.tenant}` : ""}`}
                    rows={[
                      { label: `${BASIS_LABEL[basis]} · ${window}`, value: money0(r.expected) },
                      { label: "Billed to the GL", value: money0(r.billed) },
                      { label: "Difference", value: money0(r.variance), color: r.variance < -1 ? "#b91c1c" : undefined },
                      { label: "Lease term", value: r.leaseFrom || r.leaseTo ? `${r.leaseFrom ?? "—"} → ${r.leaseTo ?? "—"}` : "Not on the rent roll" },
                      { label: "Months of the window leased", value: `${r.monthsCovered} of ${r.monthsInScope}` },
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
            <td style={{ ...td, borderTop: "2px solid var(--border)" }} />
          </tr></tfoot>
        </table>
      )}

      <div className="muted small" style={{ marginTop: 12, lineHeight: 1.5 }}>
        <strong>{BASIS_LABEL[basis]}:</strong> {BASIS_SOURCE[basis]}. <strong>GL:</strong> what was charged against it in the general ledger (a charge posts whether or not the cheque arrives).
        {basis === "other" ? " The rent roll has no insurance column, so this is OTHER EXPENSE — Skyline's catch-all, which may carry more than insurance." : ""}
        {" "}The pill judges those two columns and nothing else — whether the charge was BILLED correctly. Whether it was PAID is a different question, on <strong>Monthly Statements</strong>, where open A/R is aged and broken out by charge.
        {scope === "ytd" ? " The rent roll carries today's rate, so a mid-year escalation isn't in it and YTD is indicative." : ""}
      </div>
    </div>
  );
}
