import { NextRequest, NextResponse } from "next/server";
import {
  listFormerTenants,
  saveFormerTenant,
  deleteFormerTenant,
  type FormerTenant,
} from "@/lib/cam/formerTenants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Optional finite number, or null (a blank field / live fallback). */
function optNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
/** Required number; non-numeric → 0. */
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** GET /api/cam-recon/former-tenants?property=4080&year=2026
 *    → { tenants: FormerTenant[] } */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const property = searchParams.get("property");
  const year = Number(searchParams.get("year"));
  if (!property || !year) return NextResponse.json({ error: "property + year required" }, { status: 400 });
  return NextResponse.json({ tenants: await listFormerTenants(property, year) });
}

/** POST /api/cam-recon/former-tenants
 *  Body: { property, year, tenant }  — upsert one former tenant. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const property = str(body?.property);
    const year = Number(body?.year);
    const t = body?.tenant ?? {};
    const unitRef = str(t.unitRef);
    const kind = t.kind === "retail" ? "retail" : "office";
    if (!property || !year) return NextResponse.json({ error: "property + year required" }, { status: 400 });
    if (!unitRef) return NextResponse.json({ error: "unitRef required" }, { status: 400 });
    if (!unitRef.startsWith(`${property}-`)) {
      return NextResponse.json({ error: `Unit ref must start with "${property}-"` }, { status: 400 });
    }

    const tenant: FormerTenant = {
      unitRef,
      kind,
      name: str(t.name) || unitRef,
      sqft: num(t.sqft),
      leaseFrom: str(t.leaseFrom) || null,
      vacatedISO: str(t.vacatedISO) || null,
      opexMonth: num(t.opexMonth),
      reTaxMonth: num(t.reTaxMonth),
      // Office methodology
      baseYear: kind === "office" ? num(t.baseYear) || undefined : undefined,
      noBaseStop: kind === "office" ? !!t.noBaseStop : undefined,
      grossUp: kind === "office" ? !!t.grossUp : undefined,
      proRataPct: kind === "office" ? (optNum(t.proRataPct) ?? undefined) : undefined,
      // Retail methodology
      camPrs: kind === "retail" ? (optNum(t.camPrs) ?? undefined) : undefined,
      insPrs: kind === "retail" ? (optNum(t.insPrs) ?? undefined) : undefined,
      retPrs: kind === "retail" ? (optNum(t.retPrs) ?? undefined) : undefined,
      adminFeePct: kind === "retail" ? (optNum(t.adminFeePct) ?? undefined) : undefined,
      retDiscountPct: kind === "retail" ? (optNum(t.retDiscountPct) ?? undefined) : undefined,
      // Expense overrides
      opexActualOverride: optNum(t.opexActualOverride),
      retActualOverride: optNum(t.retActualOverride),
      insActualOverride: kind === "retail" ? optNum(t.insActualOverride) : undefined,
      // Escrow overrides
      camEscrowOverride: optNum(t.camEscrowOverride),
      insEscrowOverride: kind === "retail" ? optNum(t.insEscrowOverride) : undefined,
      retEscrowOverride: optNum(t.retEscrowOverride),
    };
    await saveFormerTenant(property, year, tenant);
    return NextResponse.json({ ok: true, tenant });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}

/** DELETE /api/cam-recon/former-tenants?property=4080&year=2026&unitRef=4080-111A */
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const property = searchParams.get("property");
  const year = Number(searchParams.get("year"));
  const unitRef = searchParams.get("unitRef");
  if (!property || !year || !unitRef) return NextResponse.json({ error: "property + year + unitRef required" }, { status: 400 });
  await deleteFormerTenant(property, year, unitRef);
  return NextResponse.json({ ok: true });
}
