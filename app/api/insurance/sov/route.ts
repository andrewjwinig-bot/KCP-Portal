// The insurance Statement of Values — the broker's form, stored, and the
// preview of what the portal would write into it.
//   GET    → the stored form's rows, matched to properties, with the fill plan
//   POST   → upload (multipart `file`): replaces the stored form
//   DELETE → forget the imported form (back to the built-in 2026 one)
// Gated by SENSITIVE_API_PREFIXES (/api/insurance → /insurance).

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, type UserId } from "@/lib/users";
import { logAudit, auditIp } from "@/lib/audit";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import {
  getSovForm, saveStoredSov, clearStoredSov, parseSovBuffer, portalData,
} from "@/lib/insurance/server";
import { planFill, seedableFacts } from "@/lib/insurance/sov";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function currentUser(): Promise<UserId | null> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return null;
  const id = await verifySiteToken((await cookies()).get(SITE_COOKIE)?.value, secret);
  return id && (ALL_USERS as readonly string[]).includes(id) ? (id as UserId) : null;
}

export async function GET(req: Request) {
  try {
    const stored = await getSovForm();
    if (!stored) return NextResponse.json({ ok: true, stored: null });
    const sov = await parseSovBuffer(Buffer.from(stored.base64, "base64"));
    if (!sov) return NextResponse.json({ ok: false, error: "The stored file no longer reads as a Statement of Values — upload it again." });
    const updateBi = new URL(req.url).searchParams.get("bi") === "1";
    const { portal, facts } = await portalData();
    const plan = planFill(sov, portal, { updateBi });
    const seed = seedableFacts(sov, facts);
    const names = Object.fromEntries(PROPERTY_DEFS.map((d) => [d.id, d.name]));
    return NextResponse.json({
      ok: true,
      stored: { fileName: stored.fileName, uploadedAt: stored.uploadedAt, uploadedBy: stored.uploadedBy, builtIn: stored.builtIn },
      sheetName: sov.sheetName,
      otherSheets: sov.otherSheets,
      columns: Object.keys(sov.columns),
      totalInsuredValue: sov.totalInsuredValue,
      rows: plan.map((r) => ({ ...r, propertyName: r.code ? names[r.code] ?? null : null })),
      seed: { properties: Object.keys(seed).length, fields: Object.values(seed).reduce((n, f) => n + Object.keys(f).length, 0) },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Could not load the form." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "No file uploaded." }, { status: 400 });
    if (!/\.xlsx$/i.test(file.name)) return NextResponse.json({ ok: false, error: "Upload the .xlsx the broker sent (not .xls or .csv)." }, { status: 400 });
    const buf = Buffer.from(await file.arrayBuffer());
    const sov = await parseSovBuffer(buf).catch(() => null);
    if (!sov) {
      return NextResponse.json({
        ok: false,
        error: "Couldn't find the Statement of Values header (a row with “Location Name” and “Construction Description”).",
      }, { status: 400 });
    }
    const user = await currentUser();
    await saveStoredSov({ fileName: file.name, uploadedAt: new Date().toISOString(), uploadedBy: user, base64: buf.toString("base64") });
    await logAudit({ event: "insurance.sov.upload", user, ip: auditIp(req), detail: `${file.name} · ${sov.rows.length} locations` });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Upload failed." }, { status: 500 });
  }
}

export async function DELETE() {
  await clearStoredSov();
  return NextResponse.json({ ok: true });
}
