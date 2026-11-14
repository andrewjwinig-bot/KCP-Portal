import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, isPathAllowed, type UserId } from "@/lib/users";
import { linkSecret, signTenantToken } from "@/lib/cam/tenantLink/token";
import { getTenantLink } from "@/lib/cam/tenantLink/store";
import { getOrEmptySuiteContacts } from "@/lib/suites/contactsStorage";
import { camRecipientEmails } from "@/lib/suites/contacts";
import { isMailConfigured, sendMailDetailed } from "@/lib/mail";
import { newCorrespondenceId, recordTenantEmail } from "@/lib/statements/correspondenceStore";
import { USERS } from "@/lib/users";
import { linkOrigin } from "@/lib/linkOrigin";
import { portalLinkEmail } from "@/lib/maintenance/confirmationEmail";
import { propertyLabel } from "@/lib/statements/tenantMail";

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
  return id && (ALL_USERS as readonly string[]).includes(id) && (isPathAllowed(id as UserId, "/cam-recon") || isPathAllowed(id as UserId, "/tenant-statements")) ? (id as UserId) : null;
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
  const url = `${linkOrigin(req)}/portal/${token}`;

  // The designed email (lib/maintenance/confirmationEmail.ts): the link is a
  // button, not a raw URL.
  const m = portalLinkEmail({ propertyCode: link.property, propertyName: propertyLabel(link.property), unitRef: link.unitRef, tenantName, year: link.year, url });
  const subject = m.subject;
  const textBody = m.text;
  const sent = await sendMailDetailed({
    to: recipients.join(", "),
    // The tenant must see the portal's own domain, not a tracking
    // redirector — see `noLinkTracking`.
    noLinkTracking: true,
    subject,
    textBody,
    htmlBody: m.html,
  });
  if (sent.ok) {
    // On the tenant's correspondence timeline — the link itself is a bearer
    // credential, so the kept wording carries a placeholder, not the URL.
    await recordTenantEmail({
      id: newCorrespondenceId(link.unitRef), kind: "portal-link", unitRef: link.unitRef, propertyCode: link.property, tenantName,
      sentAt: new Date().toISOString(), sentBy: USERS[user]?.label ?? user, from: null, to: recipients, bcc: null, replyTo: null,
      subject, text: textBody.split(url).join("[private portal link]"), html: m.html.split(url).join("#private-portal-link"), messageId: sent.messageId ?? null, testMode: !!sent.testMode,
      attachment: null, summary: `${link.year} CAM / RET statement`, refId: link.id, balance: null,
    });
  }
  if (!sent.ok) return NextResponse.json({ error: "The email failed to send. Please try again." }, { status: 502 });

  return NextResponse.json({ ok: true, recipients });
}
