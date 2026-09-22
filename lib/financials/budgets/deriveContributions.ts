// What a budget still needs from people — DERIVED, not maintained.
//
// The list of outstanding parts is computed from the data every time: the
// imported rent schedule says which spaces have no contracted rent, and the
// property list says which buildings need a tax, insurance and maintenance
// figure. Nothing is keyed and nothing goes stale — import a better export and
// the list changes by itself, exactly like the vacancy review it feeds.
//
// The ONLY thing stored is completion: who filled a part, and when. That is
// the piece the data cannot know.

import { contributionId, ownerFor, type Contribution, type ContributionKind } from "./contributors";
import { unitsNeedingAssumption } from "./inPlaceDerive";
import type { InPlaceRevenueRecord } from "./inPlaceStore";

export type BudgetProperty = { code: string; name: string; allocGroup: "SC" | "BP" | undefined };

/** Completion records, keyed by contribution id. */
export type FilledMap = Record<string, { filledAt: string; filledBy: string }>;

/**
 * Every part this budget needs, with its owner and whether it is done.
 *
 * A space with NO contracted rent at all is a vacancy; one whose charges stop
 * inside the year is a renewal. Both come out of the same import, and the
 * distinction is what the person is actually being asked — "will this re-let,
 * when, at what?" is a different question from "will they renew?".
 */
export function deriveContributions(
  year: number,
  properties: BudgetProperty[],
  inPlace: InPlaceRevenueRecord | null,
  filled: FilledMap = {},
  /** Parts done BY BEING ENTERED — a figure keyed in the Expenses step is the
   *  part, so it needs no separate tick. Keyed by contribution id. */
  entered: FilledMap = {},
): Contribution[] {
  const out: Contribution[] = [];

  const push = (kind: ContributionKind, p: BudgetProperty, unitRef?: string, tenant?: string) => {
    const id = contributionId(year, kind, p.code, unitRef);
    const done = filled[id] ?? entered[id];
    out.push({
      id, year, kind, propertyCode: p.code,
      ...(unitRef ? { unitRef } : {}),
      ...(tenant ? { tenant } : {}),
      owner: ownerFor(kind, p.allocGroup),
      filledAt: done?.filledAt ?? null,
      filledBy: (done?.filledBy as Contribution["filledBy"]) ?? null,
    });
  };

  for (const p of properties) {
    // Per-space work, only where the schedule says a space needs it.
    for (const u of unitsNeedingAssumption(inPlace, p.code)) {
      push(u.monthsCovered === 0 ? "vacancy" : "renewal", p, u.unitRef, u.tenant);
    }
    // One of each per property, always — a tax figure, an insurance figure and
    // a maintenance schedule are needed whether or not anything changed.
    push("ret", p);
    push("insurance", p);
    push("building-maintenance", p);
  }

  return out;
}

/** Overall progress, for the bar. */
export function overallProgress(items: Contribution[]): { total: number; done: number; pct: number } {
  const total = items.length;
  const done = items.filter((c) => c.filledAt).length;
  return { total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
}

/**
 * Per-owner progress, worst first.
 *
 * Whoever has the most outstanding leads, because the question the bar answers
 * is "what is holding this up" — not "who has done the most".
 */
export function ownerProgress(items: Contribution[]): { owner: string; total: number; done: number; open: number }[] {
  const by: Record<string, { total: number; done: number }> = {};
  for (const c of items) {
    const p = (by[c.owner] ??= { total: 0, done: 0 });
    p.total += 1;
    if (c.filledAt) p.done += 1;
  }
  return Object.entries(by)
    .map(([owner, p]) => ({ owner, total: p.total, done: p.done, open: p.total - p.done }))
    .sort((a, b) => b.open - a.open || a.owner.localeCompare(b.owner));
}

/** Outstanding counts by kind, so the bar can say WHAT is missing, not just how much. */
export function kindProgress(items: Contribution[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of items) if (!c.filledAt) out[c.kind] = (out[c.kind] ?? 0) + 1;
  return out;
}
