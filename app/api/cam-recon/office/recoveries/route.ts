// GET /api/cam-recon/office/recoveries?year=  — what each operating-expense
// line recovered from tenants, per office building and summed by fund and for
// all the business parks (lineRecovery.ts). Off the SAME loadOfficeRecon the
// tenant statements use, so the figures are the recon's own.

import { NextRequest, NextResponse } from "next/server";
import { loadOfficeRecon } from "@/lib/cam/office/loadResult";
import { availableOfficeRecons } from "@/lib/cam/office/registry";
import { combineLineRecoveries, lineRecoveries, type BuildingLineRecovery } from "@/lib/cam/office/lineRecovery";
import { OFFICE_BUILDINGS } from "@/lib/rentroll/baseYearExpenses";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const avail = availableOfficeRecons();
  const years = [...new Set(avail.flatMap((a) => a.years))].sort((a, b) => b - a);
  const asked = Number(req.nextUrl.searchParams.get("year"));
  const year = years.includes(asked) ? asked : years[0];
  if (!year) return NextResponse.json({ years, year: null, buildings: [], funds: [] });

  const buildings: (BuildingLineRecovery & { name: string; fund: string })[] = [];
  for (const b of OFFICE_BUILDINGS) {
    if (!avail.some((a) => a.propertyCode === b.code && a.years.includes(year))) continue;
    const loaded = await loadOfficeRecon(b.code, year);
    if (!loaded) continue;
    buildings.push({ ...lineRecoveries(loaded.pool, loaded.result, loaded.finals), name: b.name, fund: b.fund });
  }
  const group = (label: string, list: typeof buildings) => {
    const c = combineLineRecoveries(list, label);
    return c ? { ...c, name: label, fund: label, members: list.map((b) => b.propertyCode) } : null;
  };
  const funds = [
    group("JV III", buildings.filter((b) => b.fund === "JV III")),
    group("NI LLC", buildings.filter((b) => b.fund === "NI LLC")),
    group("All Business Parks", buildings),
  ].filter(Boolean);
  return NextResponse.json({ years, year, buildings, funds });
}
