import { NextResponse } from "next/server";
import { clearAiNotes } from "@/lib/financials/operating-statements/statementStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { key, year, period } — clear this property/month's AUTO-EXPLAIN notes so
// it can be explained from scratch. Notes a person wrote or edited are kept; the
// month's dismissed "?" flags are restored, since a NONE answer dismissed its own
// flag and a fresh run has to be able to see that line again.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { key, year, period } = body ?? {};
    if (!key || !year || !period) {
      return NextResponse.json({ error: "key, year and period are required" }, { status: 400 });
    }
    const res = await clearAiNotes(String(key), Number(year), Number(period));
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to clear notes" }, { status: 500 });
  }
}
