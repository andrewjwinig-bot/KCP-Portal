// Cash against Marie's Skyline bank recs (the accountants' Bank Rec tab).
//
// Marie reconciles every account each month in Skyline and saves the
// "Statement Reconcile Report" as PDFs (Rec1 / Rec2 / Rec2B / Rec1&2) under
// "!<year> Year End/Bank Account Reconciliations/<NN Month YYYY>/<Bank>/".
// That report proves the bank side (statement ± open items = the book), and
// its ADJUSTED CHECK BOOK BALANCE is Skyline's own book for the account — so
// the workpaper's job is the other half: does the General Ledger's cash at
// the quarter end equal the books Marie reconciled?
//
// It reads her PDFs directly, NOT the portal's Bank Recs page (still a draft).
// Pure: the store and the route read and write; this decides and explains.

import type { OpenItem, SkylineRec, RecFileKind } from "@/lib/bank-rec/monthFiles";
import { kindFromName, last4FromName } from "@/lib/bank-rec/monthFiles";

export type RecRole = "operating" | "restricted";

/** Which ledger each account's book lives on, and whether it is operating cash
 *  (01xx) or restricted cash (02xx, security deposits / money markets).
 *  Accounts several ledgers share (TKD x6063, Eastwick x5303, Nockamixon
 *  x6127) are not here — no one ledger's cash can be checked against them. */
export const REC_ACCOUNTS: Record<string, { key: string; role: RecRole }> = {
  x5615: { key: "2300", role: "operating" }, x6888: { key: "2300", role: "operating" },
  x5631: { key: "PJV3", role: "operating" }, x1993: { key: "PIIICO", role: "operating" },
  x5656: { key: "7010", role: "operating" }, x9436: { key: "7010", role: "operating" },
  x9629: { key: "2010", role: "operating" }, x0613: { key: "2010", role: "operating" },
  x7216: { key: "2010", role: "restricted" }, x8276: { key: "2010", role: "restricted" },
  x6055: { key: "2000", role: "operating" }, x1622: { key: "2000", role: "operating" },
  x2190: { key: "PNIPLX", role: "operating" }, x7448: { key: "PNIPLX", role: "restricted" },
  x1235: { key: "9510", role: "operating" }, x6088: { key: "9510", role: "operating" },
  x0669: { key: "5600", role: "operating" }, x1692: { key: "7200", role: "operating" },
  x0308: { key: "8200", role: "operating" }, x8822: { key: "0800", role: "operating" },
  x9879: { key: "1100", role: "operating" }, x1896: { key: "9000", role: "operating" },
  x7857: { key: "9800", role: "operating" }, x2296: { key: "9820", role: "operating" },
  x9579: { key: "9840", role: "operating" }, x8563: { key: "9860", role: "operating" },
  x3777: { key: "4900", role: "operating" }, x6119: { key: "2070", role: "operating" },
  x4756: { key: "7300", role: "operating" }, x8177: { key: "7300", role: "restricted" },
  x0598: { key: "4500", role: "operating" }, x8086: { key: "4500", role: "restricted" },
};

/** One account's rec as the workpaper keeps it. */
export type RecAccount = {
  last4: string;
  checkingKey: string | null;
  statementDateISO: string | null;
  runDateISO: string | null;
  bookBalance: number;
  inBalance: boolean;
  unreconciled: OpenItem[];
  file: string;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The month a rec belongs to: its statement month, or the month before for a
 *  statement dated in the first days (Liberty's money markets run 5th → 5th
 *  and Marie files them under the earlier month). */
export function recMonth(statementDateISO: string): string {
  const [y, m, d] = statementDateISO.split("-").map(Number);
  if (d > 10) return statementDateISO.slice(0, 7);
  const pm = m === 1 ? 12 : m - 1;
  return `${m === 1 ? y - 1 : y}-${String(pm).padStart(2, "0")}`;
}

/** A parsed Statement Reconcile Report → the account it reconciles. */
export function recAccountOf(rec: SkylineRec, last4: string, file: string): RecAccount | null {
  if (rec.adjustedCheckBookBalance == null || !rec.statementDateISO) return null;
  return {
    last4, checkingKey: rec.checkingKey, statementDateISO: rec.statementDateISO, runDateISO: rec.runDateISO,
    bookBalance: rec.adjustedCheckBookBalance, inBalance: rec.inBalance, unreconciled: rec.unreconciled, file,
  };
}

/** Two reports for one account: the one run later wins (a Rec2B re-run after
 *  an item cleared replaces the Rec2). */
export function laterRec(a: RecAccount | undefined, b: RecAccount): RecAccount {
  if (!a) return b;
  return (b.runDateISO ?? "") >= (a.runDateISO ?? "") ? b : a;
}

export type RecRoleCheck = {
  role: RecRole;
  /** Marie's book balance, summed over the accounts imported. */
  recs: number;
  /** The accounts expected on this ledger with no rec imported. */
  missing: string[];
  /** Accounts whose statement is not dated at the month end (off-cycle). */
  offCycle: string[];
};

export type LedgerRecs = {
  month: string;
  accounts: (RecAccount & { role: RecRole })[];
  roles: RecRoleCheck[];
};

/** What the quarter-end recs say about one ledger. Null when the ledger owns
 *  no account in the map. */
export function recsForLedger(key: string, month: string, imported: Record<string, RecAccount>): LedgerRecs | null {
  const mine = Object.entries(REC_ACCOUNTS).filter(([, a]) => a.key === key);
  if (!mine.length) return null;
  const [y, m] = month.split("-").map(Number);
  const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const accounts = mine.flatMap(([l4, a]) => (imported[l4] ? [{ ...imported[l4], role: a.role }] : []));
  const roles: RecRoleCheck[] = (["operating", "restricted"] as RecRole[])
    .filter((role) => mine.some(([, a]) => a.role === role))
    .map((role) => {
      const these = accounts.filter((a) => a.role === role);
      return {
        role,
        recs: round2(these.reduce((t, a) => t + a.bookBalance, 0)),
        missing: mine.filter(([l4, a]) => a.role === role && !imported[l4]).map(([l4]) => l4),
        offCycle: these.filter((a) => a.statementDateISO !== monthEnd).map((a) => a.last4),
      };
    });
  return { month, accounts, roles };
}

/** Open items on a rec older than this many days are worth a question. */
export const STALE_OPEN_DAYS = 90;

export function staleItems(a: RecAccount, asOfISO: string): OpenItem[] {
  const asOf = Date.parse(asOfISO + "T12:00:00Z");
  return a.unreconciled.filter((i) => i.dateISO && (asOf - Date.parse(i.dateISO + "T12:00:00Z")) / 86400000 > STALE_OPEN_DAYS);
}

/** From a month folder's file names, the one rec to import per account: a
 *  re-run (Rec2B) first, then the single-file Rec1&2, then Rec2, then Rec1.
 *  Bank statements and anything else are left out. */
export function pickRecFiles<T extends { name: string }>(files: T[]): T[] {
  const RANK: Partial<Record<RecFileKind, number>> = { rec2b: 4, rec12: 3, rec2: 2, rec1: 1 };
  const best = new Map<string, { f: T; r: number }>();
  const loose: T[] = [];
  for (const f of files) {
    if (!/\.pdf$/i.test(f.name)) continue;
    const r = RANK[kindFromName(f.name)];
    if (!r) continue;
    const l4 = last4FromName(f.name);
    if (!l4) { loose.push(f); continue; }
    const cur = best.get(l4);
    if (!cur || r > cur.r) best.set(l4, { f, r });
  }
  return [...[...best.values()].map((b) => b.f), ...loose];
}
