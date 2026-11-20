// The Rent Roll Review's groups — who makes the leasing calls for which
// properties. Client-safe (no storage), so the pages, the routes and the
// signed links all read ONE definition.
//
// Harry makes the calls for the shopping centres AND Korman Homes (owner:
// "let harry make leasing assumptions for Korman Homes budgets as well … two
// tabs — one for shopping centers and one for Korman Homes"); Nancy for the
// business parks.

import { PROPERTY_DEFS } from "@/lib/properties/data";

export type ReviewGroup = "SC" | "BP" | "KH";
export const REVIEW_GROUPS: ReviewGroup[] = ["SC", "KH", "BP"];

export const REVIEW_GROUP: Record<ReviewGroup, { title: string; tab: string; owner: string; category: string | null }> = {
  SC: { title: "Shopping centers", tab: "Shopping Centers", owner: "harry", category: "Shopping Centers" },
  KH: { title: "Korman Homes", tab: "Korman Homes", owner: "harry", category: null },
  BP: { title: "Business parks", tab: "Business Parks", owner: "nancy", category: "Office" },
};

export function isReviewGroup(g: unknown): g is ReviewGroup {
  return g === "SC" || g === "BP" || g === "KH";
}

/** The review group a property belongs to — its allocation group, or Korman
 *  Homes for a residential property. Null for anything else (2010, a fund). */
export function reviewGroupOf(code: string): ReviewGroup | null {
  const def = PROPERTY_DEFS.find((d) => d.id.toUpperCase() === code.toUpperCase());
  if (!def) return null;
  if (def.allocGroup === "SC" || def.allocGroup === "BP") return def.allocGroup;
  return def.type === "Residential" ? "KH" : null;
}

/** The property codes in a group. */
export function groupCodes(group: ReviewGroup): Set<string> {
  return new Set(PROPERTY_DEFS.filter((d) => reviewGroupOf(d.id) === group).map((d) => d.id));
}

/** The groups a person makes the calls for, in tab order. */
export function groupsOwnedBy(user: string): ReviewGroup[] {
  return REVIEW_GROUPS.filter((g) => REVIEW_GROUP[g].owner === user);
}
