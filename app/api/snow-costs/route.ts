import { NextResponse } from "next/server";
import { OFFICE_BUILDINGS, SEED_EXPENSES } from "@/lib/rentroll/baseYearExpenses";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import { listFullGls } from "@/lib/financials/operating-statements/statementStore";
import { assembleGls } from "@/lib/financials/operating-statements/glAssemble";
import { lineMonthly } from "@/lib/financials/operating-statements/lineSeries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Snow Removal is GL account 6370-8502 in both the operating-expense workbook
// and the live Skyline GL, so the same mask pulls it from either source.
const SNOW_MASK = "6370-8502";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Per office building: the Snow Removal cost by year — the frozen workbook
 * history (through the last closed year) plus the CURRENT year's snow-to-date
 * pulled LIVE from the imported operating-statement GLs. Feeds the Snow Removal
 * Cost Estimator on the Leasing page so a prospective tenant's proportionate
 * share of this year's snow can be figured at a glance.
 */
export async function GET() {
  const currentYear = new Date().getFullYear();

  // Live current-year snow-to-date from the operating statements, per building.
  const liveByCode: Record<string, { ytd: number; throughPeriod: number; throughLabel: string }> = {};
  try {
    const fulls = await listFullGls();
    for (const b of OFFICE_BUILDINGS) {
      const asm = assembleGls(fulls.filter((g) => g.key === b.code && g.year === currentYear));
      if (!asm) continue;
      const period = asm.maxPeriodInFile;
      const months = lineMonthly(asm.monthly, SNOW_MASK, 1, period);
      const ytd = months.reduce((a, v) => a + v, 0);
      liveByCode[b.code] = {
        ytd,
        throughPeriod: period,
        throughLabel: MONTHS[Math.min(Math.max(period, 1), 12) - 1],
      };
    }
  } catch {
    // No live GL available (dev, or nothing imported yet) — history still serves.
  }

  const buildings = OFFICE_BUILDINGS.map((b) => {
    const seed = SEED_EXPENSES[b.code];
    const snowLine = seed?.lines.find((l) => l.label === "Snow Removal");
    const history: Record<string, number> = snowLine?.values ?? {};
    const sqft = seed?.rentableSqft ?? PROPERTY_DEFS.find((p) => p.id === b.code)?.sqft ?? 0;
    return {
      code: b.code,
      name: b.name,
      fund: b.fund,
      rentableSqft: sqft,
      history, // year(string) → snow $ (frozen workbook, through last closed year)
      current: liveByCode[b.code] ?? null, // live current-year YTD, or null
    };
  });

  return NextResponse.json({ currentYear, buildings });
}
