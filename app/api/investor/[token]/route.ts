import { NextRequest, NextResponse } from "next/server";
import { checkInvestorAccess, logInvestorView } from "@/lib/investors/k1Access";
import { publishedK1sForOwner } from "@/lib/investors/k1Store";
import { linkOwnerIds } from "@/lib/investors/k1Link";
import { cookies } from "next/headers";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, canManageK1, type UserId } from "@/lib/users";
import { PREVIEW_TOKEN, previewPayload, previewOwnerPayload } from "@/lib/investors/k1Preview";
import { k1sForOwner } from "@/lib/investors/k1Store";
import { PROPERTY_OWNERSHIP } from "@/lib/properties/ownership";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import { coveredOwnerIds } from "@/lib/investors/linkCoverage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const propName = (code: string) => PROPERTY_DEFS.find((p) => p.id.toUpperCase() === code.toUpperCase())?.name ?? code;

/** Public — one investor's own published K-1s, behind the signed link + PIN.
 *  Scoped entirely to the link's single owner id. */

/** Preview is STAFF only, and is checked before any token logic runs — it must
 *  never become a way to reach a real investor's documents. */
async function previewViewer(): Promise<boolean> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return false;
  const id = await verifySiteToken((await cookies()).get(SITE_COOKIE)?.value, secret);
  return !!id && (ALL_USERS as readonly string[]).includes(id) && canManageK1(id as UserId);
}

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const { token } = await params;
  if (token === PREVIEW_TOKEN) {
    if (!(await previewViewer())) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

    // ?owner= renders a REAL owner's page as they would see it, so staff can
    // look before releasing anything. Still mints nothing and publishes
    // nothing — it is a view, not a share.
    const ownerId = req.nextUrl.searchParams.get("owner");
    if (ownerId) {
      const entry = PROPERTY_OWNERSHIP.find((p) => p.owners.some((o) => o.id === ownerId));
      const owner = entry?.owners.find((o) => o.id === ownerId);
      if (!entry || !owner) return NextResponse.json({ error: "That owner isn't on file." }, { status: 404 });
      // Their whole person-group, matching what a real link would carry.
      const norm = (v: string) => v.toLowerCase().replace(/\s+/g, " ").trim();
      // Across every partnership, matching the link they would actually get.
      const group = PROPERTY_OWNERSHIP.flatMap((p) => p.owners.map((o) => ({ o, code: p.propertyCode })))
        .filter((x) => norm(x.o.name) === norm(owner.name));
      const docs = (await Promise.all(group.map(async ({ o, code }) => {
        const heldAs = o.detailedName ?? null;
        return (await k1sForOwner(o.id)).map((d) => ({
          id: d.id, taxYear: d.taxYear, filename: d.filename, size: d.size,
          publishedAt: d.publishedAt, heldAs, published: d.published,
          propertyCode: code, propertyName: propName(code),
        }));
      }))).flat();
      return NextResponse.json(previewOwnerPayload({
        ownerName: owner.name,
        propertyCode: entry.propertyCode,
        propertyName: propName(entry.propertyCode),
        documents: docs.map(({ published, ...d }) => d),
        propertyCount: new Set(docs.map((d) => d.propertyCode)).size,
        anyUnsent: docs.some((d) => !d.published),
      }));
    }
    return NextResponse.json(previewPayload());
  }
  const access = await checkInvestorAccess(token, req);
  if (!access.ok) {
    return NextResponse.json({ error: access.error, ...(access.pinRequired ? { pinRequired: true } : {}) }, { status: access.status });
  }
  const link = access.link!;
  await logInvestorView(link, req.headers.get("x-forwarded-for")?.split(",")[0]?.trim());

  // A link covers the whole PERSON, across every partnership they hold, so
  // resolve owners globally rather than within one property.
  const everyOwner = PROPERTY_OWNERSHIP.flatMap((p) => p.owners.map((o) => ({ o, code: p.propertyCode })));
  const ids = coveredOwnerIds(link);
  const owner = everyOwner.find((x) => x.o.id === ids[0])?.o;
  // Each document carries BOTH its property and the interest it's held through:
  // an investor in four partnerships needs to see which K-1 is which, and a
  // trust interest and a personal one in the same partnership are separate
  // documents that would otherwise read identically.
  const perOwner = await Promise.all(ids.map(async (id) => {
    const hit = everyOwner.find((x) => x.o.id === id);
    return {
      heldAs: hit?.o.detailedName ?? null,
      propertyCode: hit?.code ?? link.propertyCode,
      docs: await publishedK1sForOwner(id),
    };
  }));
  const docs = perOwner.flatMap(({ heldAs, propertyCode, docs }) =>
    docs.map((d) => ({ ...d, heldAs, propertyCode, propertyName: propName(propertyCode) })));

  return NextResponse.json({
    ok: true,
    owner: {
      name: owner?.name ?? link.ownerName,
      // The trust or entity the interest is actually held through — the thing
      // that distinguishes one Alison Korman Feldman interest from the other.
      heldAs: owner?.detailedName ?? null,
    },
    property: { code: link.propertyCode, name: propName(link.propertyCode) },
    /** How many partnerships this link actually spans — the header stops naming
     *  a single property once there is more than one. */
    propertyCount: new Set(docs.map((d) => d.propertyCode)).size,
    // Deliberately NOT sent: ownership percentages, co-owners, capital
    // accounts. This link exists to deliver a document, nothing more.
    documents: docs
      .sort((a, b) => b.taxYear - a.taxYear
        || a.propertyCode.localeCompare(b.propertyCode)
        || (a.heldAs ?? "").localeCompare(b.heldAs ?? ""))
      .map((d) => ({
        id: d.id, taxYear: d.taxYear, filename: d.filename, size: d.size,
        publishedAt: d.publishedAt, heldAs: d.heldAs,
        propertyCode: d.propertyCode, propertyName: d.propertyName,
      })),
  });
}
