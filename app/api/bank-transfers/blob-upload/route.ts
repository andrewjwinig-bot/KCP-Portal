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
  return !!id && (ALL_USERS as readonly string[]).includes(id) && isPathAllowed(id as UserId, "/bank-transfers");
}

/** Authorizes a browser → Vercel Blob direct upload for a bank-transfer
 *  confirmation PDF, so the file never has to pass through the 4.5 MB
 *  serverless request limit. The store is PRIVATE; the recorded URL is served
 *  back only through the authenticated /api/blob proxy. */
export async function POST(req: Request): Promise<Response> {
  const body = (await req.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        if (!(await authed())) throw new Error("Not authorized");
        return {
          addRandomSuffix: true,
          maximumSizeInBytes: 25 * 1024 * 1024, // 25 MB — plenty for a confirmation
          allowedContentTypes: ["application/pdf"],
          tokenPayload: clientPayload ?? undefined,
        };
      },
      onUploadCompleted: async () => { /* record happens on the /api/bank-transfers POST */ },
    });
    return NextResponse.json(json);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Upload authorization failed" }, { status: 400 });
  }
}
