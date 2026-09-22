// Who fills in which part of a budget, and what is still outstanding.
//
// A budget is not one person's document. It is assembled from parts that
// different people own — Harry knows which retail spaces will re-let and at
// what, Nancy the same for the office parks, Greg what the buildings will cost
// to maintain, Drew the tax appeals and the insurance renewal. The old
// workbook handled this by emailing a spreadsheet around; the cost of that is
// that nobody can see whose part is missing until the review meeting.
//
// So an outstanding part is a first-class thing with an OWNER, and the budget
// is finalisable when none are left.
//
// THE CONTRIBUTOR SURFACE IS NOT THE BUDGET PAGE. Greg is service staff: his
// access is the field tools, and giving him the P&L so he can key a
// maintenance line would be a poor trade. He gets HIS items — the property,
// the line, the twelve cells, last year's budget and last year's actual beside
// them — and nothing else. Harry and Nancy can already see more, but the same
// surface serves them, and it is the thing that can prompt them.

import type { UserId } from "@/lib/users";
import { EXPENSE_ROLES, type SectionRole } from "@/lib/financials/operating-statements/types";

/** A part of the budget somebody has to fill in. */
export type ContributionKind =
  /** A space with no contracted rent — will it re-let, when, at what? */
  | "vacancy"
  /** A lease expiring inside the budget year — renew, at what? */
  | "renewal"
  /** Real-estate taxes: 3% by default, overridden where a property was reassessed. */
  | "ret"
  /** Insurance, keyed per property as it is today. */
  | "insurance"
  /** Recurring building maintenance, month by month. */
  | "building-maintenance";

export const CONTRIBUTION_LABEL: Record<ContributionKind, string> = {
  vacancy: "Vacancies",
  renewal: "Lease renewals",
  ret: "Real estate taxes",
  insurance: "Insurance",
  "building-maintenance": "Building maintenance",
};

/**
 * Who owns each kind of contribution.
 *
 * Vacancies and renewals split by PORTFOLIO, because that is how the work
 * actually divides: Harry walks the shopping centres, Nancy the office parks.
 * Everything else is one owner across the book.
 */
export type OwnerRule =
  | { by: "portfolio"; sc: UserId; bp: UserId }
  | { by: "single"; owner: UserId };

export const CONTRIBUTION_OWNER: Record<ContributionKind, OwnerRule> = {
  vacancy: { by: "portfolio", sc: "harry", bp: "nancy" },
  renewal: { by: "portfolio", sc: "harry", bp: "nancy" },
  ret: { by: "single", owner: "drew" },
  insurance: { by: "single", owner: "drew" },
  "building-maintenance": { by: "single", owner: "greg" },
};

/** The user who owns this contribution for this property's portfolio. */
export function ownerFor(kind: ContributionKind, allocGroup: "SC" | "BP" | undefined): UserId {
  const rule = CONTRIBUTION_OWNER[kind];
  if (rule.by === "single") return rule.owner;
  return allocGroup === "BP" ? rule.bp : rule.sc;
}

/**
 * Drew hosts the budget review, so Drew can fill or change ANY part, not only
 * the ones he owns — the meeting is where the last gaps get closed and nobody
 * wants to be blocked on chasing a login. Admin likewise.
 *
 * This is deliberately an override, not a reassignment: the item keeps its
 * real owner, so "Harry still owes six" stays true on the roster even after
 * Drew fills one in during the review. `filledBy` on the item records who
 * actually did it.
 */
export function canEdit(user: UserId, kind: ContributionKind, allocGroup: "SC" | "BP" | undefined): boolean {
  return user === "drew" || user === "admin" || ownerFor(kind, allocGroup) === user;
}

/** Typing months straight into the budget grid is the budget's own author's
 *  job — Drew, or admin. The owners' parts have their own screens. */
export function canEditLines(user: UserId | null | undefined): boolean {
  return user === "drew" || user === "admin";
}

/** One outstanding (or completed) part of the budget. */
export type Contribution = {
  id: string;
  year: number;
  kind: ContributionKind;
  propertyCode: string;
  /** Set for vacancy / renewal — the space in question. */
  unitRef?: string;
  tenant?: string;
  /** The owner this was assigned to, by rule. Unchanged when Drew fills it in. */
  owner: UserId;
  /** Null while outstanding. */
  filledAt: string | null;
  filledBy: UserId | null;
  /**
   * What we already know, shown beside the cell being filled — because a
   * budget is built from last year's budget AND last year's actuals, and
   * asking someone for a number without either is asking them to guess.
   */
  reference?: {
    priorBudget?: number[] | null;
    priorActual?: number[] | null;
    priorBudgetTotal?: number | null;
    priorActualTotal?: number | null;
  };
};

export const contributionId = (year: number, kind: ContributionKind, propertyCode: string, unitRef?: string): string =>
  [year, kind, propertyCode, unitRef ?? ""].join("|").replace(/[^a-zA-Z0-9_|-]+/g, "_");

/** Outstanding items for one user — what to prompt them with. */
export function outstandingFor(items: Contribution[], user: UserId): Contribution[] {
  return items.filter((c) => !c.filledAt && (c.owner === user || user === "drew" || user === "admin"));
}

/** Per-owner progress, for the roster that says whose part is missing. */
export function progressByOwner(items: Contribution[]): Record<string, { total: number; done: number }> {
  const out: Record<string, { total: number; done: number }> = {};
  for (const c of items) {
    const p = (out[c.owner] ??= { total: 0, done: 0 });
    p.total += 1;
    if (c.filledAt) p.done += 1;
  }
  return out;
}

/** A budget is finalisable when every assigned part has been filled in. */
export function isComplete(items: Contribution[]): boolean {
  return items.length > 0 && items.every((c) => !!c.filledAt);
}


/**
 * Which sections of a budget a contributor may SEE.
 *
 * Not the same question as which cells they may fill. Greg keys building
 * maintenance, and to judge whether $900 a month is right for 4500 he wants
 * the rest of that property's expense budget next to it — what is on
 * landscaping, on parking lot maintenance, what it cost last year. What he has
 * no need for is the revenue side: rents, recoveries, NOI, debt service.
 *
 * So the scope is by SECTION ROLE, which the statement engine already types.
 * Everyone else sees the whole thing.
 */
export function visibleRoles(user: UserId): ReadonlySet<SectionRole> | null {
  if (user === "greg" || user === "charles" || user === "jay" || user === "maint") {
    return new Set<SectionRole>(EXPENSE_ROLES);
  }
  return null; // null = no restriction
}

/** Convenience for a renderer: may this user see this section? */
export function canSeeRole(user: UserId, role: SectionRole): boolean {
  const allowed = visibleRoles(user);
  return !allowed || allowed.has(role);
}
