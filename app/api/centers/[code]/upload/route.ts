import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, type UserId } from "@/lib/users";
import { centerByCode } from "@/lib/centers/registry";

// Authorizes a browser → Vercel Blob direct upload for a public shopping-center
// image (hero, site plan, neighborhood photo), so large images bypass the
// 4.5 MB serverless request limit. Client uploads are PUBLIC — the returned URL
// is embedded directly on the public marketing page. Mirrors
// /api/bank-transfers/blob-upload (which is a private store served via proxy);
// here the blob is intentionally public.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function signedInUser(): Promise<UserId | null> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return null;
  const id = await verifySiteToken((await cookies()).get(SITE_COOKIE)?.value, secret);
  return id && (ALL_USERS as readonly string[]).includes(id) ? (id as UserId) : null;
}

export async function POST(req: Request, { params }: { params: { code: string } }): Promise<Response> {
  if (!centerByCode(params.code)) {
    return NextResponse.json({ error: "Unknown center" }, { status: 404 });
  }
  const body = (await req.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        if (!(await signedInUser())) throw new Error("Not authorized");
        return {
          addRandomSuffix: true,
          maximumSizeInBytes: 15 * 1024 * 1024, // 15 MB — ample for a hero photo
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "image/avif", "image/svg+xml"],
          tokenPayload: clientPayload ?? undefined,
        };
      },
      onUploadCompleted: async () => { /* URL is recorded by the /api/centers PUT */ },
    });
    return NextResponse.json(json);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upload authorization failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
