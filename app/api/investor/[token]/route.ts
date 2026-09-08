import { NextRequest, NextResponse } from "next/server";
import { checkInvestorAccess, logInvestorView } from "@/lib/investors/k1Access";
import { publishedK1sForOwner } from "@/lib/investors/k1Store";
import { linkOwnerIds } from "@/lib/investors/k1Link";
import { cookies } from "next/headers";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, canManageK1, type UserId } from "@/lib/users";
import { PREVIEW_TOKEN, previewPayload } from "@/lib/investors/k1Preview";
import { PROPERTY_OWNERSHIP } from "@/lib/properties/ownership";
import { PROPERTY_DEFS } from "@/lib/properties/data";

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
    return NextResponse.json(previewPayload());
  }
  const access = await checkInvestorAccess(token, req);
  if (!access.ok) {
    return NextResponse.json({ error: access.error, ...(access.pinRequired ? { pinRequired: true } : {}) }, { status: access.status });
  }
  const link = access.link!;
  await logInvestorView(link, req.headers.get("x-forwarded-for")?.split(",")[0]?.trim());

  const owners = PROPERTY_OWNERSHIP.find((p) => p.propertyCode === link.propertyCode)?.owners ?? [];
  const ids = linkOwnerIds(link);
  const owner = owners.find((o) => o.id === ids[0]);
  // One person, so one link — but a trust interest and a personal one are
  // separate K-1s, so each document carries the interest it belongs to or the
  // two rows would look identical.
  const perOwner = await Promise.all(ids.map(async (id) => ({
    heldAs: owners.find((o) => o.id === id)?.detailedName ?? null,
    docs: await publishedK1sForOwner(id),
  })));
  const docs = perOwner.flatMap(({ heldAs, docs }) => docs.map((d) => ({ ...d, heldAs })));

  return NextResponse.json({
    ok: true,
    owner: {
      name: owner?.name ?? link.ownerName,
      // The trust or entity the interest is actually held through — the thing
      // that distinguishes one Alison Korman Feldman interest from the other.
      heldAs: owner?.detailedName ?? null,
    },
    property: { code: link.propertyCode, name: propName(link.propertyCode) },
    // Deliberately NOT sent: ownership percentages, co-owners, capital
    // accounts. This link exists to deliver a document, nothing more.
    documents: docs
      .sort((a, b) => b.taxYear - a.taxYear || (a.heldAs ?? "").localeCompare(b.heldAs ?? ""))
      .map((d) => ({ id: d.id, taxYear: d.taxYear, filename: d.filename, size: d.size, publishedAt: d.publishedAt, heldAs: d.heldAs })),
  });
}
