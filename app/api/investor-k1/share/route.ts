import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, isPathAllowed, USERS, type UserId } from "@/lib/users";
import { PROPERTY_OWNERSHIP } from "@/lib/properties/ownership";
import { resolveOwnerEmail } from "@/lib/investors/ownerEmail";
import { getContactOverrides } from "@/lib/properties/ownerContactsStore";
import { allOwnerEmails } from "@/lib/investors/ownerEmailStore";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import {
  investorLinkSecret, signInvestorToken, saveInvestorLink, listInvestorLinks,
  revokeInvestorLink, generatePin, linkOwnerIds, type InvestorLink,
} from "@/lib/investors/k1Link";
import { k1sForOwner, saveK1 } from "@/lib/investors/k1Store";
import { sendMail, isMailConfigured } from "@/lib/mail";
import { logAudit, auditIp } from "@/lib/audit";
import { linkOrigin } from "@/lib/linkOrigin";
import { coveredOwnerIds } from "@/lib/investors/linkCoverage";
import { composeK1ShareEmail, composeK1PinEmail, applyK1EmailEdit, type K1ShareEmail } from "@/lib/investors/k1ShareEmail";
import { addressRecipients, reached } from "@/lib/investors/recipients";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function currentUser(): Promise<UserId | null> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return null;
  const id = await verifySiteToken((await cookies()).get(SITE_COOKIE)?.value, secret);
  if (!id || !(ALL_USERS as readonly string[]).includes(id)) return null;
  return isPathAllowed(id as UserId, "/investor-k1") ? (id as UserId) : null;
}

/**
 * Who gets a copy of every investor K-1 email — the link and the PIN alike.
 *
 * BLIND copy, not a visible Cc. The copy exists so there is a record in our
 * own inbox that both messages actually left Postmark; a visible Cc would also
 * put an internal address on an investor's tax-document email and invite a
 * reply-all onto it, neither of which the record needs.
 *
 * Override with `K1_SHARE_COPY_TO` (comma-separated), or set it to empty to
 * turn the copies off — neither needs a deploy.
 */
const shareCopyTo = () => (process.env.K1_SHARE_COPY_TO ?? "dwinig@kormancommercial.com").trim();

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
  /** Who got the PIN's own email. Empty means it did NOT go out and somebody
   *  has to hand the PIN over — which is why the results panel shouts about
   *  it rather than letting a link sit unopenable. */
  pinSentTo: string[];
  pinError: string | null;
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
  /** A staff edit of the draft, from the confirm step. Single sends only —
   *  a batch reaches many different investors, so one hand-written body
   *  cannot be right for all of them and the canonical draft is used. */
  draft?: { subject?: unknown; body?: unknown } | null,
  /** Put the additional recipients on Cc rather than addressing them all on
   *  To. Same people either way — it changes how the mail reads, not who
   *  receives it. */
  ccSecondary?: boolean,
): Promise<ShareResult> {
  const found = personGroup(propertyCode, ownerId);
  if (!found) return { ownerId, ownerName: ownerId, sentTo: [], mailError: null, pinSentTo: [], pinError: null, error: "That owner isn't on this partnership." };
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
      pinSentTo: [], pinError: null,
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
    .find((l) => !l.revoked && coveredOwnerIds(l).some((id) => ids.includes(id)));

  let link: InvestorLink;
  if (existing) {
    const covered = new Set(coveredOwnerIds(existing));
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
      // Explicitly 0, not absent. A link minted from here on KNOWS it has
      // never been emailed; a link with no `sendCount` at all predates send
      // tracking, and the roster must say "unknown" for those rather than
      // claiming they were never sent.
      sendCount: 0, sentAt: null, sentTo: [], pinSentAt: null,
    };
    await saveInvestorLink(link);
  }
  const url = `${linkOrigin(req)}/investor/${await signInvestorToken(secret, { v: 1, id: link.id, o: link.ownerId, p: link.propertyCode })}`;

  let mailError: string | null = null;
  let sentTo: string[] = [];
  let pinSentTo: string[] = [];
  let pinError: string | null = null;
  let wasEdited = false;
  if (send) {
    const overrides = await allOwnerEmails();
    const resolved = resolveOwnerEmail(owner.name, owner.detailedName ?? null, overrides[owner.id]?.email, await getContactOverrides());
    const email = resolved.email ?? "";
    // An investor can nominate an accountant or manager to receive what they
    // receive. Everyone on the list gets the SAME link, so `sentTo` records all
    // of them and the results panel shows the list — a K-1 reaching a second
    // person is a deliberate act, never a silent one.
    // WHO receives it is identical either way; this only changes how the mail
    // reads. On Cc the investor is the addressee and their accountant is
    // visibly copied, which is how that relationship actually works — on To
    // they are co-addressees. `sentTo` still records everyone, because a K-1
    // reaching a second person is a deliberate act whichever header carried
    // them. `addressRecipients` is tested on exactly that invariant.
    const addressed = addressRecipients(email, resolved.alsoEmail, ccSecondary !== false);
    const recipients = reached(addressed);
    const headers = () => ({
      to: addressed.to.join(", "),
      ...(addressed.cc.length ? { cc: addressed.cc.join(", ") } : {}),
    });
    if (!email) mailError = `No email on file for ${owner.name}. Copy the link and send it yourself.`;
    else if (!isMailConfigured()) mailError = "Email isn't configured, so the link was created but not sent.";
    else {
      // Same composer the preview endpoint uses, then the staff edit folded in
      // — so what was read in the confirm is what leaves the building.
      const canonical = composeK1ShareEmail({
        ownerName: owner.name, propertyName: propName(propertyCode),
        documentCount: published.length, taxYear: published[0].taxYear, url,
      });
      const { email: draftEmail, edited } = applyK1EmailEdit(canonical, draft, url);
      wasEdited = edited;
      const copyTo = shareCopyTo();
      const ok = await sendMail({
        ...headers(), subject: draftEmail.subject, textBody: draftEmail.body,
        ...(copyTo ? { bcc: copyTo } : {}),
      });
      if (ok) sentTo = recipients;
      else mailError = "The email failed to send. The link is created — copy it and send it yourself.";

      // The PIN follows as its OWN message, automatically. Staff used to have
      // to call or text it, and a delivery step that depends on remembering is
      // a step that gets missed — an investor holding a link they can't open
      // is a support call either way.
      //
      // Only after the link actually went: a PIN on its own tells the
      // recipient nothing and is one more thing to explain. It goes to the
      // SAME list, because an additional recipient who can't open the document
      // is not an additional recipient.
      if (ok) {
        const pinMail = composeK1PinEmail({ ownerName: owner.name, pin: link.pin ?? "" });
        // Copied as well, so the inbox record shows BOTH halves went out. A
        // copy of only the link email would confirm the half that was never
        // in doubt and stay silent on the one that was.
        // Addressed exactly like the link email — the two messages are a pair,
        // and a PIN that arrives To when the link arrived Cc reads as a
        // different conversation.
        const pinOk = link.pin
          ? await sendMail({
              ...headers(), subject: pinMail.subject, textBody: pinMail.body,
              ...(copyTo ? { bcc: copyTo } : {}),
            })
          : false;
        if (pinOk) pinSentTo = recipients;
        else pinError = "The PIN email didn't go out — give them the PIN below yourself, or they can't open the link.";
      }
    }
  }

  // Record the send ON THE LINK, so "did this actually go out, and when" is
  // answerable from the roster forever after — not only in the results panel
  // that disappears, the admin audit log behind a second password, or
  // Postmark. A link EXISTING and a link having been EMAILED are different
  // facts, and the roster has to be able to tell them apart.
  if (sentTo.length) {
    const at = new Date().toISOString();
    link.sentAt = at;
    link.sentTo = sentTo;
    link.pinSentAt = pinSentTo.length ? at : null;
    link.sendCount = (link.sendCount ?? 0) + 1;
    await saveInvestorLink(link);
  }

  await logAudit({
    event: "investor-k1.share", user: USERS[user]?.label ?? user, ip: auditIp(req),
    detail: `${propertyCode} · ${owner.name}${sentTo.length ? ` · emailed ${sentTo.join(", ")}` : " · link only"}${wasEdited ? " · edited wording" : ""}${sentTo.length ? (pinSentTo.length ? " · PIN emailed" : " · PIN NOT emailed") : ""}`,
  });
  return { ownerId: owner.id, ownerName: owner.name, heldAs: owner.detailedName ?? null, url, pin: link.pin, sentTo, mailError, pinSentTo, pinError };
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
    // A draft edit is only meaningful when the batch is one person — the UI's
    // single-investor Share card posts through this path. Two or more
    // recipients get the canonical wording, because one hand-written body
    // addressed to somebody cannot be right for everybody.
    const draft = ids.length === 1 ? (body?.draft ?? null) : null;
    // Unlike the draft, this applies to a batch as happily as to one: it is a
    // convention about addressing, not wording meant for one person.
    const ccSecondary = body?.ccSecondary !== false;
    const results: ShareResult[] = [];
    for (const id of ids) results.push(await shareOne(req, user, secret, propertyCode, id, year, send, draft, ccSecondary));
    return NextResponse.json({ ok: true, results }, { status: 201 });
  }

  // The draft edit belongs to a single send: a batch addresses many different
  // investors, so one hand-written body cannot be right for all of them.
  const one = await shareOne(req, user, secret, propertyCode, String(body?.ownerId ?? ""), year, send, body?.draft ?? null, body?.ccSecondary !== false);
  if (one.error) return NextResponse.json({ error: one.error }, { status: 400 });
  return NextResponse.json({
    ok: true, url: one.url, pin: one.pin, sentTo: one.sentTo, mailError: one.mailError,
    pinSentTo: one.pinSentTo, pinError: one.pinError,
  }, { status: 201 });
}

/**
 * GET ?propertyCode=&ownerId=&year= — the exact email the send would compose.
 *
 * Read-only and side-effect-free by construction: it publishes nothing, mints
 * nothing and revokes nothing. It exists so "Email the investor" can show the
 * message before it goes out rather than after — the send is irreversible
 * (you cannot unsend a link to an investor's tax document), so reading it
 * first is the point.
 *
 * It re-signs the EXISTING link's token, which is why it can only preview an
 * investor who already has a link. That matches the UI: the confirm step only
 * opens on a link that exists.
 */
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const secret = investorLinkSecret();
  if (!secret) return NextResponse.json({ error: "Investor sharing is not configured (no link secret set)." }, { status: 500 });

  const q = req.nextUrl.searchParams;
  const propertyCode = String(q.get("propertyCode") ?? "");
  const found = personGroup(propertyCode, String(q.get("ownerId") ?? ""));
  if (!found) return NextResponse.json({ error: "That owner isn't on this partnership." }, { status: 400 });
  const { owner, group } = found;
  const rawYear = Number(q.get("year"));
  const year = Number.isFinite(rawYear) && rawYear > 0 ? rawYear : null;

  // The same scope the send releases: this partnership, this year.
  const inScope = new Set(
    (PROPERTY_OWNERSHIP.find((p) => p.propertyCode === propertyCode)?.owners ?? [])
      .filter((o) => group.some((g) => g.id === o.id))
      .map((o) => o.id),
  );
  const mine = (await Promise.all([...inScope].map((id) => k1sForOwner(id))))
    .flat()
    .filter((d) => year == null || d.taxYear === year);
  if (mine.length === 0) {
    return NextResponse.json({ error: `${owner.name} has no ${year ?? ""} K-1 uploaded yet.`.replace("  ", " ") }, { status: 400 });
  }

  const ids = group.map((o) => o.id);
  const link = (await listInvestorLinks())
    .find((l) => !l.revoked && coveredOwnerIds(l).some((id) => ids.includes(id)));
  const url = link
    ? `${linkOrigin(req)}/investor/${await signInvestorToken(secret, { v: 1, id: link.id, o: link.ownerId, p: link.propertyCode })}`
    : `${linkOrigin(req)}/investor/…`;

  const overrides = await allOwnerEmails();
  const resolved = resolveOwnerEmail(owner.name, owner.detailedName ?? null, overrides[owner.id]?.email, await getContactOverrides());
  const recipients = [resolved.email ?? "", ...resolved.alsoEmail].filter(Boolean);

  const email: K1ShareEmail = composeK1ShareEmail({
    ownerName: owner.name, propertyName: propName(propertyCode),
    documentCount: mine.length, taxYear: mine[0].taxYear, url,
  });
  // The second message the send delivers. Shown in the confirm but not
  // editable: it is three lines and a number, and the number is the one thing
  // an edit could get wrong.
  const pinEmail = link?.pin ? composeK1PinEmail({ ownerName: owner.name, pin: link.pin }) : null;
  const copyTo = shareCopyTo();
  return NextResponse.json({
    ok: true, ...email, followUp: pinEmail, recipients, hasLink: !!link,
    // Reported so the confirm can say who is blind-copied. A copy nobody can
    // see in the UI is the kind of thing that surprises someone later.
    copyTo: copyTo ? copyTo.split(",").map((a) => a.trim()).filter(Boolean) : [],
  });
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
