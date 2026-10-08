import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, canManageK1, USERS, type UserId } from "@/lib/users";
import { getTaxDoc } from "@/lib/investors/taxDocStore";
import { readTaxDocBytes } from "@/lib/investors/taxDocFiles";
import { logAudit, auditIp } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET ?id= — stream a partnership tax document to STAFF.
 *
 * There is deliberately no token-authenticated counterpart to this route.
 * Investors reach documents through /api/investor/[token]/file, which resolves
 * only records in the `investor-k1` collection and re-checks
 * `doc.ownerId === link.ownerId`; nothing here has an owner and nothing here is
 * in that collection, so no investor link can address these files.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.SITE_AUTH_SECRET;
  const id = secret ? await verifySiteToken((await cookies()).get(SITE_COOKIE)?.value, secret) : null;
  if (!id || !(ALL_USERS as readonly string[]).includes(id) || !canManageK1(id as UserId)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  const doc = await getTaxDoc(req.nextUrl.searchParams.get("id") ?? "");
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let bytes: Buffer;
  try { bytes = await readTaxDocBytes(doc); }
  catch { return NextResponse.json({ error: "That file could not be read." }, { status: 502 }); }

  await logAudit({
    event: "property-tax-doc.view", user: USERS[id as UserId]?.label ?? id, ip: auditIp(req),
    detail: `${doc.propertyCode} ${doc.taxYear} · ${doc.filename}`,
  });
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${doc.filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
