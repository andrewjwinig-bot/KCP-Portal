import { NextRequest, NextResponse } from "next/server";
import { checkInvestorAccess, logInvestorView } from "@/lib/investors/k1Access";
import { publishedK1sForOwner } from "@/lib/investors/k1Store";
import { PROPERTY_OWNERSHIP } from "@/lib/properties/ownership";
import { PROPERTY_DEFS } from "@/lib/properties/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const propName = (code: string) => PROPERTY_DEFS.find((p) => p.id.toUpperCase() === code.toUpperCase())?.name ?? code;

/** Public — one investor's own published K-1s, behind the signed link + PIN.
 *  Scoped entirely to the link's single owner id. */
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const access = await checkInvestorAccess(params.token, req);
  if (!access.ok) {
    return NextResponse.json({ error: access.error, ...(access.pinRequired ? { pinRequired: true } : {}) }, { status: access.status });
  }
  const link = access.link!;
  await logInvestorView(link, req.headers.get("x-forwarded-for")?.split(",")[0]?.trim());

  const owner = PROPERTY_OWNERSHIP.find((p) => p.propertyCode === link.propertyCode)?.owners.find((o) => o.id === link.ownerId);
  const docs = await publishedK1sForOwner(link.ownerId);

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
    documents: docs.map((d) => ({ id: d.id, taxYear: d.taxYear, filename: d.filename, size: d.size, publishedAt: d.publishedAt })),
  });
}
