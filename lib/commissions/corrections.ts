// One-time data corrections to stored commissions, applied on read and
// idempotent — once a record is fixed it no longer matches, so nothing is
// written again. Each correction fixes the live entry AND the as-sent record.
//
// Fenningham Stevens, Building 5 (4050) suite 315: keyed 2029–2032 for a
// 2026–2029 lease (owner, 10/2026). The term (3 yr) and incentive are right,
// so only the years move. Nothing is re-sent to AvidXchange.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import type { CommissionEntry } from "@/lib/commissions";
import type { CommissionHistory } from "./history";

const PREFIX = "commissions";

function isFenningham315(e: CommissionEntry | undefined): boolean {
  if (!e) return false;
  return /fenningham/i.test(e.tenant || "") && /315/.test(e.suite || "") && /2029/.test(e.leaseFrom || "");
}

/** 2029 → 2026, 2032 → 2029, whatever the date's format. */
const shiftYears = (s: string) => (s || "").replace(/\b(2029|2030|2031|2032)\b/g, (y) => String(Number(y) - 3));

function fix(e: CommissionEntry): CommissionEntry {
  return { ...e, leaseFrom: shiftYears(e.leaseFrom), leaseTo: shiftYears(e.leaseTo) };
}

/** Apply to a list of live entries; returns the list and whether it changed. */
export function correctEntries(list: CommissionEntry[]): { list: CommissionEntry[]; changed: boolean } {
  let changed = false;
  const out = list.map((e) => (isFenningham315(e) ? ((changed = true), fix(e)) : e));
  return { list: out, changed };
}

export function correctHistory(h: CommissionHistory): boolean {
  let changed = false;
  for (const q of Object.keys(h)) {
    for (const id of Object.keys(h[q] ?? {})) {
      const inv = h[q][id];
      if (isFenningham315(inv?.entry)) {
        h[q][id] = { ...inv, entry: fix(inv.entry) };
        changed = true;
      }
    }
  }
  return changed;
}

/** Fix the stored records in place. Safe to call on every read. */
export async function applyCommissionCorrections(): Promise<void> {
  for (const id of ["entries", "entries-retail"]) {
    const raw = await getJSON(PREFIX, id).catch(() => null);
    if (!Array.isArray(raw)) continue;
    const { list, changed } = correctEntries(raw as CommissionEntry[]);
    if (changed) await storeJSON(PREFIX, id, list);
  }
  const hist = await getJSON(PREFIX, "history").catch(() => null);
  if (hist && typeof hist === "object") {
    const h = hist as CommissionHistory;
    if (correctHistory(h)) await storeJSON(PREFIX, "history", h);
  }
}
