import { NextResponse } from "next/server";
import { budgetUser } from "@/lib/financials/budgets/currentUser";
import { isBudgetAuthor } from "@/lib/financials/budgets/contributors";
import { setEstimateOverride } from "@/lib/financials/budgets/estimateOverrideStore";
import { ESTIMATE_PARTS, type EstimateOverride } from "@/lib/financials/budgets/estimateOverrides";
import { USERS } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// POST { year, propertyCode, unitRef, cam?, ins?, ret?, note } — a tenant's
// monthly estimate set by hand on the CAM estimates table; it becomes the
// budget's figure for that tenant (`estimateOverrides.ts`). A REASON is
// required: an estimate moved by hand is one a tenant will ask about.
// { …, clear: true } hands the tenant back to the computed estimate.
export async function POST(req: Request) {
  const user = await budgetUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!isBudgetAuthor(user)) return NextResponse.json({ error: "Only Drew, Alison or admin can override an estimate." }, { status: 403 });
  const b = await req.json().catch(() => null);
  const year = Number(b?.year);
  const code = String(b?.propertyCode ?? "").trim().toUpperCase();
  const unitRef = String(b?.unitRef ?? "").trim();
  if (!Number.isInteger(year) || !code || !unitRef) return NextResponse.json({ error: "year, propertyCode and unitRef are required" }, { status: 400 });
  if (b?.clear === true) {
    await setEstimateOverride(year, code, unitRef, null);
    return NextResponse.json({ ok: true, cleared: true });
  }
  const o: EstimateOverride = {};
  for (const p of ESTIMATE_PARTS) {
    const v = b?.[p];
    if (v == null || v === "") continue;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return NextResponse.json({ error: `${p.toUpperCase()} must be a number ≥ 0` }, { status: 400 });
    o[p] = Math.round(n);
  }
  if (!ESTIMATE_PARTS.some((p) => o[p] != null)) return NextResponse.json({ error: "Nothing to override." }, { status: 400 });
  const note = String(b?.note ?? "").trim().slice(0, 300);
  if (!note) return NextResponse.json({ error: "Say why — the tenant will ask." }, { status: 400 });
  o.note = note;
  o.by = USERS[user]?.label ?? user;
  o.at = new Date().toISOString();
  await setEstimateOverride(year, code, unitRef, o);
  return NextResponse.json({ ok: true, override: o });
}
