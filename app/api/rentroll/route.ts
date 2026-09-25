import { NextRequest, NextResponse } from "next/server";
import { parseRentRollExcel, stripStoreNumber } from "@/lib/rentroll/parseRentRollExcel";
import { snapshotMonthKey } from "@/lib/rentroll/snapshot";
import { composeCurrentRoll } from "@/lib/rentroll/current";
import { storeJSON, getJSON, listJSON } from "@/lib/storage";
import { recordImport } from "@/lib/tracker/importEvents";

// Always read fresh from storage — never serve a statically-cached response.
// A rent-roll import must be visible immediately, not after the cache expires.
export const dynamic = "force-dynamic";

const RENTROLL_PREFIX = "rentroll";
const RENTROLL_ID     = "current";
const HISTORY_PREFIX  = "rentroll-history";

// Strip "#1234" / "Store #234" / "Branch #5" tail off every occupant
// name at read time so old uploads benefit without a re-upload.
// (New uploads also get stripped at parse time — see parseRentRollExcel.)
function normalizeOccupantNames(data: any): any {
  if (!data?.properties) return data;
  for (const prop of data.properties) {
    if (!Array.isArray(prop.units)) continue;
    for (const unit of prop.units) {
      if (unit?.isVacant) continue;
      if (unit?.amenity) continue;
      if (typeof unit?.occupantName !== "string") continue;
      unit.occupantName = stripStoreNumber(unit.occupantName);
    }
  }
  return data;
}

/**
 * Resolve the current rent roll as a PER-PROPERTY UNION across all history
 * (each property from the latest snapshot that contains it — see
 * composeCurrentRoll). This means importing a roll that omits some properties
 * (e.g. an office-only import) carries the excluded properties (retail)
 * forward instead of erasing them. For a full import it's identical to "the
 * latest snapshot". The composed roll is written back to the "current" pointer
 * so direct readers (budgets, status report, tenant lookups) see the same
 * union.
 */
// Cheap identity of a roll for self-heal comparison: report month, the set of
// property codes, total unit count — AND THE MONEY.
//
// The money was missing, and that made the self-heal unable to heal the case
// it most needed to. Shape-only, a roll re-imported after a PARSER FIX is
// identical to the stale one: same month, same properties, same units. So the
// pointer was never rewritten and every reader of it kept the old figures,
// while `/api/rentroll` looked right because it returns the freshly composed
// roll rather than the stored pointer. That is exactly what happened to 1100:
// the Rent Roll page showed Ferry Good Treats' corrected $2,000 while the
// operating statement, which reads the pointer, still had $0 and reported the
// correct charge as "UNEXPECTED $2,000".
//
// Ten modules read that pointer directly (the rent check, tenant directory,
// move-out candidates, reservations, the monthly report…), so a signature that
// cannot see a value change leaves all ten stale with nothing to say so.
// Summing a few hundred units is nothing next to the work of composing the
// roll, and it makes the next read of /api/rentroll repair the pointer for
// everyone.
function rollSig(r: any): string {
  if (!r?.properties) return "none";
  const codes = (r.properties as any[]).map((p) => String(p.propertyCode ?? "").toUpperCase()).sort();
  const units = (r.properties as any[]).reduce((n, p) => n + (p.units?.length ?? 0), 0);
  // A HASH, NOT A SUM. Summing the four columns cannot see a figure MOVING
  // between them, which is exactly what the parser fix did: Ferry Good Treats
  // went from base 0 / other 2,159 to base 2,000 / other 159. Same total. A
  // total would have left the signature identical and the pointer stale — the
  // bug this exists to heal, surviving the fix for it.
  let h = 0x811c9dc5; // FNV-1a over each unit's four figures, in order
  for (const p of r.properties as any[]) {
    for (const u of (p.units ?? []) as any[]) {
      const cells = `${u.baseRent ?? 0}|${u.opexMonth ?? 0}|${u.reTaxMonth ?? 0}|${u.otherMonth ?? 0};`;
      for (let i = 0; i < cells.length; i++) {
        h ^= cells.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
    }
  }
  return `${snapshotMonthKey(r)}|${codes.join(",")}|${units}|${(h >>> 0).toString(36)}`;
}

async function resolveCurrentRentroll(): Promise<any | null> {
  const snapshots = (await listJSON(HISTORY_PREFIX)) as any[];
  const composed = composeCurrentRoll(snapshots);
  if (!composed) {
    return await getJSON(RENTROLL_PREFIX, RENTROLL_ID);
  }
  const current = { ...composed, id: RENTROLL_ID };
  const stored = await getJSON(RENTROLL_PREFIX, RENTROLL_ID);
  if (!stored || rollSig(stored) !== rollSig(current)) {
    await storeJSON(RENTROLL_PREFIX, RENTROLL_ID, current);
  }
  return current;
}

/**
 * GET /api/rentroll
 * Returns the rent roll for the most recent report month, or null if none
 * exists. Importing an older roll never changes this.
 */
export async function GET() {
  try {
    const data = await resolveCurrentRentroll();
    return NextResponse.json({ rentroll: data ? normalizeOccupantNames(data) : null });
  } catch {
    return NextResponse.json({ rentroll: null });
  }
}

/**
 * POST /api/rentroll
 * Body: { fileBase64: string }
 *
 * Parses the Excel rent roll, saves a snapshot keyed by the roll's own
 * report month, and points "current" at whichever month is the most
 * recent across all snapshots — NOT simply at whatever was uploaded last.
 *
 * That means you can import past rent rolls in any order to backfill
 * history: each is filed under its report month, and the newest month
 * stays "current". Re-importing a month overwrites just that snapshot.
 */
export async function POST(req: NextRequest) {
  try {
    const body       = await req.json();
    const fileBase64 = body?.fileBase64 as string | undefined;
    const uploadedBy = typeof body?.uploadedBy === "string" && body.uploadedBy.trim()
      ? body.uploadedBy.trim()
      : null;

    if (!fileBase64) {
      return NextResponse.json({ error: "Missing fileBase64" }, { status: 400 });
    }

    const buf    = Buffer.from(fileBase64, "base64");
    const parsed = parseRentRollExcel(buf);

    const uploadedAt  = new Date().toISOString();
    const imported    = { uploadedAt, uploadedBy, ...parsed };

    // File this upload under its report month. Re-importing a month
    // overwrites that snapshot.
    const importedMonth = snapshotMonthKey(imported);
    await storeJSON(HISTORY_PREFIX, importedMonth, imported);

    // "Current" = a per-property union across every snapshot (each property
    // from the latest snapshot that has it). Backfilling an older roll never
    // dethrones a newer current, AND a partial import (e.g. office-only) never
    // erases the properties it omitted — they carry forward from the last
    // snapshot that had them. See composeCurrentRoll.
    const all = (await listJSON(HISTORY_PREFIX)) as any[];
    let latestMonth = importedMonth;
    for (const snap of all) {
      const m = snapshotMonthKey(snap);
      if (m.localeCompare(latestMonth) > 0) latestMonth = m;
    }
    const composed = composeCurrentRoll(all) ?? imported;
    const current = { ...composed, id: RENTROLL_ID };
    await storeJSON(RENTROLL_PREFIX, RENTROLL_ID, current);

    const becameCurrent = latestMonth === importedMonth;

    const summary = {
      uploadedAt,
      reportFrom:     imported.reportFrom,
      reportTo:       imported.reportTo,
      propertyCount:  imported.properties.length,
      totalSqft:      imported.properties.reduce((s, p) => s + p.totalSqft, 0),
      occupiedSqft:   imported.properties.reduce((s, p) => s + p.occupiedSqft, 0),
      vacantSqft:     imported.properties.reduce((s, p) => s + p.vacantSqft, 0),
    };

    // Mark the rent-roll import reminder satisfied for the weekly digest / dashboard.
    try { await recordImport("imp-rentroll", { at: uploadedAt, by: uploadedBy ?? null }); } catch { /* best-effort */ }

    // Diff vs the prior month's roll → downstream prompts: new leases to
    // commission, vacated tenants to close out / return their deposit.
    type ChangeRow = { propertyCode: string; unitRef: string; occupantName: string; sqft: number; leaseTo: string | null };
    const changes: { newTenants: ChangeRow[]; vacated: ChangeRow[] } = { newTenants: [], vacated: [] };
    try {
      const norm = (s: string) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
      // Restrict the diff to the properties actually in THIS import. A partial
      // import (e.g. office-only) must not report the omitted properties'
      // tenants (retail) as "vacated" just because they aren't in the file.
      const importedCodes = new Set(
        (imported.properties ?? []).map((p) => String(p.propertyCode ?? "").toUpperCase()),
      );
      const occ = (r: any, scoped = false) => {
        const map = new Map<string, any>();
        for (const p of r.properties ?? []) {
          if (scoped && !importedCodes.has(String(p.propertyCode ?? "").toUpperCase())) continue;
          for (const u of p.units ?? []) {
            if (u.isVacant || u.amenity || !u.occupantName) continue;
            map.set(u.unitRef, { ...u, propertyCode: p.propertyCode });
          }
        }
        return map;
      };

      // Compare against the most recent PRIOR snapshot that actually has
      // occupied tenants. A missing / partial / stray snapshot (no properties,
      // all-vacant, or a non-roll object under the history prefix) yields an
      // empty map — comparing against THAT made every current tenant look
      // "new" (with 0 vacated). Skip those and fall back to the last real roll;
      // if there's no comparable prior, emit no changes rather than flagging
      // the whole portfolio as new.
      const now = occ(imported);
      const priorCandidates = all
        .map((snap) => ({ snap, month: snapshotMonthKey(snap) }))
        .filter((x) => x.month.localeCompare(importedMonth) < 0)
        .sort((a, b) => b.month.localeCompare(a.month));

      let priorMonth = "";
      let was = new Map<string, any>();
      for (const cand of priorCandidates) {
        const m = occ(cand.snap, true); // scoped to this import's properties
        if (m.size > 0) { was = m; priorMonth = cand.month; break; }
      }

      if (was.size > 0) {
        for (const [ref, u] of now) {
          const b = was.get(ref);
          if (!b || norm(b.occupantName) !== norm(u.occupantName)) {
            changes.newTenants.push({ propertyCode: u.propertyCode, unitRef: ref, occupantName: u.occupantName, sqft: u.sqft ?? 0, leaseTo: u.leaseTo ?? null });
          }
        }
        for (const [ref, u] of was) {
          const a = now.get(ref);
          if (!a || norm(a.occupantName) !== norm(u.occupantName)) {
            changes.vacated.push({ propertyCode: u.propertyCode, unitRef: ref, occupantName: u.occupantName, sqft: u.sqft ?? 0, leaseTo: u.leaseTo ?? null });
          }
        }
      }
      console.info(
        `[rentroll diff] imported=${importedMonth} prior=${priorMonth || "none"} ` +
        `now=${now.size} was=${was.size} new=${changes.newTenants.length} vacated=${changes.vacated.length} ` +
        `snapshots=${all.length}`,
      );
    } catch (e) { console.warn("[rentroll diff] failed", e); }

    // Always hand back the *current* (latest-month) roll for display, plus
    // what was imported and whether it became current.
    return NextResponse.json({
      ok: true,
      summary,
      rentroll: normalizeOccupantNames(current),
      imported: { month: importedMonth, becameCurrent },
      currentMonth: latestMonth,
      changes,
    });
  } catch (err: any) {
    console.error("[POST /api/rentroll]", err?.message ?? err);
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
