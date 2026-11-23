import { type NextRequest } from "next/server";
import { get } from "@vercel/blob";
import { budgetUser } from "@/lib/financials/budgets/currentUser";
import { isPathAllowed } from "@/lib/users";
import { blobPathname, blobReaders, inlineSafe } from "@/lib/blobAccess";

// Authenticated proxy for PRIVATE Vercel Blob objects — the UPLOADED files a
// page shows (photos, floor plans, check images, receipts). Only a full blob
// URL in an allowed upload folder, to a user who may open that folder's page
// (`lib/blobAccess.ts`). JSON documents and K-1s are never served here.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return new Response("url required", { status: 400 });
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return new Response("Blob storage is not configured.", { status: 503 });
  }
  const pathname = blobPathname(url);
  const readers = pathname ? blobReaders(pathname) : undefined;
  if (!pathname || readers === undefined) return new Response("Not found", { status: 404 });
  if (readers) {
    const u = await budgetUser();
    if (!u || !readers.some((p) => isPathAllowed(u, p))) return new Response("Not found", { status: 404 });
  }
  try {
    const result = await get(url, { access: "private" });
    if (!result) return new Response("Not found", { status: 404 });
    const type = result.blob.contentType || "application/octet-stream";
    const headers = new Headers();
    headers.set("cache-control", "private, max-age=300");
    headers.set("x-content-type-options", "nosniff");
    if (inlineSafe(type)) {
      headers.set("content-type", type);
    } else {
      // Anything but a PDF or a raster image is a DOWNLOAD, sandboxed — an
      // uploaded .html must never run on this origin with the viewer's session.
      // (Not on PDFs: Chrome will not draw a PDF under a sandbox CSP.)
      headers.set("content-security-policy", "sandbox");
      headers.set("content-type", "application/octet-stream");
      const name = (pathname.split("/").pop() || "file").replace(/["\r\n]/g, "");
      headers.set("content-disposition", `attachment; filename="${name}"`);
    }
    return new Response(result.stream, { headers });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
