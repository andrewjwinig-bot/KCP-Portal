import { NextResponse } from "next/server";
import { loadReprojection } from "@/lib/financials/reprojections/load";
import { buildReprojGroupXlsx } from "@/lib/financials/reprojections/reprojExport";
import { monthlyStatements } from "@/lib/financials/operating-statements/mappingStore";
import { rentRollGroupFor, RENTROLL_GROUP_ORDER } from "@/lib/financials/operating-statements/propertyGroups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
// Thirteen buildings, each blending a GL against a budget. The default cap is
// well short of that.
export const maxDuration = 300;

/**
 * GET ?group=<Shopping Centers|JV III LLC|NI LLC|…>&year= — every property in
 * one portfolio group, one sheet each, in a single workbook.
 *
 * The group definitions are `rentRollGroupFor`, the SAME buckets the rent roll
 * and the Flags review use. A second list of "which buildings are shopping
 * centers" is how a building quietly ends up in one report and not another.
 *
 * Each sheet comes from the SAME writer as the single-property download, so a
 * group workbook cannot drift from the one figures are already checked
 * against.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const group = (url.searchParams.get("group") ?? "").trim();
    const year = Number(url.searchParams.get("year"));
    if (!group || !year) return NextResponse.json({ error: "group and year are required" }, { status: 400 });
    if (!(RENTROLL_GROUP_ORDER as readonly string[]).includes(group)) {
      return NextResponse.json({ error: `Unknown group "${group}"` }, { status: 400 });
    }

    const mappings = (await monthlyStatements())
      .filter((m) => rentRollGroupFor(m.propertyCode) === group)
      .sort((a, b) => a.propertyCode.localeCompare(b.propertyCode));
    if (mappings.length === 0) {
      return NextResponse.json({ error: `No properties mapped in ${group}` }, { status: 404 });
    }

    // Sequential rather than parallel: each load reads the GL and the budget,
    // and thirteen at once is how a serverless function runs out of memory
    // rather than out of time.
    const items: Awaited<ReturnType<typeof loadReprojection>>[] = [];
    for (const m of mappings) items.push(await loadReprojection(m.key, year));

    const usable = items.filter((x): x is NonNullable<typeof x> => !!x);
    if (usable.length === 0) {
      return NextResponse.json({ error: `Nothing to report for ${group} in ${year}` }, { status: 404 });
    }

    const buf = await buildReprojGroupXlsx(
      usable.map((l) => ({ r: l.reprojection, meta: l.meta, notes: l.notes })),
    );
    // Named for what it is, so a folder of these sorts by group and year.
    const safe = group.replace(/[\\/?*[\]:]/g, " ").replace(/\s+/g, " ").trim();
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${year} Reprojections - ${safe}.xlsx"`,
        // How many actually made it, so a short workbook is explainable
        // without opening it.
        "X-Sheets": String(usable.length),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to generate Excel" }, { status: 500 });
  }
}
