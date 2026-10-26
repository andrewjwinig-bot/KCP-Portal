import { NextResponse } from "next/server";
import { getJSON, deleteJSON, listJSON } from "@/lib/storage";
import { rollAsOf } from "@/lib/rentroll/current";
import { snapshotMonthKey } from "@/lib/rentroll/snapshot";

// Always read fresh — a just-imported month's snapshot must not be masked by a
// stale cached response.
export const dynamic = "force-dynamic";

const HISTORY_PREFIX = "rentroll-history";

const code = (p: { propertyCode?: string }) => String(p?.propertyCode ?? "").toUpperCase();

/**
 * GET /api/rentroll/history/YYYY-MM → the rent roll AS OF that month: every
 * property from the newest roll at or before it (`rollAsOf`). A month's own
 * snapshot only holds the properties imported for it — Nancy's office-only
 * file filed under a new month made that month read as having no retail at
 * all, and the Rent Roll page opens on the newest month. `carriedFrom` names
 * the properties taken from an earlier month's roll.
 */
export async function GET(_req: Request, ctx: { params: { month: string } }) {
  const month = (ctx.params.month ?? "").replace(/[^0-9-]/g, "");
  const own = await getJSON(HISTORY_PREFIX, month);
  if (!own) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const all = ((await listJSON(HISTORY_PREFIX)) as any[]).filter((s) => s && snapshotMonthKey(s) !== snapshotMonthKey(own));
  const asOf = rollAsOf([...all, own], snapshotMonthKey(own)) ?? own;
  const ownCodes = new Set((own.properties ?? []).map(code));
  const carriedFrom: Record<string, string> = {};
  for (const p of asOf.properties ?? []) {
    if (ownCodes.has(code(p))) continue;
    const src = all
      .filter((s) => snapshotMonthKey(s) <= snapshotMonthKey(own) && (s.properties ?? []).some((q: any) => code(q) === code(p)))
      .map((s) => snapshotMonthKey(s)).sort().pop();
    if (src) carriedFrom[code(p)] = src;
  }
  return NextResponse.json({ rentroll: { ...own, properties: asOf.properties }, carriedFrom });
}

/** DELETE /api/rentroll/history/YYYY-MM → remove a snapshot. */
export async function DELETE(_req: Request, ctx: { params: { month: string } }) {
  const month = (ctx.params.month ?? "").replace(/[^0-9-]/g, "");
  const ok = await deleteJSON(HISTORY_PREFIX, month);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
