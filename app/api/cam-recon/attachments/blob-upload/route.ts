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
  return !!id && (ALL_USERS as readonly string[]).includes(id) && isPathAllowed(id as UserId, "/cam-recon");
}

/** Authorizes a browser → Vercel Blob direct upload for CAM backup files, so a
 *  large invoice PDF never has to pass through the 4.5 MB serverless request
 *  limit. The client (CamBackupModal) calls `upload()` against this route to get
 *  a short-lived token, uploads straight to Blob, then POSTs the resulting URL
 *  back to /api/cam-recon/attachments to record it. */
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
          maximumSizeInBytes: 100 * 1024 * 1024, // 100 MB — well past any invoice
          allowedContentTypes: [
            "application/pdf", "image/png", "image/jpeg", "image/webp",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "text/csv", "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/octet-stream",
          ],
          tokenPayload: clientPayload ?? undefined,
        };
      },
      // The record is written by the explicit client → /attachments POST after
      // upload() resolves (race-free), so nothing to do on the webhook here.
      onUploadCompleted: async () => { /* no-op */ },
    });
    return NextResponse.json(json);
  } catch (err: any) {
    console.error("[POST /api/cam-recon/attachments/blob-upload]", err?.message ?? err);
    return NextResponse.json({ error: err?.message ?? "Upload authorization failed" }, { status: 400 });
  }
}
