"use client";

// What is still outstanding on this budget, always visible while you work it.
//
// Sticky at the bottom rather than in a card, because the question it answers
// — "what is holding this up" — is the one being asked continuously in a room
// with four people in it, not once when the page loads.
//
// It is ordered WORST FIRST: whoever has the most open parts leads. The bar is
// not a scoreboard of who has done the most; it exists to point at what is in
// the way.

import { useCallback, useEffect, useState } from "react";
import { Pill, TONE_GREEN, TONE_AMBER, TONE_NEUTRAL } from "@/app/components/Pill";
import { HoverCard } from "@/app/components/HoverCard";
import { CONTRIBUTION_LABEL } from "@/lib/financials/budgets/contributors";
import { overallProgress, ownerProgress, kindProgress } from "@/lib/financials/budgets/deriveContributions";
import type { Contribution } from "@/lib/financials/budgets/contributors";

const secLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" };
const NAME: Record<string, string> = { harry: "Harry", nancy: "Nancy", greg: "Greg", drew: "Drew", admin: "Admin" };

export function BudgetProgressBar({ year, category, refreshTick }: {
  year: number; category: string; refreshTick?: number;
}) {
  const [items, setItems] = useState<Contribution[] | null>(null);
  const [hasSchedule, setHasSchedule] = useState(true);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/financials/budgets/progress?year=${year}&category=${encodeURIComponent(category)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { setItems(j.contributions ?? []); setHasSchedule(j.hasSchedule !== false); })
      .catch(() => setItems(null));
  }, [year, category]);

  useEffect(() => { load(); }, [load, refreshTick]);

  if (!items || items.length === 0) return null;

  const all = overallProgress(items);
  const owners = ownerProgress(items);
  const kinds = kindProgress(items);
  const done = all.done === all.total;

  return (
    <div style={{
      position: "sticky", bottom: 0, zIndex: 20, marginTop: 16,
      background: "var(--card)", borderTop: "2px solid var(--border)",
      boxShadow: "0 -6px 20px rgba(15,23,42,0.08)",
      padding: "10px 14px", borderRadius: "10px 10px 0 0",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ minWidth: 190 }}>
          <div style={secLabel}>{year} budget · outstanding</div>
          <div style={{ fontSize: 18, fontWeight: 900, marginTop: 1 }}>
            {done ? "Every part is in" : `${all.total - all.done} of ${all.total} still open`}
          </div>
        </div>

        {/* The bar. One track, filled by what is done. */}
        <div style={{ flex: "1 1 220px", minWidth: 180 }}>
          <div style={{ height: 10, borderRadius: 999, background: "var(--border)", overflow: "hidden" }}>
            <div style={{
              width: `${all.pct}%`, height: "100%",
              background: done ? "#15803d" : "var(--brand)",
              transition: "width 220ms ease",
            }} />
          </div>
          <div className="muted small" style={{ marginTop: 3 }}>{all.pct}% complete</div>
        </div>

        {/* Whose part is missing — worst first. */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {owners.map((o) => (
            <HoverCard key={o.owner}
              title={`${NAME[o.owner] ?? o.owner} · ${year} budget`}
              rows={[
                { label: "Assigned", value: String(o.total) },
                { label: "Done", value: String(o.done), color: "#15803d" },
                ...(o.open ? [{ label: "Still open", value: String(o.open), color: "#b45309" }] : []),
              ]}
              footer={o.open ? { label: "Note", value: "Drew can fill any of these in the review; the item keeps its owner either way." } : undefined}
            >
              <div>
                <Pill tone={o.open === 0 ? TONE_GREEN : TONE_AMBER}>
                  {(NAME[o.owner] ?? o.owner).toUpperCase()} {o.done}/{o.total}
                </Pill>
              </div>
            </HoverCard>
          ))}
          <button type="button" className="btn" onClick={() => setOpen((v) => !v)}
            style={{ fontSize: 12, padding: "4px 11px", fontWeight: 700 }}>
            {open ? "Hide" : "What's left"}
          </button>
        </div>
      </div>

      {!hasSchedule && (
        <div className="muted small" style={{ marginTop: 6 }}>
          No rent schedule imported yet — vacancies and renewals will appear here once it is.
        </div>
      )}

      {open && (
        <div style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {Object.keys(kinds).length === 0 ? (
            <span className="muted small">Nothing outstanding.</span>
          ) : (
            Object.entries(kinds)
              .sort((a, b) => b[1] - a[1])
              .map(([kind, n]) => (
                <Pill key={kind} tone={TONE_NEUTRAL}>
                  {(CONTRIBUTION_LABEL[kind as keyof typeof CONTRIBUTION_LABEL] ?? kind).toUpperCase()} · {n}
                </Pill>
              ))
          )}
        </div>
      )}
    </div>
  );
}
