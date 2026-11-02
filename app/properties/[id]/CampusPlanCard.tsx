"use client";

// The Neshaminy Interplex campus, on a holding entity's page (JV III Condo,
// NI LLC): every building on the map coloured by how much of it is leased,
// off the current rent roll. This fund's buildings lead; the other fund's
// read lighter. Hover a building for its figures, click for its page — where
// its floor plans are. Data: /api/properties/[id]/siteplan → `campus`.

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { StatPill } from "../../components/Pill";
import PlanTip, { type PlanTipRow } from "./PlanTip";
import { OCC_BANDS, occBand, occupancyOf, type CampusBuildingFigures, type CampusView } from "../../../lib/buildings/campusMath";

const money0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export default function CampusPlanCard({ campus, style }: { campus: CampusView; style?: React.CSSProperties }) {
  const router = useRouter();
  const [hover, setHover] = useState<{ b: CampusBuildingFigures; x: number; y: number } | null>(null);
  const ours = campus.buildings.filter((b) => b.fund === campus.fund);
  const sf = ours.reduce((t, b) => t + b.sf, 0);
  const leased = ours.reduce((t, b) => t + b.leasedSf, 0);
  const pastDue = ours.reduce((t, b) => t + (b.pastDue ?? 0), 0);
  const tenants = ours.reduce((t, b) => t + b.tenants, 0);
  const present = new Set(campus.buildings.filter((b) => b.onRoll).map((b) => occBand(b).key));

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", ...style }}>
      <div style={{ padding: "16px 20px 0" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "var(--muted)", textTransform: "uppercase" }}>Campus Plan</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
          Neshaminy Interplex · live from the rent roll{campus.rollImportedAt ? ` imported ${new Date(campus.rollImportedAt).toLocaleDateString("en-US")}` : ""} · hover a building, click for its floor plans
        </div>
      </div>
      <div className="pills" style={{ padding: "12px 20px 0", margin: 0 }}>
        <StatPill label={`${campus.fund} occupied`} value={sf ? pct(leased / sf) : "—"} />
        <StatPill label="Vacant SF" value={Math.round(sf - leased).toLocaleString("en-US")} />
        <StatPill label="Tenants" value={String(tenants)} />
        {campus.canSeeAr && <StatPill label="Past due" value={money0(pastDue)} />}
      </div>

      <div style={{ position: "relative", margin: "14px 20px 0" }} onMouseLeave={() => setHover(null)}>
        <img src={campus.src} alt="Neshaminy Interplex campus map" width={campus.width} height={campus.height}
          style={{ display: "block", width: "100%", height: "auto", borderRadius: 8, border: "1px solid var(--border)" }} />
        <svg viewBox={`0 0 ${campus.width} ${campus.height}`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} role="group" aria-label="Buildings">
          {campus.buildings.map((b) => {
            const band = occBand(b);
            const mine = b.fund === campus.fund;
            const hot = hover?.b.id === b.id;
            return (
              <g key={b.id} style={{ cursor: "pointer" }}
                onMouseMove={(e) => setHover({ b, x: e.clientX, y: e.clientY })}
                onClick={() => router.push(`/properties/${encodeURIComponent(b.code)}`)}
                tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") router.push(`/properties/${encodeURIComponent(b.code)}`); }}
                aria-label={`${b.name}, ${pct(occupancyOf(b))} leased`}>
                {b.pts.map((p, i) => (
                  <polygon key={i} points={p} fill={b.onRoll ? band.color : "#94a3b8"}
                    fillOpacity={hot ? 0.9 : mine ? 0.72 : 0.35}
                    stroke={hot ? "#0f172a" : mine ? "#0f172a" : "rgba(15,23,42,0.4)"} strokeWidth={hot ? 3 : mine ? 1.6 : 1} />
                ))}
                {b.onRoll && (
                  <text x={b.cx} y={b.cy + 20} textAnchor="middle" fontSize={12} fontWeight={800} fill="#0f172a"
                    stroke="#fff" strokeWidth={3} paintOrder="stroke" style={{ pointerEvents: "none" }}>
                    {Math.round(occupancyOf(b) * 100)}%
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {hover && <BuildingTip b={hover.b} x={hover.x} y={hover.y} campus={campus} />}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "12px 20px 16px" }}>
        {OCC_BANDS.filter((x) => present.has(x.key)).map((x) => (
          <span key={x.key} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "4px 10px", borderRadius: 999, border: "1px solid var(--border)", fontSize: 12, fontWeight: 600 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: x.color }} />{x.label}
          </span>
        ))}
        <span className="small muted" style={{ alignSelf: "center" }}>Lighter: the other fund&rsquo;s buildings</span>
      </div>
    </div>
  );
}

function BuildingTip({ b, x, y, campus }: { b: CampusBuildingFigures; x: number; y: number; campus: CampusView }) {
  const occ = occupancyOf(b);
  const rows: PlanTipRow[] = !b.onRoll ? [{ label: "Rent roll", value: "Not imported" }] : [
    { label: "Occupied", value: pct(occ), color: occBand(b).color, strong: true },
    { label: "Leased SF", value: `${b.leasedSf.toLocaleString()} of ${b.sf.toLocaleString()}` },
    { label: "Tenants", value: String(b.tenants) },
    { label: "Vacant suites", value: String(b.vacantSuites) },
    ...(b.walt != null ? [{ label: "WALT", value: `${b.walt.toFixed(1)} yr` }] : []),
    ...(campus.canSeeMoney && b.baseRentAnnual != null
      ? [{ label: "Base rent / yr", value: money0(b.baseRentAnnual), strong: true }, { label: "Avg rent $/SF", value: `$${(b.avgRentPsf ?? 0).toFixed(2)}/SF` }]
      : []),
  ];
  const footer = campus.canSeeAr && b.onRoll
    ? { label: "Past due", value: money0(b.pastDue ?? 0), color: (b.pastDue ?? 0) >= 1 ? "#b91c1c" : "#15803d" }
    : null;
  return (
    <PlanTip title={b.name} subtitle={`${b.fund ?? "Neshaminy Interplex"} · ${b.sf.toLocaleString()} SF`} rows={rows} footer={footer}
      accent={b.onRoll ? occBand(b).color : "#94a3b8"} x={x} y={y} />
  );
}
