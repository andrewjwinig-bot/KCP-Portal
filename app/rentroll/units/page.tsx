"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PROPERTY_DEFS } from "../../../lib/properties/data";
import type { RentRollData, RentRollUnit } from "../../../lib/rentroll/parseRentRollExcel";
import { amenityFor } from "../../../lib/rentroll/amenities";
import { SectionLabel } from "../../properties/PropertyDetail";
import { Pill, TONE_NEUTRAL } from "../../components/Pill";

// Unit Info index — a single landing where you can search across every
// property and jump straight to any unit page, instead of bouncing back
// through the Rent Roll. Reuses the same /api/rentroll data the Rent Roll
// itself loads, so the unit set always matches the latest import.

function propName(code: string): string {
  const def = PROPERTY_DEFS.find((p) => p.id.toUpperCase() === code.toUpperCase());
  return def?.name ?? code;
}

function unitLabel(u: RentRollUnit): string {
  return (u.amenity ?? amenityFor(u.unitRef))?.label || u.occupantName || "Vacant";
}

const FROM = "?from=/rentroll/units";

export default function UnitInfoIndexPage() {
  const [data, setData] = useState<RentRollData | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/rentroll")
      .then((r) => r.json())
      .then((j) => { if (alive) setData(j.rentroll ?? null); })
      .catch(() => { /* ignore */ })
      .finally(() => { if (alive) setLoading(false); });
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

  const backStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, color: "var(--muted)", textDecoration: "none", width: "fit-content",
  };

  return (
    <main style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <header style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Link href="/rentroll" style={backStyle}>← Rent roll</Link>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Unit Info</h1>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            {loading ? "Loading…" : `${total} unit${total === 1 ? "" : "s"} · ${groups.length} propert${groups.length === 1 ? "y" : "ies"}`}
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
          No rent roll imported yet. Import one on the <Link href="/rentroll" style={{ fontWeight: 600, color: "#0b4a7d" }}>Rent Roll</Link> page.
        </div>
      ) : groups.length === 0 ? (
        <div className="card" style={{ fontSize: 13, color: "var(--muted)" }}>No units match “{query}”.</div>
      ) : (
        groups.map((g) => (
          <div className="card" key={g.code} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <SectionLabel>{g.name} · {g.code}</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {g.units.map((u) => (
                <Link
                  key={u.unitRef}
                  href={`/rentroll/units/${encodeURIComponent(u.unitRef)}${FROM}`}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                    padding: "8px 4px", borderTop: "1px solid var(--border)", textDecoration: "none",
                    color: "var(--text)",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <code style={{ fontSize: 12, color: "var(--muted)", flexShrink: 0 }}>{u.unitRef}</code>
                    <span style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {unitLabel(u)}
                    </span>
                    {u.isVacant && <Pill tone={TONE_NEUTRAL}>Vacant</Pill>}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>{u.sqft.toLocaleString("en-US")} sf</span>
                    <span style={{ fontSize: 13, color: "var(--muted)" }}>›</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ))
      )}
    </main>
  );
}
