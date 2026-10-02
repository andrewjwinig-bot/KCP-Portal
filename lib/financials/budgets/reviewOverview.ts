// The Rent Roll Review's list — every property in a group (shopping centres or
// business parks) that has a statement to budget from, with how many leasing
// calls it needs, how many are made, when the newest was, and its sign-off.
// ONE function behind both the signed-in page and the emailed link, so the two
// cannot count differently.

import "server-only";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import { availableStatements } from "@/lib/financials/operating-statements/mappingStore";
import { getInPlaceRevenue } from "./inPlaceStore";
import { getLeasingAssumptions } from "./leasingAssumptions";
import { projectLeaseRevenue } from "./leaseRevenue";
import { getRentReviews, type RentReview } from "./rentReviewStore";

export type ReviewGroup = "SC" | "BP";
export const REVIEW_GROUP: Record<ReviewGroup, { title: string; category: string; owner: string }> = {
  SC: { title: "Shopping centers", category: "Shopping Centers", owner: "harry" },
  BP: { title: "Business parks", category: "Office", owner: "nancy" },
};

export type ReviewProperty = {
  key: string;
  code: string;
  name: string;
  /** Suites needing a call, and how many are made. */
  total: number;
  done: number;
  /** When the newest decision was made (ISO), for "changed since confirmed". */
  latest: string | null;
  review: RentReview | null;
};

/** The group's properties, in code order — only those with a statement. */
export async function reviewProperties(group: ReviewGroup): Promise<{ key: string; code: string; name: string }[]> {
  const codes = new Set(PROPERTY_DEFS.filter((d) => d.allocGroup === group).map((d) => d.id));
  const statements = await availableStatements();
  return statements
    .filter((s) => codes.has(s.propertyCode))
    .map((s) => ({ key: s.key, code: s.propertyCode, name: PROPERTY_DEFS.find((d) => d.id === s.propertyCode)?.name ?? s.entityName }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

export async function reviewOverview(group: ReviewGroup, year: number): Promise<ReviewProperty[]> {
  const [props, schedule, reviews] = await Promise.all([
    reviewProperties(group),
    getInPlaceRevenue(year, REVIEW_GROUP[group].category).catch(() => null),
    getRentReviews(year).catch(() => ({})),
  ]);
  return Promise.all(props.map(async (p) => {
    const assumptions = await getLeasingAssumptions(year, [p.code]).catch(() => ({}));
    const lease = await projectLeaseRevenue([p.code], year, assumptions, schedule?.charges ?? null).catch(() => null);
    const calls = lease?.hasData ? [...lease.expiring.map((e) => e.assumption), ...lease.vacant.map((v) => v.assumption)] : [];
    const made = calls.filter(Boolean);
    const latest = made.reduce<string | null>((m, a) => (a?.updatedAt && (!m || a.updatedAt > m) ? a.updatedAt : m), null);
    return { ...p, total: calls.length, done: made.length, latest, review: (reviews as Record<string, RentReview>)[p.code] ?? null };
  }));
}
