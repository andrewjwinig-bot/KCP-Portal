import { NextResponse } from "next/server";
import { getJSON, deleteJSON, listJSON, storeJSON } from "@/lib/storage";
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

/** DELETE /api/rentroll/history/YYYY-MM?property=CODE → take ONE property's
 *  roll out of the month. A month holds every import MERGED into it (Nancy's
 *  office roll beside Harry's retail), so deleting the whole document to undo
 *  one import erased the others with it. The whole month goes only with
 *  `?all=1`, said deliberately. */
export async function DELETE(req: Request, ctx: { params: { month: string } }) {
  const month = (ctx.params.month ?? "").replace(/[^0-9-]/g, "");
  const url = new URL(req.url);
  const property = (url.searchParams.get("property") ?? "").toUpperCase();
  if (url.searchParams.get("all") === "1") {
    const ok = await deleteJSON(HISTORY_PREFIX, month);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, removed: "month" });
  }
  if (!property) {
    return NextResponse.json({ error: "Name the property to remove (?property=CODE) — the month holds every import merged together. ?all=1 removes the whole month." }, { status: 400 });
  }
  const doc = (await getJSON(HISTORY_PREFIX, month, { retryOnMiss: true })) as { properties?: any[] } | null;
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const keep = (doc.properties ?? []).filter((p) => code(p) !== property);
  if (keep.length === (doc.properties ?? []).length) return NextResponse.json({ error: `${property} is not in ${month}` }, { status: 404 });
  if (!keep.length) await deleteJSON(HISTORY_PREFIX, month);
  else await storeJSON(HISTORY_PREFIX, month, { ...doc, properties: keep });
  return NextResponse.json({ ok: true, removed: property });
}
