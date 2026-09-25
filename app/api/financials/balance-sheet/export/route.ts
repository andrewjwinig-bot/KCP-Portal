import { NextResponse } from "next/server";
import { assembledGlConsolidated, listGls, mergeAccountNames } from "@/lib/financials/operating-statements/statementStore";
import { availableStatements } from "@/lib/financials/operating-statements/mappingStore";
import { computeBalanceSheet } from "@/lib/financials/balance-sheet/compute";
import { getBsOverrides } from "@/lib/financials/balance-sheet/overrideStore";
import { balanceSheetXlsx, balanceSheetPdf, asOfLabel } from "@/lib/financials/balance-sheet/export";
import { PROPERTY_DEFS } from "@/lib/properties/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?key&year[&month]&format=xlsx|pdf — the balance sheet as a file. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key") ?? "";
  const year = Number(url.searchParams.get("year"));
  const format = (url.searchParams.get("format") ?? "xlsx").toLowerCase();
  if (!key || !Number.isFinite(year)) return NextResponse.json({ error: "key and year are required" }, { status: 400 });

  const gl = await assembledGlConsolidated(key, year);
  if (!gl) return NextResponse.json({ error: "No general ledger for that property and year." }, { status: 404 });

  const metas = await listGls();
  const names = { ...mergeAccountNames(metas), ...(gl.names ?? {}) };
  const monthParam = Number(url.searchParams.get("month"));
  const sheet = computeBalanceSheet(
    { ...gl, names },
    { key, year, asOfMonth: Number.isFinite(monthParam) ? monthParam : undefined, overrides: await getBsOverrides(key) },
  );

  const def = PROPERTY_DEFS.find((d) => d.id === key);
  const meta = {
    entityName: (await availableStatements()).find((p) => p.key === key)?.entityName ?? def?.name ?? key,
    propertyName: def?.name ?? key,
    ein: def?.ein ?? null,
  };

  const base = `Balance Sheet - ${key} - ${asOfLabel(sheet).replace(/,/g, "")}`;
  if (format === "pdf") {
    const bytes = await balanceSheetPdf(sheet, meta);
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${base}.pdf"`,
      },
    });
  }
  const buf = await balanceSheetXlsx(sheet, meta);
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${base}.xlsx"`,
    },
  });
}
