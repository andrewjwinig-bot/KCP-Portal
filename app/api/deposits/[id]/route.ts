import { NextRequest, NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { getDeposit, saveDeposit, deleteDeposit } from "@/lib/deposits/storage";
import { sanitizeDeposit } from "@/lib/deposits/deposits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const existing = await getDeposit(params.id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const deposit = sanitizeDeposit(body, existing);
  await saveDeposit(deposit);
  return NextResponse.json({ deposit });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const existing = await getDeposit(params.id);
  if (existing?.checkImage && process.env.BLOB_READ_WRITE_TOKEN) {
    try { await del(existing.checkImage.url); } catch { /* ignore */ }
  }
  const ok = await deleteDeposit(params.id);
  return NextResponse.json({ ok });
}
