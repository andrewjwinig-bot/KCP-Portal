// The leasing owner's sign-off on a property's rent and assumptions — Harry's
// on each shopping centre, Nancy's on each business park. One document per
// budget year, keyed by property: who confirmed it and when.
//
// A sign-off is a statement about the decisions AS THEY STOOD: a decision
// changed after it is reported as "changed since confirmed" (the page compares
// the newest decision's time with `at`), rather than silently keeping the tick.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";

export type RentReview = { by: string; at: string };
export type RentReviews = Record<string, RentReview>;

const PREFIX = "budget-rent-review";

export async function getRentReviews(budgetYear: number): Promise<RentReviews> {
  return ((await getJSON(PREFIX, String(budgetYear))) as RentReviews | null) ?? {};
}

/** Confirm (or, with `review` null, withdraw) one property's sign-off. */
export async function setRentReview(budgetYear: number, propertyCode: string, review: RentReview | null): Promise<RentReviews> {
  const doc = await getRentReviews(budgetYear);
  const k = propertyCode.toUpperCase();
  if (review) doc[k] = review; else delete doc[k];
  await storeJSON(PREFIX, String(budgetYear), doc);
  return doc;
}
