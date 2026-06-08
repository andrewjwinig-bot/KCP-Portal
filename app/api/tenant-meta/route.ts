import { NextRequest, NextResponse } from "next/server";
import { createMapStore } from "@/lib/collectionStore";
import { BASE_YEAR_SEED } from "@/lib/rentroll/baseYears";

export type TenantMeta = {
  baseYear?: number | string | null;
};

type Store = Record<string, TenantMeta>;

// One blob per unitRef (was a single all-tenants map, read-modify-written on
// every base-year edit). Legacy map migrated on first read.
const store = createMapStore<TenantMeta>({
  prefix: "tenant-meta-v2",
  legacy: { prefix: "tenant-meta", id: "all", extract: (b) => (b as Store) ?? {} },
});

export const runtime = "nodejs";

/** GET /api/tenant-meta → { tenantMeta: { [unitRef]: { baseYear } } }
 *  Merges the static base-year seed with stored overrides — stored values
 *  (edited through the base-year editor) win over the seed. */
export async function GET() {
  try {
    const data = await store.all();
    const merged: Store = {};
    for (const [unitRef, year] of Object.entries(BASE_YEAR_SEED)) {
      merged[unitRef] = { baseYear: year };
    }
    for (const [unitRef, meta] of Object.entries(data ?? {})) {
      merged[unitRef] = { ...merged[unitRef], ...meta };
    }
    return NextResponse.json({ tenantMeta: merged });
  } catch {
    return NextResponse.json({ tenantMeta: {} });
  }
}

/**
 * POST /api/tenant-meta
 * Body: { unitRef: string, baseYear: number | null }
 * Merges into the combined store. Pass baseYear: null to clear.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const unitRef = String(body?.unitRef ?? "").trim();
    if (!unitRef) return NextResponse.json({ error: "Missing unitRef" }, { status: 400 });

    // A base year is either a 4-digit year or a free-text marker
    // ("NNN", "GROSS", "NONE", a range, …). Pass null/"" to clear.
    const raw = body?.baseYear;
    let baseYear: number | string | null;
    if (raw === null || raw === "" || raw === undefined) {
      baseYear = null;
    } else if (typeof raw === "number" || /^\d+$/.test(String(raw).trim())) {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 1900 || n > 2100) {
        return NextResponse.json({ error: "Invalid baseYear" }, { status: 400 });
      }
      baseYear = n;
    } else {
      baseYear = String(raw).trim().toUpperCase().slice(0, 16);
    }

    const existing: TenantMeta = (await store.get(unitRef)) ?? {};
    if (baseYear === null) {
      delete existing.baseYear;
    } else {
      existing.baseYear = baseYear;
    }
    if (Object.keys(existing).length === 0) {
      await store.remove(unitRef);
    } else {
      await store.set(unitRef, existing);
    }
    return NextResponse.json({ ok: true, tenantMeta: await store.all() });
  } catch (err: any) {
    console.error("[POST /api/tenant-meta]", err?.message ?? err);
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
