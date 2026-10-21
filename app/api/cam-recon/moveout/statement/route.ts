import { NextRequest, NextResponse } from "next/server";
import { parseSkylineStatements, periodOf } from "@/lib/statements/parseSkylineStatements";
import { mergeIntoPeriod } from "@/lib/statements/store";
import { pickTenantStatement } from "@/lib/cam/moveout/openAr";
import { tenantOpenAr } from "@/lib/cam/moveout/deposit";
import { resolveCurrentRentroll } from "@/lib/rentroll/current";
import { logAudit, auditIp } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST (multipart: file, unitRef, tenant?, year, uploadedBy?) — the close-out's
// own "Import final statement" step (owner: "add the option right in the close
// out page to add the final statement for that tenant alone"). Reads a Skyline
// Statement export and files ONLY this tenant's statement, by the move-out's
// own match (suite past -CU / -FO, name first, never the current occupant), so
// a whole-property file cannot move anyone else's month. It lands in the month
// of its newest charge, or the month already holding the tenant if that is
// later, so it always becomes the statement the close-out reads.
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  const unitRef = String(form.get("unitRef") ?? "").trim();
  const name = String(form.get("tenant") ?? "").trim() || undefined;
  const year = Number(form.get("year")) || new Date().getFullYear();
  const uploadedBy = String(form.get("uploadedBy") ?? "").trim() || null;
  if (!(file instanceof File)) return NextResponse.json({ error: "No file was uploaded." }, { status: 400 });
  if (!unitRef) return NextResponse.json({ error: "unitRef required" }, { status: 400 });

  let parsed;
  try { parsed = parseSkylineStatements(Buffer.from(await file.arrayBuffer())); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Could not read that workbook." }, { status: 400 }); }

  const roll = await resolveCurrentRentroll().catch(() => null);
  const now = roll?.properties.flatMap((p) => p.units).find((u) => u.unitRef === unitRef && !u.isVacant);
  const hit = pickTenantStatement(parsed.statements, unitRef, name, now?.occupantName ?? null);
  if (!hit) {
    return NextResponse.json({
      error: parsed.statements.length
        ? `That file has no statement for ${unitRef}${name ? ` (${name})` : ""}. Run Skyline's Statement report for this tenant alone — a moved-out tenant is listed as ${unitRef}-FO.`
        : "No tenant statements found. Export Skyline's Statement report to Excel and upload that file unmodified.",
    }, { status: 400 });
  }

  const before = await tenantOpenAr(unitRef, name, year);
  const own = periodOf([hit.statement]);
  const period = [own, before?.period].filter(Boolean).sort().pop() as string | undefined;
  if (!period) return NextResponse.json({ error: "No charge dates on this tenant's statement." }, { status: 400 });

  await mergeIntoPeriod(period, [hit.statement], {
    filename: file.name, importedAt: new Date().toISOString(), importedBy: uploadedBy, tenantCount: 1,
  });
  await logAudit({
    event: "tenant-statements.moveout-import", user: uploadedBy, ip: auditIp(req),
    detail: `${file.name} → ${period} · ${hit.statement.unitRef} ${hit.statement.tenantName} · $${hit.statement.reportedBalance.toFixed(2)}${hit.statement.tiesOut ? "" : " · DOES NOT TIE"}`,
  });

  return NextResponse.json({
    ok: true, period, tiesOut: hit.statement.tiesOut,
    openAr: await tenantOpenAr(unitRef, name, year),
  });
}
