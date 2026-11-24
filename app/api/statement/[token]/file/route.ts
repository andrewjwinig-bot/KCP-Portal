import { NextRequest, NextResponse } from "next/server";
import { inlineSafe } from "@/lib/blobAccess";
import { checkTenantAccess } from "@/lib/cam/tenantLink/access";
import { camAttachments } from "@/lib/cam/attachments/store";
import { readAttachmentBytes } from "@/lib/cam/attachments/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public — stream one backup file behind a signed tenant link. Only files
 *  flagged shareable (includeInPackage), scoped to the link's property/year, are
 *  ever served; anything else 404s. */
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const access = await checkTenantAccess(params.token, req);
  if (!access.ok) return NextResponse.json({ error: access.error, ...(access.pinRequired ? { pinRequired: true } : {}) }, { status: access.status });
  const { payload } = access;

  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const rec = await camAttachments(payload.p, payload.y).get(id);
  if (!rec || !rec.includeInPackage || rec.property !== payload.p || rec.year !== payload.y) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const bytes = await readAttachmentBytes(rec);
    const download = req.nextUrl.searchParams.get("download") === "1";
    return new NextResponse(bytes, {
      headers: {
        // Only a PDF or an image shows inline; anything else is a sandboxed
        // download, so a stored .html can never run on this origin.
        "Content-Type": inlineSafe(rec.contentType || "") ? rec.contentType : "application/octet-stream",
        "Content-Disposition": `${download || !inlineSafe(rec.contentType || "") ? "attachment" : "inline"}; filename="${rec.name.replace(/["\r\n]/g, "")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        ...(inlineSafe(rec.contentType || "") ? {} : { "Content-Security-Policy": "sandbox" }),
      },
    });
  } catch (err: any) {
    console.error("[GET /api/statement/file]", err?.message ?? err);
    return NextResponse.json({ error: "Could not read file" }, { status: 500 });
  }
}
