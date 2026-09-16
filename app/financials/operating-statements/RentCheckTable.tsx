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

// The statuses worth a second look. "Ties" and "no rent due" are the norm and
// are hidden by default so a finding isn't buried in sixty calm rows.
const ATTENTION = new Set(["not-billed", "short", "over", "unexpected", "partial"]);

const money0 = (v: number): string => {
  const s = Math.round(Math.abs(v)).toLocaleString("en-US");
  return v < 0 ? `(${s})` : s;
};

export function RentCheckTable({ viewKey, property, year, period, scope, mask, sign, version, monthLabel }: {
  viewKey: string; property: string; year: number; period: number;
  scope: "month" | "ytd"; mask: string; sign: 1 | -1; version?: string | null; monthLabel: string;
}) {
  const [data, setData] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

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

  const attention = data.rows.filter((r) => ATTENTION.has(r.status));
  const shown = showAll ? data.rows : attention;
  const t = data.totals;
  const window = scope === "month" ? monthLabel : `YTD through ${monthLabel}`;
  const hasAr = t.openAr !== null;

  return (
    <div style={{ padding: "12px 10px 18px" }}>
      <div className="pills" style={{ marginBottom: 12 }}>
        <StatPill label={`Contract rent · ${window}`} value={money0(t.expected)} />
        <StatPill label="Billed (GL)" value={money0(t.billed)} />
        <StatPill label="Billing variance" value={money0(t.variance)} accent={Math.abs(t.variance) > 1 ? "#b91c1c" : "#15803d"} />
        {hasAr && <StatPill label="Open A/R" value={money0(t.openAr!)} />}
        {hasAr && <StatPill label="Past due" value={money0(t.pastDue!)} accent={(t.pastDue ?? 0) > 1 ? "#b45309" : undefined} />}
      </div>

      {data.counts["not-billed"] > 0 && (
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "#b91c1c", background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)", borderRadius: 8, padding: "8px 10px", marginBottom: 10 }}>
          {data.counts["not-billed"]} leased suite{data.counts["not-billed"] === 1 ? " is" : "s are"} owed rent in {window} with nothing posted to the GL.
        </div>
      )}
      {Math.abs(data.unplacedBilled) > 1 && (
        <div className="muted small" style={{ marginBottom: 10 }}>
          {money0(data.unplacedBilled)} of rental income names no suite, so it isn&apos;t in the billed column above. It is still in the line&apos;s total.
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--muted)" }}>
          {showAll ? `All ${data.rows.length} suites` : `${attention.length} suite${attention.length === 1 ? "" : "s"} to look at`}
        </div>
        <button type="button" className="btn" onClick={() => setShowAll(!showAll)} style={{ padding: "4px 10px", fontSize: 12, fontWeight: 700 }}>
          {showAll ? "Only what needs a look" : `Show all ${data.rows.length}`}
        </button>
      </div>

      {shown.length === 0 ? (
        <div className="muted small" style={{ padding: "10px 0" }}>Every leased suite was billed its contract rent in {window}.</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={th}>Suite</th>
            <th style={th}>Tenant</th>
            <th style={thR}>SF</th>
            <th style={thR}>Contract</th>
            <th style={thR}>Billed</th>
            <th style={thR}>Δ</th>
            {hasAr && <th style={thR}>Open A/R</th>}
            <th style={th} />
          </tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.unitRef}>
                <td style={{ ...td, whiteSpace: "nowrap" }}><code style={{ fontSize: 12 }}>{r.unitRef}</code></td>
                <td style={td}>{r.tenant || <span className="muted">— vacant</span>}</td>
                <td style={{ ...tdR, color: "var(--muted)" }}>{r.sqft ? r.sqft.toLocaleString("en-US") : "—"}</td>
                <td style={tdR}>{money0(r.expected)}</td>
                <td style={tdR}>{money0(r.billed)}</td>
                <td style={{ ...tdR, fontWeight: Math.abs(r.variance) > 1 ? 800 : undefined, color: r.variance < -1 ? "#b91c1c" : undefined }}>{money0(r.variance)}</td>
                {hasAr && (
                  <td style={{ ...tdR, color: (r.pastDue ?? 0) > 1 ? "#b45309" : "var(--muted)", fontWeight: (r.pastDue ?? 0) > 1 ? 800 : undefined }}>
                    {r.openAr === null ? "—" : money0(r.openAr)}
                  </td>
                )}
                <td style={{ ...td, whiteSpace: "nowrap" }}>
                  <HoverCard
                    title={`${r.unitRef}${r.tenant ? ` · ${r.tenant}` : ""}`}
                    rows={[
                      { label: `Contract rent · ${window}`, value: money0(r.expected) },
                      { label: "Billed to the GL", value: money0(r.billed) },
                      { label: "Months of the window leased", value: `${r.monthsCovered} of ${r.monthsInScope}` },
                      ...(r.openAr !== null ? [{ label: "Open A/R", value: money0(r.openAr) }] : []),
                      ...(r.pastDue ? [{ label: "Past due", value: money0(r.pastDue), color: "#b45309" }] : []),
                    ]}
                    footer={r.caveats.length ? { label: "Note", value: r.caveats.join(" ") } : { label: "Difference", value: money0(r.variance) }}
                    width={300}
                  >
                    <Pill tone={rentCheckTone(r.status)}>{STATUS_LABEL[r.status] ?? r.status.toUpperCase()}</Pill>
                  </HoverCard>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr>
            <td colSpan={3} style={{ ...td, fontWeight: 800, borderTop: "2px solid var(--border)" }}>
              {showAll ? "Total · all suites" : "Total · suites shown"}
            </td>
            <td style={{ ...tdR, fontWeight: 900, borderTop: "2px solid var(--border)" }}>{money0(shown.reduce((s, r) => s + r.expected, 0))}</td>
            <td style={{ ...tdR, fontWeight: 900, borderTop: "2px solid var(--border)" }}>{money0(shown.reduce((s, r) => s + r.billed, 0))}</td>
            <td style={{ ...tdR, fontWeight: 900, borderTop: "2px solid var(--border)" }}>{money0(shown.reduce((s, r) => s + r.variance, 0))}</td>
            {hasAr && <td style={{ ...tdR, fontWeight: 900, borderTop: "2px solid var(--border)" }}>{money0(shown.reduce((s, r) => s + (r.openAr ?? 0), 0))}</td>}
            <td style={{ ...td, borderTop: "2px solid var(--border)" }} />
          </tr></tfoot>
        </table>
      )}

      <div className="muted small" style={{ marginTop: 12, lineHeight: 1.5 }}>
        <strong>Billed is not collected.</strong> The Δ column compares contract rent to what was <em>charged</em> in the GL — a lease that was never keyed, a suite still at last year&apos;s rate, a vacated tenant still being billed.
        {hasAr
          ? <> Whether the money arrived is the <strong>Open A/R</strong> column, open charges only{data.arPeriod ? `, from the ${data.arPeriod} statement import` : ""}.</>
          : <> Import a Skyline statement on Monthly Statements to see open A/R beside it.</>}
        {" "}Contract rent is base rent from the current rent roll{scope === "ytd" ? ", which carries today's rate — a mid-year escalation isn't in it, so YTD is indicative" : ""}.
      </div>
    </div>
  );
}
