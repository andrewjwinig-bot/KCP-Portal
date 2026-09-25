// Running the rent-roll check — the shared path, so the "?" on a statement
// line and the table inside the modal cannot disagree about whether a suite
// ties. Both call `runRentCheck`; the route that serves the modal is a thin
// wrapper over it.

import { getGl, getTransactions, assembledTransactions } from "./statementStore";
import { accountMatchesMask } from "./mask";
import { directoryFromRoll, canonicalUnitRef, type TenantDirectory } from "./tenants";
import { identifyTx } from "./txUnits";
import { rentCheck, basisForLine, BASIS_LABEL, type RentCheckUnit, type RentCheckBasis, type RentCheckResult, type RentCheckStatus } from "./rentCheck";
import { getJSON, listJSON } from "@/lib/storage";
import { rollAsOf } from "@/lib/rentroll/current";
import type { RentRollData } from "@/lib/rentroll/parseRentRollExcel";

/**
 * WHICH ROLL, AND FROM WHERE.
 *
 * The rent roll HISTORY, not the stored "current" pointer. The pointer is a
 * copy that is only rewritten when someone opens the Rent Roll page, so after
 * a re-import (or a parser fix) it can carry figures the Rent Roll page no
 * longer shows. 1100's August: the Rent Roll page read Ferry Good Treats at
 * $2,000, the pointer still had $0, and the statement called the correctly
 * billed $2,000 "UNEXPECTED". Reading the snapshots the page itself composes
 * from makes the two impossible to disagree.
 *
 * And the roll AS OF THE STATEMENT'S MONTH (`rollAsOf`): an August statement
 * is checked against the August roll, so importing September's cannot move
 * August's expectation.
 */
export type RentCheckShared = {
  snapshots: RentRollData[];
  /** Per month key — the roll and its tenant directory, built once. */
  byMonth: Map<string, { rentroll: RentRollData; dir: TenantDirectory } | null>;
};

/** Loaded once per request and handed to every line, rather than per line. */
export type RentCheckContext = {
  shared: RentCheckShared;
  byAccount: Record<string, { month: number; amount: number; date: string | null; description: string; ref: string }[]>;
};

/**
 * The parts that are the same for every property. Split out because the
 * cross-property Review asks this question of thirteen properties in one
 * pass, and re-reading the history for each of them is thirteen times the
 * work for one answer. Null when there is no rent roll — the check simply
 * doesn't run.
 */
export async function loadRentCheckShared(): Promise<RentCheckShared | null> {
  let snapshots = ((await listJSON("rentroll-history")) ?? []) as RentRollData[];
  snapshots = snapshots.filter((s) => s && Array.isArray(s.properties));
  if (!snapshots.length) {
    // Before any history existed the pointer was the only copy.
    const legacy = (await getJSON("rentroll", "current")) as RentRollData | null;
    if (!legacy) return null;
    snapshots = [legacy];
  }
  return { snapshots, byMonth: new Map() };
}

/** The roll (and directory) a statement month is checked against. */
export function rollForMonth(shared: RentCheckShared, year: number, period: number) {
  const key = `${year}-${String(period).padStart(2, "0")}`;
  if (!shared.byMonth.has(key)) {
    const rentroll = rollAsOf(shared.snapshots, key);
    shared.byMonth.set(key, rentroll ? { rentroll, dir: directoryFromRoll(rentroll) } : null);
  }
  return shared.byMonth.get(key)!;
}

/** Null when there is no rent roll — the check simply doesn't run. */
export async function loadRentCheckContext(
  key: string,
  year: number,
  versionId?: string | null,
  shared?: RentCheckShared | null,
): Promise<RentCheckContext | null> {
  const base = shared ?? (await loadRentCheckShared());
  if (!base) return null;
  const byAccount = versionId
    ? await (async () => { const v = await getGl(versionId); return v ? getTransactions(v.id) : {}; })()
    : await assembledTransactions(key, year);
  return { shared: base, byAccount } as RentCheckContext;
}

export function runRentCheck(ctx: RentCheckContext, opts: {
  property: string | null;
  year: number;
  period: number;
  scope: "month" | "ytd";
  mask: string;
  sign: 1 | -1;
  basis: RentCheckBasis;
}): RentCheckResult & { properties: string[] } {
  const { property, year, period, scope, mask, sign, basis } = opts;
  const { byAccount } = ctx;
  const resolved = rollForMonth(ctx.shared, year, period);
  if (!resolved) return { ...rentCheck({ year, period, scope, units: [], billedByUnit: {}, basis }), properties: [] };
  const { rentroll, dir } = resolved;

  // Bill the window, suite by suite. A charge that resolves to no suite is
  // totalled separately — dropping it would make the billed column short and
  // read as a collection problem it isn't.
  const billedByUnit: Record<string, number> = {};
  let unplacedBilled = 0;
  for (const account of Object.keys(byAccount)) {
    if (!accountMatchesMask(mask, account)) continue;
    for (const t of byAccount[account]) {
      if (scope === "month" ? t.month !== period : t.month > period) continue;
      const amount = t.amount * sign;
      const id = identifyTx(dir, account, t);
      // Only a suite the ACCOUNT or the charge text names is evidence; a
      // name-matched payer is a convenience and must not drive a variance.
      if (id.unit && id.via !== "payer") {
        const ref = canonicalUnitRef(id.unit);
        billedByUnit[ref] = (billedByUnit[ref] ?? 0) + amount;
      } else unplacedBilled += amount;
    }
  }

  // Which properties this line covers: the ones its own charges landed in,
  // plus the statement's property when the rent roll carries it (so a suite
  // that was never billed at all still appears — the finding that matters).
  const codes = new Set<string>();
  for (const ref of Object.keys(billedByUnit)) codes.add(ref.split("-")[0]);
  if (property) {
    const p = property.toUpperCase();
    if (rentroll.properties.some((rp) => rp.propertyCode.toUpperCase() === p)) codes.add(p);
  }

  const units: RentCheckUnit[] = [];
  for (const p of rentroll.properties) {
    if (!codes.has(p.propertyCode.toUpperCase())) continue;
    for (const u of p.units) {
      // In-house amenity space (training room, conference centre) is occupied
      // for SF accounting but is not a rent-paying tenant.
      if (u.amenity) continue;
      units.push({
        unitRef: canonicalUnitRef(u.unitRef),
        tenant: u.isVacant ? null : (u.occupantName || "").trim() || null,
        isVacant: u.isVacant,
        sqft: u.sqft || null,
        baseRent: u.baseRent || 0,
        opexMonth: u.opexMonth || 0,
        reTaxMonth: u.reTaxMonth || 0,
        otherMonth: u.otherMonth || 0,
        leaseFrom: u.leaseFrom,
        leaseTo: u.leaseTo,
      });
    }
  }

  return { ...rentCheck({ year, period, scope, units, billedByUnit, unplacedBilled, basis }), properties: [...codes].sort() };
}

// ── The "?" ─────────────────────────────────────────────────────────────────

/**
 * The statuses that are a real BILLING problem.
 *
 * `partial` (a lease starting or ending mid-window, so the real charge is
 * prorated) and `approximate` are expectations we already say we cannot make
 * exactly — flagging them would put a "?" on every new lease. `idle` is
 * nothing due and nothing billed, which is the quiet correct case.
 */
const MISMATCH: ReadonlySet<RentCheckStatus> = new Set<RentCheckStatus>(["not-billed", "short", "over", "unexpected"]);

const STATUS_WORD: Partial<Record<RentCheckStatus, string>> = {
  "not-billed": "not billed", short: "short", over: "over", unexpected: "unexpected",
};

const dollars = (v: number) => `$${Math.round(Math.abs(v)).toLocaleString("en-US")}`;

/**
 * Name the suites that do not tie, or null when every one of them does.
 *
 * WHEN THEY ALL TIE THERE IS NOTHING TO SAY — that is the whole point of the
 * check, and a "?" on a line that reconciles perfectly is the noise every rule
 * in `flagRules` exists to avoid.
 *
 * The floor is the house floor (`FLAG_MIN_DOLLARS`) applied to the TOTAL of
 * the untied amounts, not to each one: a single suite $4,667 short clears it,
 * and so does a rate change that left nine suites $60 short each, which is the
 * more interesting of the two and would never clear a per-suite test.
 */
export function billingFlagReason(
  res: RentCheckResult,
  basis: RentCheckBasis,
  minDollars: number,
  maxNamed = 4,
): string | null {
  const off = res.rows.filter((r) => MISMATCH.has(r.status));
  if (!off.length) return null;
  const total = off.reduce((s, r) => s + Math.abs(r.variance), 0);
  if (total < minDollars) return null;
  const worst = [...off].sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
  const named = worst.slice(0, maxNamed)
    .map((r) => `${r.tenant || r.unitRef} (${STATUS_WORD[r.status] ?? r.status} ${dollars(r.variance)})`);
  const rest = worst.length - named.length;
  const who = named.join(", ") + (rest > 0 ? `, and ${rest} more` : "");
  const column = BASIS_LABEL[basis].replace(/^Rent roll(\s·\s)?/, "") || "base rent";
  return `${off.length} suite${off.length === 1 ? "" : "s"} do${off.length === 1 ? "es" : ""} not tie to the rent roll's ${column} column: ${who}`;
}

export { basisForLine };
