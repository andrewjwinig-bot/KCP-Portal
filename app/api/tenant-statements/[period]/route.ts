import { NextRequest, NextResponse } from "next/server";
import { deleteRun, getRun, setPublished } from "@/lib/statements/store";
import { sortedCharges, summarize } from "@/lib/statements/summary";
import { instructionsFor } from "@/lib/statements/payment";
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

  const codes = [...new Set(run.statements.map((s) => s.propertyCode))];
  const payment = Object.fromEntries(await Promise.all(codes.map(async (c) => [c, await instructionsFor(c)] as const)));

  return NextResponse.json({
    ok: true,
    period: run.period,
    published: run.published,
    publishedAt: run.publishedAt,
    updatedAt: run.updatedAt,
    sources: run.sources,
    properties: codes.sort().map((code) => ({ code, name: propName(code) })),
    payment,
    // Same newest-first order the tenant sees, so a staff read of the ledger
    // and the tenant's statement never disagree on ordering.
    tenants: run.statements.map((st) => ({ ...st, charges: sortedCharges(st), summary: summarize(st, run.period) })),
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
