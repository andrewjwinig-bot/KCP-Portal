"use client";

// Budget season as a rail: where you are, what is left, and who owes it.
//
// A bar along the bottom answers "how much", which is the smaller question.
// The one asked in the room is "where are we" — and the answer has a shape:
// the schedule has to land before the vacancy list means anything, but the
// expenses do not wait for either. A rail can show that; a percentage cannot.
//
// Each step reports its OWN progress, so a step that is blocked reads as
// blocked rather than as nobody having started it.

import { useCallback, useEffect, useState } from "react";
import { Pill, TONE_GREEN, TONE_AMBER, TONE_NEUTRAL, TONE_BLUE } from "@/app/components/Pill";
import { HoverCard } from "@/app/components/HoverCard";
import { ownerProgress } from "@/lib/financials/budgets/deriveContributions";
import type { Contribution, ContributionKind } from "@/lib/financials/budgets/contributors";

const secLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" };
const NAME: Record<string, string> = { harry: "Harry", nancy: "Nancy", greg: "Greg", drew: "Drew", admin: "Admin" };

type StepState = "done" | "active" | "blocked" | "waiting";

type Step = {
  id: string;
  title: string;
  who: string;
  /** Where the step's work is done, when it has its own page. */
  href?: string;
  /** The contribution kinds this step is made of. Empty = not a task step. */
  kinds: ContributionKind[];
  done: number;
  total: number;
  state: StepState;
  note?: string;
};

const DOT: Record<StepState, { bg: string; ring: string }> = {
  done:    { bg: "#15803d", ring: "rgba(22,163,74,0.25)" },
  active:  { bg: "var(--brand)", ring: "rgba(11,74,125,0.22)" },
  blocked: { bg: "#b45309", ring: "rgba(217,119,6,0.22)" },
  waiting: { bg: "var(--border)", ring: "transparent" },
};

function buildSteps(items: Contribution[], hasSchedule: boolean): Step[] {
  const count = (kinds: ContributionKind[]) => {
    const mine = items.filter((c) => kinds.includes(c.kind));
    return { done: mine.filter((c) => c.filledAt).length, total: mine.length };
  };

  const leasing = count(["vacancy", "renewal"]);
  const expenses = count(["ret", "insurance", "building-maintenance"]);
  const allDone = leasing.total + expenses.total > 0 && leasing.done === leasing.total && expenses.done === expenses.total;

  return [
    {
      id: "schedule", title: "Rent schedule", who: "Drew", kinds: [],
      done: hasSchedule ? 1 : 0, total: 1,
      state: hasSchedule ? "done" : "active",
      note: hasSchedule ? undefined : "Import it — the vacancy list is derived from it.",
    },
    {
      id: "leasing", title: "Vacancies & renewals", who: "Harry · Nancy", kinds: ["vacancy", "renewal"],
      ...leasing,
      state: !hasSchedule ? "blocked"
        : leasing.total === 0 ? "waiting"
        : leasing.done === leasing.total ? "done" : "active",
      note: !hasSchedule ? "Waiting on the rent schedule." : undefined,
    },
    {
      id: "expenses", title: "Expenses", who: "Greg · Drew", kinds: ["ret", "insurance", "building-maintenance"],
      href: "/budget-inputs",
      ...expenses,
      // Deliberately NOT blocked by the schedule — this half runs in parallel,
      // which is the point of splitting the work by person.
      state: expenses.total === 0 ? "waiting" : expenses.done === expenses.total ? "done" : "active",
    },
    {
      id: "recoveries", title: "Recoveries", who: "Derived", kinds: [],
      done: 0, total: 0,
      state: allDone ? "active" : "waiting",
      note: "Needs tenancy AND expenses — runs once both are in.",
    },
    {
      id: "review", title: "Review & finalize", who: "Drew", kinds: [],
      done: 0, total: 0,
      state: allDone ? "active" : "waiting",
    },
  ];
}

export function BudgetSteps({ year, category, refreshTick }: { year: number; category: string; refreshTick?: number }) {
  const [items, setItems] = useState<Contribution[] | null>(null);
  const [hasSchedule, setHasSchedule] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/financials/budgets/progress?year=${year}&category=${encodeURIComponent(category)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { setItems(j.contributions ?? []); setHasSchedule(j.hasSchedule === true); })
      .catch(() => setItems([]));
  }, [year, category]);

  useEffect(() => { load(); }, [load, refreshTick]);

  const list = items ?? [];
  const steps = buildSteps(list, hasSchedule);
  const owners = ownerProgress(list);
  const taskSteps = steps.filter((s) => s.total > 0);
  const done = taskSteps.reduce((s, x) => s + x.done, 0);
  const total = taskSteps.reduce((s, x) => s + x.total, 0);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <aside style={{ position: "sticky", top: 16, alignSelf: "start", display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="card" style={{ padding: 14 }}>
        <div style={secLabel}>{year} budget</div>
        <div style={{ fontSize: 22, fontWeight: 900, marginTop: 2, lineHeight: 1.1 }}>
          {total > 0 && done === total ? "Complete" : `${total - done} left`}
        </div>
        <div style={{ height: 8, borderRadius: 999, background: "var(--border)", overflow: "hidden", marginTop: 8 }}>
          <div style={{ width: `${pct}%`, height: "100%", background: done === total && total > 0 ? "#15803d" : "var(--brand)", transition: "width 220ms ease" }} />
        </div>
        <div className="muted small" style={{ marginTop: 4 }}>{done} of {total} parts in · {pct}%</div>
      </div>

      {/* The steps, with the rail drawn down their left. */}
      <div className="card" style={{ padding: "14px 14px 10px" }}>
        <div style={{ ...secLabel, marginBottom: 10 }}>Steps</div>
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", left: 5, top: 6, bottom: 14, width: 2, background: "var(--border)" }} />
          {steps.map((s, i) => {
            const d = DOT[s.state];
            return (
              <div key={s.id} style={{ position: "relative", paddingLeft: 22, paddingBottom: 14 }}>
                <div style={{
                  position: "absolute", left: 0, top: 3, width: 12, height: 12, borderRadius: 999,
                  background: d.bg, boxShadow: `0 0 0 4px ${d.ring}`,
                }} />
                <div style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.25, color: s.state === "waiting" ? "var(--muted)" : "var(--text)" }}>
                  <span style={{ color: "var(--muted)", fontWeight: 700 }}>{i + 1}.</span> {s.title}
                </div>
                <div className="muted" style={{ fontSize: 11.5, marginTop: 1 }}>{s.who}</div>
                {s.total > 0 && (
                  <>
                    <div style={{ height: 5, borderRadius: 999, background: "var(--border)", overflow: "hidden", marginTop: 5, maxWidth: 150 }}>
                      <div style={{ width: `${Math.round((s.done / s.total) * 100)}%`, height: "100%", background: s.done === s.total ? "#15803d" : "var(--brand)", transition: "width 200ms ease" }} />
                    </div>
                    <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>{s.done} of {s.total}</div>
                  </>
                )}
                {s.note && <div className="muted" style={{ fontSize: 11, marginTop: 3, fontStyle: "italic" }}>{s.note}</div>}
                {s.href && s.state !== "waiting" && (
                  <a href={s.href} style={{ display: "inline-block", marginTop: 4, fontSize: 12, fontWeight: 700, color: "var(--brand)", textDecoration: "none" }}>Enter figures →</a>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {owners.length > 0 && (
        <div className="card" style={{ padding: 14 }}>
          <div style={{ ...secLabel, marginBottom: 8 }}>Who owes what</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700 }}>{NAME[o.owner] ?? o.owner}</span>
                  <Pill tone={o.open === 0 ? TONE_GREEN : TONE_AMBER}>{o.done}/{o.total}</Pill>
                </div>
              </HoverCard>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
