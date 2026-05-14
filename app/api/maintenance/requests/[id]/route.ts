import { NextRequest, NextResponse } from "next/server";
import {
  applyPatch,
  newNoteId,
  type MaintenanceRequest,
  type Note,
} from "@/lib/maintenance/requests";
import { getRequest, removeRequest, saveRequest } from "@/lib/maintenance/requestsStorage";
import { isStaffId, staffName } from "@/lib/maintenance/staff";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const r = await getRequest(params.id);
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ request: r });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const r = await getRequest(params.id);
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: Partial<MaintenanceRequest> & { addNote?: { author: string; text: string } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let next = applyPatch(r, body);

  if (body.addNote && body.addNote.text.trim()) {
    const authorRaw = String(body.addNote.author ?? "");
    const author: Note["author"] = isStaffId(authorRaw) ? authorRaw : "admin";
    const note: Note = {
      id: newNoteId(),
      author,
      authorName: author === "admin" ? "Admin" : staffName(author),
      text: body.addNote.text.trim(),
      createdAt: new Date().toISOString(),
    };
    next = { ...next, notes: [...next.notes, note], updatedAt: note.createdAt };
  }

  try {
    await saveRequest(next);
    return NextResponse.json({ request: next });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save" },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const ok = await removeRequest(params.id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
