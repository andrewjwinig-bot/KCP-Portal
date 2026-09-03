import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { checkTenantAccess } from "@/lib/cam/tenantLink/access";
import { camAttachments } from "@/lib/cam/attachments/store";
import { readAttachmentBytes } from "@/lib/cam/attachments/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public — bundle several backup files behind a signed tenant link into one
 *  .zip so a tenant can grab a whole line's invoices (e.g. all 8 RET invoices)
 *  in a single download instead of clicking each. Same guards as the single-file
 *  route: only shareable (includeInPackage) files scoped to the link's
 *  property/year are ever included; unknown / out-of-scope ids are skipped. */
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const access = await checkTenantAccess(params.token, req);
  if (!access.ok) return NextResponse.json({ error: access.error, ...(access.pinRequired ? { pinRequired: true } : {}) }, { status: access.status });
  const { payload } = access;

  const idsParam = req.nextUrl.searchParams.get("ids") ?? "";
  const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return NextResponse.json({ error: "ids required" }, { status: 400 });

  const store = camAttachments(payload.p, payload.y);
  const zip = new JSZip();
  const used = new Set<string>();
  let added = 0;

  for (const id of ids) {
    const rec = await store.get(id);
    if (!rec || !rec.includeInPackage || rec.property !== payload.p || rec.year !== payload.y) continue;
    try {
      const bytes = await readAttachmentBytes(rec);
      // Keep each file's real name, but guarantee uniqueness — several lines can
      // ship a file called "invoice.pdf" and JSZip would otherwise overwrite.
      let name = (rec.name || `invoice-${id}`).replace(/[/\\]/g, "_");
      if (used.has(name)) {
        const dot = name.lastIndexOf(".");
        const base = dot > 0 ? name.slice(0, dot) : name;
        const ext = dot > 0 ? name.slice(dot) : "";
        let n = 2;
        while (used.has(`${base} (${n})${ext}`)) n++;
        name = `${base} (${n})${ext}`;
      }
      used.add(name);
      zip.file(name, bytes);
      added++;
    } catch {
      /* skip a file we can't read rather than failing the whole bundle */
    }
  }

  if (added === 0) return NextResponse.json({ error: "No files available" }, { status: 404 });

  const zipBytes = await zip.generateAsync({ type: "uint8array" });
  const rawName = req.nextUrl.searchParams.get("name") || "Invoices";
  const safeName = rawName.replace(/[^a-z0-9\-_. ]/gi, "_").trim() || "Invoices";
  return new NextResponse(zipBytes, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeName}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
