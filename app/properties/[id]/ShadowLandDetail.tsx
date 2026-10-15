"use client";

// A held-only (shadow) land holding: the schedule of parcels, banded by
// region, and nothing else — no rent roll, budgets or tax filings, because we
// do not manage it. Data: lib/properties/shadowProperties.ts.

import { Fragment } from "react";
import { StatPill } from "@/app/components/Pill";
import { th, thL, td, tdL } from "@/app/components/tableStyles";
import { entityValue, STATEMENT_AS_OF } from "@/lib/properties/entityValues";
import { parcelCount, regionAcres, totalAcres, type ShadowProperty } from "@/lib/properties/shadowProperties";

const acres = (n: number, d = 2) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: Math.max(d, 3) });
const band: React.CSSProperties = { background: "rgba(180,83,9,0.07)", fontWeight: 800 };

export default function ShadowLandDetail({ prop }: { prop: ShadowProperty }) {
  const sov = entityValue(prop.id);
  const total = totalAcres(prop);
  return (
    <>
      <div className="pills">
        <StatPill label="Total acres" value={acres(total)} total />
        <StatPill label="Parcels" value={parcelCount(prop)} />
        <StatPill label="Regions" value={prop.regions.length} />
        {sov?.equityValue != null && (
          <StatPill label="Equity value · Statement of Values" value={`$${Math.round(sov.equityValue).toLocaleString("en-US")}`}
            sub={`As of ${new Date(STATEMENT_AS_OF + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`} />
        )}
      </div>

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <div style={{ padding: "12px 14px 6px", display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 800, fontSize: 15 }}>Schedule of Vacant Land</span>
          <span className="muted small">{prop.source} · held for reference, not managed by KCP</span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={thL}>Address</th><th style={thL}>Zip</th><th style={th}>Acreage</th>
          </tr></thead>
          <tbody>
            {prop.regions.map((r) => (
              <Fragment key={r.label}>
                <tr style={band}>
                  <td style={{ ...tdL, fontWeight: 800, color: "#b45309" }} colSpan={2}>
                    {r.label} <span className="muted small" style={{ fontWeight: 600, marginLeft: 6 }}>{r.parcels.length} parcel{r.parcels.length === 1 ? "" : "s"}</span>
                  </td>
                  <td style={{ ...td, fontWeight: 800 }}>{acres(regionAcres(r))}</td>
                </tr>
                {r.parcels.map((p) => (
                  <tr key={p.address}>
                    <td style={{ ...tdL, fontWeight: 600 }}>{p.address}</td>
                    <td style={tdL}><code style={{ fontSize: 12 }}>{p.zip}</code></td>
                    <td style={td}>
                      {p.acres != null ? acres(p.acres) : <span className="muted small">incl. above</span>}
                      {p.sharedWith && <div className="muted small">for {p.sharedWith}</div>}
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
            <tr style={{ borderTop: "2px solid var(--border)" }}>
              <td style={{ ...tdL, fontWeight: 900 }} colSpan={2}>Total Vacant Land — The Korman Co</td>
              <td style={{ ...td, fontWeight: 900 }}>{acres(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
