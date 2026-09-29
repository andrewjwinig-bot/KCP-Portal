// CAM ESTIMATES BY TENANT — the monthly CAM / INS / RET estimates each tenant
// is billed TODAY (the rent roll), what the budget sets for next year, and WHY
// they moved. This is the review before the estimates are imported into
// Skyline as the tenants' monthly charges, and it is where tenants push back —
// so every change is explained in dollars, not asserted:
//
//   today ──(catch-up)──▶ last reconciliation's actual ──(pool change)──▶ budget
//
// The CATCH-UP is the gap between what the tenant is billed now and what the
// last reconciliation says they actually owed (recon-year amount due ÷ 12): an
// estimate that was set low is being brought up to what the building really
// cost. The POOL CHANGE is the rest — the budget's expense pools against the
// recon year's, through the tenant's own share, admin fee and cap. A tenant
// asking "why is my CAM up $180?" gets "$140 of it is last year's actual cost
// you were under-billed for; $40 is the 2027 budget, CAM pool +6%".
//
// "Budget" is the escrow the budget sets: each category's recovery averaged
// over the months it is billed (`monthlyEstimate` — the same figure the ▲ flag
// reads), or the figure someone keyed as an OVERRIDE (`estimateOverrides.ts`),
// which is also what the budget's recovery lines carry.
//
// Pure: fed `draft.tenantRevenue` and the draft's reimbursement estimate.

import type { TenantRevenueRow } from "./draft";
import type { ReimbursementEstimate } from "./reimbursementEstimate";
import type { SkylineChargeRow } from "@/lib/cam/office/exports";
import { monthlyEstimate, estimateJump, type EstimateJump } from "./estimateJump";
import { ESTIMATE_PARTS, type EstimatePart } from "./estimateOverrides";

export type Estimates = { cam: number; ins: number; ret: number; total: number };

export type WhyPart = {
  part: EstimatePart;
  now: number;
  /** The recon year's actual amount due, a month. Null when there is no recon. */
  recon: number | null;
  next: number;
  /** now → recon actual. */
  catchUp: number | null;
  /** recon actual → budget (the pools, through the tenant's share / cap). */
  budgetChange: number | null;
  /** How the budget pool moved against the recon year's, %. */
  poolPct: number | null;
  overridden: boolean;
  computed?: number;
  /** Settled at reconciliation, never billed monthly: the year's recovery the
   *  budget carries for it (the monthly estimate and the import are $0). */
  annual?: number;
};

export type EstimateRow = {
  unitRef: string;
  tenant: string;
  sqft: number;
  portion?: "retail" | "office";
  status: TenantRevenueRow["status"];
  method?: TenantRevenueRow["method"];
  /** Billed a month today (rent roll). Null for a suite billed nothing today. */
  now: Estimates | null;
  /** The recon year's actual, a month. Null when the tenant is on no recon. */
  recon: Estimates | null;
  next: Estimates;
  change: number;
  changePct: number | null;
  why: WhyPart[];
  /** One line saying what moved it most. */
  reason: string;
  jump: EstimateJump | null;
  assumed: boolean;
  overridden: boolean;
  overrideNote?: string;
  /** Philadelphia's Use & Occupancy tax billed today (the roll's Other
   *  Expense) — shown for reference, NOT an estimate and not imported. */
  uo?: number;
  /** Where each of today's figures came from, and the statement month read. */
  billedFrom?: CurrentBilling["from"];
  billedMonth?: string;
  /** Where the statement and the rent roll disagree. */
  differs?: CurrentBilling["differs"];
  /** Charges settled at reconciliation, not billed monthly — the year's
   *  recovery the budget carries for each (`reconOnlyParts`). */
  annual?: Partial<Record<EstimatePart, number>>;
};

const r0 = (n: number) => Math.round(n || 0);
/** The 2027 monthly estimate is billed in whole $5s — it ends in 0 or 5. */
export const round5 = (n: number) => Math.round((n || 0) / 5) * 5;
/** Excel's ROUND(x, -1): half away from zero. */
const round10 = (n: number) => Math.sign(n || 0) * Math.round(Math.abs(n || 0) / 10) * 10 || 0;
const money = (n: number) => `$${Math.abs(r0(n)).toLocaleString("en-US")}`;
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${money(n)}`;
const LABEL: Record<EstimatePart, string> = { cam: "CAM", ins: "INS", ret: "RET" };

export type BilledFrom = "statement" | "rentroll" | "recon";
export type CurrentBilling = {
  cam: number; ins: number; ret: number;
  /** Philadelphia's Use & Occupancy tax — reference only, never an estimate. */
  uo?: number;
  /** Where each figure came from. */
  from: { cam: BilledFrom; ins: BilledFrom; ret: BilledFrom };
  /** The statement month read ("YYYY-MM"), when there was one. */
  month?: string;
  /** Where the statement and the rent roll disagree about a charge. */
  differs: { part: EstimatePart; statement: number; rentRoll: number }[];
};

/** What a suite is billed a month TODAY, by category — ONE source first: the
 *  tenant's latest MONTHLY STATEMENT, whose dated lines give that month's
 *  CAM, INS, RET and U&O charge by charge (`statementBilling.ts`). A kind the
 *  statement month has no line for falls back, and says so:
 *    CAM / RET → the rent roll's Operating Expense / Real Estate Tax column;
 *    INS → the rent roll's Other Expense — except in PHILADELPHIA, where that
 *      column is INS + U&O in one figure (Victra at 4500: $234 = $20 + $214),
 *      so it falls back to the last recon's INS escrow over the months it
 *      billed ($160 ÷ 8 = $20).
 *  U&O is the statement's U&O line, else the rest of the Other Expense column.
 *  A statement figure that disagrees with the rent roll is listed in
 *  `differs`, so the two sources are checked against each other rather than
 *  silently mixed. */
export function currentBilling(r: Pick<TenantRevenueRow, "billing" | "method">): CurrentBilling | null {
  const b = r.billing;
  if (!b) return null;
  const st = b.stmt?.month ? b.stmt : undefined;
  const phl = b.uo != null; // the roll's Other Expense is INS + U&O
  const m = r.method;
  // Philadelphia INS with no statement line: rebuild the estimate billed
  // since January the way it was SET — the recon year's INS amount due
  // (scaled to a full year for a part-year tenant), rounded to $10, ÷ 12,
  // rounded to $10 (the recon's own `nextYearEstimate`). Fresh Grocer at 4500:
  // $8,336 → $8,340 ÷ 12 = $695 → $700, which is what it is billed. Last
  // year's ESCROW was the old fallback and it is a year stale ($600).
  const reconIns = (): number | null => {
    if (m?.kind !== "retail" || !m.recon) return null;
    const occ = m.reconOcc && m.reconOcc > 0 ? m.reconOcc : 1;
    return round10(round10((m.recon.ins || 0) / occ) / 12);
  };
  const from = { cam: "rentroll" as BilledFrom, ins: "rentroll" as BilledFrom, ret: "rentroll" as BilledFrom };
  const differs: CurrentBilling["differs"] = [];
  const pick = (part: "cam" | "ret", roll: number) => {
    const v = st?.[part];
    if (v == null) return r0(roll);
    from[part] = "statement";
    if (Math.abs(v - roll) >= 1) differs.push({ part, statement: r0(v), rentRoll: r0(roll) });
    return r0(v);
  };
  const cam = pick("cam", b.cam), ret = pick("ret", b.ret);
  let ins: number;
  if (st?.ins != null) {
    ins = r0(st.ins); from.ins = "statement";
    if (!phl && Math.abs(st.ins - b.ins) >= 1) differs.push({ part: "ins", statement: ins, rentRoll: r0(b.ins) });
  } else if (phl) {
    const rc = reconIns();
    ins = Math.min(rc ?? 0, r0(b.uo));
    if (rc != null) from.ins = "recon";
  } else ins = r0(b.ins);
  const uo = phl ? (st?.uo != null ? r0(st.uo) : Math.max(0, r0(b.uo) - ins)) : undefined;
  return { cam, ins, ret, ...(uo != null ? { uo } : {}), from, month: st?.month, differs };
}

/** NO NEW MONTHLY CHARGES FOR AN EXISTING TENANT (owner: "these are signed
 *  leases — we can't just add new charges to tenants who in previous years and
 *  currently aren't paying"). A tenant already in place — on a reconciliation,
 *  or billed anything today — keeps $0 for every category billed $0 today:
 *  what they owe for it, if anything, is collected at reconciliation only, as
 *  it always has been (McDonald's RET, USPS's RET, Clear Channel's own-parcel
 *  RET at 4500). The budget still carries that recovery as revenue — it is
 *  collected, at year-end — but the MONTHLY estimate and the Skyline import
 *  are $0. Only a genuinely NEW lease (no recon, nothing billed) starts new
 *  estimates. A hand-set estimate is a deliberate decision and overrides this. */
export function reconOnlyParts(r: Pick<TenantRevenueRow, "method" | "overridden">, now: { cam: number; ins: number; ret: number } | null): EstimatePart[] {
  const m = r.method;
  const onRecon = m?.kind === "retail" || m?.kind === "office";
  const billedToday = !!now && now.cam + now.ins + now.ret > 0;
  if (!onRecon && !billedToday) return [];
  return ESTIMATE_PARTS.filter((p) => (now?.[p] ?? 0) === 0 && !r.overridden?.[p]);
}

/** The ▲ jump, on what is billed MONTHLY — the table and Revenue by tenant
 *  both read it, so they cannot disagree. */
export function jumpFor(r: TenantRevenueRow): EstimateJump | null {
  const cur = currentBilling(r);
  const now = cur ? { cam: cur.cam, ins: cur.ins, ret: cur.ret } : null;
  const off = new Set(reconOnlyParts(r, now));
  const z = new Array(12).fill(0) as number[];
  return estimateJump({ cam: off.has("cam") ? z : r.cam, ins: off.has("ins") ? z : r.ins, ret: off.has("ret") ? z : r.ret, billing: now });
}

export function estimateRows(rows: TenantRevenueRow[], est?: ReimbursementEstimate | null): EstimateRow[] {
  const out: EstimateRow[] = [];
  const reconYear = est?.reconYear;
  for (const r of rows) {
    if (!r.tenant && !r.recoveryOnly) continue; // a vacancy owes nothing
    // Each monthly estimate to the nearest $5 (owner: "cleaner and easier" —
    // $603 → $605); a figure set by hand stands exactly as keyed.
    const est5 = (p: EstimatePart) => (r.overridden?.[p] ? r0(monthlyEstimate(r[p])) : round5(monthlyEstimate(r[p])));
    const next: Estimates = { cam: est5("cam"), ins: est5("ins"), ret: est5("ret"), total: 0 };
    const b = r.billing;
    const cur = currentBilling(r);
    const now: Estimates | null = cur ? { cam: cur.cam, ins: cur.ins, ret: cur.ret, total: 0 } : null;
    if (now) now.total = now.cam + now.ins + now.ret;
    const annual: Partial<Record<EstimatePart, number>> = {};
    for (const p of reconOnlyParts(r, now)) {
      const year = r0(r[p].reduce((a, v) => a + (v || 0), 0));
      if (year) annual[p] = year;
      next[p] = 0;
    }
    next.total = next.cam + next.ins + next.ret;
    const anyAnnual = Object.values(annual).some((v) => (v ?? 0) > 0);
    if ((!now || now.total === 0) && next.total === 0 && !anyAnnual) continue; // gross lease: nothing to say

    // The recon year's actual, a month — scaled to a full year where the
    // tenant was there only part of it, as the engine does.
    const m = r.method;
    const reconDue = m && (m.kind === "retail" || m.kind === "office") ? m.recon : null;
    const occ = m?.kind === "retail" && m.reconOcc && m.reconOcc > 0 ? m.reconOcc : 1;
    const recon: Estimates | null = reconDue ? {
      cam: r0(reconDue.cam / occ / 12), ins: r0(reconDue.ins / occ / 12), ret: r0(reconDue.ret / occ / 12), total: 0,
    } : null;
    if (recon) recon.total = recon.cam + recon.ins + recon.ret;

    const why: WhyPart[] = ESTIMATE_PARTS.map((part) => {
      const n = now?.[part] ?? 0, x = next[part], rc = recon ? recon[part] : null;
      const ratio = est?.ratios?.[part];
      return {
        part, now: n, recon: rc, next: x,
        catchUp: rc == null ? null : rc - n,
        budgetChange: rc == null ? null : x - rc,
        poolPct: ratio && Number.isFinite(ratio) ? (ratio - 1) * 100 : null,
        overridden: !!r.overridden?.[part],
        computed: r.computed?.[part],
        ...(annual[part] != null ? { annual: annual[part] } : {}),
      };
    }).filter((w) => w.now || w.next || w.recon);

    const change = next.total - (now?.total ?? 0);
    out.push({
      unitRef: r.unitRef, tenant: r.tenant, sqft: r.sqft, portion: r.portion, status: r.status, method: r.method,
      now, recon, next, change,
      changePct: now && now.total > 0.5 ? (change / now.total) * 100 : null,
      why, reason: reasonFor(r, now, recon, next, why, reconYear),
      jump: jumpFor(r),
      ...(anyAnnual ? { annual } : {}),
      assumed: r.assumed.some(Boolean),
      overridden: !!r.overridden && Object.values(r.overridden).some(Boolean),
      overrideNote: r.overrideNote,
      ...(cur ? { billedFrom: cur.from, billedMonth: cur.month, differs: cur.differs } : {}),
      ...(cur?.uo != null ? { uo: cur.uo } : {}),
    });
  }
  return out;
}

/** The one-line why: the override if there is one; else whichever of the
 *  catch-up and the budget change moved the bill most, in dollars. */
function reasonFor(r: TenantRevenueRow, now: Estimates | null, recon: Estimates | null, next: Estimates, why: WhyPart[], reconYear?: number): string {
  const ann = why.filter((w) => w.annual);
  const base = reasonCore(r, now, recon, next, why.filter((w) => !w.annual), reconYear);
  if (!ann.length) return base;
  const note = `${ann.map((w) => LABEL[w.part]).join(" + ")} settled at reconciliation, not billed monthly (${ann.map((w) => `${money(w.annual!)}/yr`).join(" + ")})`;
  return next.total === 0 && (!now || now.total === 0) ? note : `${note} · ${base}`;
}

function reasonCore(r: TenantRevenueRow, now: Estimates | null, recon: Estimates | null, next: Estimates, why: WhyPart[], reconYear?: number): string {
  if (r.overridden && Object.values(r.overridden).some(Boolean)) return `Set by hand${r.overrideNote ? ` — ${r.overrideNote}` : ""}`;
  const m = r.method;
  if (m?.kind === "retail" && m.grossLease) return "Gross lease — no recoveries";
  if (!now || now.total === 0) {
    if (m?.kind === "leaseup") return "Lease-up — new estimate from its start month";
    if (m?.kind === "new" && m.assumption === "gross") return "Gross lease (unit page) — no recoveries";
    if (m?.kind === "new" && m.assumption === "held") return "Not on a reconciliation — no recoveries billed today, none assumed";
    if (m?.kind === "new") return m.assumption === "nnn" ? "Newer lease, on no reconciliation — pro-rata share, NNN" : "Newer lease — base year is the budget year";
    return "Not billed today — first estimate";
  }
  if (next.total === 0) return r.status === "expiring" ? "Lease ends before the year — nothing billed" : "Backed out of the budget — nothing billed";
  if (m?.kind === "new" && m.assumption === "held") return "Not on a reconciliation — held at what it is billed today, no new charges";
  if (!recon) return "No reconciliation to compare against";
  const catchUp = recon.total - now.total, budget = next.total - recon.total;
  const big = why.slice().sort((a, b) => Math.abs((b.next - b.now)) - Math.abs((a.next - a.now)))[0];
  const pool = big?.poolPct != null && Math.abs(big.poolPct) >= 0.5 ? ` (${LABEL[big.part]} pool ${big.poolPct >= 0 ? "+" : "−"}${Math.abs(big.poolPct).toFixed(1)}%)` : "";
  const capped = m?.kind === "retail" && m.capPct != null ? ` · CAM capped at ${m.capPct}%` : "";
  if (Math.abs(catchUp) < 1 && Math.abs(budget) < 1) return "Unchanged";
  const parts: string[] = [];
  if (Math.abs(catchUp) >= 1) parts.push(`${signed(catchUp)} to the ${reconYear ?? "last"} actual`);
  if (Math.abs(budget) >= 1) parts.push(`${signed(budget)} budget${pool}`);
  return parts.join(" · ") + capped;
}

export type EstimateTotals = {
  now: Estimates; recon: Estimates; next: Estimates; change: number; changePct: number | null; flagged: number; tenants: number; overridden: number;
  /** Tenants whose whole "today" came off the monthly statement. */
  fromStatement: number;
  /** Tenants with at least one charge NOT on the statement (rent roll / recon). */
  fallback: number;
  /** Tenants whose statement disagrees with the rent roll. */
  differs: number;
  /** The statement month most tenants were read from ("YYYY-MM"). */
  statementMonth: string | null;
};

/** Every "today" figure came off the statement. */
export const allFromStatement = (r: EstimateRow) => !!r.billedFrom && ESTIMATE_PARTS.every((p) => r.billedFrom![p] === "statement");

export function estimateTotals(rows: EstimateRow[]): EstimateTotals {
  const z = (): Estimates => ({ cam: 0, ins: 0, ret: 0, total: 0 });
  const now = z(), recon = z(), next = z();
  const keys: (keyof Estimates)[] = ["cam", "ins", "ret", "total"];
  for (const r of rows) for (const k of keys) { now[k] += r.now?.[k] ?? 0; recon[k] += r.recon?.[k] ?? 0; next[k] += r.next[k]; }
  const change = next.total - now.total;
  return {
    now, recon, next, change, changePct: now.total > 0.5 ? (change / now.total) * 100 : null,
    flagged: rows.filter((r) => r.jump).length, tenants: rows.length, overridden: rows.filter((r) => r.overridden).length,
    fromStatement: rows.filter(allFromStatement).length,
    fallback: rows.filter((r) => r.now && !allFromStatement(r)).length,
    differs: rows.filter((r) => r.differs?.length).length,
    statementMonth: mostCommon(rows.map((r) => r.billedMonth).filter(Boolean) as string[]),
  };
}

function mostCommon(xs: string[]): string | null {
  const n = new Map<string, number>();
  for (const x of xs) n.set(x, (n.get(x) ?? 0) + 1);
  let best: string | null = null;
  for (const [k, c] of n) if (best == null || c > n.get(best)! || (c === n.get(best)! && k > best)) best = k;
  return best;
}

/** Each computed estimate is imported in whole $5s (`round5`) — the same
 *  figure the table shows; an override is imported exactly as keyed. */
export const skylineMonthly = (w: WhyPart) => (w.overridden ? r0(w.next) : round5(w.next));

/** The Skyline recurring-charge rows — the SAME format the CAM recon's
 *  Estimates page uploads (`SkylineChargeRow`, unit "<ref>-CU", monthly,
 *  effective 1/1): CAM seq 2, INS seq 3, RET seq 4. Zero rows are dropped by
 *  `chargeRowsToCSV`. */
export function skylineEstimateRows(rows: EstimateRow[], year: number): SkylineChargeRow[] {
  const seq: Record<EstimatePart, number> = { cam: 2, ins: 3, ret: 4 };
  const out: SkylineChargeRow[] = [];
  for (const r of rows) for (const w of r.why) {
    out.push({
      unit: `${r.unitRef}-CU`, seq: seq[w.part], chargeCode: LABEL[w.part],
      chargeDescription: `${year} ${LABEL[w.part]} Estimate`, freq: "M",
      effectiveDate: `${year}-01-01`, endDate: "", amount: skylineMonthly(w),
    });
  }
  return out;
}
