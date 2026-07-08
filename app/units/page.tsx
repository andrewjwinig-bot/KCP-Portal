"use client";
import LoadingState from "@/app/components/LoadingState";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import type { RentRollData, RentRollUnit } from "@/lib/rentroll/parseRentRollExcel";
import { amenityFor } from "@/lib/rentroll/amenities";
import { SectionLabel } from "@/app/properties/PropertyDetail";
import { Pill, TONE_NEUTRAL } from "@/app/components/Pill";
import { blobSrc } from "@/lib/blobProxy";

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

// Portfolio categories — mirror the Rent Roll's grouping (4900 = The Office
// Works is split out of Office), and keep the same order + accent colors.
type Cat = "Office" | "Retail" | "Residential" | "The Office Works" | "Other";
const CAT_ORDER: Cat[] = ["Office", "Retail", "Residential", "The Office Works", "Other"];
const CAT_COLOR: Record<Cat, string> = {
  Office: "#0b4a7d",
  Retail: "#0d9488",
  Residential: "#6d28d9",
  "The Office Works": "#475569",
  Other: "#94a3b8",
};
function categoryOf(code: string): Cat {
  const c = code.toUpperCase();
  if (c === "4900") return "The Office Works";
  const def = PROPERTY_DEFS.find((p) => p.id.toUpperCase() === c);
  if (def?.type === "Office") return "Office";
  if (def?.type === "Retail") return "Retail";
  if (def?.type === "Residential") return "Residential";
  return "Other";
}

const FROM = "?from=/units";
const COLS_KEY = "unit-info-columns";

const th: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
  color: "var(--muted)", textAlign: "left", padding: "0 10px 7px",
};
const td: React.CSSProperties = {
  fontSize: 13, padding: "8px 10px", borderTop: "1px solid var(--border)", verticalAlign: "middle",
};
const muted: React.CSSProperties = { color: "var(--muted)" };
const catHeading: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 10, marginTop: 6,
  fontSize: 15, fontWeight: 800, color: "var(--text)",
};

// Yes/No-style spec cell: green for Yes, muted for No / N/A / blank.
function specCell(v: string) {
  if (!v) return <span style={muted}>—</span>;
  const yes = v.toLowerCase() === "yes";
  return <span style={{ color: yes ? "#15803d" : "var(--muted)", fontWeight: yes ? 600 : 400 }}>{v}</span>;
}

// Optional, user-selectable columns (Unit + Occupant are always shown).
type ColKey = "sf" | "floorplan" | "restrooms" | "kitchen" | "paint" | "hvac" | "flooring" | "attachments";
type ColDef = { key: ColKey; label: string; width: number; align?: "right"; def: boolean };
const COLUMNS: ColDef[] = [
  { key: "sf",          label: "SF",         width: 70,  align: "right", def: true },
  { key: "floorplan",   label: "Floorplan",  width: 110,                 def: true },
  { key: "restrooms",   label: "Restrooms",  width: 90,                  def: true },
  { key: "kitchen",     label: "Kitchen",    width: 80,                  def: true },
  { key: "paint",       label: "Paint",      width: 80,                  def: true },
  { key: "hvac",        label: "HVAC",       width: 150,                 def: false },
  { key: "flooring",    label: "Flooring",   width: 150,                 def: false },
  { key: "attachments", label: "Files",      width: 60,  align: "right", def: false },
];

export default function UnitInfoIndexPage() {
  const router = useRouter();
  const [data, setData] = useState<RentRollData | null>(null);
  const [specs, setSpecs] = useState<Record<string, SuiteSummary>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [vacantOnly, setVacantOnly] = useState(false);
  const [cols, setCols] = useState<Set<ColKey>>(() => new Set(COLUMNS.filter((c) => c.def).map((c) => c.key)));
  const [colMenu, setColMenu] = useState(false);

  // Restore + persist the chosen columns.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(COLS_KEY);
      if (saved) {
        const keys = JSON.parse(saved) as string[];
        const valid = keys.filter((k): k is ColKey => COLUMNS.some((c) => c.key === k));
        setCols(new Set(valid));
      }
    } catch { /* ignore */ }
  }, []);
  function toggleCol(key: ColKey) {
    setCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      try { localStorage.setItem(COLS_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }

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

  const visibleCols = useMemo(() => COLUMNS.filter((c) => cols.has(c.key)), [cols]);

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
          if (vacantOnly && !u.isVacant) return false;
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
  }, [data, query, vacantOnly]);

  // Bucket the property groups into portfolio categories, in canonical order.
  const byCategory = useMemo(() => {
    const map = new Map<Cat, typeof groups>();
    for (const g of groups) {
      const cat = categoryOf(g.code);
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(g);
    }
    return CAT_ORDER.filter((c) => map.has(c)).map((c) => ({
      cat: c,
      groups: map.get(c)!,
      units: map.get(c)!.reduce((n, g) => n + g.units.length, 0),
    }));
  }, [groups]);

  const total = useMemo(() => groups.reduce((n, g) => n + g.units.length, 0), [groups]);
  const withPlans = useMemo(() => Object.values(specs).filter((s) => s.floorplan).length, [specs]);

  function renderCell(c: ColDef, u: RentRollUnit, s: SuiteSummary | undefined) {
    switch (c.key) {
      case "sf":
        return <td style={{ ...td, textAlign: "right", ...muted, whiteSpace: "nowrap" }}>{u.sqft.toLocaleString("en-US")}</td>;
      case "floorplan": {
        const fp = s?.floorplan;
        const isImg = fp?.contentType?.startsWith("image/");
        return (
          <td style={td} onClick={(e) => e.stopPropagation()}>
            {fp ? (
              <a href={blobSrc(fp.url)} target="_blank" rel="noreferrer" title={fp.name}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "#0b4a7d", textDecoration: "none" }}>
                {isImg ? (
                  <img src={blobSrc(fp.url)} alt="" loading="lazy"
                    style={{ width: 34, height: 26, objectFit: "cover", borderRadius: 4, border: "1px solid var(--border)" }} />
                ) : "📄"}
                View
              </a>
            ) : <span style={muted}>—</span>}
          </td>
        );
      }
      case "restrooms": return <td style={td}>{specCell(s?.restrooms ?? "")}</td>;
      case "kitchen":   return <td style={td}>{specCell(s?.kitchen ?? "")}</td>;
      case "paint":     return <td style={td}>{s?.paint ? <span>{s.paint}</span> : <span style={muted}>—</span>}</td>;
      case "hvac":      return <td style={{ ...td, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={s?.hvac || undefined}>{s?.hvac ? s.hvac : <span style={muted}>—</span>}</td>;
      case "flooring":  return <td style={{ ...td, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s?.flooring?.length ? s.flooring.join(", ") : <span style={muted}>—</span>}</td>;
      case "attachments": return <td style={{ ...td, textAlign: "right", ...muted }}>{s?.attachments ? s.attachments : <span style={muted}>—</span>}</td>;
    }
  }

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
              : `${total} unit${total === 1 ? "" : "s"} · ${byCategory.reduce((n, c) => n + c.groups.length, 0)} propert${byCategory.reduce((n, c) => n + c.groups.length, 0) === 1 ? "y" : "ies"}${withPlans ? ` · ${withPlans} with floorplan` : ""}`}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by tenant, unit, or property…"
            style={{
              flex: "1 1 260px", maxWidth: 420, padding: "8px 12px", fontSize: 14,
              borderRadius: 9, border: "1px solid var(--border)", background: "var(--card)",
              color: "var(--text)",
            }}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text)", cursor: "pointer", whiteSpace: "nowrap" }}>
            <input type="checkbox" checked={vacantOnly} onChange={(e) => setVacantOnly(e.target.checked)} />
            Vacant only
          </label>
          <div style={{ position: "relative" }}>
            <button
              type="button"
              className="btn"
              onClick={() => setColMenu((v) => !v)}
              style={{ fontSize: 13, padding: "7px 12px", fontWeight: 600 }}
            >
              Columns ▾
            </button>
            {colMenu && (
              <>
                <div onClick={() => setColMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 20 }} />
                <div style={{
                  position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 21,
                  background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10,
                  padding: "8px 6px", minWidth: 180, boxShadow: "0 8px 24px rgba(15,23,42,0.16)",
                }}>
                  {COLUMNS.map((c) => (
                    <label key={c.key} style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "6px 10px",
                      fontSize: 13, cursor: "pointer", borderRadius: 6, whiteSpace: "nowrap",
                    }}>
                      <input type="checkbox" checked={cols.has(c.key)} onChange={() => toggleCol(c.key)} />
                      {c.label}
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {loading ? (
        <LoadingState status="Loading units…" rows={5} />
      ) : !data ? (
        <div className="card" style={{ fontSize: 13, color: "var(--muted)" }}>
          No rent roll imported yet. Import one on the <a href="/rentroll" style={{ fontWeight: 600, color: "#0b4a7d" }}>Rent Roll</a> page.
        </div>
      ) : byCategory.length === 0 ? (
        <div className="card" style={{ fontSize: 13, color: "var(--muted)" }}>No units match your filters.</div>
      ) : (
        byCategory.map(({ cat, groups: catGroups, units }) => (
          <Fragment key={cat}>
            <div style={catHeading}>
              <span style={{ width: 9, height: 9, borderRadius: 999, background: CAT_COLOR[cat], display: "inline-block" }} />
              {cat}
              <span style={{ fontWeight: 600, color: "var(--muted)", fontSize: 12 }}>
                {units} unit{units === 1 ? "" : "s"} · {catGroups.length} propert{catGroups.length === 1 ? "y" : "ies"}
              </span>
            </div>
            {catGroups.map((g) => (
              <div className="card" key={g.code} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <SectionLabel>{g.name} · {g.code}</SectionLabel>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", minWidth: 380 + visibleCols.length * 90 }}>
                    <colgroup>
                      <col style={{ width: 92 }} />
                      <col />
                      {visibleCols.map((c) => <col key={c.key} style={{ width: c.width }} />)}
                    </colgroup>
                    <thead>
                      <tr>
                        <th style={th}>Unit</th>
                        <th style={th}>Occupant</th>
                        {visibleCols.map((c) => (
                          <th key={c.key} style={c.align === "right" ? { ...th, textAlign: "right" } : th}>{c.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {g.units.map((u) => {
                        const s = specs[u.unitRef];
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
                            {visibleCols.map((c) => <Fragment key={c.key}>{renderCell(c, u, s)}</Fragment>)}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </Fragment>
        ))
      )}
    </main>
  );
}
