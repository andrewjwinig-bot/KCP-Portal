import { NextRequest, NextResponse } from "next/server";
import { applyPatch } from "@/lib/maintenance/requests";
import { getRequest, saveRequest } from "@/lib/maintenance/requestsStorage";
import { isMailConfigured, sendMail } from "@/lib/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/maintenance/requests/:id/billback-notify
// Fire-and-forget notification when a tenant billback has been added to a
// request, so it doesn't get forgotten. Emails trovkin@ (cc mjaster@) once with
// the billback + request details. Idempotent — a billback is announced at most
// once (guarded by billbackNotifiedAt); editing an already-announced billback
// does NOT re-notify.
//
// TODO (revisit): this is an interim "so nobody forgets" notification only — it
// doesn't invoice the tenant, post to a GL, or feed AR. Wire the real handling
// when the team decides how billbacks should flow.

const NOTIFY_TO = "trovkin@kormancommercial.com";
const NOTIFY_CC = "mjaster@kormancommercial.com";

function money(n: number): string {
  return "$" + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const r = await getRequest(params.id);
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const bb = r.tenantBillback;
  // Only a real, complete billback is worth announcing.
  if (!bb || !(Number(bb.amount) > 0)) {
    return NextResponse.json({ request: r, sent: false, reason: "incomplete" });
  }
  // Already announced — never send twice.
  if (r.billbackNotifiedAt) {
    return NextResponse.json({ request: r, sent: false, reason: "already-notified" });
  }
  // Leave it un-notified (so it can send later) if mail isn't configured.
  if (!isMailConfigured()) {
    return NextResponse.json({ request: r, sent: false, reason: "mail-not-configured" });
  }

  const property = r.propertyCode ? `${r.propertyCode}${r.propertyName ? ` — ${r.propertyName}` : ""}` : (r.propertyName || "—");
  const tenant = r.tenantCompany || r.tenantName || "—";
  const lines = [
    `A tenant billback was added on a maintenance request.`,
    ``,
    `Amount:      ${money(bb.amount)}`,
    `For:         ${bb.description || "(no description)"}`,
    `Date:        ${bb.date || "—"}`,
    ``,
    `Tenant:      ${tenant}${r.tenantSuite ? ` · Suite ${r.tenantSuite}` : ""}`,
    `Property:    ${property}`,
    r.tenantName ? `Contact:     ${r.tenantName}${r.tenantEmail ? ` <${r.tenantEmail}>` : ""}` : ``,
    `Request:     ${r.subject || "(no subject)"} (ref ${r.id})`,
    ``,
    `This is an automatic heads-up so the billback isn't forgotten — it has not`,
    `been invoiced or posted anywhere yet.`,
    ``,
    `— KCP Portal`,
  ].filter((l) => l !== null).join("\n");

  const sent = await sendMail({
    to: NOTIFY_TO,
    cc: NOTIFY_CC,
    subject: `Tenant billback ${money(bb.amount)} — ${tenant}`,
    textBody: lines,
  });
  if (!sent) {
    return NextResponse.json({ request: r, sent: false, reason: "send-failed" }, { status: 502 });
  }

  const next = applyPatch(r, { billbackNotifiedAt: new Date().toISOString() });
  await saveRequest(next);
  return NextResponse.json({ request: next, sent: true });
}
