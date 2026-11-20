"use client";

import { useEffect } from "react";
import { sitePath } from "@/lib/site/paths";
import { sizeText, spacePath, type SpaceListing } from "@/lib/site/spaces";
import { isPlan } from "../_property/ListingsTable";
import { useCompare } from "../_property/compare";
import { X } from "../_components/icons";

type Row = [string, (l: SpaceListing) => string | null | undefined];
const ROWS: Row[] = [
  ["Property", (l) => l.propertyName],
  ["Town", (l) => l.city],
  ["Type", (l) => (l.category === "office" ? "Office" : l.category === "retail" ? "Retail" : null)],
  ["Size", (l) => sizeText(l)],
  ["Rental rate", (l) => l.rentalRate],
  ["Rent type", (l) => l.rentType],
  ["Term", (l) => l.term],
  ["Use", (l) => l.spaceUse],
  ["Condition", (l) => l.condition],
  ["Available", (l) => l.available],
  ["Leasing contact", (l) => [l.contactName, l.contactPhone].filter(Boolean).join(" · ")],
];

export default function CompareView({ found }: { found: { slug: string; l: SpaceListing | null }[] }) {
  const c = useCompare();
  // The URL is the comparison: make the visitor's shortlist match it.
  useEffect(() => {
    const live = found.filter((f) => f.l).map((f) => ({ slug: f.slug, label: `${f.l!.space} · ${f.l!.propertyName}` }));
    if (live.length && live.map((p) => p.slug).join() !== c.list.map((p) => p.slug).join()) {
      try { localStorage.setItem("kcs:compare", JSON.stringify(live)); window.dispatchEvent(new Event("kcs:compare")); } catch { /* */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const live = found.filter((f) => f.l) as { slug: string; l: SpaceListing }[];
  const gone = found.length - live.length;
  const remove = (slug: string) => {
    c.remove(slug);
    const rest = found.filter((f) => f.slug !== slug && f.l).map((f) => f.slug);
    window.location.href = rest.length ? `${sitePath("/compare")}?spaces=${rest.join(",")}` : sitePath("/available-space");
  };

  if (!live.length) {
    return (
      <div className="container mx-auto px-4 py-12 text-slate-700">
        Nothing to compare yet. Choose <strong>Compare</strong> on two or three spaces in{" "}
        <a href={sitePath("/available-space")} className="as-link">Available Space</a>.
      </div>
    );
  }
  return (
    <div className="container mx-auto px-4 py-10">
      {gone > 0 && <p className="text-slate-600 mb-4">{gone === 1 ? "One space" : `${gone} spaces`} you picked {gone === 1 ? "has" : "have"} since been leased.</p>}
      <div className="overflow-x-auto">
        <table className="cmp-table">
          <thead>
            <tr>
              <th className="cmp-label" />
              {live.map(({ slug, l }) => {
                const pic = l.images?.[0];
                return (
                  <th key={slug}>
                    <div className="cmp-img">{pic && <img src={pic.url} alt="" className={isPlan(pic.url) ? "contain" : "cover"} />}</div>
                    <div className="cmp-title">{l.space}</div>
                    <div className="cmp-actions">
                      <a href={spacePath(l)} className="as-contact-btn primary">View space</a>
                      <button type="button" className="cmp-remove" onClick={() => remove(slug)} aria-label={`Remove ${l.space}`}><X className="h-4 w-4" /> Remove</button>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([label, get]) => (
              <tr key={label}>
                <td className="cmp-label">{label}</td>
                {live.map(({ slug, l }) => <td key={slug}>{get(l) || "—"}</td>)}
              </tr>
            ))}
            {live.some(({ l }) => (l.details ?? []).length) && <tr>
              <td className="cmp-label">Details</td>
              {live.map(({ slug, l }) => (
                <td key={slug}><ul className="cmp-details">{(l.details ?? []).slice(0, 5).map((d, k) => <li key={k}>{d.text}</li>)}</ul></td>
              ))}
            </tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
