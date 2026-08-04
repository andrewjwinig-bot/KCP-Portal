import { NextRequest, NextResponse } from "next/server";
import { getJSON, storeJSON } from "@/lib/storage";
import type { CommissionEntry } from "@/lib/commissions";

const PREFIX = "commissions";
const ID     = "entries";

export const runtime = "nodejs";

export async function GET() {
  try {
    const data = (await getJSON(PREFIX, ID)) as CommissionEntry[] | null;
    return NextResponse.json({ entries: Array.isArray(data) ? data : [] });
  } catch {
    return NextResponse.json({ entries: [] });
  }
}

/** POST body: { entries: CommissionEntry[] } — replaces the whole array. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const list: CommissionEntry[] = Array.isArray(body?.entries) ? body.entries : [];
    // Light validation: drop entries missing an id.
    const cleaned = list.filter((e) => e && typeof e.id === "string" && e.id.length > 0);
    await storeJSON(PREFIX, ID, cleaned);
    return NextResponse.json({ ok: true, entries: cleaned });
  } catch (err: any) {
    console.error("[POST /api/commissions]", err?.message ?? err);
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
