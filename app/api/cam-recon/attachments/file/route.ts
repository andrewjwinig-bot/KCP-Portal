import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, isPathAllowed, type UserId } from "@/lib/users";
import { camAttachments } from "@/lib/cam/attachments/store";
import { readAttachmentBytes } from "@/lib/cam/attachments/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authed(): Promise<boolean> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return false;
  const id = await verifySiteToken((await cookies()).get(SITE_COOKIE)?.value, secret);
  return !!id && (ALL_USERS as readonly string[]).includes(id) && isPathAllowed(id as UserId, "/cam-recon");
}

/** GET ?property=&year=&id=&download=1 → stream one backup file (inline to view,
 *  attachment to download). */
export async function GET(req: NextRequest) {
  if (!(await authed())) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const property = req.nextUrl.searchParams.get("property") ?? "";
  const year = Number(req.nextUrl.searchParams.get("year"));
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const download = req.nextUrl.searchParams.get("download") === "1";
  if (!property || !year || !id) return NextResponse.json({ error: "property, year, id required" }, { status: 400 });
  try {
    const rec = await camAttachments(property, year).get(id);
    if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const bytes = await readAttachmentBytes(rec);
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": rec.contentType || "application/octet-stream",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${rec.name.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err: any) {
    console.error("[GET /api/cam-recon/attachments/file]", err?.message ?? err);
    return NextResponse.json({ error: "Failed to read file" }, { status: 500 });
  }
}
