import { NextRequest, NextResponse } from "next/server";
import { getJSON, storeJSON } from "@/lib/storage";

const PREFIX = "stacie-tasks";
const ID     = "checked";

export const runtime = "nodejs";

type CheckedMap = Record<string, boolean>;

export async function GET() {
  try {
    const data = (await getJSON(PREFIX, ID)) as CheckedMap | null;
    return NextResponse.json({ checked: data ?? {} });
  } catch {
    return NextResponse.json({ checked: {} });
  }
}

/** POST body: { checked: Record<string, boolean> } — replaces the whole map. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const checked: CheckedMap = {};
    if (body?.checked && typeof body.checked === "object") {
      for (const [k, v] of Object.entries(body.checked)) {
        if (v === true) checked[k] = true;
      }
    }
    await storeJSON(PREFIX, ID, checked);
    return NextResponse.json({ ok: true, checked });
  } catch (err: any) {
    console.error("[POST /api/stacie-tasks]", err?.message ?? err);
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
