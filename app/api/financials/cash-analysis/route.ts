import { NextResponse } from "next/server";
import { availableStatements } from "@/lib/financials/operating-statements/mappingStore";
import { listFullGls } from "@/lib/financials/operating-statements/statementStore";
import { assembleGls } from "@/lib/financials/operating-statements/glAssemble";
import { cashAtStartOfMonth } from "@/lib/financials/operating-statements/cash";
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

function nameFor(key: string, fallback: string): string {
  return PROPERTY_DEFS.find((p) => p.id === key)?.name ?? fallback;
}

// GET ?year=YYYY&period=1-12 (&ytd=1). Computes each property's cash-flow buckets
// from its uploaded GL using the ported account→code map. Draft / read-only.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const now = new Date();
  const year = Number(url.searchParams.get("year")) || now.getFullYear();
  const period = Math.min(12, Math.max(1, Number(url.searchParams.get("period")) || 12));
  const ytd = url.searchParams.get("ytd") === "1";

  const [mappings, fulls] = await Promise.all([availableStatements(), listFullGls()]);
  const rows = mappings.map((m) => {
    const stored = assembleGls(fulls.filter((g) => g.key === m.key && g.year === year));
    if (!stored) return null;
    const maxPeriod = stored.maxPeriodInFile;
    const p = Math.min(period, maxPeriod);
    const flow = computeCashFlow(stored.monthly, p, { ytd });
    const startingCash = cashAtStartOfMonth(stored, p);
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
      unmappedCount: flow.unmapped.length,
      unmapped: flow.unmapped.slice(0, 8),
    };
  }).filter((r): r is NonNullable<typeof r> => r != null);

  return NextResponse.json({
    year, period, ytd,
    buckets: CASH_FLOW_BUCKETS,
    rows,
    generatedAt: new Date().toISOString(),
  });
}
