import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { budgetUser } from "@/lib/financials/budgets/currentUser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Authorizes a browser → Vercel Blob upload of a credit-card receipt (a phone
 *  photo or a scanned PDF can exceed the 4.5 MB a request can carry). The
 *  charge is pointed at it by `POST /api/expenses/receipt`, which checks the
 *  charge is the uploader's to code. */
export async function POST(req: Request): Promise<Response> {
  const body = (await req.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!(await budgetUser())) throw new Error("Not authorized");
        if (!pathname.startsWith("cc-receipts/")) throw new Error("Bad upload path");
        return {
          addRandomSuffix: true,
          maximumSizeInBytes: 25 * 1024 * 1024,
          allowedContentTypes: ["application/pdf", "image/jpeg", "image/png", "image/gif", "image/webp", "image/heic", "image/heif"],
        };
      },
      onUploadCompleted: async () => { /* attached by POST /api/expenses/receipt */ },
    });
    return NextResponse.json(json);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Upload authorization failed" }, { status: 400 });
  }
}
