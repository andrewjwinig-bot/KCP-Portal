import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import archiver from "archiver";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, isPathAllowed, type UserId } from "@/lib/users";
import { camAttachments } from "@/lib/cam/attachments/store";
import { readAttachmentBytes } from "@/lib/cam/attachments/files";
import { backupCategory, safeSegment } from "@/lib/cam/attachments/category";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authed(): Promise<boolean> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return false;
  const id = await verifySiteToken((await cookies()).get(SITE_COOKIE)?.value, secret);
  return !!id && (ALL_USERS as readonly string[]).includes(id) && isPathAllowed(id as UserId, "/cam-recon");
}

/** GET ?property=&year=&all=1 → a zip of the property's CAM backup, organized
 *  Real Estate Taxes / Insurance / Operating Expenses → line → file. By default
 *  only files flagged for the tenant package are included; ?all=1 includes every
 *  attachment (internal use). */
export async function GET(req: NextRequest) {
  if (!(await authed())) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const property = req.nextUrl.searchParams.get("property") ?? "";
  const year = Number(req.nextUrl.searchParams.get("year"));
  const all = req.nextUrl.searchParams.get("all") === "1";
  if (!property || !year) return NextResponse.json({ error: "property and year are required" }, { status: 400 });

  try {
    const recs = (await camAttachments(property, year).all()).filter((a) => all || a.includeInPackage);
    if (recs.length === 0) return NextResponse.json({ error: "No backup files to package for this property/year." }, { status: 404 });

    const archive = archiver("zip", { zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    archive.on("data", (c: Buffer) => chunks.push(c));
    const done = new Promise<void>((resolve, reject) => { archive.on("end", () => resolve()); archive.on("error", reject); });

    // De-dupe filenames within the same folder.
    const seen = new Set<string>();
    for (const a of recs) {
      let bytes: Buffer;
      try { bytes = await readAttachmentBytes(a); } catch { continue; }
      const folder = `${safeSegment(backupCategory(a.account, a.accountLabel))}/${safeSegment(`${a.account} ${a.accountLabel}`)}`;
      let entry = `${folder}/${safeSegment(a.name)}`;
      let n = 2;
      while (seen.has(entry)) { entry = `${folder}/${safeSegment(a.name).replace(/(\.[^.]+)?$/, ` (${n})$1`)}`; n++; }
      seen.add(entry);
      archive.append(bytes, { name: entry });
    }
    await archive.finalize();
    await done;

    const zip = Buffer.concat(chunks);
    return new NextResponse(zip, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="CAM Backup ${property} ${year}.zip"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err: any) {
    console.error("[GET /api/cam-recon/attachments/package]", err?.message ?? err);
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
