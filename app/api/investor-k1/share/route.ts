import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, isPathAllowed, USERS, type UserId } from "@/lib/users";
import { PROPERTY_OWNERSHIP } from "@/lib/properties/ownership";
import { resolveOwnerEmail } from "@/lib/investors/ownerEmail";
import { allOwnerEmails } from "@/lib/investors/ownerEmailStore";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import {
  investorLinkSecret, signInvestorToken, saveInvestorLink, listInvestorLinks,
  revokeInvestorLink, generatePin, linkOwnerIds, type InvestorLink,
} from "@/lib/investors/k1Link";
import { k1sForOwner, saveK1 } from "@/lib/investors/k1Store";
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

type ShareResult = {
  ownerId: string;
  ownerName: string;
  /** Trust / detailed name. Two interests held by one person produce two rows
   *  with the same name and DIFFERENT PINs, so the label is what tells staff
   *  which PIN goes with which link. */
  heldAs?: string | null;
  url?: string;
  pin?: string;
  sentTo: string[];
  mailError: string | null;
  /** Set when this owner couldn't be shared at all — the batch continues. */
  error?: string;
};

/**
 * Mint (or re-mint) ONE investor link and optionally email it.
 *
 * The single-owner and bulk paths both go through here — there is deliberately
 * no second implementation, so the checks that matter (a published K-1 exists,
 * any earlier link is revoked first, a fresh PIN per owner, the email carries a
 * LINK and never the K-1 itself) cannot drift apart between them.
 */
const normName = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Every interest ONE PERSON holds — across EVERY partnership, not just the one
 * you happen to be standing on.
 *
 * An investor in four partnerships should hold ONE link, not four links and
 * four PINs, and it should keep working as later years and other properties are
 * added. So the link covers the whole person and the portal labels each K-1
 * with its property.
 *
 * Computed here from the roster, never from anything the caller sent: a link
 * covers whatever this returns, so if a client could name the set it could mint
 * a link onto a co-owner's K-1. Matching is by name, which is the same identity
 * the Investor Info "By Investor" view has always used to group a person across
 * properties — one curated ownership file is the authority for who is who.
 */
function personGroup(_propertyCode: string, ownerId: string) {
  const all = PROPERTY_OWNERSHIP.flatMap((p) => p.owners.map((o) => ({ o, code: p.propertyCode })));
  const found = all.find((x) => x.o.id === ownerId);
  if (!found) return null;
  const group = all.filter((x) => normName(x.o.name) === normName(found.o.name)).map((x) => x.o);
  return { owner: found.o, group };
}

async function shareOne(
  req: NextRequest, user: UserId, secret: string, propertyCode: string, ownerId: string, year: number | null, send: boolean,
): Promise<ShareResult> {
  const found = personGroup(propertyCode, ownerId);
  if (!found) return { ownerId, ownerName: ownerId, sentTo: [], mailError: null, error: "That owner isn't on this partnership." };
  const { owner, group } = found;

  // Sending IS the release. There is no separate publish step: an upload sits
  // invisible until someone deliberately sends it, and the send is that
  // deliberate act. This matters because an investor holding a live link from a
  // previous year would otherwise see a new upload the instant it landed —
  // including one dropped on the wrong row by mistake.
  // The link spans every partnership, but a SEND releases only the partnership
  // you sent from, for that year. Otherwise releasing a finished 7010 K-1 would
  // also expose a 9510 draft that isn't finalised. The link is durable: later
  // releases appear on it automatically, without re-sending.
  const inScope = new Set(
    (PROPERTY_OWNERSHIP.find((p) => p.propertyCode === propertyCode)?.owners ?? [])
      .filter((o) => group.some((g) => g.id === o.id))
      .map((o) => o.id),
  );
  const mine = (await Promise.all([...inScope].map((id) => k1sForOwner(id))))
    .flat()
    .filter((d) => year == null || d.taxYear === year);
  if (mine.length === 0) {
    return {
      ownerId, ownerName: owner.name, heldAs: owner.detailedName ?? null, sentTo: [], mailError: null,
      error: `${owner.name} has no ${year ?? ""} K-1 uploaded yet.`.replace("  ", " "),
    };
  }
  const at = new Date().toISOString();
  for (const d of mine.filter((d) => !d.published)) {
    d.published = true;
    d.publishedAt = d.publishedAt ?? at;
    await saveK1(d);
  }
  const published = mine;

  // An investor has ONE durable link. Releasing another partnership must not
  // invalidate the link (and PIN) they already have — that would mean re-sending
  // everyone every time a partnership finishes. So reuse the live link if there
  // is one, widening it to cover any interests added since; only mint when they
  // have none. Revoke is the deliberate way to kill a link.
  const ids = group.map((o) => o.id);
  const existing = (await listInvestorLinks())
    .find((l) => !l.revoked && linkOwnerIds(l).some((id) => ids.includes(id)));

  let link: InvestorLink;
  if (existing) {
    const covered = new Set(linkOwnerIds(existing));
    const widened = ids.filter((id) => !covered.has(id));
    link = widened.length
      ? { ...existing, ownerIds: [...covered, ...widened] }
      : existing;
    if (widened.length) await saveInvestorLink(link);
  } else {
    link = {
      id: "il_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      ownerId: owner.id, ownerIds: ids, ownerName: owner.name, propertyCode,
      createdAt: new Date().toISOString(), createdBy: USERS[user]?.label ?? user,
      revoked: false, expiresAt: null,
      pin: generatePin(),   // never optional for a K-1, and never reused between owners
      views: [], lastViewedAt: null, viewCount: 0,
    };
    await saveInvestorLink(link);
  }
  const url = `${originOf(req)}/investor/${await signInvestorToken(secret, { v: 1, id: link.id, o: link.ownerId, p: link.propertyCode })}`;

  let mailError: string | null = null;
  let sentTo: string[] = [];
  if (send) {
    const overrides = await allOwnerEmails();
    const email = resolveOwnerEmail(owner.name, owner.detailedName ?? null, overrides[owner.id]?.email).email ?? "";
    if (!email) mailError = `No email on file for ${owner.name}. Copy the link and send it yourself.`;
    else if (!isMailConfigured()) mailError = "Email isn't configured, so the link was created but not sent.";
    else {
      const ok = await sendMail({
        to: email,
        subject: published.length > 1
          ? `Your ${published[0].taxYear} Schedule K-1s — Korman Commercial Properties`
          : `Your ${published[0].taxYear} Schedule K-1 — ${propName(propertyCode)}`,
        textBody: [
          `Hello ${owner.name},`,
          "",
          published.length > 1
            ? `Your ${published.length} Schedule K-1s are ready in your secure investor portal — one link covers every partnership you hold an interest in.`
            : `Your Schedule K-1 for ${propName(propertyCode)} is ready in your secure investor portal.`,
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
  return { ownerId: owner.id, ownerName: owner.name, heldAs: owner.detailedName ?? null, url, pin: link.pin, sentTo, mailError };
}

/** How many owners one request may share at once. Parkwood has 21; the cap is
 *  about bounding the work per request, not about the roster size. */
const MAX_BATCH = 50;

/**
 * POST { propertyCode, ownerId | ownerIds[], send? } — mint investor links.
 *
 * `ownerId` returns the flat single-owner shape the page has always used.
 * `ownerIds` returns `results[]`, one entry per owner, and a failure on one
 * owner (nothing uploaded, no email on file) is reported on that entry rather
 * than aborting the rest — sending 19 of 21 and being told which two to chase
 * beats sending none.
 */
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const secret = investorLinkSecret();
  if (!secret) return NextResponse.json({ error: "Investor sharing is not configured (no link secret set)." }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const propertyCode = String(body?.propertyCode ?? "");
  const send = body?.send === true;
  const rawYear = Number(body?.year);
  const year = Number.isFinite(rawYear) && rawYear > 0 ? rawYear : null;

  if (Array.isArray(body?.ownerIds)) {
    // De-duplicated: two entries for one owner would revoke the link the first
    // pass just minted and email them twice.
    const raw = [...new Set(body.ownerIds.map((x: unknown) => String(x)).filter(Boolean))] as string[];
    // Collapse to one entry per PERSON. Two interests of one owner ticked
    // separately would otherwise mint a link and then immediately revoke it.
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const id of raw) {
      const g = personGroup(propertyCode, id);
      const key = g ? normName(g.owner.name) : id;
      if (seen.has(key)) continue;
      seen.add(key);
      ids.push(id);
    }
    if (ids.length === 0) return NextResponse.json({ error: "Pick at least one investor." }, { status: 400 });
    if (ids.length > MAX_BATCH) return NextResponse.json({ error: `Too many at once (max ${MAX_BATCH}).` }, { status: 400 });

    // Sequential on purpose: each share revokes that owner's prior link and
    // writes a link record, and the link store is read-modify-write.
    const results: ShareResult[] = [];
    for (const id of ids) results.push(await shareOne(req, user, secret, propertyCode, id, year, send));
    return NextResponse.json({ ok: true, results }, { status: 201 });
  }

  const one = await shareOne(req, user, secret, propertyCode, String(body?.ownerId ?? ""), year, send);
  if (one.error) return NextResponse.json({ error: one.error }, { status: 400 });
  return NextResponse.json({
    ok: true, url: one.url, pin: one.pin, sentTo: one.sentTo, mailError: one.mailError,
  }, { status: 201 });
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
