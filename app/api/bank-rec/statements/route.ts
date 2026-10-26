import { NextRequest, NextResponse } from "next/server";
import { getJSON, storeJSON } from "@/lib/storage";

const PREFIX = "bank-rec";
const ID     = "statements";

export const runtime = "nodejs";

type CheckedMap = Record<string, boolean>;

export async function GET() {
  try {
    const data = (await getJSON(PREFIX, ID)) as CheckedMap | null;
    return NextResponse.json({ statements: data ?? {} });
  } catch (err: any) {
    // A failed read must not read as "nothing ticked" — the page would save
    // its next tick over every other one.
    console.error("[GET bank-rec/statements]", err?.message ?? err);
    return NextResponse.json({ error: "Could not load — refresh before making changes." }, { status: 503 });
  }
}

/** POST body: { statements: Record<string, boolean> } — or { patch } — see below. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // { patch: { key: value | null } } changes only those keys against what is
    // stored — two people ticking different accounts no longer overwrite each
    // other. The whole-map form ({ statements }) is still taken from an old page.
    let statements: Record<string, any> = {};
    if (body?.patch && typeof body.patch === "object") {
      const stored = (await getJSON(PREFIX, ID, { retryOnMiss: true })) ?? {};
      statements = { ...stored };
      for (const [k, v] of Object.entries(body.patch as Record<string, unknown>)) {
        if (v === true) statements[k] = v; else delete statements[k];
      }
    } else if (body?.statements && typeof body.statements === "object") {
      for (const [k, v] of Object.entries(body.statements as Record<string, unknown>)) {
        if (v === true) statements[k] = v;
      }
    }
    await storeJSON(PREFIX, ID, statements);
    return NextResponse.json({ ok: true, statements });
  } catch (err: any) {
    console.error("[POST /api/bank-rec/statements]", err?.message ?? err);
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
