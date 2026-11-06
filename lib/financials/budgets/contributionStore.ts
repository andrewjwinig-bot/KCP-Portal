// The ONLY thing stored about a budget's outstanding parts: who filled which,
// and when. The list itself is derived (see `deriveContributions`) so it can
// never go stale against a re-imported schedule.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import type { FilledMap } from "./deriveContributions";

const PREFIX = "financials-budgets-contributions";
const idFor = (year: number, category: string) => `${year}-${category}`.replace(/[^a-zA-Z0-9_-]+/g, "_");

export async function getFilled(year: number, category: string): Promise<FilledMap> {
  return ((await getJSON(PREFIX, idFor(year, category))) as FilledMap | null) ?? {};
}

export async function setFilled(
  year: number, category: string, contributionId: string, filledBy: string, done: boolean,
): Promise<FilledMap> {
  const map = await getFilled(year, category);
  if (done) map[contributionId] = { filledAt: new Date().toISOString(), filledBy };
  else delete map[contributionId];
  await storeJSON(PREFIX, idFor(year, category), map);
  return map;
}
