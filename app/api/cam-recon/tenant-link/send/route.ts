import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, isPathAllowed, type UserId } from "@/lib/users";
import { linkSecret, signTenantToken } from "@/lib/cam/tenantLink/token";
import { getTenantLink } from "@/lib/cam/tenantLink/store";
import { getOrEmptySuiteContacts } from "@/lib/suites/contactsStorage";
import { camRecipientEmails } from "@/lib/suites/contacts";
import { isMailConfigured, sendMail } from "@/lib/mail";

// Admin action: EMAIL a tenant's private portal link to their statement
// recipients. Deliberately separate from minting/copying — the "Share with
// tenant" popover only mints + copies by default (staff-visible), and this is
// the explicit "actually send it to the tenant" step behind a confirmation.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function currentUser(): Promise<UserId | null> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return null;
  const id = await verifySiteToken((await cookies()).get(SITE_COOKIE)?.value, secret);
  return id && (ALL_USERS as readonly string[]).includes(id) && isPathAllowed(id as UserId, "/cam-recon") ? (id as UserId) : null;
}

function originOf(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host") ?? req.nextUrl.host;
  return `${proto}://${host}`;
}

function emailBody(tenantName: string, year: number, url: string): string {
  const greet = tenantName ? `Hi ${tenantName},` : "Hello,";
  return [
    greet,
    "",
    `Your ${year} CAM / RET reconciliation statement from Korman Commercial Properties is ready to view online.`,
    "",
    "Open your private tenant portal here:",
    url,
    "",
    "From the portal you can review the statement line by line (with backup invoices), download a PDF, see your lease terms, submit a service request, and reserve a conference room.",
    "",
    "This link is private to your suite — please don't forward it outside your company. If you have questions about the statement, just reply to this email.",
    "",
    "— Korman Commercial Properties",
  ].join("\n");
}

/** POST { id, tenantName? } → email the portal link for that minted link's
 *  suite to the suite's statement recipients (CAM-recipient contacts, falling
 *  back to any contact with an email). */
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const secret = linkSecret();
  if (!secret) return NextResponse.json({ error: "Sharing is not configured (no link secret set)." }, { status: 500 });
  if (!isMailConfigured()) {
    return NextResponse.json({ error: "Email is not configured. Set POSTMARK_SERVER_TOKEN and MAINTENANCE_REPLY_FROM." }, { status: 503 });
  }

  let body: { id?: unknown; tenantName?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const id = typeof body.id === "string" ? body.id : "";
  const tenantName = typeof body.tenantName === "string" ? body.tenantName : "";
  if (!id) return NextResponse.json({ error: "Link id is required" }, { status: 400 });

  const link = await getTenantLink(id);
  if (!link || link.revoked) return NextResponse.json({ error: "That link no longer exists or was revoked." }, { status: 404 });

  const rec = await getOrEmptySuiteContacts(link.unitRef);
  const recipients = camRecipientEmails(rec.contacts).split(";").map((s) => s.trim()).filter(Boolean);
  if (recipients.length === 0) {
    return NextResponse.json({ error: "No contact with an email is on file for this suite. Add a recipient contact first, then send." }, { status: 400 });
  }

  const token = await signTenantToken(secret, {
    v: 1, id: link.id, p: link.property, u: link.unitRef, y: link.year, k: link.kind,
    ...(link.expiresAt ? { exp: Math.floor(new Date(link.expiresAt).getTime() / 1000) } : {}),
  });
  const url = `${originOf(req)}/portal/${token}`;

  const sent = await sendMail({
    to: recipients.join(", "),
    subject: `Your ${link.year} CAM / RET statement — Korman Commercial Properties`,
    textBody: emailBody(tenantName, link.year, url),
  });
  if (!sent) return NextResponse.json({ error: "The email failed to send. Please try again." }, { status: 502 });

  return NextResponse.json({ ok: true, recipients });
}
