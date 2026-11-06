// RECOVER THE HELD BALANCES (owner, 10/20/26: "i dont want to lose the held
// accounts … pass it through with next month"). The 10/19 repair restored
// August's holds onto a ledger that STILL carried them — the backup it took
// shows the January–August entries were never swept — so every one was
// doubled (7200 Elbridge read $914, Postage "14 mo" since January), and some
// accounts sat over $100. The 10/19 import had also put October–November 2025
// entries on hold: months billed in 2025, re-processed by that import.
//
// So: the ledger goes back to the repair's own backup (the state just before
// it), minus every held entry dated 2025, and the next fresh month bills EVERY
// held balance (`billAllOnNextSend`, as December does) so the recovered
// amounts pass through with it. Months already billed and their baselines are
// untouched. Previewed, the current ledger backed up, applied once.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import type { CarryoverLedger, PropertyCarry } from "./carryover";
import { getAllocLedger, saveAllocLedger, backupAllocLedger, getAllocLedgerBackup } from "./carryoverStore";
import { PROPERTY_DEFS } from "@/lib/properties/data";

const MARK_PREFIX = "alloc-repairs";
const REPAIR_ID = "2026-10-19";
const MARK_ID = "recover-held-2026-10-20";
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const nameOf = (id: string) => PROPERTY_DEFS.find((p) => p.id === id)?.name ?? id;
/** A held entry from a month billed in 2025 (catch-up entries are "catchup:YYYY-MM"). */
const from2025 = (m: string) => /^2025-\d{2}$/.test(m) || /^catchup:2025-/.test(m);

/** The backup's balances without their 2025 entries — each account's total
 *  re-summed from the months it keeps. Pure. */
export function withoutYear2025(balances: Record<string, PropertyCarry>): { kept: Record<string, PropertyCarry>; dropped: number } {
  const kept: Record<string, PropertyCarry> = {};
  let dropped = 0;
  for (const [pid, pc] of Object.entries(balances)) {
    for (const ac of Object.values(pc.accounts)) {
      const months = ac.months.filter((m) => !from2025(m.statementMonth));
      dropped += ac.months.filter((m) => from2025(m.statementMonth)).reduce((s, m) => s + m.amount, 0);
      const heldTotal = round2(months.reduce((s, m) => s + m.amount, 0));
      if (!months.length || Math.abs(heldTotal) < 0.005) continue;
      if (!kept[pid]) kept[pid] = { ...pc, accounts: {} };
      kept[pid].accounts[ac.accountCode] = { ...ac, months, heldTotal, sinceMonth: months.map((m) => m.statementMonth.replace(/^catchup:/, "")).sort()[0] };
    }
  }
  return { kept, dropped: round2(dropped) };
}

const totalOf = (b: Record<string, PropertyCarry>, pid: string) => round2(Object.values(b[pid]?.accounts ?? {}).reduce((s, a) => s + a.heldTotal, 0));

export type RecoverRow = { code: string; name: string; now: number; recovered: number; dropped2025: number; accounts: { code: string; name: string; recovered: number }[] };
export type RecoverState =
  | { applied: false; none: true; reason: string }
  | { applied: false; rows: RecoverRow[]; now: number; recovered: number; dropped2025: number }
  | { applied: true; appliedAt: string; appliedBy: string | null; recovered: number; backup: string };

async function work() {
  const repair = (await getJSON(MARK_PREFIX, REPAIR_ID)) as { backup?: string } | null;
  if (!repair?.backup) return { error: "The 10/19 repair's backup is not on record." } as const;
  const backup = await getAllocLedgerBackup(repair.backup);
  if (!backup) return { error: "The 10/19 repair's backup could not be read." } as const;
  const current = await getAllocLedger();
  const { kept, dropped } = withoutYear2025(backup.balances ?? {});
  return { current, backup, kept, dropped };
}

export async function recoverState(): Promise<RecoverState> {
  const mark = (await getJSON(MARK_PREFIX, MARK_ID)) as Extract<RecoverState, { applied: true }> | null;
  if (mark) return { ...mark, applied: true };
  const w = await work();
  if ("error" in w) return { applied: false, none: true, reason: w.error! };
  const ids = [...new Set([...Object.keys(w.current.balances), ...Object.keys(w.backup.balances ?? {})])];
  const rows: RecoverRow[] = ids.map((pid) => ({
    code: pid, name: nameOf(pid),
    now: totalOf(w.current.balances, pid),
    recovered: totalOf(w.kept, pid),
    dropped2025: round2(totalOf(w.backup.balances ?? {}, pid) - totalOf(w.kept, pid)),
    accounts: Object.values(w.kept[pid]?.accounts ?? {}).map((a) => ({ code: a.accountCode, name: a.accountName, recovered: round2(a.heldTotal) })).sort((a, b) => b.recovered - a.recovered),
  })).filter((r) => r.now || r.recovered || r.dropped2025).sort((a, b) => b.recovered - a.recovered);
  const sum = (f: (r: RecoverRow) => number) => round2(rows.reduce((s, r) => s + f(r), 0));
  return { applied: false, rows, now: sum((r) => r.now), recovered: sum((r) => r.recovered), dropped2025: w.dropped };
}

export async function applyRecover(by: string | null): Promise<RecoverState | { error: string }> {
  if (await getJSON(MARK_PREFIX, MARK_ID)) return { error: "The held balances were already recovered." };
  const w = await work();
  if ("error" in w) return { error: w.error! };
  const nowISO = new Date().toISOString();
  const backup = await backupAllocLedger(w.current, `recover-${nowISO.replace(/[^0-9]/g, "").slice(0, 14)}`);
  const next: CarryoverLedger = { ...w.current, balances: w.kept, billAllOnNextSend: true, updatedAt: nowISO };
  await saveAllocLedger(next);
  const recovered = round2(Object.keys(w.kept).reduce((s, pid) => s + totalOf(w.kept, pid), 0));
  const mark = { appliedAt: nowISO, appliedBy: by, recovered, backup };
  await storeJSON(MARK_PREFIX, MARK_ID, mark);
  return { applied: true, ...mark };
}
