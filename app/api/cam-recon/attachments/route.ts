import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, isPathAllowed, USERS, type UserId } from "@/lib/users";
import { camAttachments, toMeta, type CamAttachment } from "@/lib/cam/attachments/store";
import { putAttachmentFile, removeAttachmentFile } from "@/lib/cam/attachments/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function currentUser(): Promise<UserId | null> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return null;
  const id = await verifySiteToken((await cookies()).get(SITE_COOKIE)?.value, secret);
  return id && (ALL_USERS as readonly string[]).includes(id) && isPathAllowed(id as UserId, "/cam-recon") ? (id as UserId) : null;
}

/** GET ?property=&year= → the attachment metadata for a property/year. */
export async function GET(req: NextRequest) {
  if (!(await currentUser())) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const property = req.nextUrl.searchParams.get("property") ?? "";
  const year = Number(req.nextUrl.searchParams.get("year"));
  if (!property || !year) return NextResponse.json({ error: "property and year are required" }, { status: 400 });
  try {
    const all = await camAttachments(property, year).all();
    return NextResponse.json({ attachments: all.map(toMeta) });
  } catch (err: any) {
    console.error("[GET /api/cam-recon/attachments]", err?.message ?? err);
    return NextResponse.json({ attachments: [] });
  }
}

/** POST multipart: file, property, year, account, accountLabel → upload one file. */
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 }); }
  const file = form.get("file");
  const property = String(form.get("property") ?? "");
  const year = Number(form.get("year"));
  const account = String(form.get("account") ?? "");
  const accountLabel = String(form.get("accountLabel") ?? account);
  if (!(file instanceof Blob) || file.size === 0) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (!property || !year || !account) return NextResponse.json({ error: "property, year, account are required" }, { status: 400 });

  try {
    const id = "cam_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const name = (file as File).name || "attachment";
    const { ref, local } = await putAttachmentFile({ property, year, account, id, name, file });
    const rec: CamAttachment = {
      id, property, year, account, accountLabel, name, ref, local,
      contentType: file.type || "application/octet-stream",
      size: file.size,
      uploadedAt: new Date().toISOString(),
      uploadedBy: USERS[user]?.label ?? user,
      includeInPackage: true,
    };
    await camAttachments(property, year).set(id, rec);
    return NextResponse.json({ attachment: toMeta(rec) }, { status: 201 });
  } catch (err: any) {
    console.error("[POST /api/cam-recon/attachments]", err?.message ?? err);
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}

/** PATCH { property, year, id, includeInPackage } → toggle package inclusion. */
export async function PATCH(req: NextRequest) {
  if (!(await currentUser())) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  try {
    const body = await req.json();
    const { property, id } = body ?? {};
    const year = Number(body?.year);
    if (!property || !year || !id) return NextResponse.json({ error: "property, year, id required" }, { status: 400 });
    const store = camAttachments(property, year);
    const rec = await store.get(id);
    if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if ("includeInPackage" in body) rec.includeInPackage = body.includeInPackage === true;
    await store.set(id, rec);
    return NextResponse.json({ attachment: toMeta(rec) });
  } catch (err: any) {
    console.error("[PATCH /api/cam-recon/attachments]", err?.message ?? err);
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}

/** DELETE ?property=&year=&id= → remove a file + its record. */
export async function DELETE(req: NextRequest) {
  if (!(await currentUser())) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const property = req.nextUrl.searchParams.get("property") ?? "";
  const year = Number(req.nextUrl.searchParams.get("year"));
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!property || !year || !id) return NextResponse.json({ error: "property, year, id required" }, { status: 400 });
  try {
    const store = camAttachments(property, year);
    const rec = await store.get(id);
    if (rec) { await removeAttachmentFile(rec); await store.remove(id); }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[DELETE /api/cam-recon/attachments]", err?.message ?? err);
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
