import { NextRequest, NextResponse } from "next/server";
import { getJSON, storeJSON } from "@/lib/storage";
import { BASE_YEAR_SEED } from "@/lib/rentroll/baseYears";

const PREFIX = "tenant-meta";
const ID     = "all";

export type TenantMeta = {
  baseYear?: number | null;
};

type Store = Record<string, TenantMeta>;

export const runtime = "nodejs";

/** GET /api/tenant-meta → { tenantMeta: { [unitRef]: { baseYear } } }
 *  Merges the static base-year seed with stored overrides — stored values
 *  (edited through the base-year editor) win over the seed. */
export async function GET() {
  try {
    const data = (await getJSON(PREFIX, ID)) as Store | null;
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

    const baseYearRaw = body?.baseYear;
    const baseYear: number | null =
      baseYearRaw === null || baseYearRaw === "" || baseYearRaw === undefined
        ? null
        : Number(baseYearRaw);
    if (baseYear !== null && (!Number.isFinite(baseYear) || baseYear < 1900 || baseYear > 2100)) {
      return NextResponse.json({ error: "Invalid baseYear" }, { status: 400 });
    }

    const current = ((await getJSON(PREFIX, ID)) as Store | null) ?? {};
    const next: Store = { ...current };
    const existing = next[unitRef] ?? {};
    if (baseYear === null) {
      delete (existing as TenantMeta).baseYear;
    } else {
      existing.baseYear = baseYear;
    }
    if (Object.keys(existing).length === 0) {
      delete next[unitRef];
    } else {
      next[unitRef] = existing;
    }
    await storeJSON(PREFIX, ID, next);
    return NextResponse.json({ ok: true, tenantMeta: next });
  } catch (err: any) {
    console.error("[POST /api/tenant-meta]", err?.message ?? err);
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
