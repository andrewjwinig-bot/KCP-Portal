import { NextRequest, NextResponse } from "next/server";
import { verifyTenantToken, linkSecret } from "@/lib/cam/tenantLink/token";
import { getTenantLink, logTenantLinkView } from "@/lib/cam/tenantLink/store";
import { loadRetailRecon } from "@/lib/cam/retail/loadResult";
import { loadOfficeRecon } from "@/lib/cam/office/loadResult";
import { camAttachments } from "@/lib/cam/attachments/store";
import { monthlyRentRollEscrow } from "@/lib/cam/escrowFromRolls";
import { PROPERTY_DEFS } from "@/lib/properties/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const propName = (code: string) => PROPERTY_DEFS.find((p) => p.id.toUpperCase() === code.toUpperCase())?.name ?? code;

/** Public — the tenant CAM statement behind a signed link. Verifies the token,
 *  checks the link isn't revoked, logs the view, and returns exactly that one
 *  tenant's statement + the backups flagged shareable + escrow-from-rolls. */
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const secret = linkSecret();
  if (!secret) return NextResponse.json({ error: "Sharing is not configured." }, { status: 503 });
  const payload = await verifyTenantToken(params.token, secret);
  if (!payload) return NextResponse.json({ error: "This link is invalid or has expired." }, { status: 401 });

  const link = await getTenantLink(payload.id);
  if (!link || link.revoked) return NextResponse.json({ error: "This link has been revoked." }, { status: 401 });

  // Backups flagged shareable, grouped by account (shared across both kinds).
  const shareable = (await camAttachments(payload.p, payload.y).all()).filter((a) => a.includeInPackage);
  const byAccount: Record<string, { id: string; name: string; size: number; contentType: string }[]> = {};
  for (const a of shareable) (byAccount[a.account] ??= []).push({ id: a.id, name: a.name, size: a.size, contentType: a.contentType });
  const backupFor = (...accts: string[]) => accts.flatMap((k) => byAccount[k] ?? []);

  type Line = { account: string; label: string; amount: number; backup: ReturnType<typeof backupFor> };
  let tenant: Record<string, unknown>;
  let lines: Line[];
  let ins: { label: string; amount: number; backup: ReturnType<typeof backupFor> } | null = null;
  let ret: { label: string; amount: number; backup: ReturnType<typeof backupFor> };
  let basis: "pro-rata" | "base-year";
  const notes: string[] = [];

  if (payload.k === "retail") {
    const loaded = await loadRetailRecon(payload.p, payload.y);
    if (!loaded) return NextResponse.json({ error: "Statement not found." }, { status: 404 });
    const t = loaded.result.tenants.find((x) => x.unitRef === payload.u);
    if (!t) return NextResponse.json({ error: "Statement not found." }, { status: 404 });
    basis = "pro-rata";
    tenant = {
      unitRef: t.unitRef, suite: t.suite, name: t.name,
      camPrs: t.camPrs, insPrs: t.insPrs, retPrs: t.retPrs, adminFeePct: t.adminFeePct,
      grossLease: t.grossLease, occPct: t.occPct, baseYear: null,
      camDue: t.camDue, camEscrow: t.camEscrow, camBalance: t.camBalance,
      insDue: t.insDue, insEscrow: t.insEscrow, insBalance: t.insBalance,
      retDue: t.retDue, retEscrow: t.retEscrow, retBalance: t.retBalance,
    };
    lines = loaded.expenseFinal.lines.map((l) => ({ account: l.account, label: l.label, amount: l.amount, backup: backupFor(l.account) }));
    ins = { label: loaded.expenseFinal.ins.label, amount: loaded.expenseFinal.ins.amount, backup: backupFor("INS", "—") };
    ret = { label: loaded.expenseFinal.ret.label, amount: loaded.expenseFinal.ret.amount, backup: backupFor("6410", "6410-8502") };
  } else {
    const loaded = await loadOfficeRecon(payload.p, payload.y);
    if (!loaded) return NextResponse.json({ error: "Statement not found." }, { status: 404 });
    const t = loaded.result.tenants.find((x) => x.unitRef === payload.u);
    if (!t) return NextResponse.json({ error: "Statement not found." }, { status: 404 });
    basis = "base-year";
    tenant = {
      unitRef: t.unitRef, suite: t.suite, name: t.name,
      camPrs: t.proRataPct, insPrs: 0, retPrs: t.proRataPct, adminFeePct: 0,
      grossLease: false, occPct: t.occPct, baseYear: t.noBaseStop ? null : t.baseYear,
      camDue: t.opexAmountDue, camEscrow: t.opexEscrow, camBalance: t.opexBalance,
      insDue: 0, insEscrow: 0, insBalance: 0,
      retDue: t.retAmountDue, retEscrow: t.retEscrow, retBalance: t.retBalance,
    };
    // Office lines show the current-year expense per line (the tenant recovers a
    // share of the increase over the base year).
    lines = t.opexLines.map((l) => ({ account: l.glAccount, label: l.label, amount: l.actual, backup: backupFor(l.glAccount) }));
    ret = { label: t.retLine.label, amount: t.retLine.actual, backup: backupFor(t.retLine.glAccount, "6410", "6410-8502") };
    if (t.snowBaseExcluded) notes.push("Snow Removal is excluded from your base year — you recover a full pro-rata share of the year's snow expense.");
    if (t.baseYearResetISO) notes.push("Your base year was reset during this period; recovery is prorated through the reset date.");
    if (t.aggregateBaseYear) notes.push("Your base-year stop is applied to the expense total (not line-by-line): the net increase is total actual minus total base year.");
  }

  const escrowMonthly = await monthlyRentRollEscrow(payload.u, payload.y);
  logTenantLinkView(payload.id, req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()).catch(() => {});

  return NextResponse.json({
    ok: true,
    property: payload.p,
    propertyName: propName(payload.p),
    year: payload.y,
    kind: payload.k,
    basis,
    notes,
    tenant, lines, ins, ret, escrowMonthly,
  });
}
