import { NextRequest, NextResponse } from "next/server";
import { FUND_BUILDINGS } from "@/lib/financials/cash-analysis/funds";
import { assembledTransactions, listGls } from "@/lib/financials/operating-statements/statementStore";
import { availableStatements } from "@/lib/financials/operating-statements/mappingStore";
import { reclassByProperty, reclassLines, type ReclassLine } from "@/lib/expenses/ccReclass";
import { buildReclassXlsx } from "@/lib/expenses/ccReclassExport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** GET ?year=[&format=xlsx] — every credit-card charge on 6220-8502 that
 *  belongs on 6220-8501, by property (gated with /financials by middleware). */
export async function GET(req: NextRequest) {
  const asked = Number(req.nextUrl.searchParams.get("year"));
  const year = Number.isFinite(asked) && asked > 2000 ? asked : new Date().getFullYear();

  const metas = await listGls();
  // A fund key's transactions include its buildings', so a building read
  // through its fund is not read again (the 1099 register's rule).
  const uploaded = [...new Set(metas.filter((g) => g.year === year).map((g) => g.key))];
  const viaFund = new Set(uploaded.flatMap((k) => FUND_BUILDINGS[k] ?? []));
  const keys = uploaded.filter((k) => !viaFund.has(k)).sort();

  const lines: ReclassLine[] = [];
  for (const key of keys) lines.push(...reclassLines(key, await assembledTransactions(key, year)));

  const names: Record<string, string> = {};
  for (const s of await availableStatements()) names[s.key] = s.entityName;

  if (req.nextUrl.searchParams.get("format") === "xlsx") {
    const buf = await buildReclassXlsx(year, lines, names);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="CC Building Maint Reclass ${year}.xlsx"`,
      },
    });
  }
  const byProperty = reclassByProperty(lines).map((p) => ({ ...p, name: names[p.key] ?? "" }));
  return NextResponse.json({ ok: true, year, propertiesRead: keys.length, total: byProperty.reduce((a, p) => a + p.amount, 0), byProperty, lines });
}
