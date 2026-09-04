import { NextRequest, NextResponse } from "next/server";
import { checkInvestorAccess } from "@/lib/investors/k1Access";
import { getK1, saveK1 } from "@/lib/investors/k1Store";
import { readK1Bytes } from "@/lib/investors/k1Files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public — stream ONE K-1 belonging to this link's owner.
 *
 *  Every guard here matters: the document must exist, be published, and belong
 *  to the owner this token was minted for. An investor who guesses another
 *  document's id gets a 404, not somebody else's tax return. */
export async function GET(req: NextRequest, { params }: { params: { token: string } }): Promise<Response> {
  const access = await checkInvestorAccess(params.token, req);
  if (!access.ok) {
    return NextResponse.json({ error: access.error, ...(access.pinRequired ? { pinRequired: true } : {}) }, { status: access.status });
  }
  const link = access.link!;
  const doc = await getK1(req.nextUrl.searchParams.get("id") ?? "");
  if (!doc || !doc.published || doc.ownerId !== link.ownerId) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // Reading a K-1 is worth recording — best-effort, never blocks the download.
  try {
    const at = new Date().toISOString();
    doc.views = [...(doc.views ?? []), { at }].slice(-50);
    doc.viewCount = (doc.viewCount ?? 0) + 1;
    doc.lastViewedAt = at;
    await saveK1(doc);
  } catch { /* best-effort */ }

  try {
    return new NextResponse(await readK1Bytes(doc), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${`K-1 ${doc.taxYear} ${link.ownerName}`.replace(/[^\w.\- ]+/g, "_")}.pdf"`,
        "Cache-Control": "no-store, private",
      },
    });
  } catch {
    return NextResponse.json({ error: "That file could not be read." }, { status: 502 });
  }
}
