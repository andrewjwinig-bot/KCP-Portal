"use client";

// COMPARE UP TO THREE SPACES (owner, 11/2026). The picks live in this browser
// (localStorage, `kcs:compare`) — a visitor's own shortlist, nothing stored on
// our side — and every "Compare" toggle and the bar stay in step through one
// event. The bar sits at the bottom of the screen while anything is picked and
// opens /site/compare with the picks in the URL, so a comparison can be sent.

import { useEffect, useState } from "react";
import { COMPARE_MAX, comparePath } from "@/lib/site/spaces";
import { Check, Plus, X } from "../_components/icons";

export type ComparePick = { slug: string; label: string };
const KEY = "kcs:compare";
const EVENT = "kcs:compare";

function read(): ComparePick[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => x && typeof x.slug === "string").slice(0, COMPARE_MAX) : [];
  } catch {
    return [];
  }
}
function write(list: ComparePick[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* private window */ }
  window.dispatchEvent(new Event(EVENT));
}

export function useCompare() {
  const [list, setList] = useState<ComparePick[]>([]);
  useEffect(() => {
    const sync = () => setList(read());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener("storage", sync); };
  }, []);
  const has = (slug: string) => list.some((p) => p.slug === slug);
  return {
    list,
    has,
    full: list.length >= COMPARE_MAX,
    toggle: (p: ComparePick) => write(has(p.slug) ? list.filter((x) => x.slug !== p.slug) : [...list, p].slice(0, COMPARE_MAX)),
    remove: (slug: string) => write(list.filter((x) => x.slug !== slug)),
    clear: () => write([]),
  };
}

/** "Compare" on a space: adds it to the shortlist, or takes it off. */
export function CompareToggle({ slug, label, className = "" }: { slug: string; label: string; className?: string }) {
  const c = useCompare();
  const on = c.has(slug);
  const disabled = !on && c.full;
  return (
    <button type="button" disabled={disabled} aria-pressed={on}
      onClick={(e) => { e.stopPropagation(); c.toggle({ slug, label }); }}
      title={disabled ? `Compare holds ${COMPARE_MAX} spaces — remove one first` : undefined}
      className={`as-compare-toggle${on ? " on" : ""} ${className}`}>
      {on ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
      {on ? "Added to compare" : "Compare"}
    </button>
  );
}

/** The shortlist, pinned to the bottom while anything is on it. */
export function CompareBar() {
  const c = useCompare();
  const [onCompare, setOnCompare] = useState(false);
  useEffect(() => setOnCompare(/\/compare\/?$/.test(window.location.pathname)), []);
  if (!c.list.length || onCompare) return null;
  return (
    <>
    {/* Room at the bottom so the bar never covers the footer's last line. */}
    <div aria-hidden="true" style={{ height: 72 }} />
    <div className="as-compare-bar" role="region" aria-label="Spaces to compare">
      <div className="as-compare-inner">
        <span className="as-compare-count">Compare {c.list.length} of {COMPARE_MAX}</span>
        <div className="as-compare-picks">
          {c.list.map((p) => (
            <span key={p.slug} className="as-compare-pick">
              {p.label}
              <button type="button" aria-label={`Remove ${p.label}`} onClick={() => c.remove(p.slug)}><X className="h-4 w-4" /></button>
            </span>
          ))}
        </div>
        <div className="as-compare-actions">
          <button type="button" className="as-link" onClick={c.clear}>Clear</button>
          {c.list.length >= 2
            ? <a href={comparePath(c.list.map((p) => p.slug))} className="as-contact-btn primary">Compare spaces</a>
            : <span className="as-compare-hint">Add one more to compare</span>}
        </div>
      </div>
    </div>
    </>
  );
}
