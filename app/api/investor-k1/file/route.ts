import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, isPathAllowed, type UserId } from "@/lib/users";
import { getK1 } from "@/lib/investors/k1Store";
import { readK1Bytes } from "@/lib/investors/k1Files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Staff preview of a K-1 — so the person confirming the match can actually
 *  open the document and check the name on it before signing off. */
export async function GET(req: NextRequest): Promise<Response> {
  const secret = process.env.SITE_AUTH_SECRET;
  const id = secret ? await verifySiteToken((await cookies()).get(SITE_COOKIE)?.value, secret) : null;
  if (!id || !(ALL_USERS as readonly string[]).includes(id) || !isPathAllowed(id as UserId, "/investor-k1")) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  const doc = await getK1(req.nextUrl.searchParams.get("id") ?? "");
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    return new NextResponse(await readK1Bytes(doc), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${doc.filename.replace(/[^\w.\-]+/g, "_")}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "That file could not be read." }, { status: 502 });
  }
}
