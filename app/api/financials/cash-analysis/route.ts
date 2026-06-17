import { NextResponse } from "next/server";
import { availableStatements } from "@/lib/financials/operating-statements/mappingStore";
import { listFullGls, mergeAccountNames } from "@/lib/financials/operating-statements/statementStore";
import { assembleGls } from "@/lib/financials/operating-statements/glAssemble";
import { cashAtStartOfMonth } from "@/lib/financials/operating-statements/cash";
import { mortgagePaymentsFor } from "@/lib/financials/cash-sheet/mortgage";
import { anticipatedRevenueFor } from "@/lib/financials/cash-sheet/revenue";
import { getMonth } from "@/lib/financials/cash-sheet/store";
import { totalBills, monthKey } from "@/lib/financials/cash-sheet/util";
import { computeCashFlow, CASH_FLOW_BUCKETS } from "@/lib/financials/cash-analysis/compute";
import { PROPERTY_DEFS } from "@/lib/properties/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Legacy CASH ANALYSIS entity grouping (by statement key / property code).
const GROUP_OF: Record<string, string> = {};
const addGroup = (label: string, codes: string[]) => codes.forEach((c) => (GROUP_OF[c] = label));
addGroup("Business Parks", ["0800", "PJV3", "PIIICO", "CONDO", "PNIPLX", "4900", "3610", "3620", "3640", "4050", "4060", "4070", "4080", "40A0", "40B0", "40C0"]);
addGroup("Eastwick Joint Venture", ["1500", "9200"]);
addGroup("Shopping Centers", ["1100", "2300", "4500", "4510", "5600", "7010", "7200", "7300", "8200", "9500", "9510"]);
addGroup("LIK Management", ["2010", "2000"]);
addGroup("GP / LP – Property Owner", ["0200", "0300", "0900", "4210", "4410"]);
addGroup("Nockamixon", ["2070", "2040", "2080"]);
addGroup("Korman Homes", ["9800", "9820", "9840", "9860", "PHOMES", "KORMAN HOMES"]);

// Pooled funds carry their rent-roll revenue on the underlying buildings.
const FUND_BUILDINGS: Record<string, string[]> = {
  PJV3: ["3610", "3620", "3640"],
  PNIPLX: ["4050", "4060", "4070", "4080", "40A0", "40B0", "40C0"],
};

function nameFor(key: string, fallback: string): string {
  return PROPERTY_DEFS.find((p) => p.id === key)?.name ?? fallback;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// GET ?year=YYYY&period=1-12 (&ytd=1). Per property: GL-bucketed cash flow
// (Opening→Ending) PLUS an "Estimated Cash Today" that brings the latest posted
// GL forward through the un-posted months using the live weekly bills + scheduled
// mortgage + anticipated receipts. Draft / read-only.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const now = new Date();
  const year = Number(url.searchParams.get("year")) || now.getFullYear();
  const period = Math.min(12, Math.max(1, Number(url.searchParams.get("period")) || 12));
  const ytd = url.searchParams.get("ytd") === "1";
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1;

  const [mappings, fulls, scheduledDebt] = await Promise.all([
    availableStatements(),
    listFullGls(),
    mortgagePaymentsFor(year, period), // for the debt-not-posted check
  ]);
  const acctNames = mergeAccountNames(fulls);

  // Pass 1: assemble each property's GL for the year.
  type Entry = { m: typeof mappings[number]; stored: NonNullable<ReturnType<typeof assembleGls>> };
  const entries: Entry[] = [];
  for (const m of mappings) {
    const stored = assembleGls(fulls.filter((g) => g.key === m.key && g.year === year));
    if (stored) entries.push({ m, stored });
  }

  // The estimate only applies to the current year, for months after the latest
  // posted GL month, through the current month. Pre-pull the weekly overlay
  // inputs (bills / mortgage / receipts) once per un-posted month.
  const estimateApplies = year === curYear;
  const minLatest = entries.length ? Math.min(...entries.map((e) => e.stored.maxPeriodInFile)) : 12;
  const gapMonths: number[] = [];
  if (estimateApplies) for (let mo = minLatest + 1; mo <= curMonth; mo++) gapMonths.push(mo);

  const billsByMonth: Record<number, Awaited<ReturnType<typeof getMonth>>> = {};
  const mortgageByMonth: Record<number, Record<string, number>> = {};
  const revenueByMonth: Record<number, Record<string, number>> = {};
  await Promise.all(gapMonths.map(async (mo) => {
    const [doc, mort, rev] = await Promise.all([
      getMonth(monthKey(year, mo)),
      mortgagePaymentsFor(year, mo),
      anticipatedRevenueFor(year, mo),
    ]);
    billsByMonth[mo] = doc;
    mortgageByMonth[mo] = mort;
    revenueByMonth[mo] = rev.byCode;
  }));

  const revenueForKey = (byCode: Record<string, number>, key: string, propertyCode: string): number => {
    if (FUND_BUILDINGS[key]) return FUND_BUILDINGS[key].reduce((s, b) => s + (byCode[b.toUpperCase()] ?? 0), 0);
    return byCode[key.toUpperCase()] ?? byCode[propertyCode.toUpperCase()] ?? 0;
  };

  const rows = entries.map(({ m, stored }) => {
    const maxPeriod = stored.maxPeriodInFile;
    const p = Math.min(period, maxPeriod);
    const flow = computeCashFlow(stored.monthly, p, { ytd });
    const startingCash = cashAtStartOfMonth(stored, p);
    const scheduled = scheduledDebt[m.key.toUpperCase()] ?? scheduledDebt[m.propertyCode.toUpperCase()] ?? 0;
    const debtPosted = (flow.byBucket[4] ?? 0) !== 0;

    // ── Estimated Cash Today ──
    // latest posted GL ending + (receipts − bills − mortgage) for un-posted months.
    const latestStart = cashAtStartOfMonth(stored, maxPeriod);
    const latestEnding = latestStart == null ? null : latestStart + computeCashFlow(stored.monthly, maxPeriod).netChange;
    const myGap = gapMonths.filter((mo) => mo > maxPeriod);
    let estRevenue = 0, estBills = 0, estMortgage = 0;
    for (const mo of myGap) {
      estRevenue += revenueForKey(revenueByMonth[mo] ?? {}, m.key, m.propertyCode);
      estBills += totalBills(billsByMonth[mo]?.rows?.[m.key] ?? billsByMonth[mo]?.rows?.[m.propertyCode]);
      estMortgage += (mortgageByMonth[mo]?.[m.key.toUpperCase()] ?? mortgageByMonth[mo]?.[m.propertyCode.toUpperCase()] ?? 0);
    }
    const hasEstimate = latestEnding != null && myGap.length > 0;
    const estimatedCash = latestEnding == null ? null : latestEnding + estRevenue - estBills - estMortgage;

    return {
      key: m.key,
      propertyCode: m.propertyCode,
      name: nameFor(m.key, m.entityName),
      group: GROUP_OF[m.key] ?? GROUP_OF[m.propertyCode] ?? "Other",
      period: p,
      maxPeriod,
      byBucket: flow.byBucket,
      netChange: flow.netChange,
      startingCash,
      endingCash: startingCash == null ? null : startingCash + flow.netChange,
      scheduledDebt: scheduled,
      debtExpected: scheduled > 0,
      debtPosted,
      debtMissing: scheduled > 0 && !debtPosted,
      // Weekly overlay → current snapshot.
      latestGLMonth: maxPeriod,
      estimate: hasEstimate
        ? { months: myGap.length, revenue: estRevenue, bills: estBills, mortgage: estMortgage, estimatedCash, latestEnding }
        : null,
      unmappedCount: flow.unmapped.length,
      unmapped: flow.unmapped.slice(0, 8).map((u) => ({
        ...u,
        name: stored.names?.[u.account] ?? acctNames[u.account] ?? null,
      })),
    };
  });

  return NextResponse.json({
    year, period, ytd,
    buckets: CASH_FLOW_BUCKETS,
    rows,
    estimateAsOf: estimateApplies && gapMonths.length ? `${MONTHS[curMonth - 1]} ${curYear}` : null,
    gapMonthLabels: gapMonths.map((mo) => MONTHS[mo - 1]),
    generatedAt: new Date().toISOString(),
  });
}
