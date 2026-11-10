// OPEN CREDIT TRACKER + A/R AGING SCHEDULE (owner: "call out the open credits
// at the top so we can easily see an open credit tracker … do like an aging
// schedule chart"). Both read the imported laser statement through `summarize`,
// so they cannot disagree with the roster beneath them.
//
// What the laser statement CAN tell us about a credit: Skyline prints ONE
// undated aggregate "Open Credits" line per tenant, plus — where a credit was
// posted as its own dated line (an overpayment, a reversal) — that line too.
// What it CANNOT: the CAM / RET / INS / OTHER split and the reason ("Dup Pymt
// of July CAM"). That lives in Skyline's tenant ledger, so the tracker keeps a
// FOLLOW-UP NOTE per tenant (`creditNoteStore.ts`) — the notes column of the
// team's spreadsheet — and says where the split comes from.
//
// "Since" is read off the earlier imported months: the first month of the
// unbroken run in which this tenant carried a credit, so a credit that has sat
// on the books for a year says so.
//
// Pure (no I/O).

import type { StatementRun, TenantStatement, AgingBucket } from "./types";
import { AGING_ORDER } from "./types";
import { agingOf, summarize } from "./summary";
import { PROPERTY_DEFS } from "../properties/data";
import { MIN_OPEN_CREDIT } from "./aging";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** The tracker's groups, in the spreadsheet's order. */
export const CREDIT_GROUPS = ["JV III", "NI LLC", "Shopping Centers", "Korman Homes", "Other", "Former tenants"] as const;
export type CreditGroup = (typeof CREDIT_GROUPS)[number];

/** A unit Skyline prints as a former occupant ("3640-300-FO"). */
export const isFormerOccupant = (unitRef: string) => /-FO$/i.test(unitRef.trim());

export function creditGroupOf(propertyCode: string, unitRef = ""): CreditGroup {
  if (isFormerOccupant(unitRef)) return "Former tenants";
  const def = PROPERTY_DEFS.find((p) => p.id.toUpperCase() === propertyCode.toUpperCase());
  if (def?.fundGroup === "JV III") return "JV III";
  if (def?.fundGroup === "NI LLC") return "NI LLC";
  if (def?.allocGroup === "SC") return "Shopping Centers";
  if (def?.type === "Residential") return "Korman Homes";
  return "Other";
}

export type CreditLine = { dateISO: string | null; description: string; amount: number };

export type OpenCredit = {
  unitRef: string;
  propertyCode: string;
  suite: string;
  tenantName: string;
  group: CreditGroup;
  /** Credits on account, as a positive figure. */
  credit: number;
  /** The lines that make it up (positive amounts), in printed order. */
  lines: CreditLine[];
  /** Open charges on the same statement, before the credit. */
  openCharges: number;
  /** What the tenant owes net of the credit — negative = we owe them. */
  net: number;
  /** First month of the unbroken run of months carrying a credit. */
  since: string;
  /** How many imported months in a row (this one included). */
  months: number;
};

export type CreditGroupTotal = { group: CreditGroup; credit: number; count: number; rows: OpenCredit[] };

export type OpenCreditTracker = {
  period: string;
  total: number;
  count: number;
  /** Tenants whose credit exceeds what they owe — money we hold for them. */
  netCreditTotal: number;
  netCreditCount: number;
  groups: CreditGroupTotal[];
  /** Credits under MIN_OPEN_CREDIT left off (owner: not worth chasing). */
  small: number;
};

/** Positive credit on one statement, from `summarize` — the roster's figure. */
const creditOf = (st: TenantStatement, period: string) => summarize(st, period).credits;

export function openCredits(run: StatementRun, earlier: StatementRun[] = []): OpenCreditTracker {
  // Earlier months, newest first, for "since".
  const history = earlier
    .filter((r) => r.period < run.period)
    .sort((a, b) => b.period.localeCompare(a.period))
    .map((r) => ({ period: r.period, byUnit: new Map(r.statements.map((s) => [s.unitRef.toUpperCase(), s])) }));

  const rows: OpenCredit[] = [];
  let small = 0;
  for (const st of run.statements) {
    const credit = creditOf(st, run.period);
    if (credit < 0.005) continue;
    // Under $5 isn't worth chasing (owner) — left off, as on Open Credits.
    if (credit < MIN_OPEN_CREDIT) { small++; continue; }
    const lines = st.charges
      .filter((c) => c.amount < 0)
      .map((c) => ({ dateISO: c.dateISO, description: c.description, amount: r2(-c.amount) }));
    const openCharges = r2(st.charges.filter((c) => c.amount > 0).reduce((a, c) => a + c.amount, 0));

    let since = run.period, months = 1;
    for (const h of history) {
      const prev = h.byUnit.get(st.unitRef.toUpperCase());
      if (!prev || creditOf(prev, h.period) < 0.005) break;
      since = h.period; months += 1;
    }

    rows.push({
      unitRef: st.unitRef, propertyCode: st.propertyCode, suite: st.suite, tenantName: st.tenantName,
      group: creditGroupOf(st.propertyCode, st.unitRef),
      credit, lines, openCharges, net: r2(openCharges - credit), since, months,
    });
  }

  const groups = CREDIT_GROUPS
    .map((group) => {
      const g = rows.filter((r) => r.group === group).sort((a, b) => b.credit - a.credit);
      return { group, credit: r2(g.reduce((a, r) => a + r.credit, 0)), count: g.length, rows: g };
    })
    .filter((g) => g.count > 0);
  const owed = rows.filter((r) => r.net < -0.005);

  return {
    period: run.period,
    total: r2(rows.reduce((a, r) => a + r.credit, 0)),
    count: rows.length,
    netCreditTotal: r2(owed.reduce((a, r) => a - r.net, 0)),
    netCreditCount: owed.length,
    groups,
    small,
  };
}

// ── A/R aging schedule ─────────────────────────────────────────────────────

export type AgingRow = {
  propertyCode: string;
  /** Open CHARGES by bucket — credits are their own column, never netted into
   *  "Current" (the laser statement's credit row is undated, so netting it in
   *  would make a month look paid that is not). */
  buckets: Record<AgingBucket, number>;
  charges: number;
  credits: number;
  net: number;
  tenants: number;
};

export type AgingSchedule = { rows: AgingRow[]; total: AgingRow };

const emptyBuckets = () => Object.fromEntries(AGING_ORDER.map((b) => [b, 0])) as Record<AgingBucket, number>;

export function agingSchedule(run: StatementRun): AgingSchedule {
  const by = new Map<string, AgingRow>();
  const total: AgingRow = { propertyCode: "Total", buckets: emptyBuckets(), charges: 0, credits: 0, net: 0, tenants: 0 };
  for (const st of run.statements) {
    const row = by.get(st.propertyCode) ?? { propertyCode: st.propertyCode, buckets: emptyBuckets(), charges: 0, credits: 0, net: 0, tenants: 0 };
    row.tenants += 1; total.tenants += 1;
    for (const c of st.charges) {
      if (c.amount < 0) { row.credits -= c.amount; total.credits -= c.amount; continue; }
      const b = agingOf(c, run.period);
      row.buckets[b] += c.amount; total.buckets[b] += c.amount;
      row.charges += c.amount; total.charges += c.amount;
    }
    by.set(st.propertyCode, row);
  }
  const tidy = (r: AgingRow): AgingRow => ({
    ...r,
    buckets: Object.fromEntries(AGING_ORDER.map((b) => [b, r2(r.buckets[b])])) as Record<AgingBucket, number>,
    charges: r2(r.charges), credits: r2(r.credits), net: r2(r.charges - r.credits),
  });
  // The laser statement's own order is property-grouped; keep first-seen order.
  return { rows: [...by.values()].map(tidy), total: tidy(total) };
}

// ── Applying a credit (owner: "click to apply them to the statements and try
// to widdle them down") ─────────────────────────────────────────────────────
// The portal cannot post to Skyline. Applying a credit here RECORDS which open
// charges it goes against — oldest first, the last one partially — and that
// record is the list of entries to key in Skyline. The tracker counts the
// credit down by it, and the next laser statement shows it cleared (or not).
// The amounts are always recomputed from the stored statement, never taken
// from the client, as a remittance's are.

export type AppliedLine = { idx: number; dateISO: string | null; description: string; open: number; applied: number };
export type CreditApplicationPlan = { lines: AppliedLine[]; applied: number; credit: number; remaining: number };

/** Apply the tenant's credit to the chosen charges (indexes into `st.charges`;
 *  null = every open charge), oldest first, capped at the credit. */
export function planCreditApplication(st: TenantStatement, period: string, chosen: number[] | null): CreditApplicationPlan {
  const credit = creditOf(st, period);
  const pick = chosen ? new Set(chosen) : null;
  const open = st.charges
    .map((c, idx) => ({ c, idx }))
    .filter(({ c, idx }) => c.amount > 0.005 && (!pick || pick.has(idx)))
    .sort((a, b) => (a.c.dateISO ?? "9999").localeCompare(b.c.dateISO ?? "9999") || a.idx - b.idx);
  let left = credit;
  const lines: AppliedLine[] = [];
  for (const { c, idx } of open) {
    if (left < 0.005) break;
    const applied = r2(Math.min(left, c.amount));
    left = r2(left - applied);
    lines.push({ idx, dateISO: c.dateISO, description: c.description, open: r2(c.amount), applied });
  }
  const applied = r2(lines.reduce((a, l) => a + l.applied, 0));
  return { lines, applied, credit, remaining: r2(credit - applied) };
}
