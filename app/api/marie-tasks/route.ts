import { NextRequest, NextResponse } from "next/server";
import { getJSON, storeJSON } from "@/lib/storage";

const PREFIX = "marie-tasks";
const ID     = "checked";

// Legacy key from before the stacie → marie rename. We lazily migrate saved
// checkbox state from here on first read so nothing is lost.
const LEGACY_PREFIX = "stacie-tasks";

export const runtime = "nodejs";

type CheckedMap = Record<string, boolean>;

/** Read the current checked map, migrating the legacy blob on first access. */
async function readChecked(): Promise<CheckedMap> {
  const data = (await getJSON(PREFIX, ID)) as CheckedMap | null;
  if (data) return data;
  // Nothing under the new key yet — fall back to (and adopt) the legacy blob.
  const legacy = (await getJSON(LEGACY_PREFIX, ID)) as CheckedMap | null;
  if (legacy && Object.keys(legacy).length > 0) {
    try { await storeJSON(PREFIX, ID, legacy); } catch { /* best-effort copy */ }
    return legacy;
  }
  return {};
}

export async function GET() {
  try {
    return NextResponse.json({ checked: await readChecked() });
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
    console.error("[POST /api/marie-tasks]", err?.message ?? err);
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
