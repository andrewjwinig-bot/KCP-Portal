import { type NextRequest } from "next/server";
import { get } from "@vercel/blob";

// PUBLIC proxy for a shopping-center image stored in the PRIVATE Vercel Blob
// store. The public marketing pages (/centers/[slug]) are viewed by anonymous
// visitors, but private blob URLs can't be loaded directly by a browser — so
// every center image is referenced through here via centerImageSrc().
//
// This route is intentionally unauthenticated (exempted in middleware, like the
// public center pages), so it is scoped tightly: it will ONLY serve blobs whose
// pathname is under /centers/ — never bank statements, CAM backup, or any other
// private object. The BLOB_READ_WRITE_TOKEN is scoped to our store, so a
// foreign URL can't pull anything either.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("u");
  if (!url) return new Response("u required", { status: 400 });

  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return new Response("bad url", { status: 400 });
  }
  // Only center images — the upload key is `centers/<code>/<slot>-<file>`.
  if (!pathname.startsWith("/centers/")) return new Response("forbidden", { status: 403 });
  if (!process.env.BLOB_READ_WRITE_TOKEN) return new Response("Blob storage is not configured.", { status: 503 });

  try {
    const result = await get(url, { access: "private" });
    if (!result) return new Response("Not found", { status: 404 });
    const headers = new Headers();
    headers.set("content-type", result.blob.contentType || "application/octet-stream");
    // Public, cacheable — these are marketing images, not sensitive.
    headers.set("cache-control", "public, max-age=3600, s-maxage=86400");
    return new Response(result.stream, { headers });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
