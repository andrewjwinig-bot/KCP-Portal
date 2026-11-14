import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, canManageK1, USERS, type UserId } from "@/lib/users";
import { PROPERTY_OWNERSHIP } from "@/lib/properties/ownership";
import { isTaxDocKind, taxDocLabel, type PropertyTaxDoc } from "@/lib/investors/taxDocs";
import { allTaxDocs, getTaxDoc, removeTaxDoc, saveTaxDoc, taxDocsFor, taxDocYearsFor } from "@/lib/investors/taxDocStore";
import { putTaxDocFile, removeTaxDocFile } from "@/lib/investors/taxDocFiles";
import { logAudit, auditIp } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Staff only, and specifically the K-1 capability — these carry every
 *  partner's allocation and the return as filed. Property Info is reachable by
 *  the whole company, so this must NOT inherit that page's access. */
async function currentUser(): Promise<UserId | null> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return null;
  const id = await verifySiteToken((await cookies()).get(SITE_COOKIE)?.value, secret);
  if (!id || !(ALL_USERS as readonly string[]).includes(id)) return null;
  return canManageK1(id as UserId) ? (id as UserId) : null;
}

const isPartnership = (code: string) =>
  PROPERTY_OWNERSHIP.some((p) => p.propertyCode === code);

/** GET ?property=&year= — one partnership's tax documents for a year. */
export async function GET(req: NextRequest) {
  if (!(await currentUser())) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const property = req.nextUrl.searchParams.get("property") ?? "";
  const year = Number(req.nextUrl.searchParams.get("year"));
  if (!property || !Number.isFinite(year)) {
    return NextResponse.json({ error: "property and year are required." }, { status: 400 });
  }
  const documents = await taxDocsFor(property, year);
  return NextResponse.json({
    ok: true,
    years: await taxDocYearsFor(property),
    // The ref never leaves the server.
    documents: documents.map(({ ref, local, ...d }) => d),
  });
}

/** POST (multipart) — attach ONE document under ONE kind.
 *  Re-uploading the same kind REPLACES it: unlike a K-1, there is exactly one
 *  Government Copy for a year and a revised return supersedes the old one. */
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Expected a multipart upload." }, { status: 400 }); }
  const property = String(form.get("property") ?? "");
  const year = Number(form.get("year"));
  const kind = String(form.get("kind") ?? "");
  if (!property || !Number.isFinite(year)) return NextResponse.json({ error: "property and year are required." }, { status: 400 });
  if (!isPartnership(property)) return NextResponse.json({ error: "That isn't a partnership on file." }, { status: 400 });
  if (!isTaxDocKind(kind)) return NextResponse.json({ error: "Unknown document type." }, { status: 400 });

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file was uploaded." }, { status: 400 });
  if (!/\.pdf$/i.test(file.name)) {
    return NextResponse.json({ error: `${file.name} isn't a PDF.` }, { status: 400 });
  }

  const id = "ptd_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const { ref, local } = await putTaxDocFile({ propertyCode: property, taxYear: year, id, name: file.name, file });
  const doc: PropertyTaxDoc = {
    id, propertyCode: property, taxYear: year, kind, filename: file.name, size: file.size, ref, local,
    uploadedAt: new Date().toISOString(), uploadedBy: USERS[user]?.label ?? user,
  };
  await saveTaxDoc(doc);

  // Supersede the previous copy of this kind, bytes and all.
  for (const old of (await taxDocsFor(property, year)).filter((d) => d.kind === kind && d.id !== id)) {
    await removeTaxDocFile(old);
    await removeTaxDoc(old.id);
  }

  await logAudit({
    event: "property-tax-doc.upload", user: USERS[user]?.label ?? user, ip: auditIp(req),
    detail: `${property} ${year} · ${taxDocLabel(kind)} · ${file.name}`,
  });
  const { ref: _r, local: _l, ...safe } = doc;
  return NextResponse.json({ ok: true, document: safe }, { status: 201 });
}

/** DELETE ?id= */
export async function DELETE(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const doc = await getTaxDoc(req.nextUrl.searchParams.get("id") ?? "");
  if (!doc) return NextResponse.json({ error: "That document no longer exists." }, { status: 404 });
  await removeTaxDocFile(doc);
  await removeTaxDoc(doc.id);
  await logAudit({
    event: "property-tax-doc.delete", user: USERS[user]?.label ?? user, ip: auditIp(req),
    detail: `${doc.propertyCode} ${doc.taxYear} · ${taxDocLabel(doc.kind)} · ${doc.filename}`,
  });
  return NextResponse.json({ ok: true });
}
