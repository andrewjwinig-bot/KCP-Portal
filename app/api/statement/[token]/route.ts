import { NextRequest, NextResponse } from "next/server";
import { verifyTenantToken, linkSecret } from "@/lib/cam/tenantLink/token";
import { getTenantLink, logTenantLinkView } from "@/lib/cam/tenantLink/store";
import { loadRetailRecon } from "@/lib/cam/retail/loadResult";
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

  if (payload.k !== "retail") {
    return NextResponse.json({ error: "This statement type isn't available yet." }, { status: 400 });
  }

  const loaded = await loadRetailRecon(payload.p, payload.y);
  if (!loaded) return NextResponse.json({ error: "Statement not found." }, { status: 404 });
  const t = loaded.result.tenants.find((x) => x.unitRef === payload.u);
  if (!t) return NextResponse.json({ error: "Statement not found." }, { status: 404 });

  // Backups flagged shareable, grouped by account.
  const shareable = (await camAttachments(payload.p, payload.y).all()).filter((a) => a.includeInPackage);
  const byAccount: Record<string, { id: string; name: string; size: number; contentType: string }[]> = {};
  for (const a of shareable) (byAccount[a.account] ??= []).push({ id: a.id, name: a.name, size: a.size, contentType: a.contentType });
  const backupFor = (...accts: string[]) => accts.flatMap((k) => byAccount[k] ?? []);

  const lines = loaded.expenseFinal.lines.map((l) => ({ account: l.account, label: l.label, amount: l.amount, backup: backupFor(l.account) }));
  const ins = { label: loaded.expenseFinal.ins.label, amount: loaded.expenseFinal.ins.amount, backup: backupFor("INS", "—") };
  const ret = { label: loaded.expenseFinal.ret.label, amount: loaded.expenseFinal.ret.amount, backup: backupFor("6410", "6410-8502") };

  const escrowMonthly = await monthlyRentRollEscrow(payload.u, payload.y);

  // Best-effort access log (never blocks the response).
  logTenantLinkView(payload.id, req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()).catch(() => {});

  return NextResponse.json({
    ok: true,
    property: payload.p,
    propertyName: propName(payload.p),
    year: payload.y,
    kind: payload.k,
    tenant: {
      unitRef: t.unitRef, suite: t.suite, name: t.name,
      camPrs: t.camPrs, insPrs: t.insPrs, retPrs: t.retPrs, adminFeePct: t.adminFeePct,
      grossLease: t.grossLease, occPct: t.occPct,
      camShare: t.camShare, camAdmin: t.camAdmin,
      camDue: t.camDue, camEscrow: t.camEscrow, camBalance: t.camBalance,
      insDue: t.insDue, insEscrow: t.insEscrow, insBalance: t.insBalance,
      retDue: t.retDue, retEscrow: t.retEscrow, retBalance: t.retBalance,
    },
    lines, ins, ret, escrowMonthly,
  });
}
