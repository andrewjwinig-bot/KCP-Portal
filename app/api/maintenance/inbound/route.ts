import { NextRequest, NextResponse } from "next/server";
import { normalizeInbound, saveEmail } from "@/lib/maintenance/emails";

// Inbound parsed-email webhook for the Maintenance Inbox.
//
// Auth: shared secret in MAINTENANCE_INBOUND_TOKEN, sent either as
//   - ?token=<secret> query param, OR
//   - X-Inbound-Token: <secret> header
// Configure your inbound provider (Postmark, Resend, SendGrid, Mailgun)
// to POST parsed JSON to this URL.
//
// Note: middleware.ts exempts this path from site-cookie auth so the
// external provider can reach it.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const expected = process.env.MAINTENANCE_INBOUND_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: "MAINTENANCE_INBOUND_TOKEN not set" },
      { status: 503 },
    );
  }
  const got =
    req.nextUrl.searchParams.get("token") ??
    req.headers.get("x-inbound-token") ??
    "";
  if (got !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const email = normalizeInbound(payload);
    await saveEmail(email);
    return NextResponse.json({ ok: true, id: email.id });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to store email" },
      { status: 500 },
    );
  }
}
