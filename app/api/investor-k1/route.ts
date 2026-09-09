import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, isPathAllowed, USERS, type UserId } from "@/lib/users";
import { PROPERTY_OWNERSHIP } from "@/lib/properties/ownership";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import { publishBlockers, type K1Document } from "@/lib/investors/k1";
import { k1sFor, k1YearsFor, saveK1, getK1, removeK1, allK1s } from "@/lib/investors/k1Store";
import { putK1File, removeK1File } from "@/lib/investors/k1Files";
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
const propName = (code: string) => PROPERTY_DEFS.find((p) => p.id.toUpperCase() === code.toUpperCase())?.name ?? code;

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
            ? { id: live.id, createdAt: live.createdAt, viewCount: live.viewCount ?? 0, lastViewedAt: live.lastViewedAt ?? null, url: liveUrl, pin: live.pin ?? null }
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
          }
        : null,
    })),
    documents,
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
  if (!/\.pdf$/i.test(file.name)) {
    return NextResponse.json({ error: `${file.name} isn't a PDF. K-1s must be PDFs.` }, { status: 400 });
  }

  const existing = (await k1sFor(property, year)).find((d) => d.ownerId === owner.id);
  if (existing) {
    return NextResponse.json({ error: `${owner.name} already has a ${year} K-1 (${existing.filename}). Delete it first to replace it.` }, { status: 409 });
  }

  const id = "k1_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const { ref, local } = await putK1File({ propertyCode: property, taxYear: year, id, name: file.name, file });
  const doc: K1Document = {
    id, propertyCode: property, taxYear: year, filename: file.name, size: file.size, ref, local,
    uploadedAt: new Date().toISOString(), uploadedBy: USERS[user]?.label ?? user,
    ownerId: owner.id, ownerName: owner.name,
    published: false, publishedAt: null, views: [], viewCount: 0, lastViewedAt: null,
  };
  await saveK1(doc);

  await logAudit({
    event: "investor-k1.upload", user: USERS[user]?.label ?? user, ip: auditIp(req),
    detail: `${property} ${year} · ${owner.name}${owner.vendorCode ? ` (${owner.vendorCode})` : ""} · ${file.name}`,
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
