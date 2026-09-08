import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, canManageK1, type UserId } from "@/lib/users";
import { PREVIEW_TOKEN, previewPdf } from "@/lib/investors/k1Preview";
import { checkInvestorAccess } from "@/lib/investors/k1Access";
import { getK1, saveK1 } from "@/lib/investors/k1Store";
import { linkOwnerIds } from "@/lib/investors/k1Link";
import { readK1Bytes } from "@/lib/investors/k1Files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public — stream ONE K-1 belonging to this link's owner.
 *
 *  Every guard here matters: the document must exist, be published, and belong
 *  to the owner this token was minted for. An investor who guesses another
 *  document's id gets a 404, not somebody else's tax return. */

/** Preview is STAFF only, checked before any token logic — it must never become
 *  a way to reach a real investor's documents. */
async function previewViewer(): Promise<boolean> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return false;
  const id = await verifySiteToken((await cookies()).get(SITE_COOKIE)?.value, secret);
  return !!id && (ALL_USERS as readonly string[]).includes(id) && canManageK1(id as UserId);
}

export async function GET(req: NextRequest, { params }: { params: { token: string } }): Promise<Response> {
  const tok = (await params).token;
  if (tok === PREVIEW_TOKEN) {
    if (!(await previewViewer())) return NextResponse.json({ error: "Preview is for staff only." }, { status: 401 });
    // A real document id belongs to the ?owner= view; anything else is the
    // sample. Either way the caller is staff, who can already download these.
    const wanted = req.nextUrl.searchParams.get("id") ?? "";
    if (!wanted.startsWith("preview-")) {
      const real = await getK1(wanted);
      if (real) {
        const buf = await readK1Bytes(real);
        return new NextResponse(new Uint8Array(buf), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="${real.filename.replace(/"/g, "")}"`,
            "Cache-Control": "private, no-store",
          },
        });
      }
    }
    const bytes = previewPdf();
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="sample-schedule-k1.pdf"',
        "Cache-Control": "private, no-store",
      },
    });
  }
  const access = await checkInvestorAccess(params.token, req);
  if (!access.ok) {
    return NextResponse.json({ error: access.error, ...(access.pinRequired ? { pinRequired: true } : {}) }, { status: access.status });
  }
  const link = access.link!;
  const doc = await getK1(req.nextUrl.searchParams.get("id") ?? "");
  if (!doc || !doc.published || !linkOwnerIds(link).includes(doc.ownerId)) {
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
