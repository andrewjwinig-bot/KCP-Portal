import { NextRequest, NextResponse } from "next/server";
import { allOverrides, clearOverride, DEFAULT_INSTRUCTIONS, GLOBAL_KEY, saveOverride, type PaymentInstructions } from "@/lib/statements/payment";
import { logAudit, auditIp } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** GET — the defaults plus every saved override (global + per property). */
export async function GET() {
  return NextResponse.json({ ok: true, defaults: DEFAULT_INSTRUCTIONS, overrides: await allOverrides() });
}

const FIELDS: (keyof PaymentInstructions)[] = ["payableTo", "remitTo", "achNote", "contactName", "contactEmail", "contactPhone", "note"];

/** PUT { key, value } — save one override ("default" or a property code).
 *  A null/empty value clears it back to the defaults. */
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const key = String(body.key ?? GLOBAL_KEY).trim();
  if (!/^[A-Za-z0-9_-]{1,24}$/.test(key)) return NextResponse.json({ error: "Invalid key." }, { status: 400 });

  if (body.value === null) {
    await clearOverride(key);
    await logAudit({ event: "tenant-statements.payment.clear", user: body.by ?? null, ip: auditIp(req), detail: key });
    return NextResponse.json({ ok: true, cleared: true });
  }

  const src = (body.value ?? {}) as Record<string, unknown>;
  const value: Partial<PaymentInstructions> = {};
  for (const f of FIELDS) {
    const v = src[f];
    if (f === "remitTo") {
      const lines = Array.isArray(v) ? v.map(String).map((s) => s.trim()).filter(Boolean)
        : typeof v === "string" ? v.split("\n").map((s) => s.trim()).filter(Boolean) : [];
      if (lines.length) value.remitTo = lines;
    } else if (typeof v === "string" && v.trim()) {
      (value as Record<string, string>)[f] = v.trim();
    }
  }
  await saveOverride(key, value);
  await logAudit({ event: "tenant-statements.payment.save", user: body.by ?? null, ip: auditIp(req), detail: key });
  return NextResponse.json({ ok: true, value });
}
