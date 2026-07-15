import { NextRequest, NextResponse } from "next/server";
import { verifyTenantToken, linkSecret } from "@/lib/cam/tenantLink/token";
import { getTenantLink } from "@/lib/cam/tenantLink/store";
import { camAttachments } from "@/lib/cam/attachments/store";
import { readAttachmentBytes } from "@/lib/cam/attachments/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public — stream one backup file behind a signed tenant link. Only files
 *  flagged shareable (includeInPackage), scoped to the link's property/year, are
 *  ever served; anything else 404s. */
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const secret = linkSecret();
  if (!secret) return NextResponse.json({ error: "Sharing is not configured." }, { status: 503 });
  const payload = await verifyTenantToken(params.token, secret);
  if (!payload) return NextResponse.json({ error: "Invalid or expired link." }, { status: 401 });
  const link = await getTenantLink(payload.id);
  if (!link || link.revoked) return NextResponse.json({ error: "This link has been revoked." }, { status: 401 });

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
        "Content-Type": rec.contentType || "application/octet-stream",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${rec.name.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err: any) {
    console.error("[GET /api/statement/file]", err?.message ?? err);
    return NextResponse.json({ error: "Could not read file" }, { status: 500 });
  }
}
