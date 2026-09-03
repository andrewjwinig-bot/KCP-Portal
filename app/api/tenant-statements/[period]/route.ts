import { NextRequest, NextResponse } from "next/server";
import { deleteRun, getRun, setPublished } from "@/lib/statements/store";
import { statementCharges, summarize } from "@/lib/statements/summary";
import { instructionsFor } from "@/lib/statements/payment";
import { remittancesForPeriod } from "@/lib/statements/remittanceStore";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import { logAudit, auditIp } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const propName = (code: string) => PROPERTY_DEFS.find((p) => p.id.toUpperCase() === code.toUpperCase())?.name ?? code;

/** GET — one period's full roster: every tenant, their summary, and the
 *  payment instructions in force for their property. */
export async function GET(_req: NextRequest, { params }: { params: { period: string } }) {
  const run = await getRun(params.period);
  if (!run) return NextResponse.json({ error: "No statements for that period." }, { status: 404 });

  // What tenants have told us their payments cover, newest first per unit.
  const remittances = await remittancesForPeriod(run.period);
  const declaredByUnit = new Map<string, (typeof remittances)[number]>();
  for (const r of remittances) if (!declaredByUnit.has(r.unitRef)) declaredByUnit.set(r.unitRef, r);

  const codes = [...new Set(run.statements.map((s) => s.propertyCode))];
  // Provenance is only meaningful once a month has had more than one upload.
  const latestImport = run.sources.length > 1 ? run.sources[run.sources.length - 1].importedAt : null;
  const payment = Object.fromEntries(await Promise.all(codes.map(async (c) => [c, await instructionsFor(c)] as const)));

  return NextResponse.json({
    ok: true,
    period: run.period,
    published: run.published,
    publishedAt: run.publishedAt,
    updatedAt: run.updatedAt,
    sources: run.sources,
    declaredCount: declaredByUnit.size,
    declaredAmount: Math.round([...declaredByUnit.values()].reduce((a, r) => a + r.amount, 0) * 100) / 100,
    properties: codes.sort().map((code) => ({ code, name: propName(code) })),
    payment,
    // Skyline's own printed order — the admin ledger, the tenant's statement
    // and the paper laser statement all read line for line.
    tenants: run.statements.map((st) => ({
      ...st,
      charges: statementCharges(st),
      summary: summarize(st, run.period),
      // A tenant the latest upload didn't mention. Their statement is still
      // valid — it just predates the newest export, which is worth seeing when
      // you re-import mid-month and a tenant quietly falls out of the report.
      carriedOver: !!latestImport && !!st.importedAt && st.importedAt !== latestImport,
      declared: declaredByUnit.get(st.unitRef) ?? null,
    })),
  });
}

/** PATCH { published } — publish or unpublish the period to the tenant portal. */
export async function PATCH(req: NextRequest, { params }: { params: { period: string } }) {
  const body = await req.json().catch(() => ({}));
  if (typeof body.published !== "boolean") {
    return NextResponse.json({ error: "Expected { published: boolean }." }, { status: 400 });
  }
  const run = await setPublished(params.period, body.published);
  if (!run) return NextResponse.json({ error: "No statements for that period." }, { status: 404 });
  await logAudit({
    event: body.published ? "tenant-statements.publish" : "tenant-statements.unpublish",
    user: typeof body.by === "string" ? body.by : null,
    ip: auditIp(req),
    detail: `${params.period} · ${run.statements.length} tenants`,
  });
  return NextResponse.json({ ok: true, published: run.published, publishedAt: run.publishedAt });
}

/** DELETE — drop a period entirely (a bad import). */
export async function DELETE(req: NextRequest, { params }: { params: { period: string } }) {
  const run = await getRun(params.period);
  if (!run) return NextResponse.json({ error: "No statements for that period." }, { status: 404 });
  await deleteRun(params.period);
  await logAudit({ event: "tenant-statements.delete", user: null, ip: auditIp(req), detail: params.period });
  return NextResponse.json({ ok: true });
}
