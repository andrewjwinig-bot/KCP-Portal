import { NextRequest, NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { getDeposit, saveDeposit } from "@/lib/deposits/storage";
import type { DepositCheckImage } from "@/lib/deposits/deposits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 4 * 1024 * 1024;

// POST — multipart "file" field. Replaces the deposit's check image.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "BLOB_READ_WRITE_TOKEN is not set; image upload requires Vercel Blob." },
      { status: 503 },
    );
  }
  const deposit = await getDeposit(params.id);
  if (!deposit) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: "No file in 'file' field" }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "File is larger than 4 MB" }, { status: 400 });
  }

  const name = (file as File).name || "check";
  const result = await put(`deposits/${deposit.id}/${name}`, file, {
    access: "public",
    addRandomSuffix: true,
    contentType: file.type || undefined,
  });

  // Drop the previous image blob if we're replacing one.
  if (deposit.checkImage) {
    try { await del(deposit.checkImage.url); } catch { /* ignore */ }
  }

  const checkImage: DepositCheckImage = {
    url: result.url,
    name,
    contentType: file.type || "application/octet-stream",
    size: file.size,
    uploadedAt: new Date().toISOString(),
  };
  const next = { ...deposit, checkImage, updatedAt: new Date().toISOString() };
  await saveDeposit(next);
  return NextResponse.json({ deposit: next }, { status: 201 });
}

// DELETE — remove the check image.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const deposit = await getDeposit(params.id);
  if (!deposit) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (deposit.checkImage && process.env.BLOB_READ_WRITE_TOKEN) {
    try { await del(deposit.checkImage.url); } catch { /* ignore */ }
  }
  const next = { ...deposit, checkImage: null, updatedAt: new Date().toISOString() };
  await saveDeposit(next);
  return NextResponse.json({ deposit: next });
}
