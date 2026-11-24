import { NextResponse } from "next/server";
import { sendNotPostedDigest } from "@/lib/financials/operating-statements/notPostedEmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// POST — send the import's ONE "not posted to the GL" digest: every property
// the batch staged, in one email. Called by the Operating Statements page once
// the last file of an import has landed. Gated with /api/financials.
export async function POST() {
  try {
    return NextResponse.json(await sendNotPostedDigest());
  } catch (e) {
    return NextResponse.json({ sent: false, error: e instanceof Error ? e.message : "Couldn't send" }, { status: 500 });
  }
}
