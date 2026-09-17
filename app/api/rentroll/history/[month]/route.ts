import { NextResponse } from "next/server";
import { getJSON, deleteJSON } from "@/lib/storage";

// Always read fresh — a just-imported month's snapshot must not be masked by a
// stale cached response.
export const dynamic = "force-dynamic";

const HISTORY_PREFIX = "rentroll-history";

/** GET /api/rentroll/history/YYYY-MM → full rent roll data for that snapshot. */
export async function GET(_req: Request, ctx: { params: { month: string } }) {
  const month = (ctx.params.month ?? "").replace(/[^0-9-]/g, "");
  const data = await getJSON(HISTORY_PREFIX, month);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ rentroll: data });
}

/** DELETE /api/rentroll/history/YYYY-MM → remove a snapshot. */
export async function DELETE(_req: Request, ctx: { params: { month: string } }) {
  const month = (ctx.params.month ?? "").replace(/[^0-9-]/g, "");
  const ok = await deleteJSON(HISTORY_PREFIX, month);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
