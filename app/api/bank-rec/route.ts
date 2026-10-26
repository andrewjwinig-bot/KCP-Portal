import { NextRequest, NextResponse } from "next/server";
import { getJSON, storeJSON } from "@/lib/storage";

const PREFIX = "bank-rec";
const ID     = "checked";

export const runtime = "nodejs";

type CheckedMap = Record<string, boolean>;

export async function GET() {
  try {
    const data = (await getJSON(PREFIX, ID)) as CheckedMap | null;
    return NextResponse.json({ checked: data ?? {} });
  } catch (err: any) {
    // A failed read must not read as "nothing ticked" — the page would save
    // its next tick over every other one.
    console.error("[GET bank-rec/checked]", err?.message ?? err);
    return NextResponse.json({ error: "Could not load — refresh before making changes." }, { status: 503 });
  }
}

/** POST body: { checked: Record<string, boolean> } — or { patch } — see below. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // { patch: { key: value | null } } changes only those keys against what is
    // stored — two people ticking different accounts no longer overwrite each
    // other. The whole-map form ({ checked }) is still taken from an old page.
    let checked: Record<string, any> = {};
    if (body?.patch && typeof body.patch === "object") {
      const stored = (await getJSON(PREFIX, ID, { retryOnMiss: true })) ?? {};
      checked = { ...stored };
      for (const [k, v] of Object.entries(body.patch as Record<string, unknown>)) {
        if (v === true) checked[k] = v; else delete checked[k];
      }
    } else if (body?.checked && typeof body.checked === "object") {
      for (const [k, v] of Object.entries(body.checked as Record<string, unknown>)) {
        if (v === true) checked[k] = v;
      }
    }
    await storeJSON(PREFIX, ID, checked);
    return NextResponse.json({ ok: true, checked });
  } catch (err: any) {
    console.error("[POST /api/bank-rec]", err?.message ?? err);
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
