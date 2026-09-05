import { NextResponse } from "next/server";
import { setFlagDismissed } from "@/lib/financials/operating-statements/statementStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { key, year, period, lineKey, dismissed } — mark a line's "?" investigate
// flag as dismissed (investigated + confirmed fine) or restore it.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { key, year, period, lineKey, dismissed } = body ?? {};
    if (!key || !year || !period || !lineKey) {
      return NextResponse.json({ error: "key, year, period and lineKey are required" }, { status: 400 });
    }
    const lineKeys = await setFlagDismissed(String(key), Number(year), Number(period), String(lineKey), dismissed !== false);
    return NextResponse.json({ ok: true, dismissed: lineKeys });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to update" }, { status: 500 });
  }
}
