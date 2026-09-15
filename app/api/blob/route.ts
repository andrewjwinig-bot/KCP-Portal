import { type NextRequest } from "next/server";
import { get } from "@vercel/blob";

// Authenticated proxy for PRIVATE Vercel Blob objects. The store is private,
// so stored blob URLs can't be loaded directly by the browser — every display
// site routes through here via blobSrc(). Site auth (middleware) already gates
// /api/*, so only signed-in users can read; the BLOB_READ_WRITE_TOKEN is
// scoped to our store, so an arbitrary URL can't pull anything outside it.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return new Response("url required", { status: 400 });
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return new Response("Blob storage is not configured.", { status: 503 });
  }
  try {
    const result = await get(url, { access: "private" });
    if (!result) return new Response("Not found", { status: 404 });
    const headers = new Headers();
    headers.set("content-type", result.blob.contentType || "application/octet-stream");
    headers.set("cache-control", "private, max-age=300");
    return new Response(result.stream, { headers });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
