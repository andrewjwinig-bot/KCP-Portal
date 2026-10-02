import { NextRequest, NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { applyPatch } from "@/lib/maintenance/requests";
import { getRequest, saveRequest } from "@/lib/maintenance/requestsStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; attachmentId: string } },
) {
  const r = await getRequest(params.id);
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const att = r.attachments.find((a) => a.id === params.attachmentId);
  if (!att) return NextResponse.json({ error: "Attachment not found" }, { status: 404 });

  // Best-effort blob delete; if the URL is already gone we still want to
  // strip the metadata from the request.
  try { await del(att.url); } catch { /* ignore */ }

  const next = applyPatch(r, { attachments: r.attachments.filter((a) => a.id !== att.id) });
  await saveRequest(next);
  return NextResponse.json({ request: next });
}
