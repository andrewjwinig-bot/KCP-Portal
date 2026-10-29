import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, isPathAllowed, type UserId } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authed(): Promise<boolean> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return false;
  const id = await verifySiteToken((await cookies()).get(SITE_COOKIE)?.value, secret);
  return !!id && (ALL_USERS as readonly string[]).includes(id) && isPathAllowed(id as UserId, "/deposits");
}

/** Authorizes a browser → Vercel Blob direct upload for a security-deposit
 *  check image or scan, so the file never passes through the 4.5 MB serverless
 *  request limit — a scanned PDF of a check was rejected by the platform before
 *  it reached the route, with no message (Nancy, 10/2026). The deposit is
 *  pointed at the blob afterwards by `POST /api/deposits/[id]/check-image`. */
export async function POST(req: Request): Promise<Response> {
  const body = (await req.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!(await authed())) throw new Error("Not authorized");
        if (!pathname.startsWith("deposits/")) throw new Error("Bad upload path");
        return {
          addRandomSuffix: true,
          maximumSizeInBytes: 25 * 1024 * 1024,
          allowedContentTypes: ["application/pdf", "image/jpeg", "image/png", "image/gif", "image/webp", "image/heic", "image/heif"],
        };
      },
      onUploadCompleted: async () => { /* attached by the check-image POST */ },
    });
    return NextResponse.json(json);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Upload authorization failed" }, { status: 400 });
  }
}
