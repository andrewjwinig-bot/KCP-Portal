import { NextRequest, NextResponse } from "next/server";
import { getJSON, storeJSON } from "@/lib/storage";

const PREFIX = "base-year-resets";
const ID     = "all";

export type BaseYearReset = {
  unitRef: string;
  propertyCode: string | null;
  occupantName: string;
  originalBaseYear: number | null;     // base year that was reset away from
  newBaseYear: number;                  // current year (set at reset time)
  resetDate: string;                    // ISO YYYY-MM-DD
  notes?: string;
  updatedAt: string;
};

type Store = { resets: Record<string, BaseYearReset>; updatedAt: string };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function load(): Promise<Record<string, BaseYearReset>> {
  const s = (await getJSON(PREFIX, ID)) as Store | null;
  return s?.resets ?? {};
}
async function save(resets: Record<string, BaseYearReset>): Promise<void> {
  await storeJSON(PREFIX, ID, { resets, updatedAt: new Date().toISOString() });
}

export async function GET() {
  try {
    const resets = await load();
    return NextResponse.json({ resets });
  } catch {
    return NextResponse.json({ resets: {} });
  }
}

/** POST upserts one reset, or with { unitRef, clear: true } removes it. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const unitRef = String(body?.unitRef ?? "").trim();
    if (!unitRef) return NextResponse.json({ error: "Missing unitRef" }, { status: 400 });

    const all = await load();

    if (body?.clear === true) {
      delete all[unitRef];
      await save(all);
      return NextResponse.json({ ok: true, resets: all });
    }

    const resetDate = String(body?.resetDate ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(resetDate)) {
      return NextResponse.json({ error: "Invalid resetDate (YYYY-MM-DD)" }, { status: 400 });
    }
    const newBaseYear = Number(body?.newBaseYear);
    if (!Number.isFinite(newBaseYear) || newBaseYear < 1900 || newBaseYear > 2100) {
      return NextResponse.json({ error: "Invalid newBaseYear" }, { status: 400 });
    }
    const originalRaw = body?.originalBaseYear;
    const originalBaseYear: number | null =
      originalRaw == null || originalRaw === "" ? null : Number(originalRaw);

    const next: BaseYearReset = {
      unitRef,
      propertyCode: body?.propertyCode != null ? String(body.propertyCode) : null,
      occupantName: String(body?.occupantName ?? ""),
      originalBaseYear: Number.isFinite(originalBaseYear as number) ? (originalBaseYear as number) : null,
      newBaseYear,
      resetDate,
      notes: typeof body?.notes === "string" ? body.notes.trim() : undefined,
      updatedAt: new Date().toISOString(),
    };
    all[unitRef] = next;
    await save(all);
    return NextResponse.json({ ok: true, resets: all });
  } catch (err: any) {
    console.error("[POST /api/base-year-resets]", err?.message ?? err);
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
