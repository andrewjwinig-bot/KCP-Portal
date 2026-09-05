import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, isPathAllowed, USERS, type UserId } from "@/lib/users";
import { PROPERTY_OWNERSHIP } from "@/lib/properties/ownership";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import { matchK1ToOwner, publishBlockers, type K1Document } from "@/lib/investors/k1";
import { k1sFor, k1YearsFor, saveK1, getK1, removeK1, allK1s } from "@/lib/investors/k1Store";
import { putK1File, removeK1File } from "@/lib/investors/k1Files";
import { listInvestorLinks } from "@/lib/investors/k1Link";
import { logAudit, auditIp } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** K-1s carry taxpayer IDs, so this is gated on its own path — deliberately NOT
 *  the /investors prefix, which a family owner can also reach. */
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
    const interests = PROPERTY_OWNERSHIP.flatMap((p) =>
      p.owners.filter((o) => o.name === investor).map((o) => ({ propertyCode: p.propertyCode, hasK1: !!p.hasK1Distribution, owner: o })),
    );
    return NextResponse.json({
      ok: true,
      properties,
      interests: interests.map(({ propertyCode, hasK1, owner }) => {
        const live = links.find((l) => !l.revoked && l.ownerId === owner.id) ?? null;
        return {
          ownerId: owner.id,
          propertyCode,
          propertyName: propName(propertyCode),
          filesK1: hasK1,
          heldAs: owner.detailedName ?? null,
          vendorCode: owner.vendorCode ?? null,
          documents: docs
            .filter((d) => d.ownerId === owner.id)
            .sort((a, b) => b.taxYear - a.taxYear)
            .map((d) => ({ id: d.id, taxYear: d.taxYear, filename: d.filename, published: d.published, status: d.status, viewCount: d.viewCount ?? 0 })),
          link: live ? { id: live.id, createdAt: live.createdAt, viewCount: live.viewCount ?? 0, lastViewedAt: live.lastViewedAt ?? null } : null,
        };
      }),
    });
  }

  if (!property || !Number.isFinite(year)) {
    return NextResponse.json({ ok: true, properties, years: [], owners: [], documents: [], blockers: [] });
  }

  const owners = ownersOf(property);
  const documents = await k1sFor(property, year);
  const links = await listInvestorLinks();
  const linkByOwner = new Map(links.filter((l) => !l.revoked).map((l) => [l.ownerId, l]));

  return NextResponse.json({
    ok: true,
    properties,
    years: await k1YearsFor(property),
    owners: owners.map((o) => ({
      id: o.id, name: o.name, detailedName: o.detailedName ?? null, vendorCode: o.vendorCode ?? null,
      ownerPct: o.ownerPct ?? null,
      // Owners whose name is not unique on this roster — the ones a filename
      // alone can never resolve. Surfaced so the page can say so up front.
      sharesName: owners.filter((x) => x.name === o.name).length > 1,
      link: linkByOwner.get(o.id)
        ? { id: linkByOwner.get(o.id)!.id, createdAt: linkByOwner.get(o.id)!.createdAt, viewCount: linkByOwner.get(o.id)!.viewCount ?? 0, lastViewedAt: linkByOwner.get(o.id)!.lastViewedAt ?? null }
        : null,
    })),
    documents,
    blockers: publishBlockers(documents),
  });
}

/** POST (multipart) — upload one or more K-1 PDFs and suggest an owner for each.
 *  A suggestion is never a decision: everything lands unconfirmed. */
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Expected a multipart upload." }, { status: 400 }); }
  const property = String(form.get("property") ?? "");
  const year = Number(form.get("year"));
  if (!property || !Number.isFinite(year)) return NextResponse.json({ error: "property and year are required." }, { status: 400 });
  const owners = ownersOf(property);
  if (owners.length === 0) return NextResponse.json({ error: "No owners on file for that property." }, { status: 400 });

  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (files.length === 0) return NextResponse.json({ error: "No file was uploaded." }, { status: 400 });

  const out: K1Document[] = [];
  for (const file of files) {
    if (!/\.pdf$/i.test(file.name)) {
      return NextResponse.json({ error: `${file.name} isn't a PDF. K-1s must be PDFs.` }, { status: 400 });
    }
    const id = "k1_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const { ref, local } = await putK1File({ propertyCode: property, taxYear: year, id, name: file.name, file });
    const match = matchK1ToOwner(file.name, owners);
    const owner = match.ownerId ? owners.find((o) => o.id === match.ownerId) ?? null : null;
    const doc: K1Document = {
      id, propertyCode: property, taxYear: year, filename: file.name, size: file.size, ref, local,
      uploadedAt: new Date().toISOString(), uploadedBy: USERS[user]?.label ?? user,
      ownerId: owner?.id ?? null,
      ownerName: owner?.name ?? "",
      match,
      // A machine suggestion is never a confirmation — a person signs off below.
      status: owner ? "suggested" : "unassigned",
      confirmedAt: null, confirmedBy: null,
      published: false, publishedAt: null, views: [], viewCount: 0, lastViewedAt: null,
    };
    await saveK1(doc);
    out.push(doc);
  }

  await logAudit({
    event: "investor-k1.upload", user: USERS[user]?.label ?? user, ip: auditIp(req),
    detail: `${property} ${year} · ${out.length} file${out.length === 1 ? "" : "s"}`,
  });
  return NextResponse.json({ ok: true, documents: out }, { status: 201 });
}

/** PATCH { id, action, ownerId? } — assign / confirm / unconfirm / publish. */
export async function PATCH(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "");

  if (action === "publish" || action === "unpublish") {
    const property = String(body?.property ?? "");
    const year = Number(body?.year);
    const docs = await k1sFor(property, year);
    if (docs.length === 0) return NextResponse.json({ error: "Nothing to publish." }, { status: 404 });
    if (action === "publish") {
      // The gate: every file confirmed against a distinct owner. Anything less
      // and somebody receives a document that isn't theirs.
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

  const doc = await getK1(String(body?.id ?? ""));
  if (!doc) return NextResponse.json({ error: "That document no longer exists." }, { status: 404 });

  if (action === "assign") {
    const owners = ownersOf(doc.propertyCode);
    const owner = owners.find((o) => o.id === String(body?.ownerId ?? ""));
    if (!owner) return NextResponse.json({ error: "That owner isn't on this partnership." }, { status: 400 });
    doc.ownerId = owner.id;
    doc.ownerName = owner.name;
    // Assigning by hand IS the confirmation — a person chose this owner.
    doc.status = "confirmed";
    doc.confirmedAt = new Date().toISOString();
    doc.confirmedBy = USERS[user]?.label ?? user;
  } else if (action === "confirm") {
    if (!doc.ownerId) return NextResponse.json({ error: "Assign an owner before confirming." }, { status: 400 });
    doc.status = "confirmed";
    doc.confirmedAt = new Date().toISOString();
    doc.confirmedBy = USERS[user]?.label ?? user;
  } else if (action === "unconfirm") {
    doc.status = doc.ownerId ? "suggested" : "unassigned";
    doc.confirmedAt = null; doc.confirmedBy = null;
    // A document already out in the world can't be quietly un-decided.
    doc.published = false; doc.publishedAt = null;
  } else {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
  await saveK1(doc);
  return NextResponse.json({ ok: true, document: doc });
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
