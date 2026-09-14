import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, isPathAllowed, USERS, type UserId } from "@/lib/users";
import { PROPERTY_OWNERSHIP } from "@/lib/properties/ownership";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import { publishBlockers, type K1Document } from "@/lib/investors/k1";
import { k1sFor, k1YearsFor, saveK1, getK1, removeK1, allK1s } from "@/lib/investors/k1Store";
import { putK1File, removeK1File } from "@/lib/investors/k1Files";
import { k1UploadError, displayFilename } from "@/lib/investors/k1Upload";
import { listInvestorLinks, linkOwnerIds, investorLinkSecret, signInvestorToken } from "@/lib/investors/k1Link";
import { resolveOwnerEmail } from "@/lib/investors/ownerEmail";
import { allOwnerEmails, clearOwnerEmail, setOwnerEmail } from "@/lib/investors/ownerEmailStore";
// The contact hub is where an investor's email is actually entered — the
// static seed covers a dozen people. Reading only the seed here is what put
// an address on the investor's row and "ADD EMAIL" in their share dialog.
import { getContactOverrides } from "@/lib/properties/ownerContactsStore";
import { logAudit, auditIp } from "@/lib/audit";
import { linkOrigin } from "@/lib/linkOrigin";
import { coveredOwnerIds } from "@/lib/investors/linkCoverage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** K-1s carry taxpayer IDs, so this is gated on its own key — deliberately NOT
 *  the /investors prefix, which a family owner can also reach. The page moved
 *  onto /investors; the capability did not. */
async function currentUser(): Promise<UserId | null> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return null;
  const id = await verifySiteToken((await cookies()).get(SITE_COOKIE)?.value, secret);
  if (!id || !(ALL_USERS as readonly string[]).includes(id)) return null;
  return isPathAllowed(id as UserId, "/investor-k1") ? (id as UserId) : null;
}

const ownersOf = (code: string) => PROPERTY_OWNERSHIP.find((p) => p.propertyCode === code)?.owners ?? [];
// An entity that files its own return is not necessarily a PROPERTY: Grays
// Ferry SC Assoc., Inc. is the GP of 4500 and issues K-1s to its own five
// shareholders, but it owns no real estate and has no place in the property
// directory. So the ownership record's own label wins, and PROPERTY_DEFS is
// the fallback rather than the source.
const propName = (code: string) =>
  PROPERTY_OWNERSHIP.find((p) => p.propertyCode.toUpperCase() === code.toUpperCase())?.propertyName
  ?? PROPERTY_DEFS.find((p) => p.id.toUpperCase() === code.toUpperCase())?.name
  ?? code;

/** GET ?property=&year= — the roster, the uploaded K-1s, and what blocks publish. */
export async function GET(req: NextRequest) {
  if (!(await currentUser())) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const property = req.nextUrl.searchParams.get("property") ?? "";
  const year = Number(req.nextUrl.searchParams.get("year"));
  const investor = (req.nextUrl.searchParams.get("investor") ?? "").trim();

  // Every partnership that actually distributes K-1s.
  const properties = PROPERTY_OWNERSHIP
    .filter((p) => p.hasK1Distribution)
    .map((p) => ({ code: p.propertyCode, name: propName(p.propertyCode), owners: p.owners.length }));

  // ── Collection progress, for every partnership at once ────────────────────
  // How many of each partnership's K-1s are in, without opening its card. The
  // roster otherwise says only that a property FILES K-1s, so finding the one
  // still missing three of them meant opening all of them in turn.
  if (req.nextUrl.searchParams.get("summary")) {
    const docs = await allK1s();
    const y = Number.isFinite(year) ? year : new Date().getFullYear() - 1;
    return NextResponse.json({
      ok: true,
      year: y,
      // COUNTED AGAINST THE ROSTER, not against the property. A document whose
      // ownerId is no longer a partner row is an ORPHAN — it belongs to a
      // roster shape that has since changed — and counting it made 0800 read
      // "28/15": more K-1s in than partners to receive them, with rows still
      // showing MISSING underneath. The count has to mean "partners whose K-1
      // is in" or it cannot mean complete.
      properties: properties.map((p) => {
        const roster = new Set(ownersOf(p.code).map((o) => o.id));
        const mine = docs.filter((d) => d.propertyCode === p.code && d.taxYear === y);
        return {
          ...p,
          uploaded: mine.filter((d) => roster.has(d.ownerId)).length,
          // Surfaced, never silently dropped: an orphan is a real PDF carrying
          // a taxpayer ID, sitting in storage, attached to no row — so it is
          // unreachable AND undeletable from the UI unless the page is told.
          orphaned: mine.filter((d) => !roster.has(d.ownerId)).length,
        };
      }),
      // Which OWNERS have one in, so By Investor can count a person's own K-1s
      // rather than a partnership's. An investor in four partnerships is four
      // separate documents, and "two of Carol's four are in" is not derivable
      // from the per-property counts — each of those partnerships is mostly
      // complete while hers is the one outstanding.
      //
      // Ids only. No names, no filenames, nothing about the document itself —
      // the same shape as /api/investor-k1/sent, and for the same reason.
      ownerIds: docs.filter((d) => d.taxYear === y).map((d) => d.ownerId),
    });
  }

  // ── By-investor mode ──────────────────────────────────────────────────────
  // The Investor Info page groups by NAME, but an interest is a per-property
  // owner record — and one person can hold several (a trust and a personal
  // interest in the same partnership). Return every record they hold, so the
  // page can show each interest's own documents rather than merging them.
  if (investor) {
    const links = await listInvestorLinks();
    const docs = await allK1s();
    const emailOverrides = await allOwnerEmails();
    const contactHub = await getContactOverrides();
    const secretI = investorLinkSecret();
    const originI = linkOrigin(req);
    const interests = PROPERTY_OWNERSHIP.flatMap((p) =>
      p.owners.filter((o) => o.name === investor).map((o) => ({ propertyCode: p.propertyCode, hasK1: !!p.hasK1Distribution, owner: o })),
    );
    return NextResponse.json({
      ok: true,
      properties,
      interests: await Promise.all(interests.map(async ({ propertyCode, hasK1, owner }) => {
        const live = links.find((l) => !l.revoked && linkOwnerIds(l).includes(owner.id)) ?? null;
        const liveUrl = live && secretI
          ? `${originI}/investor/${await signInvestorToken(secretI, { v: 1, id: live.id, o: live.ownerId, p: live.propertyCode })}`
          : null;
        return {
          ownerId: owner.id,
          propertyCode,
          propertyName: propName(propertyCode),
          filesK1: hasK1,
          heldAs: owner.detailedName ?? null,
          vendorCode: owner.vendorCode ?? null,
          ...(() => {
            const r = resolveOwnerEmail(owner.name, owner.detailedName ?? null, emailOverrides[owner.id]?.email, contactHub);
            return { email: r.email, alsoEmail: r.alsoEmail, emailSource: r.source, emailNote: r.note };
          })(),
          documents: docs
            .filter((d) => d.ownerId === owner.id)
            .sort((a, b) => b.taxYear - a.taxYear)
            .map((d) => ({ id: d.id, taxYear: d.taxYear, filename: d.filename, published: d.published, viewCount: d.viewCount ?? 0 })),
          link: live
            ? {
                id: live.id, createdAt: live.createdAt, viewCount: live.viewCount ?? 0,
                lastViewedAt: live.lastViewedAt ?? null, url: liveUrl, pin: live.pin ?? null,
                sentAt: live.sentAt ?? null, sentTo: live.sentTo ?? [],
                pinSentAt: live.pinSentAt ?? null, sendCount: live.sendCount ?? null, sentVia: live.sentVia ?? null,
              }
            : null,
        };
      })),
    });
  }

  if (!property || !Number.isFinite(year)) {
    return NextResponse.json({ ok: true, properties, years: [], owners: [], documents: [], blockers: [] });
  }

  const owners = ownersOf(property);
  const documents = await k1sFor(property, year);
  // Documents uploaded against a partner row that no longer exists. The roster
  // renders one row per CURRENT owner, so without this they are invisible: no
  // row shows them and nothing can delete them.
  const rosterIds = new Set(owners.map((o) => o.id));
  const orphans = documents
    .filter((d) => !rosterIds.has(d.ownerId))
    .map((d) => ({
      id: d.id, ownerId: d.ownerId, taxYear: d.taxYear, filename: d.filename,
      // The name it was uploaded ONTO, recorded at upload time. It is the only
      // thing that still identifies the orphan — the roster row it pointed at
      // is gone.
      ownerName: d.ownerName, uploadedAt: d.uploadedAt,
    }));
  // "K-1s uploaded" counts the ones that reached a PARTNER, so it can never
  // exceed the roster. Counting every document for the property read "28/15"
  // at 0800 — more K-1s in than partners to receive them, with rows still
  // showing MISSING beneath it.
  const onRoster = documents.filter((d) => rosterIds.has(d.ownerId));
  const links = await listInvestorLinks();
  const overrides = await allOwnerEmails();
  const contactHub = await getContactOverrides();
  // A link now covers every interest one person holds, so index it under ALL of
  // them — otherwise the person row shows "NO LINK" for a link it owns.
  const linkByOwner = new Map<string, (typeof links)[number]>();
  for (const l of links.filter((x) => !x.revoked)) {
    for (const id of coveredOwnerIds(l)) linkByOwner.set(id, l);
  }

  // The link's URL and PIN, so the roster can show and copy exactly what the
  // investor holds rather than only reporting that something was sent. The
  // token is re-signed from the stored link, so this is the SAME url — it does
  // not mint anything. Same audience as the documents themselves (canManageK1).
  const secret = investorLinkSecret();
  const origin = linkOrigin(req);
  const urlFor = async (l: (typeof links)[number]) =>
    secret ? `${origin}/investor/${await signInvestorToken(secret, { v: 1, id: l.id, o: l.ownerId, p: l.propertyCode })}` : null;
  const linkUrl = new Map<string, string | null>();
  for (const l of links.filter((x) => !x.revoked)) linkUrl.set(l.id, await urlFor(l));

  return NextResponse.json({
    ok: true,
    properties,
    years: await k1YearsFor(property),
    orphans,
    owners: owners.map((o) => ({
      id: o.id, name: o.name, detailedName: o.detailedName ?? null, vendorCode: o.vendorCode ?? null,
      ownerPct: o.ownerPct ?? null,
      // Owners whose name is not unique on this roster. Two rows reading
      // "Alison Korman Feldman" are different interests, so the page flags them
      // and you read "Held as" before dropping a PDF on one.
      sharesName: owners.filter((x) => x.name === o.name).length > 1,
      // Where their link would be emailed, and why — shown on the roster so a
      // wrong address is caught before a send, never after.
      ...(() => {
        const r = resolveOwnerEmail(o.name, o.detailedName ?? null, overrides[o.id]?.email, contactHub);
        // The additional recipients ride along: the share route mails them the
        // same link, so the roster has to be able to NAME them in the confirm.
        // Sending to an address the card never showed is exactly the silent
        // widening the confirm exists to prevent.
        return { email: r.email, alsoEmail: r.alsoEmail, emailSource: r.source, emailNote: r.note };
      })(),
      link: linkByOwner.get(o.id)
        ? {
            id: linkByOwner.get(o.id)!.id,
            createdAt: linkByOwner.get(o.id)!.createdAt,
            viewCount: linkByOwner.get(o.id)!.viewCount ?? 0,
            lastViewedAt: linkByOwner.get(o.id)!.lastViewedAt ?? null,
            url: linkUrl.get(linkByOwner.get(o.id)!.id) ?? null,
            pin: linkByOwner.get(o.id)!.pin ?? null,
            // Whether it was EMAILED, not just created — the roster pill
            // distinguishes the two, and this is what tells it apart.
            sentAt: linkByOwner.get(o.id)!.sentAt ?? null,
            sentTo: linkByOwner.get(o.id)!.sentTo ?? [],
            pinSentAt: linkByOwner.get(o.id)!.pinSentAt ?? null,
            sendCount: linkByOwner.get(o.id)!.sendCount ?? null,
            sentVia: linkByOwner.get(o.id)!.sentVia ?? null,
          }
        : null,
    })),
    documents: onRoster,
    blockers: publishBlockers(documents),
  });
}

/** POST (multipart) — attach ONE K-1 PDF to ONE owner.
 *  The owner is named by the caller because a person picked their row; nothing
 *  here reads the file or guesses from its name. An owner who already has a K-1
 *  for the year is refused rather than silently replaced — delete the old one
 *  first, so a document is never swapped out from under a link that's shared. */
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Expected a multipart upload." }, { status: 400 }); }
  const property = String(form.get("property") ?? "");
  const year = Number(form.get("year"));
  const ownerId = String(form.get("ownerId") ?? "");
  if (!property || !Number.isFinite(year)) return NextResponse.json({ error: "property and year are required." }, { status: 400 });

  const owner = ownersOf(property).find((o) => o.id === ownerId);
  if (!owner) return NextResponse.json({ error: "That owner isn't on this partnership." }, { status: 400 });

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file was uploaded." }, { status: 400 });
  // Same rules as the drop target, from the same function — a filename's
  // LENGTH is not among them and never has been.
  // The real filename rides as its own field: the file itself is sent under a
  // short, safe one because a long name was breaking the upload outright. Fall
  // back to the file's own name for any caller that does not send it.
  const realName = displayFilename(String(form.get("filename") ?? "").trim() || file.name);
  const bad = k1UploadError({ name: realName, size: file.size, type: file.type });
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });

  const existing = (await k1sFor(property, year)).find((d) => d.ownerId === owner.id);
  if (existing) {
    return NextResponse.json({ error: `${owner.name} already has a ${year} K-1 (${existing.filename}). Delete it first to replace it.` }, { status: 409 });
  }

  const id = "k1_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const { ref, local } = await putK1File({ propertyCode: property, taxYear: year, id, name: file.name, file });
  const doc: K1Document = {
    id, propertyCode: property, taxYear: year, filename: realName, size: file.size, ref, local,
    uploadedAt: new Date().toISOString(), uploadedBy: USERS[user]?.label ?? user,
    ownerId: owner.id, ownerName: owner.name,
    published: false, publishedAt: null, views: [], viewCount: 0, lastViewedAt: null,
  };
  await saveK1(doc);

  await logAudit({
    event: "investor-k1.upload", user: USERS[user]?.label ?? user, ip: auditIp(req),
    detail: `${property} ${year} · ${owner.name}${owner.vendorCode ? ` (${owner.vendorCode})` : ""} · ${realName}`,
  });
  return NextResponse.json({ ok: true, document: doc }, { status: 201 });
}

/** PATCH { property, year, action } — publish / unpublish a year's K-1s. */
export async function PATCH(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "");

  // Set (or clear) where one owner's K-1 link gets emailed. Keyed by owner id,
  // so it is exact and never depends on matching a name.
  if (action === "email") {
    const ownerId = String(body?.ownerId ?? "").trim();
    const email = String(body?.email ?? "").trim();
    if (!ownerId) return NextResponse.json({ error: "ownerId is required." }, { status: 400 });
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: `"${email}" doesn't look like an email address.` }, { status: 400 });
    }
    const by = USERS[user]?.label ?? user;
    if (email) await setOwnerEmail(ownerId, { email, setBy: by, at: new Date().toISOString() });
    else await clearOwnerEmail(ownerId);
    await logAudit({
      event: "investor-k1.email", user: by, ip: auditIp(req),
      detail: `${ownerId} · ${email || "cleared"}`,
    });
    return NextResponse.json({ ok: true });
  }

  if (action !== "publish" && action !== "unpublish") {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  const property = String(body?.property ?? "");
  const year = Number(body?.year);
  const docs = await k1sFor(property, year);
  if (docs.length === 0) return NextResponse.json({ error: "Nothing to publish." }, { status: 404 });
  if (action === "publish") {
    // Last check before the documents become visible.
    const blockers = publishBlockers(docs);
    if (blockers.length) return NextResponse.json({ error: blockers[0], blockers }, { status: 422 });
  }
  const at = new Date().toISOString();
  for (const d of docs) {
    d.published = action === "publish";
    d.publishedAt = action === "publish" ? (d.publishedAt ?? at) : null;
    await saveK1(d);
  }
  await logAudit({
    event: `investor-k1.${action}`, user: USERS[user]?.label ?? user, ip: auditIp(req),
    detail: `${property} ${year} · ${docs.length} documents`,
  });
  return NextResponse.json({ ok: true, published: action === "publish" });
}

/** DELETE ?id= — remove a document and its bytes (a wrong upload). */
export async function DELETE(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const doc = await getK1(req.nextUrl.searchParams.get("id") ?? "");
  if (!doc) return NextResponse.json({ error: "That document no longer exists." }, { status: 404 });
  await removeK1File(doc);
  await removeK1(doc.id);
  await logAudit({
    event: "investor-k1.delete", user: USERS[user]?.label ?? user, ip: auditIp(req),
    detail: `${doc.propertyCode} ${doc.taxYear} · ${doc.filename}`,
  });
  return NextResponse.json({ ok: true });
}
