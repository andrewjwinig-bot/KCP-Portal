"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import type { RentRollData, RentRollUnit } from "@/lib/rentroll/parseRentRollExcel";
import { amenityFor } from "@/lib/rentroll/amenities";
import { SectionLabel } from "@/app/properties/PropertyDetail";
import { Pill, TONE_NEUTRAL } from "@/app/components/Pill";

// Unit Info — a standalone top-level page (its own sidebar section, not a
// Rent Roll subpage). Search across every property and jump straight to any
// unit page. Reuses the same /api/rentroll data the Rent Roll loads, plus a
// floorplan index from /api/suites/floorplans, so the set always matches the
// latest import.

type Floorplan = { url: string; name: string; contentType: string };

function propName(code: string): string {
  const def = PROPERTY_DEFS.find((p) => p.id.toUpperCase() === code.toUpperCase());
  return def?.name ?? code;
}

function unitLabel(u: RentRollUnit): string {
  return (u.amenity ?? amenityFor(u.unitRef))?.label || u.occupantName || "Vacant";
}

function parseRentDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
}

// Lease expiration cell: short date colored by proximity (red expired / ≤30d,
// amber ≤90d, otherwise default).
function leaseExp(leaseTo: string | null | undefined): { label: string; color: string } {
  const d = parseRentDate(leaseTo);
  if (!d) return { label: "—", color: "var(--muted)" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.ceil((d.getTime() - today.getTime()) / 86400000);
  const label = `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
  if (days < 0 || days <= 30) return { label, color: "#dc2626" };
  if (days <= 90) return { label, color: "#d97706" };
  return { label, color: "var(--text)" };
}

const FROM = "?from=/units";

const th: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
  color: "var(--muted)", textAlign: "left", padding: "0 10px 7px",
};
const td: React.CSSProperties = {
  fontSize: 13, padding: "8px 10px", borderTop: "1px solid var(--border)", verticalAlign: "middle",
};

export default function UnitInfoIndexPage() {
  const router = useRouter();
  const [data, setData] = useState<RentRollData | null>(null);
  const [floorplans, setFloorplans] = useState<Record<string, Floorplan>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/rentroll")
      .then((r) => r.json())
      .then((j) => { if (alive) setData(j.rentroll ?? null); })
      .catch(() => { /* ignore */ })
      .finally(() => { if (alive) setLoading(false); });
    fetch("/api/suites/floorplans", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (alive) setFloorplans(j.floorplans ?? {}); })
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
  }, [data, query]);

  const total = useMemo(() => groups.reduce((n, g) => n + g.units.length, 0), [groups]);
  const withPlans = useMemo(() => Object.keys(floorplans).length, [floorplans]);

  return (
    <main style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <header style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Unit Info</h1>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            {loading
              ? "Loading…"
              : `${total} unit${total === 1 ? "" : "s"} · ${groups.length} propert${groups.length === 1 ? "y" : "ies"}${withPlans ? ` · ${withPlans} with floorplan` : ""}`}
          </span>
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by tenant, unit, or property…"
          style={{
            width: "100%", maxWidth: 420, padding: "8px 12px", fontSize: 14,
            borderRadius: 9, border: "1px solid var(--border)", background: "var(--card)",
            color: "var(--text)",
          }}
        />
      </header>

      {loading ? (
        <div className="card" style={{ fontSize: 13, color: "var(--muted)" }}>Loading units…</div>
      ) : !data ? (
        <div className="card" style={{ fontSize: 13, color: "var(--muted)" }}>
          No rent roll imported yet. Import one on the <a href="/rentroll" style={{ fontWeight: 600, color: "#0b4a7d" }}>Rent Roll</a> page.
        </div>
      ) : groups.length === 0 ? (
        <div className="card" style={{ fontSize: 13, color: "var(--muted)" }}>No units match “{query}”.</div>
      ) : (
        groups.map((g) => (
          <div className="card" key={g.code} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <SectionLabel>{g.name} · {g.code}</SectionLabel>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "13%" }} />
                <col />
                <col style={{ width: "11%" }} />
                <col style={{ width: "13%" }} />
                <col style={{ width: "16%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={th}>Unit</th>
                  <th style={th}>Tenant</th>
                  <th style={{ ...th, textAlign: "right" }}>SF</th>
                  <th style={{ ...th, textAlign: "right" }}>Lease Exp</th>
                  <th style={th}>Floorplan</th>
                </tr>
              </thead>
              <tbody>
                {g.units.map((u) => {
                  const fp = floorplans[u.unitRef];
                  const exp = leaseExp(u.leaseTo);
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
                      <td style={{ ...td, textAlign: "right", color: "var(--muted)", whiteSpace: "nowrap" }}>
                        {u.sqft.toLocaleString("en-US")}
                      </td>
                      <td style={{ ...td, textAlign: "right", color: exp.color, whiteSpace: "nowrap", fontWeight: exp.color === "var(--text)" ? 400 : 700 }}>
                        {exp.label}
                      </td>
                      <td style={td} onClick={(e) => e.stopPropagation()}>
                        {fp ? (
                          <a
                            href={fp.url}
                            target="_blank"
                            rel="noreferrer"
                            style={{ fontSize: 12, fontWeight: 600, color: "#0b4a7d", textDecoration: "none" }}
                          >
                            📄 View
                          </a>
                        ) : (
                          <span style={{ color: "var(--muted)" }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))
      )}
    </main>
  );
}
