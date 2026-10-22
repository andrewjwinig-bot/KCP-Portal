// POST → copy the stored form's descriptive answers into each property's
// EMPTY facts (never over one someone keyed). The one-time bootstrap that
// makes property info, not the broker's spreadsheet, the source of truth.

import { NextResponse } from "next/server";
import { getSovForm, parseSovBuffer, portalData } from "@/lib/insurance/server";
import { seedableFacts } from "@/lib/insurance/sov";
import { saveFacts, type PropertyFacts } from "@/lib/properties/facts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const stored = await getSovForm();
  if (!stored) return NextResponse.json({ ok: false, error: "Upload the Statement of Values first." }, { status: 404 });
  const sov = await parseSovBuffer(Buffer.from(stored.base64, "base64"));
  if (!sov) return NextResponse.json({ ok: false, error: "The stored file no longer reads as a Statement of Values." }, { status: 422 });
  const { facts } = await portalData();
  const seed = seedableFacts(sov, facts);
  let fields = 0;
  for (const [code, patch] of Object.entries(seed)) {
    await saveFacts(code, patch as Partial<PropertyFacts>);
    fields += Object.keys(patch).length;
  }
  return NextResponse.json({ ok: true, properties: Object.keys(seed).length, fields });
}
