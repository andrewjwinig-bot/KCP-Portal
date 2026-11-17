import { NextResponse } from "next/server";
import { listGls } from "@/lib/financials/operating-statements/statementStore";
import { availableStatements } from "@/lib/financials/operating-statements/mappingStore";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import { loadWorkpapers } from "@/lib/financials/workpapers/load";
import { workpapersXlsx, asOfLabel } from "@/lib/financials/workpapers/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Gated with the statement pages (SENSITIVE_API_PREFIXES: /api/financials → /financials).

/**
 * GET
 *   (no params) → the picker: every property with a GL and its years.
 *   ?key&year&month → the property's workpapers as of that quarter end.
 *   …&format=xlsx → the workbook.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  const year = Number(url.searchParams.get("year"));

  if (!key || !Number.isFinite(year)) {
    const metas = await listGls();
    const byKey = new Map<string, Set<number>>();
    for (const m of metas) (byKey.get(m.key) ?? byKey.set(m.key, new Set()).get(m.key)!).add(m.year);
    const mapped = await availableStatements();
    const properties = mapped
      .filter((p) => byKey.has(p.key))
      .map((p) => ({
        key: p.key,
        name: PROPERTY_DEFS.find((d) => d.id === p.key)?.name ?? p.entityName,
        years: [...(byKey.get(p.key) ?? [])].sort((a, b) => b - a),
      }))
      .sort((a, b) => a.key.localeCompare(b.key));
    return NextResponse.json({ ok: true, properties });
  }

  const monthParam = Number(url.searchParams.get("month"));
  // Quarter ends only — a workpaper is a quarter-end document.
  const asked = Number.isFinite(monthParam) && monthParam >= 1 ? Math.min(12, Math.ceil(monthParam / 3) * 3) : 12;
  const loaded = await loadWorkpapers(key, year, asked);
  if (!loaded) return NextResponse.json({ ok: true, wp: null, reason: "No General Ledger imported for this property and year." });

  if ((url.searchParams.get("format") ?? "").toLowerCase() === "xlsx") {
    const buf = await workpapersXlsx(loaded.wp, loaded.meta);
    const name = `Workpapers - ${key} - Q${loaded.wp.quarter} ${year} (${asOfLabel(loaded.wp).replace(/,/g, "")}).xlsx`;
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${name}"`,
      },
    });
  }
  return NextResponse.json({ ok: true, wp: loaded.wp, meta: loaded.meta, coverageEnd: loaded.coverageEnd });
}
