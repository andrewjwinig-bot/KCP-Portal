import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { applyPatch, type Attachment } from "@/lib/maintenance/requests";
import { getRequest, saveRequest } from "@/lib/maintenance/requestsStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/maintenance/requests/:id/attachments
// FormData with a "file" field. Stores the blob with a random suffix and
// appends an Attachment record to the request. Returns the updated request.
//
// Note: Vercel serverless function bodies cap at ~4.5 MB. For larger
// uploads we'll need the client-upload pattern; revisit when that hurts.

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "BLOB_READ_WRITE_TOKEN is not set; attachments require Vercel Blob." },
      { status: 503 },
    );
  }

  const r = await getRequest(params.id);
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "No file in 'file' field" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Empty file" }, { status: 400 });
  }

  const name = (file as File).name || "attachment";
  const result = await put(`maintenance/${r.id}/${name}`, file, {
    access: "public",
    addRandomSuffix: true,
    contentType: file.type || undefined,
  });

  const attachment: Attachment = {
    id: "att_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    name,
    url: result.url,
    contentType: file.type || "application/octet-stream",
    size: file.size,
    uploadedAt: new Date().toISOString(),
  };

  const next = applyPatch(r, { attachments: [...r.attachments, attachment] });
  await saveRequest(next);
  return NextResponse.json({ request: next, attachment }, { status: 201 });
}
