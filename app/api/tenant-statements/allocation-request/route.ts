import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, isPathAllowed, USERS, type UserId } from "@/lib/users";
import { linkSecret, signTenantToken } from "@/lib/cam/tenantLink/token";
import { listTenantLinks } from "@/lib/cam/tenantLink/store";
import { getOrEmptySuiteContacts } from "@/lib/suites/contactsStorage";
import { camRecipientEmails } from "@/lib/suites/contacts";
import { getRun } from "@/lib/statements/store";
import { saveAllocationRequest, getAllocationRequest, allocationRequestsForPeriod } from "@/lib/statements/allocationRequestStore";
import type { AllocationRequest } from "@/lib/statements/remittance";
import { sendMail, isMailConfigured } from "@/lib/mail";
import { logAudit, auditIp } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const money = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function currentUser(): Promise<UserId | null> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return null;
  const id = await verifySiteToken((await cookies()).get(SITE_COOKIE)?.value, secret);
  if (!id || !(ALL_USERS as readonly string[]).includes(id)) return null;
  return isPathAllowed(id as UserId, "/tenant-statements") ? (id as UserId) : null;
}

const originOf = (req: NextRequest) =>
  `${req.headers.get("x-forwarded-proto") ?? "https"}://${req.headers.get("host") ?? req.nextUrl.host}`;

/** GET ?period= — every request on that month. */
export async function GET(req: NextRequest) {
  if (!(await currentUser())) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const period = req.nextUrl.searchParams.get("period") ?? "";
  return NextResponse.json({ ok: true, requests: await allocationRequestsForPeriod(period) });
}

/**
 * POST { period, unitRef, amount, paymentRef?, receivedOn?, note?, send? }
 * — record a payment we can't apply and, when `send`, ask the tenant to
 * allocate it against their own open charges.
 *
 * The mirror of a tenant declaration: they told us nothing, the cheque is
 * already in hand, so the question goes the other way. The tenant answers on
 * the same statement they'd pay from, which is the only place they can see
 * what the charges actually are.
 */
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));

  const period = String(body?.period ?? "");
  const unitRef = String(body?.unitRef ?? "").trim().toUpperCase();
  const amount = Math.round(Number(body?.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Enter the amount of the payment you received." }, { status: 400 });
  }
  const run = await getRun(period);
  const statement = run?.statements.find((s) => s.unitRef.toUpperCase() === unitRef);
  if (!statement) return NextResponse.json({ error: "That tenant isn't on this statement month." }, { status: 404 });

  const rec: AllocationRequest = {
    id: "al_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    period, unitRef: statement.unitRef, propertyCode: statement.propertyCode, tenantName: statement.tenantName,
    amount,
    paymentRef: String(body?.paymentRef ?? "").slice(0, 60).trim(),
    receivedOn: /^\d{4}-\d{2}-\d{2}$/.test(String(body?.receivedOn ?? "")) ? String(body.receivedOn) : null,
    note: String(body?.note ?? "").slice(0, 2000).trim(),
    createdAt: new Date().toISOString(),
    createdBy: USERS[user]?.label ?? user,
    askedAt: null, askedTo: [], answeredAt: null, remittanceId: null, closedAt: null,
  };

  // Asking the tenant needs a portal link — that's where they answer. Record
  // the request either way so the cheque is never lost just because sending
  // failed; the page then shows it as recorded-but-not-asked.
  let mailError: string | null = null;
  if (body?.send !== false) {
    const secret = linkSecret();
    // The tenant's newest live link, whatever year it was minted for.
    const link = (await listTenantLinks())
      .filter((l) => !l.revoked && l.unitRef.toUpperCase() === unitRef)
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))[0] ?? null;
    const contacts = await getOrEmptySuiteContacts(statement.unitRef);
    const recipients = camRecipientEmails(contacts.contacts).split(";").map((s) => s.trim()).filter(Boolean);

    if (!secret || !link) mailError = "This tenant has no portal link yet — share one first, then ask them to allocate it.";
    else if (recipients.length === 0) mailError = "No contact with an email is on file for this suite. Add a recipient contact, then ask.";
    else if (!isMailConfigured()) mailError = "Email isn't configured, so the request was recorded but not sent.";
    else {
      const token = await signTenantToken(secret, {
        v: 1, id: link.id, p: link.property, u: link.unitRef, y: link.year, k: link.kind,
        ...(link.expiresAt ? { exp: Math.floor(new Date(link.expiresAt).getTime() / 1000) } : {}),
      });
      const url = `${originOf(req)}/portal/${token}`;
      const sent = await sendMail({
        to: recipients.join(", "),
        subject: `We received your payment of ${money(amount)} — which charges should it cover?`,
        textBody: [
          statement.tenantName ? `Hi ${statement.tenantName},` : "Hello,",
          "",
          `Thank you — we've received your payment of ${money(amount)}${rec.paymentRef ? ` (${rec.paymentRef})` : ""}${rec.receivedOn ? ` on ${rec.receivedOn}` : ""}.`,
          "",
          "It didn't come with instructions on which charges it covers, and we'd rather apply it exactly where you intended than guess.",
          "",
          "Open your statement and tick the charges this payment should pay:",
          url,
          "",
          "It takes a moment — your open charges are listed there, and the total updates as you select.",
          ...(rec.note ? ["", rec.note] : []),
          "",
          "— Korman Commercial Properties",
        ].join("\n"),
      });
      if (sent) { rec.askedAt = new Date().toISOString(); rec.askedTo = recipients; }
      else mailError = "The email failed to send. The payment is recorded — try asking again.";
    }
  }

  await saveAllocationRequest(rec);
  await logAudit({
    event: "tenant-statements.allocation-request",
    user: USERS[user]?.label ?? user, ip: auditIp(req),
    detail: `${statement.unitRef} ${money(amount)}${rec.askedAt ? ` · asked ${rec.askedTo.length}` : " · not sent"}`,
  });
  return NextResponse.json({ ok: true, request: rec, mailError }, { status: 201 });
}

/** PATCH { id, action: "close" } — resolved another way; stop chasing it. */
export async function PATCH(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const rec = await getAllocationRequest(String(body?.id ?? ""));
  if (!rec) return NextResponse.json({ error: "That request no longer exists." }, { status: 404 });
  rec.closedAt = body?.action === "reopen" ? null : new Date().toISOString();
  await saveAllocationRequest(rec);
  return NextResponse.json({ ok: true, request: rec });
}
