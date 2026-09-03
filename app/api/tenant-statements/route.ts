import { NextRequest, NextResponse } from "next/server";
import { parseSkylineStatements } from "@/lib/statements/parseSkylineStatements";
import { allRuns, mergeIntoPeriod, PERIOD_RE } from "@/lib/statements/store";
import { summarize } from "@/lib/statements/summary";
import { logAudit, auditIp } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** GET — every statement period, newest first, with the roster-level totals the
 *  Monthly Statements page shows before you open one. */
export async function GET() {
  const runs = await allRuns();
  return NextResponse.json({
    ok: true,
    periods: runs.map((r) => {
      let open = 0, pastDue = 0, owing = 0, untied = 0;
      for (const st of r.statements) {
        const s = summarize(st, r.period);
        open += s.totalDue;
        pastDue += s.pastDueAmount;
        if (s.totalDue > 0.005) owing += 1;
        if (!st.tiesOut) untied += 1;
      }
      return {
        period: r.period,
        published: r.published,
        publishedAt: r.publishedAt,
        updatedAt: r.updatedAt,
        tenants: r.statements.length,
        properties: new Set(r.statements.map((s) => s.propertyCode)).size,
        openBalance: Math.round(open * 100) / 100,
        pastDue: Math.round(pastDue * 100) / 100,
        tenantsOwing: owing,
        untied,
        sources: r.sources,
      };
    }),
  });
}

/** POST (multipart) — import one Skyline "Statement" export.
 *  Fields: file, period? ("YYYY-MM", defaults to the newest charge date in the
 *  file), uploadedBy?. Lands unpublished so staff review the tie-outs first. */
export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected a multipart upload." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file was uploaded." }, { status: 400 });
  const uploadedBy = String(form.get("uploadedBy") ?? "").trim() || null;
  const requested = String(form.get("period") ?? "").trim();
  if (requested && !PERIOD_RE.test(requested)) {
    return NextResponse.json({ error: `"${requested}" isn't a valid period — use YYYY-MM.` }, { status: 400 });
  }

  let parsed;
  try {
    parsed = parseSkylineStatements(Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not read that workbook." }, { status: 400 });
  }
  if (parsed.statements.length === 0) {
    return NextResponse.json(
      { error: "No tenant statements found. Export Skyline's Statement report to Excel and upload that file unmodified." },
      { status: 400 },
    );
  }
  const period = requested || parsed.period;
  if (!period) {
    return NextResponse.json({ error: "No charge dates in the file — pick the statement month and try again." }, { status: 400 });
  }

  const run = await mergeIntoPeriod(period, parsed.statements, {
    filename: file.name,
    importedAt: new Date().toISOString(),
    importedBy: uploadedBy,
    tenantCount: parsed.statements.length,
  });

  const openBalance = parsed.statements.reduce((a, s) => a + s.chargeTotal, 0);
  await logAudit({
    event: "tenant-statements.import",
    user: uploadedBy,
    ip: auditIp(req),
    detail: `${file.name} → ${period} · ${parsed.statements.length} tenants · ${parsed.mismatched.length} untied`,
  });

  return NextResponse.json({
    ok: true,
    period,
    published: run.published,
    tenants: parsed.statements.length,
    totalTenants: run.statements.length,
    properties: [...new Set(parsed.statements.map((s) => s.propertyCode))].sort(),
    openBalance: Math.round(openBalance * 100) / 100,
    mismatched: parsed.mismatched,
  });
}
