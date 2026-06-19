"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import type { RentRollData, RentRollUnit } from "@/lib/rentroll/parseRentRollExcel";
import { amenityFor } from "@/lib/rentroll/amenities";
import { SectionLabel } from "@/app/properties/PropertyDetail";
import { Pill, TONE_NEUTRAL } from "@/app/components/Pill";

// Unit Info — a standalone top-level page for the PHYSICAL side of each unit:
// floorplans + suite specs (restrooms, kitchen, paint, flooring, HVAC) at a
// glance. Tenant/lease facts live on the Rent Roll; this is the building/space
// view. Pulls unit refs + sqft from /api/rentroll and the physical specs from
// /api/suites/summary, so the set always matches the latest rent-roll import.

type SuiteSummary = {
  floorplan: { url: string; name: string; contentType: string } | null;
  restrooms: string;
  kitchen: string;
  paint: string;
  hvac: string;
  flooring: string[];
  attachments: number;
};

function propName(code: string): string {
  const def = PROPERTY_DEFS.find((p) => p.id.toUpperCase() === code.toUpperCase());
  return def?.name ?? code;
}

function unitLabel(u: RentRollUnit): string {
  return (u.amenity ?? amenityFor(u.unitRef))?.label || u.occupantName || "Vacant";
}

const FROM = "?from=/units";

const th: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
  color: "var(--muted)", textAlign: "left", padding: "0 10px 7px",
};
const td: React.CSSProperties = {
  fontSize: 13, padding: "8px 10px", borderTop: "1px solid var(--border)", verticalAlign: "middle",
};
const muted: React.CSSProperties = { color: "var(--muted)" };

// Yes/No-style spec cell: green for Yes, muted for No / N/A / blank.
function specCell(v: string) {
  if (!v) return <span style={muted}>—</span>;
  const yes = v.toLowerCase() === "yes";
  return <span style={{ color: yes ? "#15803d" : "var(--muted)", fontWeight: yes ? 600 : 400 }}>{v}</span>;
}

export default function UnitInfoIndexPage() {
  const router = useRouter();
  const [data, setData] = useState<RentRollData | null>(null);
  const [specs, setSpecs] = useState<Record<string, SuiteSummary>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [onlyFloorplans, setOnlyFloorplans] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/rentroll")
      .then((r) => r.json())
      .then((j) => { if (alive) setData(j.rentroll ?? null); })
      .catch(() => { /* ignore */ })
      .finally(() => { if (alive) setLoading(false); });
    fetch("/api/suites/summary", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (alive) setSpecs(j.suites ?? {}); })
      .catch(() => { /* ignore */ });
    return () => { alive = false; };
  }, []);

  // Flat, searchable list of every unit with its property name, grouped back
  // into properties for display. Properties sorted by name, units by ref.
  const groups = useMemo(() => {
    if (!data) return [] as { code: string; name: string; units: RentRollUnit[] }[];
    const q = query.trim().toLowerCase();
    const out: { code: string; name: string; units: RentRollUnit[] }[] = [];
    for (const p of data.properties) {
      const name = propName(p.propertyCode);
      const units = p.units
        .filter((u) => {
          if (onlyFloorplans && !specs[u.unitRef]?.floorplan) return false;
          if (!q) return true;
          return (
            u.unitRef.toLowerCase().includes(q) ||
            u.occupantName.toLowerCase().includes(q) ||
            unitLabel(u).toLowerCase().includes(q) ||
            name.toLowerCase().includes(q) ||
            p.propertyCode.toLowerCase().includes(q)
          );
        })
        .slice()
        .sort((a, b) => a.unitRef.localeCompare(b.unitRef));
      if (units.length) out.push({ code: p.propertyCode, name, units });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [data, query, specs, onlyFloorplans]);

  const total = useMemo(() => groups.reduce((n, g) => n + g.units.length, 0), [groups]);
  const withPlans = useMemo(() => Object.values(specs).filter((s) => s.floorplan).length, [specs]);

  return (
    <main style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <header style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0 }}>Unit Info</h1>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
              Floorplans &amp; physical suite specs — tenant &amp; lease details live on the Rent Roll.
            </div>
          </div>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            {loading
              ? "Loading…"
              : `${total} unit${total === 1 ? "" : "s"} · ${groups.length} propert${groups.length === 1 ? "y" : "ies"}${withPlans ? ` · ${withPlans} with floorplan` : ""}`}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by tenant, unit, or property…"
            style={{
              flex: "1 1 280px", maxWidth: 420, padding: "8px 12px", fontSize: 14,
              borderRadius: 9, border: "1px solid var(--border)", background: "var(--card)",
              color: "var(--text)",
            }}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text)", cursor: "pointer", whiteSpace: "nowrap" }}>
            <input type="checkbox" checked={onlyFloorplans} onChange={(e) => setOnlyFloorplans(e.target.checked)} />
            Only units with a floorplan
          </label>
        </div>
      </header>

      {loading ? (
        <div className="card" style={{ fontSize: 13, color: "var(--muted)" }}>Loading units…</div>
      ) : !data ? (
        <div className="card" style={{ fontSize: 13, color: "var(--muted)" }}>
          No rent roll imported yet. Import one on the <a href="/rentroll" style={{ fontWeight: 600, color: "#0b4a7d" }}>Rent Roll</a> page.
        </div>
      ) : groups.length === 0 ? (
        <div className="card" style={{ fontSize: 13, color: "var(--muted)" }}>No units match your filters.</div>
      ) : (
        groups.map((g) => (
          <div className="card" key={g.code} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <SectionLabel>{g.name} · {g.code}</SectionLabel>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", minWidth: 720 }}>
                <colgroup>
                  <col style={{ width: 92 }} />
                  <col />
                  <col style={{ width: 70 }} />
                  <col style={{ width: 110 }} />
                  <col style={{ width: 90 }} />
                  <col style={{ width: 80 }} />
                  <col style={{ width: 80 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={th}>Unit</th>
                    <th style={th}>Occupant</th>
                    <th style={{ ...th, textAlign: "right" }}>SF</th>
                    <th style={th}>Floorplan</th>
                    <th style={th}>Restrooms</th>
                    <th style={th}>Kitchen</th>
                    <th style={th}>Paint</th>
                  </tr>
                </thead>
                <tbody>
                  {g.units.map((u) => {
                    const s = specs[u.unitRef];
                    const fp = s?.floorplan;
                    const isImg = fp?.contentType?.startsWith("image/");
                    return (
                      <tr
                        key={u.unitRef}
                        onClick={() => router.push(`/units/${encodeURIComponent(u.unitRef)}${FROM}`)}
                        style={{ cursor: "pointer" }}
                      >
                        <td style={td}>
                          <code style={{ fontSize: 12, color: "var(--muted)" }}>{u.unitRef}</code>
                        </td>
                        <td style={{ ...td, overflow: "hidden" }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                            <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {unitLabel(u)}
                            </span>
                            {u.isVacant && <Pill tone={TONE_NEUTRAL}>Vacant</Pill>}
                          </span>
                        </td>
                        <td style={{ ...td, textAlign: "right", ...muted, whiteSpace: "nowrap" }}>
                          {u.sqft.toLocaleString("en-US")}
                        </td>
                        <td style={td} onClick={(e) => e.stopPropagation()}>
                          {fp ? (
                            <a
                              href={fp.url}
                              target="_blank"
                              rel="noreferrer"
                              title={fp.name}
                              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "#0b4a7d", textDecoration: "none" }}
                            >
                              {isImg ? (
                                <img
                                  src={fp.url}
                                  alt=""
                                  loading="lazy"
                                  style={{ width: 34, height: 26, objectFit: "cover", borderRadius: 4, border: "1px solid var(--border)" }}
                                />
                              ) : "📄"}
                              View
                            </a>
                          ) : (
                            <span style={muted}>—</span>
                          )}
                        </td>
                        <td style={td}>{specCell(s?.restrooms ?? "")}</td>
                        <td style={td}>{specCell(s?.kitchen ?? "")}</td>
                        <td style={td}>{s?.paint ? <span>{s.paint}</span> : <span style={muted}>—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </main>
  );
}
