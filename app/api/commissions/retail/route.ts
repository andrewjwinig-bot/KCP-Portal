import { NextRequest, NextResponse } from "next/server";
import { getJSON, storeJSON } from "@/lib/storage";
import type { CommissionEntry } from "@/lib/commissions";
import { mergeEntries } from "@/lib/commissions/mergeEntries";

// Harry's retail leasing commissions — stored separately from the
// Business Parks (Nancy) commissions.
const PREFIX = "commissions";
const ID     = "entries-retail";

export const runtime = "nodejs";

export async function GET() {
  try {
    const data = (await getJSON(PREFIX, ID)) as CommissionEntry[] | null;
    return NextResponse.json({ entries: Array.isArray(data) ? data : [] });
  } catch (err: any) {
    // A failed read must NOT read as "no commissions" — the page would then
    // save over every entry on file. It refuses to save after a failed load.
    console.error("[GET api/commissions/retail]", err?.message ?? err);
    return NextResponse.json({ error: "Could not load commissions — refresh before saving." }, { status: 503 });
  }
}

/** POST body: { entries, baseIds } — merged into what is stored
 *  (`mergeEntries`): the page's entries upserted, an entry removed only when
 *  the page had it (`baseIds`) and dropped it. Returns the merged list. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const list: CommissionEntry[] = Array.isArray(body?.entries) ? body.entries : [];
    const baseIds: string[] | null = Array.isArray(body?.baseIds) ? body.baseIds.map(String) : null;
    const stored = (await getJSON(PREFIX, ID, { retryOnMiss: true })) as CommissionEntry[] | null;
    const merged = mergeEntries(Array.isArray(stored) ? stored : [], list, baseIds);
    await storeJSON(PREFIX, ID, merged);
    return NextResponse.json({ ok: true, entries: merged });
  } catch (err: any) {
    console.error("[POST /api/commissions/retail]", err?.message ?? err);
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
