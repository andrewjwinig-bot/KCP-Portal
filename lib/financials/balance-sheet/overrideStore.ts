// Per-property corrections to the account classification.
//
// The section a GL account belongs to is INFERRED (see classify.ts) from the
// account-number ranges, because this chart of accounts has never been written
// down anywhere the portal can read. That inference is good but it is not
// authoritative, and a balance sheet that goes to a lender under a signed
// certification is not the place to be quietly wrong.
//
// So an account that lands in the wrong group is moved on screen, once, and it
// stays moved: account code → group key, or "" to keep it off the sheet
// entirely. Only corrections are stored, so a chart-of-accounts change still
// flows through the ranges for every account nobody has touched.
//
// Keyed per property because the same account number can be used differently
// by different partnerships' bookkeeping, and because a correction made while
// preparing 2300's package should not silently change 7010's.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import { bsGroup } from "./classify";

const PREFIX = "financials-balance-sheet-classify";

export type BsOverrides = Record<string, string>;

export async function getBsOverrides(key: string): Promise<BsOverrides> {
  return ((await getJSON(PREFIX, key, { retryOnMiss: true })) as BsOverrides | null) ?? {};
}

/**
 * Move one account, or clear its correction (`group` null) so it falls back to
 * the range map. An unknown group key is ignored rather than stored — a typo
 * would otherwise drop the account off the sheet and take the balance with it.
 */
export async function setBsOverride(key: string, account: string, group: string | null): Promise<BsOverrides> {
  const map = await getBsOverrides(key);
  if (group === null) delete map[account];
  else if (group === "" || bsGroup(group)) map[account] = group;
  else return map;
  await storeJSON(PREFIX, key, map);
  return map;
}
