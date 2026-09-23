"use client";

// Budget season as a strip of steps: where you are, what is left, and who owes it.
//
// A bar along the bottom answers "how much", which is the smaller question.
// The one asked in the room is "where are we" — and the answer has a shape:
// the schedule has to land before the vacancy list means anything, but the
// expenses do not wait for either. A rail can show that; a percentage cannot.
//
// Each step reports its OWN progress, so a step that is blocked reads as
// blocked rather than as nobody having started it.

import { Fragment, useCallback, useEffect, useState } from "react";
import { Pill, TONE_GREEN, contributorTone } from "@/app/components/Pill";
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
      // ONE rent step: the schedule import (Drew) and the leasing decisions it
      // produces (Harry / Nancy) are the same job — getting next year's rent
      // right — and live in one card on the page. Its count is the decisions;
      // a missing schedule is said in the note, since until it lands the list
      // comes off the rent roll.
      id: "rent", title: "Revenues", who: "Drew · Harry · Nancy", kinds: ["vacancy", "renewal"],
      ...leasing,
      state: leasing.total === 0 ? (hasSchedule ? "done" : "active")
        : leasing.done === leasing.total ? "done" : "active",
      note: !hasSchedule ? "Import the rent schedule — the list is off the rent roll until then." : undefined,
    },
    {
      // Expenses and the review are ONE step: taxes, insurance and building
      // maintenance are keyed in the budget grid itself, so the step is done
      // when they are. It runs in parallel with Revenues by design.
      id: "expenses", title: "Expenses & review", who: "Drew · Greg", kinds: ["ret", "insurance", "building-maintenance"],
      href: "#step-expenses",
      ...expenses,
      state: expenses.total === 0 ? (allDone ? "active" : "waiting") : expenses.done === expenses.total ? "done" : "active",
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
    // One slim strip under the masthead, pinned while you scroll — it used to
    // be a 250px rail down the right, which took that width from the budget
    // grid on every screen. Same content, laid out across instead of down.
    <div className="card" style={{ position: "sticky", top: 0, zIndex: 6, padding: "10px 14px", display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
      <div style={{ minWidth: 150 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={secLabel}>{year} budget</span>
          <span style={{ fontSize: 15, fontWeight: 900 }}>{total > 0 && done === total ? "Complete" : `${total - done} left`}</span>
        </div>
        <div style={{ height: 5, borderRadius: 999, background: "var(--border)", overflow: "hidden", marginTop: 5, width: 150 }}>
          <div style={{ width: `${pct}%`, height: "100%", background: done === total && total > 0 ? "#15803d" : "var(--brand)", transition: "width 220ms ease" }} />
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", flex: "1 1 520px" }}>
        {steps.map((st, i) => {
          const d = DOT[st.state];
          const chip = (
            <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 10px", borderRadius: 999, border: "1px solid var(--border)", background: st.state === "active" ? "rgba(11,74,125,0.05)" : "transparent" }}>
              <span style={{ width: 9, height: 9, borderRadius: 999, background: d.bg, boxShadow: `0 0 0 3px ${d.ring}`, flex: "none" }} />
              <span style={{ fontSize: 12.5, fontWeight: 800, color: st.state === "waiting" ? "var(--muted)" : "var(--text)", whiteSpace: "nowrap" }}>
                {i + 1}. {st.title}
              </span>
              {st.total > 0 && <span className="muted" style={{ fontSize: 11.5, fontWeight: 700 }}>{st.done}/{st.total}</span>}
            </div>
          );
          return (
            <Fragment key={st.id}>
              {i > 0 && <span className="muted" style={{ fontSize: 11 }}>›</span>}
              <HoverCard title={`${i + 1}. ${st.title}`}
                rows={[
                  { label: "Who", value: st.who },
                  ...(st.total > 0 ? [{ label: "Done", value: `${st.done} of ${st.total}`, color: st.done === st.total ? "#15803d" : undefined }] : []),
                ]}
                footer={st.note ? { label: "Note", value: st.note } : undefined}>
                {st.href && st.state !== "waiting"
                  ? <a href={st.href} style={{ textDecoration: "none", color: "inherit" }}>{chip}</a>
                  : chip}
              </HoverCard>
            </Fragment>
          );
        })}
      </div>

      {owners.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={secLabel}>Who owes what</span>
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
              <Pill tone={o.open === 0 ? TONE_GREEN : contributorTone(o.owner)}>{(NAME[o.owner] ?? o.owner).toUpperCase()} {o.done}/{o.total}</Pill>
            </HoverCard>
          ))}
        </div>
      )}
    </div>
  );
}
