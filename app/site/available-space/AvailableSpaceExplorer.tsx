"use client";

// Find a space (owner, 11/2026: "more complex features like sort and filter by
// various metrics to be more useful to prospective tenants"). Every listing on
// the page — all live off the portal's current rent roll — narrowed by type,
// property, size and a text search, and sorted by property or by size. The
// filters ride in the URL (?type=office&size=1000-2500…) so a link can be sent
// to a prospect. Styles: the `.as-*` rules at the end of site.css. The table below is the site's own ListingsTable.

import { useEffect, useMemo, useState } from "react";
import ListingsTable, { type ListingWithProperty } from "../_property/ListingsTable";

export type ExplorerListing = ListingWithProperty & { category: string; city: string | null };

const SIZES: { id: string; label: string; min: number; max: number }[] = [
  { id: "any", label: "Any size", min: 0, max: Infinity },
  { id: "0-1000", label: "Under 1,000 SF", min: 0, max: 999 },
  { id: "1000-2500", label: "1,000 – 2,500 SF", min: 1000, max: 2500 },
  { id: "2500-5000", label: "2,500 – 5,000 SF", min: 2500, max: 5000 },
  { id: "5000-10000", label: "5,000 – 10,000 SF", min: 5000, max: 10000 },
  { id: "10000-", label: "10,000 SF +", min: 10000, max: Infinity },
];
const SORTS = [
  { id: "property", label: "Property (A–Z)" },
  { id: "size-asc", label: "Size: smallest first" },
  { id: "size-desc", label: "Size: largest first" },
] as const;
type Sort = (typeof SORTS)[number]["id"];
const TYPES = [{ id: "all", label: "All" }, { id: "office", label: "Office" }, { id: "retail", label: "Retail" }];

const sizeOf = (l: ExplorerListing) => (typeof l.size === "number" ? l.size : typeof l.maxSize === "number" ? l.maxSize : 0);
const fits = (l: ExplorerListing, min: number, max: number) => {
  const lo = typeof l.minSize === "number" ? l.minSize : sizeOf(l);
  const hi = typeof l.maxSize === "number" ? l.maxSize : sizeOf(l);
  return hi >= min && lo <= max;
};


export default function AvailableSpaceExplorer({ listings }: { listings: ExplorerListing[] }) {
  const [type, setType] = useState("all");
  const [property, setProperty] = useState("all");
  const [size, setSize] = useState("any");
  const [sort, setSort] = useState<Sort>("property");
  const [q, setQ] = useState("");

  // Filters from / to the URL, so a filtered view can be shared.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("type")) setType(p.get("type")!);
    if (p.get("property")) setProperty(p.get("property")!);
    if (p.get("size") && SIZES.some((s) => s.id === p.get("size"))) setSize(p.get("size")!);
    if (SORTS.some((s) => s.id === p.get("sort"))) setSort(p.get("sort") as Sort);
    if (p.get("q")) setQ(p.get("q")!);
  }, []);
  useEffect(() => {
    const p = new URLSearchParams();
    if (type !== "all") p.set("type", type);
    if (property !== "all") p.set("property", property);
    if (size !== "any") p.set("size", size);
    if (sort !== "property") p.set("sort", sort);
    if (q.trim()) p.set("q", q.trim());
    const qs = p.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [type, property, size, sort, q]);

  const properties = useMemo(() => {
    const m = new Map<string, { name: string; category: string }>();
    for (const l of listings) m.set(l.property, { name: l.propertyName, category: l.category });
    return [...m].sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [listings]);

  const shown = useMemo(() => {
    const band = SIZES.find((s) => s.id === size) ?? SIZES[0];
    const needle = q.trim().toLowerCase();
    const list = listings.filter((l) =>
      (type === "all" || l.category === type)
      && (property === "all" || l.property === property)
      && fits(l, band.min, band.max)
      && (!needle || [l.space, l.propertyName, l.spaceUse, l.city, ...(l.details ?? []).map((d) => d.text)].some((t) => (t ?? "").toLowerCase().includes(needle))));
    const bySize = (a: ExplorerListing, b: ExplorerListing) => sizeOf(a) - sizeOf(b);
    if (sort === "property") return [...list].sort((a, b) => a.propertyName.localeCompare(b.propertyName) || bySize(a, b));
    const sorted = [...list].sort(sort === "size-asc" ? bySize : (a, b) => bySize(b, a));
    // Sorted by size, one table across every property — the property leads each space.
    return sorted.map((l) => ({ ...l, space: `${l.propertyName} · ${l.space}`, propertyName: "" }));
  }, [listings, type, property, size, sort, q]);

  const totalSf = shown.reduce((s, l) => s + sizeOf(l), 0);
  const propCount = new Set(shown.map((l) => l.property)).size;
  const filtered = type !== "all" || property !== "all" || size !== "any" || q.trim() !== "";
  const reset = () => { setType("all"); setProperty("all"); setSize("any"); setQ(""); setSort("property"); };

  return (
    <div className="w-full">
      <div className="as-panel">
        <div className="as-chips" role="tablist" aria-label="Property type">
          {TYPES.map((t) => {
            const on = type === t.id;
            return (
              <button key={t.id} type="button" role="tab" aria-selected={on}
                onClick={() => { setType(t.id); setProperty("all"); }}
                className={`as-chip${on ? " on" : ""}`}>
                {t.label}
              </button>
            );
          })}
        </div>
        <div className="as-fields">
          <label>
            <span className="as-label">Search</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Suite, building, use…" className="as-control" />
          </label>
          <label>
            <span className="as-label">Property</span>
            <select value={property} onChange={(e) => setProperty(e.target.value)} className="as-control">
              <option value="all">All properties</option>
              {properties.filter(([, p]) => type === "all" || p.category === type).map(([slug, p]) => <option key={slug} value={slug}>{p.name}</option>)}
            </select>
          </label>
          <label>
            <span className="as-label">Size</span>
            <select value={size} onChange={(e) => setSize(e.target.value)} className="as-control">
              {SIZES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
          <label>
            <span className="as-label">Sort by</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="as-control">
              {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
        </div>
        <div className="as-summary">
          <p className="text-slate-600" aria-live="polite">
            <strong className="text-slate-800">{shown.length}</strong> {shown.length === 1 ? "space" : "spaces"}
            {shown.length > 0 && <> · {totalSf.toLocaleString("en-US")} SF across {propCount} {propCount === 1 ? "property" : "properties"}</>}
          </p>
          {filtered && <button type="button" onClick={reset} className="as-link text-slate-600">Clear filters</button>}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="as-empty text-slate-600">
          No space matches these filters right now. <button type="button" onClick={reset} className="as-link">Show everything available</button>
        </div>
      ) : (
        <ListingsTable listings={shown} hidePropertyHeaders={sort !== "property"} />
      )}
    </div>
  );
}
