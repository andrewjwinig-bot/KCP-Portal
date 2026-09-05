import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, isPathAllowed, USERS, type UserId } from "@/lib/users";
import { PROPERTY_OWNERSHIP } from "@/lib/properties/ownership";
import { ownerContact } from "@/lib/properties/ownerContacts";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import {
  investorLinkSecret, signInvestorToken, saveInvestorLink, listInvestorLinks,
  revokeInvestorLink, generatePin, type InvestorLink,
} from "@/lib/investors/k1Link";
import { publishedK1sForOwner } from "@/lib/investors/k1Store";
import { sendMail, isMailConfigured } from "@/lib/mail";
import { logAudit, auditIp } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function currentUser(): Promise<UserId | null> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return null;
  const id = await verifySiteToken((await cookies()).get(SITE_COOKIE)?.value, secret);
  if (!id || !(ALL_USERS as readonly string[]).includes(id)) return null;
  return isPathAllowed(id as UserId, "/investor-k1") ? (id as UserId) : null;
}

const originOf = (req: NextRequest) =>
  `${req.headers.get("x-forwarded-proto") ?? "https"}://${req.headers.get("host") ?? req.nextUrl.host}`;
const propName = (code: string) => PROPERTY_DEFS.find((p) => p.id.toUpperCase() === code.toUpperCase())?.name ?? code;

/**
 * POST { propertyCode, ownerId, send? } — mint (or re-mint) an investor link.
 *
 * The email carries a LINK and never the K-1 itself: a PDF attachment lives in
 * the recipient's mailbox and every forward of it forever, which is not where a
 * taxpayer ID belongs. The PIN goes in the same reply only if staff choose to;
 * by default it's returned here for them to pass on separately.
 */
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const secret = investorLinkSecret();
  if (!secret) return NextResponse.json({ error: "Investor sharing is not configured (no link secret set)." }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const propertyCode = String(body?.propertyCode ?? "");
  const ownerId = String(body?.ownerId ?? "");
  const owner = PROPERTY_OWNERSHIP.find((p) => p.propertyCode === propertyCode)?.owners.find((o) => o.id === ownerId);
  if (!owner) return NextResponse.json({ error: "That owner isn't on this partnership." }, { status: 400 });

  const published = await publishedK1sForOwner(owner.id);
  if (published.length === 0) {
    return NextResponse.json({ error: "This owner has no published K-1 yet — publish the year first." }, { status: 400 });
  }

  // One live link per owner: retire any earlier one so a revoked address can't
  // still open the portal.
  for (const l of (await listInvestorLinks()).filter((l) => !l.revoked && l.ownerId === owner.id)) {
    await revokeInvestorLink(l.id);
  }

  const link: InvestorLink = {
    id: "il_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    ownerId: owner.id, ownerName: owner.name, propertyCode,
    createdAt: new Date().toISOString(), createdBy: USERS[user]?.label ?? user,
    revoked: false, expiresAt: null,
    pin: generatePin(),   // never optional for a K-1
    views: [], lastViewedAt: null, viewCount: 0,
  };
  await saveInvestorLink(link);
  const url = `${originOf(req)}/investor/${await signInvestorToken(secret, { v: 1, id: link.id, o: owner.id, p: propertyCode })}`;

  let mailError: string | null = null;
  let sentTo: string[] = [];
  if (body?.send === true) {
    const email = ownerContact(owner.name)?.email ?? "";
    if (!email) mailError = `No email on file for ${owner.name}. Copy the link and send it yourself.`;
    else if (!isMailConfigured()) mailError = "Email isn't configured, so the link was created but not sent.";
    else {
      const ok = await sendMail({
        to: email,
        subject: `Your ${published[0].taxYear} Schedule K-1 — ${propName(propertyCode)}`,
        textBody: [
          `Hello ${owner.name},`,
          "",
          `Your Schedule K-1 for ${propName(propertyCode)} is ready in your secure investor portal.`,
          "",
          url,
          "",
          "You'll be asked for a 6-digit access PIN, which we'll send to you separately.",
          "",
          "This link is private to you. Please don't forward it — if you need a copy sent elsewhere, reply and we'll arrange it.",
          "",
          "— Korman Commercial Properties",
        ].join("\n"),
      });
      if (ok) sentTo = [email];
      else mailError = "The email failed to send. The link is created — copy it and send it yourself.";
    }
  }

  await logAudit({
    event: "investor-k1.share", user: USERS[user]?.label ?? user, ip: auditIp(req),
    detail: `${propertyCode} · ${owner.name}${sentTo.length ? ` · emailed ${sentTo.join(", ")}` : " · link only"}`,
  });
  return NextResponse.json({ ok: true, link, url, pin: link.pin, sentTo, mailError }, { status: 201 });
}

/** DELETE ?id= — revoke a link. */
export async function DELETE(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const ok = await revokeInvestorLink(id);
  if (!ok) return NextResponse.json({ error: "That link no longer exists." }, { status: 404 });
  await logAudit({ event: "investor-k1.revoke", user: USERS[user]?.label ?? user, ip: auditIp(req), detail: id });
  return NextResponse.json({ ok: true });
}
