import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { verifyTenantToken, linkSecret } from "@/lib/cam/tenantLink/token";
import { getTenantLink } from "@/lib/cam/tenantLink/store";
import { getSuiteInformation } from "@/lib/suites/informationStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public — stream the tenant's own suite floorplan behind a signed link. The
 *  URL is never taken from the request; it's read from the stored suite record
 *  for the token's one unitRef, so a tenant can only ever fetch their own plan
 *  (never an arbitrary blob). Served inline so the portal can preview it. */
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const secret = linkSecret();
  if (!secret) return NextResponse.json({ error: "Sharing is not configured." }, { status: 503 });
  const payload = await verifyTenantToken(params.token, secret);
  if (!payload) return NextResponse.json({ error: "Invalid or expired link." }, { status: 401 });
  const link = await getTenantLink(payload.id);
  if (!link || link.revoked) return NextResponse.json({ error: "This link has been revoked." }, { status: 401 });

  const info = await getSuiteInformation(payload.u);
  const fp = info?.floorplan ?? null;
  if (!fp) return NextResponse.json({ error: "No floorplan on file." }, { status: 404 });
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "Blob storage is not configured." }, { status: 503 });
  }

  try {
    const result = await get(fp.url, { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return NextResponse.json({ error: "Floorplan not found." }, { status: 404 });
    }
    const download = req.nextUrl.searchParams.get("download") === "1";
    const headers = new Headers();
    headers.set("content-type", fp.contentType || result.blob.contentType || "application/octet-stream");
    headers.set("content-disposition", `${download ? "attachment" : "inline"}; filename="${fp.name.replace(/"/g, "")}"`);
    headers.set("cache-control", "private, max-age=300");
    return new NextResponse(result.stream, { headers });
  } catch (err: any) {
    console.error("[GET /api/portal/floorplan]", err?.message ?? err);
    return NextResponse.json({ error: "Could not read the floorplan." }, { status: 500 });
  }
}
