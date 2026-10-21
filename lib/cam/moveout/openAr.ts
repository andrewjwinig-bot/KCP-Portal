// THE OPEN BALANCE ON A MOVE-OUT (owner: "this is their final list of charges
// … indicate somewhere it includes the 2 unpaid months that have already been
// billed … but this should still include that amount"). A close-out is the
// tenant's LAST bill, so it carries everything still open on their account —
// read off their newest monthly statement (the Skyline Statement report, the
// one source of open A/R) — not just the CAM/RET true-up.
//
// The reconciliation credits escrow AS BILLED. Escrow billed and never paid is
// therefore still owed, and it is owed through this open balance, once. The
// settlement says so in words (`escrowUnpaid`), because a credit for $3,600
// beside a tenant who paid $2,800 otherwise reads as a giveaway.
//
// Pure (no storage) so the page, the PDF and the emails compute it alike.

import { sameTenant } from "@/lib/leasing/confirmedMoveouts";
import type { ChargeCategory, TenantStatement } from "@/lib/statements/types";
import { CATEGORY_LABEL, CATEGORY_ORDER } from "@/lib/statements/types";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const r2 = (n: number) => Math.round(n * 100) / 100;

export type MoveoutOpenAr = {
  /** The statement period it was read from ("YYYY-MM"). */
  period: string;
  /** When that tenant's figures were imported — the balance is as of then. */
  asOf: string | null;
  /** The tenant name as Skyline printed it on the statement. */
  tenantName: string;
  /** False when the statement was taken by SUITE because no statement carried
   *  the rent roll's name (Skyline's legal name ≠ the roll's short name). */
  nameMatched: boolean;
  /** Skyline's TOTAL AMOUNT DUE for the tenant. */
  balance: number;
  /** Open charges by category, statement order. */
  byCategory: { category: ChargeCategory; label: string; amount: number }[];
  /** EVERY open charge, in Skyline's printed order (owner: "should we itemize
   *  list of unpaid charges?") — the final bill lists them. `escrow` marks the
   *  estimates billed and unpaid that the reconciliation credited as billed. */
  charges: { dateISO: string | null; description: string; amount: number; category: ChargeCategory; escrow: boolean }[];
  /** CAM / INS / RET estimates billed in the close-out year and still open —
   *  credited as billed by the reconciliation, collected here. */
  escrowUnpaid: number;
  /** Those months, e.g. "Aug – Sep 2026". Null when none. */
  escrowMonths: string | null;
};

const ESCROW: ChargeCategory[] = ["cam", "insurance", "ret"];

/** "Aug – Sep 2026", "Aug, Oct 2026", "Sep 2026". */
function monthsLabel(months: number[], year: number): string | null {
  const ms = [...new Set(months)].sort((a, b) => a - b);
  if (!ms.length) return null;
  const run = ms.every((m, i) => i === 0 || m === ms[i - 1] + 1);
  if (ms.length === 1) return `${MON[ms[0] - 1]} ${year}`;
  return run ? `${MON[ms[0] - 1]} – ${MON[ms[ms.length - 1] - 1]} ${year}` : `${ms.map((m) => MON[m - 1]).join(", ")} ${year}`;
}

export function openArSummary(st: TenantStatement, period: string, year: number): MoveoutOpenAr {
  const totals = new Map<ChargeCategory, number>();
  const escrowMonths: number[] = [];
  let escrowUnpaid = 0;
  // The move-out true-up itself, once posted, is ALREADY the reconciliation
  // line — counting it in the open balance too would bill it twice.
  let trueUp = 0;
  const lines: MoveoutOpenAr["charges"] = [];
  for (const c of st.charges ?? []) {
    if (/move[\s-]*out/i.test(c.description) && /adj/i.test(c.description)) { trueUp += c.amount; continue; }
    const dd = c.dateISO?.match(/^(\d{4})-(\d{2})/);
    lines.push({ dateISO: c.dateISO, description: c.description, amount: r2(c.amount), category: c.category,
      escrow: ESCROW.includes(c.category) && c.reconYear == null && c.amount > 0 && !!dd && Number(dd[1]) === year });
    totals.set(c.category, (totals.get(c.category) ?? 0) + c.amount);
    const d = c.dateISO?.match(/^(\d{4})-(\d{2})/);
    // An estimate, not a year-end adjustment; owed, not a credit; this year.
    if (ESCROW.includes(c.category) && c.reconYear == null && c.amount > 0 && d && Number(d[1]) === year) {
      escrowUnpaid += c.amount;
      escrowMonths.push(Number(d[2]));
    }
  }
  return {
    period,
    asOf: st.importedAt ?? null,
    tenantName: st.tenantName,
    nameMatched: true,
    balance: r2(st.reportedBalance - trueUp),
    byCategory: CATEGORY_ORDER.filter((k) => Math.abs(totals.get(k) ?? 0) >= 0.005)
      .map((k) => ({ category: k, label: CATEGORY_LABEL[k], amount: r2(totals.get(k)!) })),
    charges: lines,
    escrowUnpaid: r2(escrowUnpaid),
    escrowMonths: monthsLabel(escrowMonths, year),
  };
}

const fold = (s: string) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
// Skyline suffixes the charge type: -CU (current) and -FO (FORMER occupant —
// the only way a moved-out tenant appears, e.g. SEOM's "3640-300-FO"). The
// statement store keeps -FO on purpose, so a former and a current tenant of
// one suite stay two statements; the close-out reads past it here.
const refKey = (s: string) => fold((s ?? "").replace(/-(CU|FO)$/i, ""));
const like = (a: string, b: string) => sameTenant(a, b)
  || (fold(b).length >= 4 && fold(a).includes(fold(b))) || (fold(a).length >= 4 && fold(b).includes(fold(a)));

/** The departing tenant's statement among `statements` (one month's, or one
 *  file's). By NAME first, since a re-leased suite's newest statement is the
 *  next tenant's. With no statement carrying the name — Skyline prints a legal
 *  name the rent roll shortens — the suite's own, unless it is the CURRENT
 *  occupant's (`currentOccupant`, off the newest rent roll). */
export function pickTenantStatement(
  statements: TenantStatement[], unitRef: string, name: string | undefined, currentOccupant?: string | null,
): { statement: TenantStatement; nameMatched: boolean } | null {
  const ref = refKey(unitRef);
  const onSuite = statements.filter((s) => refKey(s.unitRef) === ref || refKey(s.skylineUnitRef) === ref);
  const named = onSuite.find((s) => !name || like(s.tenantName, name));
  if (named) return { statement: named, nameMatched: true };
  const successor = currentOccupant && !(name && like(currentOccupant, name)) ? currentOccupant : null;
  const other = onSuite.find((s) => !(successor && like(s.tenantName, successor)));
  return other ? { statement: other, nameMatched: false } : null;
}

/** The departing tenant's newest statement across the imported months (`runs`
 *  newest first) — a name match in any month beats a suite-only match. */
export function pickOpenAr(
  runs: { period: string; statements: TenantStatement[] }[],
  unitRef: string,
  name: string | undefined,
  year: number,
  currentOccupant?: string | null,
): MoveoutOpenAr | null {
  let fallback: MoveoutOpenAr | null = null;
  for (const run of runs) {
    const hit = pickTenantStatement(run.statements, unitRef, name, currentOccupant);
    if (hit?.nameMatched) return openArSummary(hit.statement, run.period, year);
    if (hit && !fallback) fallback = { ...openArSummary(hit.statement, run.period, year), nameMatched: false };
  }
  return fallback;
}

/** What the tenant owes in all: the true-up plus everything still open. */
export const totalDue = (reconBalance: number, ar: MoveoutOpenAr | null) => r2(reconBalance + (ar?.balance ?? 0));

/** The line the settlement prints under the open balance. */
export function escrowNote(ar: MoveoutOpenAr | null): string | null {
  if (!ar || ar.escrowUnpaid < 0.005) return null;
  const amt = "$" + ar.escrowUnpaid.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `Includes ${amt} of estimated charges billed ${ar.escrowMonths} and not yet paid. The reconciliation credits estimates as billed, so these unpaid months are collected here.`;
}

/** The same fact as a clause for the tenant's letter. */
export function escrowClause(ar: MoveoutOpenAr | null): string | null {
  if (!ar || ar.escrowUnpaid < 0.005) return null;
  const amt = "$" + ar.escrowUnpaid.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `including ${amt} of estimated charges billed ${ar.escrowMonths} and not yet paid`;
}
